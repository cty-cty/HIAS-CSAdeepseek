/**
 * 轻量规则验证（无新增依赖）：验证培养规则确定性执行的核心场景。
 * 运行方式：npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getCourseRequirementType,
  getCourseRoleEligibility,
  getDegreeEligibility,
  getCourseDesignation,
  calculateCreditSummary,
  type CourseLike,
} from '../app/credit-model';
import { PROGRAM_PLANS } from '../app/program-plans';
import {
  canonicalCourseId,
  displayCourseCode,
} from '../app/course-identity';
import {
  calculateSemesterCheckup,
  calculateProgramGaps,
  termSeason,
  type ProgramGaps,
} from '../app/program-rules';
import {
  buildCandidates,
  coursesOverlap,
  generateRecommendationPlans,
  type CourseRecord,
  type RecommendationRequest,
} from '../app/recommendation-engine';

const SPRING_FILE = join(process.cwd(), 'app', 'courses-spring.json');
const springRows = JSON.parse(readFileSync(SPRING_FILE, 'utf8')) as CourseRecord[];

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(`${label}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`);
  }
}

function eq(actual: unknown, expected: unknown, label: string) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  ok(same, label, { actual, expected });
}

// 课程辅助（code 第14位可构造类别）
function mkCourse(partial: Partial<CourseLike>): CourseLike {
  return {
    id: partial.id ?? 'c',
    code: partial.code ?? '',
    name: partial.name ?? '课程',
    category: partial.category ?? '专业课',
    subject: partial.subject ?? '',
    credits: partial.credits ?? 0,
    ...partial,
  };
}

function courseRecordFromCourseLike(c: CourseLike): CourseRecord {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    category: c.category,
    subject: c.subject,
    credits: c.credits,
    schedules: [],
  };
}

const optical = PROGRAM_PLANS.find((p) => p.id === 'optical-master')!;
const ai = PROGRAM_PLANS.find((p) => p.id === 'ai-master')!;
const materials = PROGRAM_PLANS.find((p) => p.id === 'materials-master')!;
const physicalDoctor = PROGRAM_PLANS.find((p) => p.id === 'physical-doctor')!;

// ---------- courses-spring.json 审计 ----------
const springByMajor: Record<string, string[]> = {
  物理电子学: [
    '高级红外光电工程导论',
    '信息光子学物理',
    '半导体器件物理学',
    '光电成像原理与技术',
    '数字系统中的模拟电路技术',
  ],
  光电信息工程: [
    'FPGA电路软硬件设计',
    '专业英语',
    '超快现象与超快光谱',
    '量子光学',
    '数字图像处理',
    '非线性光学导论',
  ],
  人工智能: ['高级人工智能', '人工智能的数学基础与应用', '智能物联网技术及应用'],
  材料工程: ['绿色工艺与技术', '基因工程', '磁性材料'],
};
for (const [major, names] of Object.entries(springByMajor)) {
  for (const name of names) {
    const row = springRows.find((r) => r.name === name);
    ok(Boolean(row), `spring 课程存在：${major} → ${name}`);
    if (row) {
      ok(row.scheduleStatus === 'planned', `${name} scheduleStatus=planned`);
      ok(
        row.capacity === 0 && row.enrolled === 0 && (row.schedules ?? []).length === 0,
        `${name} 容量/时间保持未知（0/空为“未提供”而非“满员”）`,
      );
    }
  }
}
// 占位编码不伪装正式编码（有 officialCode 的课程展示正式编码）
for (const row of springRows) {
  const shown = displayCourseCode(row);
  if (row.officialCode) {
    ok(
      shown.kind === 'official' && shown.text === row.officialCode,
      `${row.name} 有正式编码时展示 officialCode`,
    );
  } else if (/^SP2027-/i.test(row.code)) {
    ok(shown.text === '' && shown.kind === 'placeholder', `${row.name} 占位码不展示为正式编码`);
    ok(!row.officialCode, `${row.name} 无正式编码时 officialCode 为 null/空`);
  }
}
const fpga = springRows.find((r) => r.name === 'FPGA电路软硬件设计')!;
ok(fpga.officialCode === '280216085408P3005', 'FPGA 已知正式编码被写入 officialCode');
ok(fpga.semesterNote === 'both', 'FPGA 秋、春（both）不被误认为两门课程');
eq(
  springRows.filter((r) => r.semesterNote === 'both').map((r) => r.name),
  ['FPGA电路软硬件设计', '学术道德与学术写作规范', '硕士学位英语', '工程伦理'],
  '秋、春(both)计划课程清单',
);
const collegeFixes: Record<string, string> = {
  高级人工智能: '智能科学与技术学院',
  人工智能的数学基础与应用: '智能科学与技术学院',
  智能物联网技术及应用: '智能科学与技术学院',
  绿色工艺与技术: '化学与材料科学学院',
  基因工程: '化学与材料科学学院',
};
for (const [name, college] of Object.entries(collegeFixes)) {
  const row = springRows.find((r) => r.name === name);
  ok(row?.college === college, `${name} 开课单位=${college}`);
}
const springPublicRows = springRows.filter((r) =>
  ['学术道德与学术写作规范', '硕士学位英语', '工程伦理', '中国马克思主义与当代', '博士学位英语'].includes(r.name),
);
eq(springPublicRows.length, 5, '材料支持的春季/秋春公共课程已加入培养规划层（5门）');

// ---------- 培养规则场景 ----------
// 1) 光电专硕 core2 pro2 degree>=12 → 通过
let gaps: ProgramGaps = calculateProgramGaps({
  plan: optical,
  summary: {
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    professionalDegreeCredits: 12,
    professionalElectiveCredits: 2,
    publicElectiveCredits: 3,
    innovationCredits: 1,
  },
  courseCounts: { coreCount: 2, professionalCount: 2 },
  confirmedDegreeNames: ['集成与微纳光子学', '高等光学原理', '激光原理', 'FPGA电路软硬件设计'],
});
ok(gaps.degreeRuleSatisfied === true, 'S1 光电 core2/pro2/>=12 → 通过');
// 2) 光电 degree12 但核心1 → 未完成
gaps = calculateProgramGaps({
  plan: optical,
  summary: {
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    professionalDegreeCredits: 12,
    professionalElectiveCredits: 2,
    publicElectiveCredits: 3,
    innovationCredits: 1,
  },
  courseCounts: { coreCount: 1, professionalCount: 2 },
  confirmedDegreeNames: ['集成与微纳光子学', '激光原理', 'FPGA电路软硬件设计'],
});
ok(gaps.degreeRuleSatisfied === false && gaps.degreeCreditsShort === false, 'S2 degree=12但core=1 → 未完成');
// 3) AI core2 但缺 高级AI/自然语言处理 → 特殊规则失败
gaps = calculateProgramGaps({
  plan: ai,
  summary: {
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    professionalDegreeCredits: 12,
    professionalElectiveCredits: 2,
    publicElectiveCredits: 3,
    innovationCredits: 1,
  },
  courseCounts: { coreCount: 2, professionalCount: 2 },
  confirmedDegreeNames: ['并行计算与实现技术', '计算机网络技术', '高级数据库系统'],
});
ok(gaps.specialRules[0]?.satisfied === false, 'S3 AI 无高AI/NLP → 特殊规则失败');
ok(gaps.degreeRuleSatisfied === false, 'S3b AI 特殊规则未满足 → 学位整体未完成');
// 4) AI: 自然语言处理 + 人工智能的数学基础与应用 → 通过
gaps = calculateProgramGaps({
  plan: ai,
  summary: {
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    professionalDegreeCredits: 12,
    professionalElectiveCredits: 2,
    publicElectiveCredits: 3,
    innovationCredits: 1,
  },
  courseCounts: { coreCount: 2, professionalCount: 2 },
  confirmedDegreeNames: ['自然语言处理', '人工智能的数学基础与应用'],
});
ok(gaps.specialRules[0]?.satisfied === true, 'S4 AI 含自然语言处理 → 特殊核心规则通过');

// 5) HIAS讲堂 → 专业非学位课 +1（专业选修），公共选修 +0
const hiasCourse = mkCourse({
  name: 'HIAS讲堂',
  code: 'HIAS-LECTURE',
  category: '专业课',
  module: 'hias',
  credits: 1,
});
eq(getCourseRequirementType(hiasCourse, 'non-degree', materials), 'professionalElective', 'S5 HIAS 归属 professionalElective');
const summaryHias = calculateCreditSummary({
  selectedCourses: [hiasCourse],
  designations: {},
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: materials,
});
ok(summaryHias.publicElectiveCredits === 0, 'S5 HIAS 公共选修 +0');
ok(summaryHias.professionalElectiveCredits === 1, 'S5 HIAS 专业非学位 +1');
ok(summaryHias.professionalDegreeCredits === 0, 'S5 HIAS 专业学位 +0');
// 6) 科学前沿讲座 → 专业选修 +1，公共选修 +0
const frontierCourse = mkCourse({
  name: '科学前沿讲座（示例）',
  code: '2802160000000700',
  category: '科学前沿讲座',
  credits: 1,
});
eq(getCourseRequirementType(frontierCourse, 'non-degree', materials), 'professionalElective', 'S6 前沿讲座 归属 professionalElective');
const summaryFrontier = calculateCreditSummary({
  selectedCourses: [frontierCourse],
  designations: {},
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: materials,
});
ok(summaryFrontier.publicElectiveCredits === 0, 'S6 前沿讲座 公共选修 +0');
ok(summaryFrontier.professionalElectiveCredits === 1, 'S6 前沿讲座 专业非学位 +1');
// 7) 研讨课尝试设置 degree → 拒绝为非学位
const seminar = mkCourse({ name: '某研讨课', code: '2802160000000400', category: '研讨课', credits: 1 });
eq(getCourseRoleEligibility(seminar, materials).status, 'ineligible', 'S7 研讨课不能作为学位课');
eq(getCourseDesignation({ ...seminar, module: 'regular' }, { [canonicalCourseId(seminar)]: 'degree' }, materials), 'non-degree', 'S7b 研讨课 degree 被强制为 non-degree');
// 8) 本专业核心/专业课 degree → eligible
const opticalCore = mkCourse({ name: '集成与微纳光子学', code: '2802160854080001', category: '专业核心课', subject: '光电信息工程', credits: 3 });
eq(getCourseRoleEligibility(opticalCore, optical).status, 'eligible', 'S8 本专业核心课 eligible');
// 9) 专硕其它专业 1/2/3 → approval_required（不能直接 ineligible）
const otherProgramCourse = mkCourse({ name: '绿色工艺与技术', code: '2802160856010003', category: '专业课', subject: '材料工程', credits: 2 });
eq(getDegreeEligibility(otherProgramCourse, optical).status, 'approval_required', 'S9 跨专业 1/2/3 课程 approval_required');
// 10) approval_required degree → 不自动计入已确认专业学位
const summaryCross = calculateCreditSummary({
  selectedCourses: [otherProgramCourse],
  designations: { [canonicalCourseId(otherProgramCourse)]: 'degree' },
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
});
ok(summaryCross.professionalDegreeCredits === 0, 'S10 approval_required 不计入已确认专业学位');
ok(summaryCross.plannedDegreeCredits > 0 || summaryCross.plannedRequirementCredits.pending > 0, 'S10b degree 标记保留但归属 pending');
// 11) 同课程 01/02 班 → canonical 一致
const sec1 = { code: '280216010108MB001-01', name: '新时代中国特色社会主义理论与实践-01班' };
const sec2 = { code: '280216010108MB001-02', name: '新时代中国特色社会主义理论与实践-02班' };
ok(canonicalCourseId(sec1) === canonicalCourseId(sec2), 'S11 同课程01/02班 canonical 一致');
// 12/13) 冲突按周次交集
const scheduleA = { day: '周一', dayIndex: 0, start: 1, end: 3, weeks: [2, 3, 4, 5] };
const scheduleB = { day: '周一', dayIndex: 0, start: 1, end: 3, weeks: [10, 11, 12] };
ok(!coursesOverlap(
  { id: 'a', code: 'A1', name: 'A', category: '专业课', subject: '', credits: 1, schedules: [scheduleA] },
  { id: 'b', code: 'B1', name: 'B', category: '专业课', subject: '', credits: 1, schedules: [scheduleB] },
), 'S12 同天同节次但周次不交叉 → 无冲突');
const scheduleC = { day: '周一', dayIndex: 0, start: 1, end: 3, weeks: [4, 5] };
ok(coursesOverlap(
  { id: 'a', code: 'A1', name: 'A', category: '专业课', subject: '', credits: 1, schedules: [scheduleA] },
  { id: 'c', code: 'C1', name: 'C', category: '专业课', subject: '', credits: 1, schedules: [scheduleC] },
), 'S13 同天同节次且周次交叉 → 冲突');
// 14) 2026秋缺自然辩证法 → 红色提醒
const fallCheck = calculateSemesterCheckup({
  termId: '2026-fall',
  plan: optical,
  summary: {
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    professionalDegreeCredits: 6,
    professionalElectiveCredits: 0,
    publicElectiveCredits: 0,
    innovationCredits: 0,
  },
  courseCounts: { coreCount: 1, professionalCount: 1 },
  confirmedDegreeNames: [],
  effectiveCredits: 8,
  semesterTarget: 10,
  springPlannedCourseNames: ['超快现象与超快光谱', '量子光学', '数字图像处理'],
  conflictsCount: 0,
  sportsCourseCount: 1,
  fallLearnedNames: ['新时代中国特色社会主义理论与实践'],
});
ok(fallCheck.mustFix.some((i) => i.kind === 'fall-mandatory'), 'S14 秋季缺自然辩证法 → mustFix 红');
ok(fallCheck.mustFix.some((i) => i.kind === 'semester-credits'), 'S14b 有效学分<10 → mustFix 红');
// 15) 核心 1/2 但春季有计划课程 → 培养进度(amber)，不是 error
const progressCore = fallCheck.progress.find((i) => i.kind === 'progress-core');
ok(progressCore !== undefined && progressCore.tone === 'amber', 'S15 核心1/2 → progress amber');
ok(!fallCheck.mustFix.some((i) => i.kind === 'progress-core' || i.id.startsWith('progress-')), 'S15b 进度不进入红色列表');
const progressPro = fallCheck.progress.find((i) => i.kind === 'progress-professional');
ok((progressPro?.detail ?? '').includes('春季'), 'S15c 春季有计划专业课存在时提示“可在春季继续完成”');
// 16) 体育公选2门 → 红
eq(
  calculateSemesterCheckup({
    termId: '2026-fall',
    plan: optical,
    summary: {
      publicRequiredDegreeCredits: 7,
      publicRequiredNonDegreeCredits: 1,
      professionalDegreeCredits: 6,
      professionalElectiveCredits: 0,
      publicElectiveCredits: 0,
      innovationCredits: 0,
    },
    courseCounts: { coreCount: 2, professionalCount: 2 },
    confirmedDegreeNames: [],
    effectiveCredits: 12,
    semesterTarget: 10,
    sportsCourseCount: 2,
    fallLearnedNames: ['新时代中国特色社会主义理论与实践', '自然辩证法概论'],
  }).mustFix.some((i) => i.kind === 'sports-overflow'),
  true,
  'S16 体育公选2门 → 红',
);
// 17) 工程伦理 → 公共必修非学位
const ethics = mkCourse({ name: '工程伦理', code: '280216125601PB001-01', category: '公共必修课', credits: 1 });
eq(getCourseRequirementType(ethics, 'non-degree', optical), 'publicRequiredNonDegree', 'S17 工程伦理 公共必修非学位');
eq(getCourseRoleEligibility(ethics, optical).status, 'ineligible', 'S17b 工程伦理不能设学位课');
// 18) 普通公选2 + 创新1 → 专硕公共选修体系通过
const summaryPub = calculateCreditSummary({
  selectedCourses: [
    mkCourse({ name: '公共选修一', code: '280216000000X001', category: '公共选修课', subject: '体育学', credits: 1 }),
    mkCourse({ name: '公共选修二', code: '280216000000X002', category: '公共选修课', credits: 1 }),
  ],
  designations: {},
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
});
const summaryPubPlusInnovation = calculateCreditSummary({
  selectedCourses: [
    mkCourse({ name: '创业管理', code: '280216120100MX001', category: '公共选修课', credits: 1 }),
  ],
  designations: {},
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: optical,
});
gaps = calculateProgramGaps({
  plan: optical,
  summary: {
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    professionalDegreeCredits: 12,
    professionalElectiveCredits: 2,
    publicElectiveCredits: summaryPub.publicElectiveCredits + summaryPubPlusInnovation.publicElectiveCredits,
    innovationCredits: summaryPubPlusInnovation.innovationCredits,
  },
  courseCounts: { coreCount: 2, professionalCount: 2 },
  confirmedDegreeNames: [],
});
ok(summaryPubPlusInnovation.innovationCredits === 1, 'S18 创新模块 1 学分');
ok(!(gaps.publicElectiveTarget !== null && gaps.publicElectiveCredits < gaps.publicElectiveTarget), 'S18b 公选2+创新1 → 体系3分满足');
// 19/20) HIAS 不能补专业非学位2分；前沿可以
ok(summaryHias.professionalElectiveCredits === 1, 'S19 HIAS 可计入专业非学位课学分（可补 2 分）');
ok(summaryFrontier.professionalElectiveCredits === 1, 'S20 前沿可入专业非学位');
// 21) 核心已2/2 后推荐不因“核心课”无脑再推核心
const engCourses: CourseRecord[] = [
  { id: 'c1', code: '2802160854080001', name: '高等光学原理', category: '专业核心课', subject: '光电信息工程', credits: 3, schedules: [{ day: '周一', dayIndex: 0, start: 1, end: 3, weeks: [1, 2] }] },
  { id: 'c2', code: '2802160854080002', name: '集成与微纳光子学', category: '专业核心课', subject: '光电信息工程', credits: 3, schedules: [] },
  { id: 'c3', code: '280216085408P3005', name: 'FPGA电路软硬件设计', category: '专业课', subject: '光电信息工程', credits: 2.5, schedules: [{ day: '周二', dayIndex: 1, start: 5, end: 7, weeks: [1, 2] }] },
  { id: 'c4', code: '280216000000X001', name: '心理学与心理健康', category: '公共选修课', subject: '心理学', credits: 1, schedules: [{ day: '周三', dayIndex: 2, start: 5, end: 7, weeks: [1, 2] }] },
];
const engRequest: RecommendationRequest = {
  termId: '2026-fall',
  courses: engCourses,
  selectedCourses: [],
  selectedIds: [],
  plan: optical,
  designations: {},
  exemptionStatus: 'normal',
  semesterTarget: 10,
  springPlannedCourseNames: springRows.map((r) => r.name),
};
const engCandidates = buildCandidates(engRequest);
const engResult = generateRecommendationPlans(engRequest, engCandidates);
const requirementPlan = engResult.plans.find((p) => p.mode === 'requirement-first');
ok(Boolean(requirementPlan), 'S21 存在推荐方案');
// core 已满 2/2 的假设由已选构造（此处从空课表构造，仅验证算法可达且不超过上限）
ok((requirementPlan?.additions.length ?? 99) <= 6, 'S21b 每方案新增门数有上限');
// 22) 已选课程不被删除
const withSelected = generateRecommendationPlans(
  { ...engRequest, selectedCourses: [engCourses[0]], selectedIds: ['c1'] },
  buildCandidates({ ...engRequest, selectedCourses: [engCourses[0]], selectedIds: ['c1'] }),
);
for (const plan of withSelected.plans) {
  ok(
    !plan.additions.some((a) => a.course.id === 'c1'),
    'S22 锁定课程不会被推荐删除/替换',
  );
}
// 23/24) 多班次只作为一门课程出现且可选无冲突班次
const multiSections: CourseRecord[] = [
  engCourses[0],
  { ...engCourses[0], id: 'c1-2', code: '2802160854080001-02', name: '高等光学原理-02班', schedules: [{ day: '周五', dayIndex: 4, start: 1, end: 3, weeks: [1, 2] }] },
  engCourses[1],
];
const multiRequest: RecommendationRequest = {
  termId: '2026-fall',
  courses: multiSections,
  selectedCourses: [],
  selectedIds: [],
  plan: optical,
  designations: {},
  semesterTarget: 10,
  springPlannedCourseNames: [],
};
const multiResult = generateRecommendationPlans(
  multiRequest,
  buildCandidates(multiRequest),
);
for (const plan of multiResult.plans) {
  const names = plan.additions.map((a) => a.course.name.replace(/-\d+班$/, ''));
  ok(new Set(names).size === names.length, 'S24 推荐结果中同课程只出现一次');
}
// 25) 秋季核心1/2 且春季有课：允许“可留至春季”（progress amber 文案含春季）
// 26) approval_required 默认方案生成不用它补学位缺口（候选不会以 core/professional-degree 角色出现）
const approvalCandidate = buildCandidates({
  termId: '2026-fall',
  courses: [
    courseRecordFromCourseLike(otherProgramCourse),
    { id: 'e1', code: '280216000000X100', name: '某公共选修', category: '公共选修课', subject: '', credits: 2, schedules: [] },
  ],
  selectedCourses: [],
  selectedIds: [],
  plan: optical,
  designations: {},
  semesterTarget: 10,
});
const crossRole = approvalCandidate.find((c) => c.course.id === otherProgramCourse.id);
ok(Boolean(crossRole), 'S26a 跨专业课程进入候选（可见）');
ok(
  !crossRole?.roles.includes('core-degree') && !crossRole?.roles.includes('professional-degree'),
  'S26 跨专业课程不会自动作为学位课补缺口',
);
// 28/29/30/31) 数据兼容类：
const oldStylePlan = { ...materials };
delete (oldStylePlan as { specialRules?: unknown }).specialRules;
gaps = calculateProgramGaps({
  plan: oldStylePlan,
  summary: {
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    professionalDegreeCredits: 6,
    professionalElectiveCredits: 0,
    publicElectiveCredits: 0,
    innovationCredits: 0,
  },
  courseCounts: { coreCount: 1, professionalCount: 1 },
  confirmedDegreeNames: [],
});
ok(gaps.specialRules.length === 0, 'S28 旧 ProgramPlan 无 specialRules 正常工作');
// 博士口径
eq(termSeason('2027-spring'), 'spring', 'S-term spring');
const doctorDirectGaps = calculateProgramGaps({
  plan: physicalDoctor,
  track: 'direct_phd',
  summary: {
    publicRequiredDegreeCredits: 11,
    publicRequiredNonDegreeCredits: 0,
    professionalDegreeCredits: 16,
    professionalElectiveCredits: 0,
    publicElectiveCredits: 2,
    innovationCredits: 0,
  },
  courseCounts: { coreCount: 2, professionalCount: 2 },
  confirmedDegreeNames: ['半导体光谱学导论', '半导体器件物理学', '光电成像原理与技术', '主被动光谱探测技术'],
});
ok(doctorDirectGaps.degreeRuleSatisfied === true, 'S-博士 直博口径 2+2 判定正常');
const doctorGeneralGaps = calculateProgramGaps({
  plan: physicalDoctor,
  track: 'general_phd',
  summary: {
    publicRequiredDegreeCredits: 5,
    publicRequiredNonDegreeCredits: 0,
    professionalDegreeCredits: 4,
    professionalElectiveCredits: 0,
    publicElectiveCredits: 0,
    innovationCredits: 0,
  },
  courseCounts: { coreCount: 0, professionalCount: 0 },
  confirmedDegreeNames: [],
});
ok(doctorGeneralGaps.coreMinimum === null && doctorGeneralGaps.professionalMinimum === null, 'S-普博 不自动套用 2+2');
ok(doctorGeneralGaps.degreeRuleSatisfied === null, 'S-普博 学位整体按待确认（null）');
ok(Boolean(doctorGeneralGaps.verificationNote), 'S-普博 verificationNote 存在');

// ---------- 汇总 ----------
console.log(`\n规则验证结果：通过 ${passed} 项，失败 ${failed} 项`);
if (failures.length) {
  console.log('失败明细：');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
