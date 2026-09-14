/**
 * 真实数据回归验证（无新增依赖）。
 *
 * 用仓库内置的 158 门秋季课程与 22 条 2027 春季计划课程做整库回归，
 * 覆盖参考版 validate-regressions 的核心意图：
 * - 真实课程数据经合并后不被误删 / 误合并；
 * - 春季计划课程状态正确，且能被正式课表升级替换；
 * - 四个培养方向都能跑通培养缺口计算，不抛异常。
 *
 * 运行方式：npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { calculateCreditSummary, type CourseLike } from '../app/credit-model';
import { isPlaceholderCode } from '../app/course-identity';
import {
  isPlannedCourse,
  mergeCourseRows,
  reconcileCourseUpdate,
  type CourseDataRow,
} from '../app/course-data';
import { PROGRAM_PLANS } from '../app/program-plans';
import { calculateProgramGaps } from '../app/program-rules';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(
      `${label}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`,
    );
  }
}

function eq(actual: unknown, expected: unknown, label: string) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), label, {
    actual,
    expected,
  });
}

const appDir = join(process.cwd(), 'app');
const fallCourses = JSON.parse(
  readFileSync(join(appDir, 'courses.json'), 'utf8'),
) as CourseDataRow[];
const springCourses = JSON.parse(
  readFileSync(join(appDir, 'courses-spring.json'), 'utf8'),
) as CourseDataRow[];

console.log(
  `\n真实数据：秋季 ${fallCourses.length} 门，春季计划 ${springCourses.length} 条`,
);

// 1) 内置数据规模
eq(fallCourses.length, 158, 'R1 秋季课程为 158 门');
ok(springCourses.length > 0, 'R1b 春季计划课程非空');

// 2) 秋季课程合并后一门都不能丢（不同教学班必须分别保留）
const mergedFall = mergeCourseRows(fallCourses);
eq(
  mergedFall.length,
  fallCourses.length,
  'R2 158 门秋季课程合并后数量不变（无课程被误合并/误删）',
);

// 3) 秋季课程默认按正式课程处理
ok(
  fallCourses.every((course) => !isPlannedCourse(course)),
  'R3 秋季内置课程默认按正式课程处理',
);

// 4) 春季计划课程状态正确
ok(
  springCourses.every((course) => isPlannedCourse(course)),
  'R4 春季计划课程全部识别为 planned',
);
ok(
  springCourses.every((course) => !isPlaceholderCode(course.officialCode ?? '')),
  'R4b 春季计划课程不把占位编码（SP2027-xxx）伪装成正式编码',
);
eq(
  mergeCourseRows(springCourses).length,
  springCourses.length,
  'R4c 春季计划课程内部合并后数量不变',
);

// 5) 春季计划课程能被正式课表升级替换，且选课随迁移
const springSample = springCourses.find((course) => course.name) as CourseDataRow;
const officialCounterpart: CourseDataRow = {
  ...springSample,
  id: 'official-spring-01',
  code: '280216085408P3005-01',
  officialCode: '280216085408P3005-01',
  scheduleStatus: 'confirmed',
  dataStatus: 'official_schedule',
};
const upgrade = reconcileCourseUpdate(
  [springSample],
  [officialCounterpart],
  [springSample.id],
  {},
);
eq(upgrade.courses.length, 1, 'R5 计划记录被正式记录替换，不重复两份');
eq(
  upgrade.courses[0]?.id,
  'official-spring-01',
  'R5b 升级后保留的是正式教学班',
);
eq(
  upgrade.selectedIds,
  ['official-spring-01'],
  'R5c 已选课程随计划→正式升级迁移',
);

// 6) 每个培养方案都能在其课程库里匹配到真实课程
const masterPlans = PROGRAM_PLANS.filter((plan) => !plan.studentTrack || plan.studentTrack === 'master' || plan.id === 'physical-doctor');
masterPlans.forEach((plan) => {
  const wanted = new Set([...plan.coreCourses, ...plan.professionalCourses]);
  const matched = fallCourses.filter((course) => wanted.has(course.name));
  const rate = wanted.size ? matched.length / wanted.size : 0;
  ok(
    matched.length > 0,
    `R6 ${plan.label} 在秋季课表中匹配到培养课程`,
    { matched: matched.length, wanted: wanted.size },
  );
  console.log(
    `  · ${plan.label}：课程库 ${wanted.size} 门，秋季可匹配 ${matched.length} 门（${(rate * 100).toFixed(0)}%）`,
  );
});

// 7) 四个培养方向跑通培养缺口计算（不抛异常、字段完整）
masterPlans.forEach((plan) => {
  const wanted = new Set([...plan.coreCourses, ...plan.professionalCourses]);
  const selected = fallCourses
    .filter((course) => wanted.has(course.name))
    .slice(0, 2) as unknown as CourseLike[];
  const summary = calculateCreditSummary({
    selectedCourses: selected,
    designations: {},
    historicalRecords: [],
    exemptionStatus: 'normal',
    plan,
  });
  const gaps = calculateProgramGaps({
    plan,
    track: plan.studentTrack ?? 'master',
    summary,
    courseCounts: { coreCount: 0, professionalCount: 0 },
    confirmedDegreeNames: [],
  });
  ok(
    gaps.planId === plan.id && typeof gaps.coreCount === 'number',
    `R7 ${plan.label} 培养缺口计算返回可用结果`,
    { planId: gaps.planId, coreCount: gaps.coreCount },
  );
  ok(
    summary.plannedCredits >= 0 && Number.isFinite(summary.plannedCredits),
    `R7b ${plan.label} 学分合计为有限数值`,
    { plannedCredits: summary.plannedCredits },
  );
});

// 8) HIAS讲堂归属口径（参考版核对结论：计入公共选修，不计入专业非学位）
const hiasRow = {
  id: 'hias-1',
  code: 'HIAS-LECTURE',
  name: 'HIAS讲堂',
  category: '公共选修课',
  subject: '人文',
  credits: 1,
  module: 'hias' as const,
} as unknown as CourseLike;
const hiasSummary = calculateCreditSummary({
  selectedCourses: [hiasRow],
  designations: {},
  historicalRecords: [],
  exemptionStatus: 'normal',
  plan: PROGRAM_PLANS[0],
});
eq(hiasSummary.publicElectiveCredits, 1, 'R8 HIAS讲堂计入公共选修体系');
eq(hiasSummary.professionalElectiveCredits, 0, 'R8b HIAS讲堂不计入专业非学位');

// ---------- 汇总 ----------
console.log(`\n真实数据回归结果：通过 ${passed} 项，失败 ${failed} 项`);
if (failures.length) {
  console.log('失败明细：');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
