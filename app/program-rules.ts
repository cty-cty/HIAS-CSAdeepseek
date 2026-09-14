/**
 * program-rules.ts —— 培养规则确定性执行层（纯函数，无 React、无存储依赖）。
 *
 * 分层职责（只读、不判断 AI）：
 *   第三层（学校通用最低要求）＋ 第二层（学院培养方案）＋ 第四层（当前学期课表，仅确认开课）
 * 合并为可执行、可测试的规则：special rules、培养缺口（gap）、学期检查（severity）、
 * 秋/春跨学期机会、博士培养类型口径。
 *
 * 纪律：
 *   - 体检（calculateSemesterCheckup）与推荐引擎读取同一份 ProgramGaps，禁止维护两套规则；
 *   - “培养进度未完成”与“本学期选课错误”是不同严重度，文案绝不混用；
 *   - 任何 AI 都不得自造课程属性、培养要求或学分规则。
 */

import type {
  ProgramPlan,
  ProgramSpecialRule,
  StudentTrack,
} from './program-plans';

/** 一年级（2026级硕士/直博/硕博连读）秋季必须修读的公共必修课。 */
export const FIRST_YEAR_FALL_MANDATORY_COURSES = [
  '新时代中国特色社会主义理论与实践',
  '自然辩证法概论',
];

/** 课程名匹配用基础名（去班号、去空白），名称未知时返回原值。 */
export function cleanCourseNameForMatch(name?: string | null) {
  return (name ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[-—－]?\d+班$/, '');
}

function formatCreditsSmall(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export type PublicRequiredBucket = {
  id: 'degree' | 'non-degree';
  label: string;
  current: number;
  target: number | null;
};

export type RuleProgress = {
  id: string;
  label: string;
  satisfied: boolean | null;
  current: number;
  minimum: number | null;
  matchedNames: string[];
  /** 规则候选课程中尚未被（学位课）占用的课程名。 */
  remainingCandidates: string[];
  status: 'done' | 'short';
};

export type ProgramGaps = {
  planId: string;
  planLabel: string;
  degree: string;
  program: string;
  track: StudentTrack | undefined;
  /** 本学期有效选课学分缺口（>0 未达学期最低门槛；null 表示当前学期不适用）。 */
  semesterCredits: number | null;
  semesterTarget: number | null;
  publicRequired: PublicRequiredBucket[];
  degreeCourseCreditsTarget: number | null;
  /** 专业学位课学分中“本专业可确认（eligible）”部分。 */
  degreeCourseCreditsConfirmed: number;
  /** 专业学位课学分中“跨专业、需导师/学院审核（approval_required）”部分。 */
  professionalDegreePendingApprovalCredits: number;
  /** 专业学位课总学分 = 确认部分 + 待审核补充部分。 */
  professionalDegreeTotalCredits: number;
  /** true 表示确认学分已足够，或加上待审核补充后足够（补充部分用 amber 提示）。 */
  degreeCreditsShort: boolean;
  /** true 表示“≥12 学分”需依赖跨专业待审核补充才能满足（尚未审核确认）。 */
  degreePendingApprovalUsed: boolean;
  coreCount: number;
  coreMinimum: number | null;
  professionalCount: number;
  professionalMinimum: number | null;
  professionalNonDegreeCredits: number;
  professionalNonDegreeTarget: number | null;
  publicElectiveCredits: number;
  publicElectiveTarget: number | null;
  innovationCredits: number;
  innovationTarget: number | null;
  specialRules: RuleProgress[];
  /** 学位课整体是否已满足（含学分+核心+专业+特殊规则；null=口径待确认不判定）。 */
  degreeRuleSatisfied: boolean | null;
  /** 博士培养类型口径下无法由材料自动确认的说明（null 表示无待确认事项）。 */
  verificationNote: string | null;
  /**
   * 可由 2027 春季继续完成的门类机会（core/professional 等 → 春季计划课程门数）。
   * 只影响展示文案与推荐优先级，不影响学校硬规则。
   */
  springOpportunity: Record<string, number>;
};

export type GapInput = {
  plan: ProgramPlan;
  /** 博士培养类型；旧数据缺省按 undefined（不猜测、按口径待确认处理）。 */
  track?: StudentTrack;
  summary: {
    publicRequiredDegreeCredits: number;
    publicRequiredNonDegreeCredits: number;
    professionalDegreeCredits: number;
    professionalDegreePendingApprovalCredits?: number;
    professionalElectiveCredits: number;
    publicElectiveCredits: number;
    innovationCredits: number;
  };
  courseCounts: {
    coreCount: number;
    professionalCount: number;
  };
  /** 已确认（designation=degree 且 recognition=eligible）的课程基础名集合。 */
  confirmedDegreeNames: string[];
  /** 本学期有效学分（不含 HIAS/科学前沿等）。 */
  effectiveCredits?: number;
  semesterTarget?: number | null;
  /** 2027 春季培养方案计划课程名（学期标注春/秋春），仅用于“可留至春季完成”提示。 */
  springPlannedCourseNames?: string[];
};

export type ProgramIssueKind =
  | 'time-conflict'
  | 'duplicate-section'
  | 'semester-credits'
  | 'sports-overflow'
  | 'fall-mandatory'
  | 'illegal-degree-designation'
  | 'progress-degree'
  | 'progress-core'
  | 'progress-professional'
  | 'progress-public-required-degree'
  | 'progress-public-required-non-degree'
  | 'progress-professional-non-degree'
  | 'progress-public-elective'
  | 'progress-innovation'
  | 'progress-special-rule'
  | 'pending-approval'
  | 'pending-verification'
  | 'pending-doctor';

export type ProgramIssue = {
  id: string;
  kind: ProgramIssueKind;
  /** error=本学期必须处理(红)；progress=培养进度(黄/绿)；pending=待确认(琥珀)。 */
  severity: 'error' | 'progress' | 'pending';
  tone: 'red' | 'amber' | 'green' | 'slate';
  title: string;
  detail: string;
  action?: string;
  counted?: number;
  target?: number | null;
};

export type SemesterCheckupInput = GapInput & {
  /** 当前学期标识（2026-fall / 2027-spring / 2027-summer…）。 */
  termId: string;
  conflictsCount?: number;
  duplicateSectionCount?: number;
  sportsCourseCount?: number;
  /** 被非法设置为学位课的课程（研讨/实验/实践/讲座/公选等），正常应为空。 */
  illegalDegreeCourseNames?: string[];
  /** 需要导师/学院审核后才能确认的学位课课程名（approval_required）。 */
  approvalRequiredNames?: string[];
  /** 资料口径不足、无法自动确定的学位课课程名（verification）。 */
  verificationNames?: string[];
  /** 已修/已选/免修覆盖的课程基础名（一年级秋季必修判断用）。 */
  fallLearnedNames?: string[];
};

export type SemesterCheckup = {
  mustFix: ProgramIssue[];
  progress: ProgramIssue[];
  pending: ProgramIssue[];
  all: ProgramIssue[];
  gaps: ProgramGaps;
};

/** 当前学期属于秋/春/夏/未知。 */
export function termSeason(termId: string): 'fall' | 'spring' | 'summer' | 'unknown' {
  const value = termId.toLowerCase();
  if (value.includes('fall') || value.includes('autumn')) return 'fall';
  if (value.includes('spring')) return 'spring';
  if (value.includes('summer')) return 'summer';
  if (/秋/.test(termId)) return 'fall';
  if (/春/.test(termId)) return 'spring';
  if (/夏/.test(termId)) return 'summer';
  return 'unknown';
}

export function isDoctorDegree(degree: string) {
  return /博士/.test(degree);
}

/** 该培养类型是否适用“一年级秋季必修”检查（普博不适用）。 */
export function needsFirstYearFallMandatory(
  plan: ProgramPlan,
  track?: StudentTrack,
) {
  if (isDoctorDegree(plan.degree) && track === 'general_phd') return false;
  return true;
}

function normalizeMatchName(name: string) {
  return cleanCourseNameForMatch(name);
}

function countMatches(
  ruleNames: string[],
  degreeNames: string[],
): { count: number; matched: string[] } {
  const targets = new Set(ruleNames.map(normalizeMatchName));
  const matched: string[] = [];
  for (const name of degreeNames) {
    const clean = normalizeMatchName(name);
    if (targets.has(clean) && !matched.includes(clean)) matched.push(clean);
  }
  return { count: matched.length, matched };
}

function evaluateSpecialRule(
  rule: ProgramSpecialRule,
  confirmedDegreeNames: string[],
): RuleProgress {
  const { count, matched } = countMatches(
    rule.courseNames,
    confirmedDegreeNames,
  );
  const minimum =
    rule.type === 'requiredCourse' ? rule.courseNames.length : rule.minimum;
  const remainingCandidates = rule.courseNames.filter(
    (name) => !confirmedDegreeNames.some((item) => normalizeMatchName(item) === normalizeMatchName(name)),
  );
  return {
    id: rule.id,
    label: rule.label,
    satisfied: count >= minimum,
    current: count,
    minimum,
    matchedNames: matched,
    remainingCandidates,
    status: count >= minimum ? 'done' : 'short',
  };
}

/** 春季培养方案计划课程（学期标注春/秋春）命中培养方案课程库的数量。 */
export function countSpringOpportunity(
  planCourseNames: string[],
  springPlannedCourseNames: string[],
) {
  const planSet = new Set(planCourseNames.map(normalizeMatchName));
  return new Set(
    springPlannedCourseNames
      .map(normalizeMatchName)
      .filter((name) => planSet.has(name)),
  ).size;
}

/**
 * 培养缺口引擎 —— 体检与推荐唯一数据源。
 */
export function calculateProgramGaps(input: GapInput): ProgramGaps {
  const {
    plan,
    track,
    summary,
    courseCounts,
    confirmedDegreeNames,
    effectiveCredits,
    semesterTarget,
    springPlannedCourseNames = [],
  } = input;

  const degree = plan.degree;
  const isPhd = isDoctorDegree(degree);
  const isGeneralPhd = isPhd && track === 'general_phd';

  // 普博：学院材料未给出“2+2 / 16学分”级联确认；校级口径为专业学位课≥4（以培养方案为准）。
  const degreeCourseCreditsTarget = isGeneralPhd ? 4 : plan.degreeCourseCredits;
  const coreMinimum = isGeneralPhd ? null : plan.coreMinimum;
  const professionalMinimum = isGeneralPhd ? null : plan.professionalMinimum;

  const publicRequired: PublicRequiredBucket[] = [
    {
      id: 'degree',
      label: isPhd ? '公共必修学位课（含博士课程）' : '公共必修学位课',
      current: summary.publicRequiredDegreeCredits,
      target: isGeneralPhd
        ? 5 // 校级：中马当代2 + 学术道德1 + 博士学位英语2
        : plan.publicRequiredDegreeCredits ?? null,
    },
    {
      id: 'non-degree',
      label: '公共必修非学位课（工程伦理）',
      current: summary.publicRequiredNonDegreeCredits,
      target: plan.publicRequiredNonDegreeCredits ?? null,
    },
  ];

  const publicElectiveTarget =
    (plan.publicElectiveCredits ?? 0) + (plan.innovationCredits ?? 0);
  // 专业学位课 ≥12 学分：本专业确认(eligible)部分优先；跨专业课程（approval_required）
  // 可作为补充学分，但需导师/学院审核，且不替代本专业 2+2 门数。
  const professionalDegreeTotalCredits = summary.professionalDegreeCredits;
  const professionalDegreePendingApprovalCredits =
    summary.professionalDegreePendingApprovalCredits ?? 0;
  const degreeCourseCreditsConfirmed =
    professionalDegreeTotalCredits - professionalDegreePendingApprovalCredits;
  const creditsOkConfirmed =
    degreeCourseCreditsTarget === null ||
    degreeCourseCreditsConfirmed >= degreeCourseCreditsTarget;
  const creditsOkWithPending =
    !creditsOkConfirmed &&
    degreeCourseCreditsTarget !== null &&
    professionalDegreeTotalCredits >= degreeCourseCreditsTarget;
  const degreeCreditsShort = !creditsOkConfirmed && !creditsOkWithPending;
  const degreePendingApprovalUsed = creditsOkWithPending;
  const coreShort =
    coreMinimum !== null && courseCounts.coreCount < coreMinimum;
  const professionalShort =
    professionalMinimum !== null &&
    courseCounts.professionalCount < professionalMinimum;

  const specialRules = (plan.specialRules ?? []).map((rule) =>
    evaluateSpecialRule(rule, confirmedDegreeNames),
  );
  const specialRulesAllDone = specialRules.every((rule) => rule.satisfied);

  const allTargetsKnown =
    degreeCourseCreditsTarget !== null &&
    coreMinimum !== null &&
    professionalMinimum !== null;
  const degreeRuleSatisfied = isGeneralPhd
    ? null
    : allTargetsKnown
      ? !(
          degreeCreditsShort ||
          coreShort ||
          professionalShort ||
          !specialRulesAllDone
        )
      : null;

  const springOpportunity: Record<string, number> = {
    core: countSpringOpportunity(plan.coreCourses, springPlannedCourseNames),
    professional: countSpringOpportunity(
      plan.professionalCourses,
      springPlannedCourseNames,
    ),
  };

  const verificationNote = isGeneralPhd
    ? '普通招考博士（普博）：学院级完整培养规则在现有正式材料中未单独明确。本页不自动套用“2门核心+2门专业”；校级口径为专业学位课不低于4学分、具体参考培养方案。请结合学院培养方案及教务系统确认。'
    : plan.verificationNote ?? null;

  return {
    planId: plan.id,
    planLabel: plan.label,
    degree,
    program: plan.program,
    track,
    semesterCredits:
      semesterTarget === null || semesterTarget === undefined
        ? null
        : Math.max(0, semesterTarget - (effectiveCredits ?? 0)),
    semesterTarget: semesterTarget ?? null,
    publicRequired,
    degreeCourseCreditsTarget,
    degreeCourseCreditsConfirmed,
    professionalDegreePendingApprovalCredits,
    professionalDegreeTotalCredits,
    degreeCreditsShort,
    degreePendingApprovalUsed,
    coreCount: courseCounts.coreCount,
    coreMinimum,
    professionalCount: courseCounts.professionalCount,
    professionalMinimum,
    professionalNonDegreeCredits: summary.professionalElectiveCredits,
    professionalNonDegreeTarget: plan.professionalNonDegreeCredits,
    publicElectiveCredits: summary.publicElectiveCredits,
    publicElectiveTarget,
    innovationCredits: summary.innovationCredits,
    innovationTarget: plan.innovationCredits,
    specialRules,
    degreeRuleSatisfied,
    verificationNote,
    springOpportunity,
  };
}

function progressIssue(input: {
  key: string;
  label: string;
  counted: number;
  target: number | null;
  kind: ProgramIssueKind;
  springCount?: number;
  note?: string;
}): ProgramIssue {
  const done = input.target !== null && input.counted >= input.target;
  const unknown = input.target === null;
  const springCount = input.springCount ?? 0;
  return {
    id: `progress-${input.key}`,
    kind: input.kind,
    severity: 'progress',
    tone: done ? 'green' : unknown ? 'slate' : 'amber',
    title: input.label,
    detail: unknown
      ? '当前值待核验：培养材料未明确最低值。'
      : done
        ? `当前 ${input.counted} / ${input.target}，已满足。`
        : `当前 ${input.counted} / ${input.target}；${input.note ?? (springCount > 0 ? `2027 春季培养方案仍计划开设 ${springCount} 门相关课程，可在春季继续完成。` : '后续学期仍需完成。')}`,
    action:
      done || unknown
        ? undefined
        : '培养方案进度，不属于本学期选课错误。',
    counted: input.counted,
    target: input.target,
  };
}

/** 一年级秋季必修缺口（仅硕士/直博/硕博连读口径；普博不适用）。 */
export function missingFallMandatoryNames(
  plan: ProgramPlan,
  track: StudentTrack | undefined,
  learnedNames: string[],
) {
  if (!needsFirstYearFallMandatory(plan, track)) return [];
  const learned = new Set(learnedNames.map(normalizeMatchName));
  return FIRST_YEAR_FALL_MANDATORY_COURSES.filter(
    (name) => !learned.has(normalizeMatchName(name)),
  );
}

/**
 * 本学期检查：红 = 本学期必须处理；黄/绿 = 培养方案进度；琥珀 = 待确认事项。
 */
export function calculateSemesterCheckup(
  input: SemesterCheckupInput,
): SemesterCheckup {
  const gaps = calculateProgramGaps(input);
  const mustFix: ProgramIssue[] = [];
  const progress: ProgramIssue[] = [];
  const pending: ProgramIssue[] = [];

  const {
    termId,
    plan,
    track,
    conflictsCount = 0,
    duplicateSectionCount = 0,
    sportsCourseCount = 0,
    illegalDegreeCourseNames = [],
    approvalRequiredNames = [],
    verificationNames = [],
    fallLearnedNames,
  } = input;
  const season = termSeason(termId);

  // ---------- 本学期必须处理（红） ----------
  if (conflictsCount > 0) {
    mustFix.push({
      id: 'err-conflict',
      kind: 'time-conflict',
      severity: 'error',
      tone: 'red',
      title: `发现 ${conflictsCount} 组上课时间冲突`,
      detail: '同一教学周内存在星期与节次重叠的课程，请换班或调整选课。',
      action: '在冲突面板使用“无冲突替代班次”，或移除冲突课程。',
    });
  }
  if (duplicateSectionCount > 0) {
    mustFix.push({
      id: 'err-duplicate',
      kind: 'duplicate-section',
      severity: 'error',
      tone: 'red',
      title: `同一门课程选择了 ${duplicateSectionCount} 个教学班`,
      detail: '同一门课的不同班次不能同时选修。',
      action: '保留其中一个班次，移除其余班次。',
    });
  }
  if (sportsCourseCount > 1) {
    mustFix.push({
      id: 'err-sports',
      kind: 'sports-overflow',
      severity: 'error',
      tone: 'red',
      title: `体育类公共选修课选了 ${sportsCourseCount} 门`,
      detail: '体育类公选课每学期限选 1 门。',
      action: '移除多余的体育类课程。',
    });
  }
  if (season === 'fall' || season === 'spring') {
    const target = input.semesterTarget ?? 10;
    const effective = input.effectiveCredits ?? 0;
    if (effective < target) {
      mustFix.push({
        id: 'err-semester-credits',
        kind: 'semester-credits',
        severity: 'error',
        tone: 'red',
        title: `本学期有效选课学分 ${effective} / ${target}`,
        detail:
          '秋季、春季学期有效选课学分原则上均不低于 10 学分；HIAS讲堂与科学前沿讲座不计入该门槛。',
        action: '补充计入有效学分的课程（本学期正式开课、非讲座类）。',
        counted: effective,
        target,
      });
    }
  }
  if (season === 'fall' && fallLearnedNames) {
    const fallMissing = missingFallMandatoryNames(plan, track, fallLearnedNames);
    if (fallMissing.length) {
      mustFix.push({
        id: 'err-fall-mandatory',
        kind: 'fall-mandatory',
        severity: 'error',
        tone: 'red',
        title: '一年级秋季必修课尚未选择',
        detail: `《${fallMissing.join('》《')}》须在一年级秋季学期修读。`,
        action: '请在本学期选择该课程（已获成绩/学分时可忽略）。',
      });
    }
  }
  if (illegalDegreeCourseNames.length) {
    mustFix.push({
      id: 'err-illegal-degree',
      kind: 'illegal-degree-designation',
      severity: 'error',
      tone: 'red',
      title: `${illegalDegreeCourseNames.length} 门非学位性质课程被标记为学位课`,
      detail: `涉及：${illegalDegreeCourseNames.join('、')}。此类课程只能作为非学位课。`,
      action: '在“设置学位课属性”中改为非学位课。',
    });
  }

  // ---------- 培养方案进度（黄/绿） ----------
  gaps.publicRequired.forEach((bucket) => {
    const done = bucket.target !== null && bucket.current >= bucket.target;
    progress.push({
      id: `progress-public-required-${bucket.id}`,
      kind:
        bucket.id === 'degree'
          ? 'progress-public-required-degree'
          : 'progress-public-required-non-degree',
      severity: 'progress',
      tone: done ? 'green' : bucket.target === null ? 'slate' : 'amber',
      title: bucket.label,
      detail: done
        ? `当前 ${bucket.current} / ${bucket.target}，已满足。`
        : bucket.target === null
          ? '当前值待核验：培养材料未明确最低值。'
          : `当前 ${bucket.current} / ${bucket.target}；后续学期完成即可（非本学期错误）。`,
      counted: bucket.current,
      target: bucket.target,
    });
  });

  const degreeTarget = gaps.degreeCourseCreditsTarget;
  const degreeConfirmed = gaps.degreeCourseCreditsConfirmed;
  const degreePending = gaps.professionalDegreePendingApprovalCredits;
  const degreeTotal = gaps.professionalDegreeTotalCredits;
  const degreeDone = degreeTarget !== null && degreeConfirmed >= degreeTarget;
  const degreePendingReview =
    !degreeDone && degreeTarget !== null && degreeTotal >= degreeTarget;
  progress.push({
    id: 'progress-degree-credits',
    kind: 'progress-degree',
    severity: 'progress',
    tone: degreeDone
      ? 'green'
      : degreeTarget === null
        ? 'slate'
        : 'amber',
    title: '专业学位课学分',
    detail:
      gaps.track === 'general_phd' && degreeTarget === 4
        ? `当前 ${degreeConfirmed} / 4（校级口径），学院级规则待确认。`
        : degreeTarget === null
          ? '当前值待核验：培养材料未明确最低值。'
          : degreeDone
            ? `当前 ${degreeConfirmed} / ${degreeTarget}，已满足。`
            : degreePendingReview
              ? `当前确认 ${degreeConfirmed} / ${degreeTarget}；另有 ${formatCreditsSmall(degreePending)} 学分来自跨专业课程，若通过导师/学院审核即可满足 ≥${degreeTarget}（本专业 2 门核心 + 2 门专业仍需由本专业课程满足）。`
              : `当前确认 ${degreeConfirmed} / ${degreeTarget}${degreePending > 0 ? `（另有 ${formatCreditsSmall(degreePending)} 学分跨专业待审核）` : ''}；后续学期仍需完成。`,
    action:
      degreeDone || degreeTarget === null || degreePendingReview
        ? undefined
        : '培养方案进度，非本学期选课错误。',
    counted: degreeConfirmed,
    target: degreeTarget,
  });

  progress.push(
    progressIssue({
      key: 'core-count',
      label: '核心课作为学位课门数',
      counted: gaps.coreCount,
      target: gaps.coreMinimum,
      kind: 'progress-core',
      springCount: gaps.springOpportunity.core,
      note: gaps.coreMinimum === null
        ? '培养材料未明确最低值，暂按待核验展示。'
        : gaps.springOpportunity.core > 0
          ? `2027 春季培养方案仍计划开设 ${gaps.springOpportunity.core} 门核心课，可在春季继续完成。`
          : '后续学期仍需完成。',
    }),
  );
  progress.push(
    progressIssue({
      key: 'professional-count',
      label: '专业课作为学位课门数',
      counted: gaps.professionalCount,
      target: gaps.professionalMinimum,
      kind: 'progress-professional',
      springCount: gaps.springOpportunity.professional,
      note: gaps.professionalMinimum === null
        ? '培养材料未明确最低值，暂按待核验展示。'
        : gaps.springOpportunity.professional > 0
          ? `2027 春季培养方案仍计划开设 ${gaps.springOpportunity.professional} 门专业课，可在春季继续完成。`
          : '后续学期仍需完成。',
    }),
  );

  const nonDegreeDone =
    gaps.professionalNonDegreeTarget !== null &&
    gaps.professionalNonDegreeCredits >= gaps.professionalNonDegreeTarget;
  progress.push({
    id: 'progress-professional-non-degree',
    kind: 'progress-professional-non-degree',
    severity: 'progress',
    tone: nonDegreeDone ? 'green' : gaps.professionalNonDegreeTarget === null ? 'slate' : 'amber',
    title: '专业非学位课（专业选修）',
    detail: nonDegreeDone
      ? `当前 ${gaps.professionalNonDegreeCredits} / ${gaps.professionalNonDegreeTarget}，已满足。`
      : gaps.professionalNonDegreeTarget === null
        ? '当前值待核验：材料未明确（学硕/博士通常不限）。'
        : `当前 ${gaps.professionalNonDegreeCredits} / ${gaps.professionalNonDegreeTarget}；科学前沿讲座可计入该学分（不计入学期10学分门槛）。`,
    action: nonDegreeDone || gaps.professionalNonDegreeTarget === null ? undefined : '培养方案进度，非本学期选课错误。',
    counted: gaps.professionalNonDegreeCredits,
    target: gaps.professionalNonDegreeTarget,
  });

  const publicElectiveDone =
    gaps.publicElectiveTarget !== null &&
    gaps.publicElectiveCredits >= gaps.publicElectiveTarget;
  progress.push({
    id: 'progress-public-elective-system',
    kind: 'progress-public-elective',
    severity: 'progress',
    tone: publicElectiveDone
      ? 'green'
      : gaps.publicElectiveTarget === null
        ? 'slate'
        : 'amber',
    title:
      gaps.innovationTarget !== null && gaps.innovationTarget !== undefined
        ? '公共选修体系（含创新创业模块）'
        : '公共选修体系',
    detail: publicElectiveDone
      ? `当前 ${gaps.publicElectiveCredits} / ${gaps.publicElectiveTarget}，已满足。`
      : gaps.publicElectiveTarget === null
        ? '当前值待核验。'
        : `当前 ${gaps.publicElectiveCredits} / ${gaps.publicElectiveTarget}（体系合计——专硕的创新创业模块已包含在内，不理解为两套要求相加；HIAS讲堂按公共选修课计入本体系）。`,
    action:
      publicElectiveDone || gaps.publicElectiveTarget === null
        ? undefined
        : '培养方案进度，非本学期选课错误。',
    counted: gaps.publicElectiveCredits,
    target: gaps.publicElectiveTarget,
  });

  // 创新创业模块：是公共选修体系的一部分（专硕口径），作为“其中”子项单独提示，不额外相加
  if (gaps.innovationTarget !== null && gaps.innovationTarget !== undefined) {
    const innovationDone =
      gaps.innovationCredits >= gaps.innovationTarget;
    progress.push({
      id: 'progress-innovation',
      kind: 'progress-innovation',
      severity: 'progress',
      tone: innovationDone ? 'green' : 'amber',
      title: '其中：创新创业模块（含在公共选修体系内）',
      detail: innovationDone
        ? `当前 ${gaps.innovationCredits} / ${gaps.innovationTarget}，已满足。`
        : `当前 ${gaps.innovationCredits} / ${gaps.innovationTarget}（计入上一条“公共选修体系”合计，不额外 +1）。`,
      counted: gaps.innovationCredits,
      target: gaps.innovationTarget,
    });
  }

  gaps.specialRules.forEach((rule) => {
    const done = rule.satisfied === true;
    progress.push({
      id: `progress-special-${rule.id}`,
      kind: 'progress-special-rule',
      severity: 'progress',
      tone: done ? 'green' : 'amber',
      title: rule.label,
      detail: done
        ? `当前命中 ${rule.current} 门（要求 ≥ ${rule.minimum ?? 1}），已满足。`
        : `当前命中 ${rule.current} 门，要求 ≥ ${rule.minimum ?? 1}。`,
      action: done
        ? undefined
        : `可选课程：${rule.remainingCandidates.join('、') || '本学期课程库暂无，可留待后续学期'}。`,
      counted: rule.current,
      target: rule.minimum,
    });
  });

  // ---------- 待确认事项（琥珀） ----------
  if (gaps.verificationNote) {
    pending.push({
      id: 'pending-plan-verification',
      kind: 'pending-doctor',
      severity: 'pending',
      tone: 'amber',
      title: '培养口径待确认',
      detail: gaps.verificationNote,
    });
  }
  if (approvalRequiredNames.length) {
    pending.push({
      id: 'pending-approval',
      kind: 'pending-approval',
      severity: 'pending',
      tone: 'amber',
      title: `${approvalRequiredNames.length} 门课程作为学位课需导师/学院审核`,
      detail: `涉及：${approvalRequiredNames.join('、')}。此类课程仍可选择，但暂不计入已确认的专业学位要求，需结合导师及学院审核确认。`,
      action: '如需计入门数与学分，请完成审核后再确认。',
    });
  }
  if (verificationNames.length) {
    pending.push({
      id: 'pending-verification',
      kind: 'pending-verification',
      severity: 'pending',
      tone: 'amber',
      title: `${verificationNames.length} 门课程数据口径待核验`,
      detail: `涉及：${verificationNames.join('、')}。当前数据或正式资料不足以自动确定其培养归属，请以教务系统及学院认定为准。`,
      action: '资料不确定 ≠ 不允许，但暂不自动计入已确认要求。',
    });
  }

  return {
    mustFix,
    progress,
    pending,
    all: [...mustFix, ...progress, ...pending],
    gaps,
  };
}
