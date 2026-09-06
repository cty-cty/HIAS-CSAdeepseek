/**
 * recommendation-engine.ts —— 智能方案生成（纯函数，禁止 import React）。
 *
 * 阶段：
 *   1) candidate generation + hard filtering（违反硬规则直接排除，不给分数）
 *   2) course contribution（读取 program-rules 的 ProgramGaps，绝不自行重算一套规则）
 *   3) plan generation（有限启发式贪心 + 班次可替换，禁止指数级全组合暴力搜索）
 *   4) plan metrics（与体检使用完全相同的 credit-model 统计口径做投影）
 *
 * 纪律：
 *   - 不是“最佳方案”，而是“推荐方案/均衡方案/时间集中方案”；
 *   - 用户当前已选默认锁定，未经允许算法不删除、不替换；
 *   - 同课程多班次作为可替换 section，推荐结果里只作为一门课程出现；
 *   - overFulfillmentPenalty：核心/专业/公选已满足后不再因该角色获得最高分；
 *   - 无排课数据不参与冲突判断，在方案中标记为待确认；
 *   - courseOpportunity 只用于产品推荐，不伪装成学校规定。
 */

import type { ProgramPlan, StudentTrack } from './program-plans';
import {
  getDegreeEligibility,
  getCourseDesignation,
  getCourseModule,
  isCoreDegreeType,
  isProfessionalDegreeType,
  isInnovationCourse,
  getCourseRequirementType,
  isEngineeringEthics,
  isHiasCourse,
  isPublicRequiredCourse,
  calculateCreditSummary,
  getPlanCourseCounts,
  type CourseDesignation,
  type CourseLike,
  type ExemptionStatus,
  type HistoricalRecord,
} from './credit-model';
import { canonicalCourseId } from './course-identity';
import {
  calculateProgramGaps,
  termSeason,
  type ProgramGaps,
} from './program-rules';

export type ScheduleLike = {
  day: string;
  dayIndex: number;
  start: number;
  end: number;
  weeks: number[];
  /** 展示用（如“周四(3-4)”），非冲突计算字段。 */
  periodText?: string;
};

export type CourseRecord = {
  id: string;
  code: string;
  name: string;
  englishName?: string;
  college?: string;
  category: string;
  level?: string;
  subject: string;
  hours?: string;
  credits: number;
  capacity?: number;
  enrolled?: number;
  teachingMode?: string;
  examMode?: string;
  teacher?: string;
  officialCode?: string | null;
  semesterNote?: string;
  scheduleStatus?: 'planned' | 'confirmed';
  schedules: ScheduleLike[];
};

function toCourseLike(course: CourseRecord): CourseLike {
  return {
    id: course.id,
    code: course.code,
    name: course.name,
    category: course.category,
    subject: course.subject,
    credits: course.credits,
    module: getCourseModule({ code: course.code, name: course.name }),
  };
}

function baseName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, '')
    .replace(/[-—－]?\d+班$/, '');
}

function isEnglishCourseRecord(course: CourseRecord) {
  return (
    /050200MB001/i.test(course.code) ||
    /050200MB001/i.test(course.officialCode ?? '') ||
    course.name === '硕士学位英语' ||
    course.name.startsWith('英语')
  );
}

function intersects<T>(left: T[], right: T[]) {
  const lookup = new Set(left);
  return right.some((item) => lookup.has(item));
}

export function schedulesOverlap(left: ScheduleLike, right: ScheduleLike) {
  return (
    left.dayIndex === right.dayIndex &&
    left.start <= right.end &&
    right.start <= left.end &&
    intersects(left.weeks, right.weeks)
  );
}

export function coursesOverlap(left: CourseRecord, right: CourseRecord) {
  return left.schedules.some((a) =>
    right.schedules.some((b) => schedulesOverlap(a, b)),
  );
}

/** 课程是否有可用于冲突判断的排课数据。 */
export function hasUsableSchedule(course: CourseRecord) {
  return course.schedules.some(
    (schedule) =>
      schedule.dayIndex >= 0 &&
      Number.isFinite(schedule.start) &&
      Number.isFinite(schedule.end) &&
      schedule.weeks.length > 0,
  );
}

export function weekendCourseCount(courses: CourseRecord[]) {
  return courses.filter((course) =>
    course.schedules.some(
      (schedule) => schedule.dayIndex >= 5 && schedule.weeks.length > 0,
    ),
  ).length;
}

export function closedExamCount(courses: CourseRecord[]) {
  return courses.filter((course) => /闭卷/.test(course.examMode ?? '')).length;
}

export function reportCourseCount(courses: CourseRecord[]) {
  return courses.filter((course) =>
    /报告|论文|综述|汇报|大作业/.test(course.examMode ?? ''),
  ).length;
}

export function longSessionCount(courses: CourseRecord[]) {
  return courses.filter((course) =>
    course.schedules.some((schedule) => schedule.end - schedule.start >= 3),
  ).length;
}

/** 待确认课程数：无排课数据（计划课程/时间未知）。 */
export function pendingTimeCourseCount(courses: CourseRecord[]) {
  return courses.filter((course) => !hasUsableSchedule(course)).length;
}

function countsTowardSemesterMinimum(course: CourseRecord) {
  return !/科学前沿讲座|HIAS讲堂|人文系列讲座/.test(
    `${course.category} ${course.name}`,
  );
}

/**
 * 官方资料中明确“秋春季都开设”的课程（用于机会判断，不改学校规则）。
 * 来源：物光学院课程设置（秋、春）+ 2026-2027 选课须知“开课学期”表。
 */
const KNOWN_BOTH_TERM_NAMES = new Set([
  'FPGA电路软硬件设计',
  '学术道德与学术写作规范',
  '硕士学位英语',
  '工程伦理',
]);

export function courseOpportunity(
  course: CourseRecord,
): 'fall' | 'spring' | 'both' | 'unknown' {
  const note = String(course.semesterNote ?? '').trim();
  if (/秋/.test(note) && /春/.test(note)) return 'both';
  if (/春/.test(note)) return 'spring';
  if (/秋/.test(note)) return 'fall';
  if (KNOWN_BOTH_TERM_NAMES.has(baseName(course.name))) return 'both';
  return 'unknown';
}

export type CandidateRole =
  | 'core-degree'
  | 'professional-degree'
  | 'public-required-degree'
  | 'public-required-non-degree'
  | 'professional-elective'
  | 'public-elective'
  | 'innovation';

export type Candidate = {
  course: CourseRecord;
  /** 同课程全部班次（课程级候选；推荐结果里只作为一门课程）。 */
  sections: CourseRecord[];
  roles: CandidateRole[];
  fillsSemesterCredits: boolean;
  degreeEligibleInScope: boolean;
  designationOnAdd: CourseDesignation;
  inPlanCore: boolean;
  inPlanProfessional: boolean;
  hasSchedule: boolean;
  opportunity: 'fall' | 'spring' | 'both' | 'unknown';
  canonicalId: string;
  levelNote: string | null;
};

export type PlanMode = 'requirement-first' | 'balanced' | 'compact';

export type Addition = {
  course: CourseRecord;
  reasons: string[];
  sectionNote?: string;
};

export type PlanMetrics = {
  totalCredits: number;
  effectiveCredits: number;
  coreCount: number;
  coreMinimum: number | null;
  professionalCount: number;
  professionalMinimum: number | null;
  professionalDegreeCredits: number;
  degreeCourseCreditsTarget: number | null;
  professionalElectiveCredits: number;
  professionalNonDegreeTarget: number | null;
  publicElectiveCredits: number;
  publicElectiveTarget: number | null;
  innovationCredits: number;
  innovationTarget: number | null;
  weekendCourses: number;
  closedExams: number;
  reportCourses: number;
  longSessions: number;
  pendingTimeCourses: number;
  conflicts: number;
};

export type GeneratedPlan = {
  mode: PlanMode;
  name: string;
  intro: string;
  additions: Addition[];
  notes: string[];
  reasonsTop: string[];
  metrics: PlanMetrics;
  projectedGaps: ProgramGaps;
  empty: boolean;
};

export type RecommendationRequest = {
  termId: string;
  courses: CourseRecord[];
  selectedCourses: CourseRecord[];
  selectedIds: string[];
  plan: ProgramPlan;
  track?: StudentTrack;
  historicalRecords?: HistoricalRecord[];
  designations: Record<string, CourseDesignation>;
  exemptionStatus?: ExemptionStatus;
  /** 当前学期最低有效学分（秋/春 10，夏 null）。 */
  semesterTarget: number | null;
  springPlannedCourseNames?: string[];
  allowOptimize?: boolean;
  excludedIds?: string[];
  maxAdditionsPerPlan?: number;
};

export type RecommendationResult = {
  candidates: Candidate[];
  plans: GeneratedPlan[];
};

function makeDesignationOnAdd(
  course: CourseRecord,
  plan: ProgramPlan,
): CourseDesignation {
  const courseLike = toCourseLike(course);
  const role = getCourseDesignation(courseLike, {}, plan);
  if (
    (isCoreDegreeType(courseLike) || isProfessionalDegreeType(courseLike)) &&
    getDegreeEligibility(courseLike, plan).status === 'eligible'
  ) {
    return 'degree';
  }
  return role === 'non-degree' ? 'non-degree' : 'unset';
}

function courseDesignationKey(course: CourseRecord) {
  const code = course.code || '';
  if (/050200MB001/i.test(code) || course.name.startsWith('英语')) {
    return 'family:english-degree-course';
  }
  return `family:${baseName(course.name)}`;
}

/**
 * 候选生成 + 硬过滤（不进评分，直接排除）：
 * 时间冲突 / 同课程重复 / 已满班 / 体育课已超 / 已明确排除。
 */
export function buildCandidates(request: RecommendationRequest): Candidate[] {
  const {
    courses,
    selectedCourses,
    selectedIds,
    plan,
    excludedIds = [],
    historicalRecords = [],
    exemptionStatus = 'normal',
  } = request;
  const selectedCanonical = new Set(
    selectedCourses.map((course) => canonicalCourseId(course)),
  );
  // 已修/前序学期已选课程（作为历史记录传入）不再重复推荐同一门课
  const historyCanonical = new Set(
    historicalRecords
      .filter((record) => record.courseName)
      .map((record) =>
        canonicalCourseId({
          code: record.courseCode,
          name: record.courseName,
          subject: record.subject ?? '',
        }),
      ),
  );
  const selectedSportsCount = selectedCourses.filter(
    (course) => course.subject === '体育学',
  ).length;
  const excluded = new Set(excludedIds);

  // 先按课程身份分组（同一门课的不同教学班归入一个课程级候选）
  const groups = new Map<string, CourseRecord[]>();
  for (const course of courses) {
    if (selectedIds.includes(course.id)) continue;
    if (excluded.has(course.id)) continue;
    const key = canonicalCourseId(course);
    if (selectedCanonical.has(key)) continue; // 同课不同班已选
    if (historyCanonical.has(key)) continue; // 该课程已计入前序学期/历史
    // 英语免修免考已获批：英语类课程视为已获学分，不再作为候选
    if (exemptionStatus === 'approved' && isEnglishCourseRecord(course)) continue;
    const list = groups.get(key) ?? [];
    list.push(course);
    groups.set(key, list);
  }

  const candidates: Candidate[] = [];
  for (const [canonicalId, rows] of groups) {
    const lead = rows[0];
    // 已满班（capacity>0 且 enrolled>=capacity 才算满；0/未知不视为满）
    const notFull = rows.filter(
      (course) =>
        !((course.capacity ?? 0) > 0 && (course.enrolled ?? 0) >= (course.capacity ?? 0)),
    );
    if (!notFull.length) continue;
    // 体育课限选 1 门
    if (lead.subject === '体育学' && selectedSportsCount >= 1) continue;

    // 无排课数据：不参与冲突判断（保留候选，标记待确认）
    const hasSchedule = notFull.some(hasUsableSchedule);
    if (hasSchedule) {
      const conflictFreeRows = notFull.filter((course) => {
        if (!hasUsableSchedule(course)) return false;
        return selectedCourses.every((selected) => {
          if (canonicalCourseId(selected) === canonicalId) return true;
          if (!hasUsableSchedule(selected)) return true;
          return !coursesOverlap(course, selected);
        });
      });
      if (!conflictFreeRows.length) continue;
    }

    const courseLike = toCourseLike(lead);
    const degreeEligibility = getDegreeEligibility(courseLike, plan);
    const inPlanCore = plan.coreCourses.some(
      (name) => baseName(lead.name) === baseName(name),
    );
    const inPlanProfessional = plan.professionalCourses.some(
      (name) => baseName(lead.name) === baseName(name),
    );
    const degreeEligibleInScope =
      (inPlanCore || inPlanProfessional) &&
      degreeEligibility.status === 'eligible';
    const designation = makeDesignationOnAdd(lead, plan);
    const requirementType = getCourseRequirementType(
      courseLike,
      designation,
      plan,
    );

    const roles: CandidateRole[] = [];
    if (isEngineeringEthics(courseLike)) {
      roles.push('public-required-non-degree');
    } else if (isHiasCourse(courseLike)) {
      // HIAS讲堂：专业非学位课（专业选修），可补“专业非学位课”学分
      roles.push('professional-elective');
    } else if (isPublicRequiredCourse(courseLike)) {
      roles.push(
        requirementType === 'publicRequiredNonDegree'
          ? 'public-required-non-degree'
          : 'public-required-degree',
      );
    } else if (/公共选修课/.test(lead.category)) {
      roles.push(isInnovationCourse(courseLike) ? 'innovation' : 'public-elective');
    } else if (inPlanCore && isCoreDegreeType(courseLike) && degreeEligibleInScope) {
      roles.push('core-degree');
    } else if (
      inPlanProfessional &&
      isProfessionalDegreeType(courseLike) &&
      degreeEligibleInScope
    ) {
      roles.push('professional-degree');
    } else {
      // 跨专业/课程池外或仅能作非学位的课程：可作为专业选修（非学位）
      roles.push('professional-elective');
    }
    // 候选必须在某一角色上有意义；既不能补学位缺口、又不能作任何学分的课不推
    if (!roles.length) continue;

    candidates.push({
      course: lead,
      sections: notFull,
      roles,
      fillsSemesterCredits: countsTowardSemesterMinimum(lead),
      degreeEligibleInScope,
      designationOnAdd: designation,
      inPlanCore,
      inPlanProfessional,
      hasSchedule,
      opportunity: courseOpportunity(lead),
      canonicalId,
      levelNote: levelFitNote(lead, plan, request.track),
    });
  }
  return candidates;
}

function levelFitNote(
  course: CourseRecord,
  plan: ProgramPlan,
  track?: StudentTrack,
) {
  const level = course.level ?? '';
  const isPhd = /博士/.test(plan.degree);
  if (/博士课程/.test(level) && !isPhd) {
    return '该课程标注为博士课程；硕士培养是否可选请以学院培养方案为准。';
  }
  if (/硕士课程/.test(level) && isPhd && track === 'general_phd') {
    return '该课程标注为硕士课程；普博是否可选请以学院培养方案为准。';
  }
  return null;
}

/** 同课程多个教学班中，选择与已锁课程均无冲突的一个班次。 */
function chooseSection(
  candidate: Candidate,
  concrete: CourseRecord[],
): { section: CourseRecord; note?: string } {
  const sections = candidate.sections.length ? candidate.sections : [candidate.course];
  if (sections.length <= 1) return { section: candidate.course };
  const conflictFree = sections.filter((section) =>
    concrete.every((existing) => {
      if (canonicalCourseId(existing) === canonicalCourseId(section)) return true;
      if (!hasUsableSchedule(section) || !hasUsableSchedule(existing)) return true;
      return !coursesOverlap(existing, section);
    }),
  );
  const chosen = conflictFree.length ? conflictFree[0] : sections[0];
  return {
    section: chosen,
    note:
      chosen.id !== candidate.course.id
        ? `已为该课程选择「${chosen.name}」班次，以避免时间冲突。`
        : undefined,
  };
}

export type ProjectedState = {
  allCourses: CourseRecord[];
  effectiveCredits: number;
  summary: ReturnType<typeof calculateCreditSummary>;
  counts: ReturnType<typeof getPlanCourseCounts>;
  confirmedDegreeNames: string[];
  gaps: ProgramGaps;
};

/** 与体检完全一致的投影口径：给定目标选课集合，计算统计与缺口。 */
export function projectState(
  targetCourses: CourseRecord[],
  designations: Record<string, CourseDesignation>,
  historicalRecords: HistoricalRecord[],
  exemptionStatus: ExemptionStatus,
  plan: ProgramPlan,
  track: StudentTrack | undefined,
  semesterTarget: number | null,
  springPlannedCourseNames: string[],
): ProjectedState {
  const courseLikes = targetCourses.map(toCourseLike);
  const designationMap = { ...designations };
  targetCourses.forEach((course) => {
    const designation = makeDesignationOnAdd(course, plan);
    if (designation === 'degree' || designation === 'non-degree') {
      const key = courseDesignationKey(course);
      if (designationMap[key] === undefined) designationMap[key] = designation;
    }
  });

  const summary = calculateCreditSummary({
    selectedCourses: courseLikes,
    designations: designationMap,
    historicalRecords,
    exemptionStatus,
    plan,
  });
  const counts = getPlanCourseCounts({
    courses: courseLikes,
    plan,
    designations: designationMap,
    historicalRecords,
  });

  // 有效学分口径与 UI 完全一致：英语免修不重复计、历史已修课程不重复计、讲座类不计
  const historicalCodes = new Set(
    historicalRecords
      .map((record) => record.courseCode.trim())
      .filter(Boolean),
  );
  const effectiveCredits = targetCourses
    .filter(
      (course) =>
        !(exemptionStatus === 'approved' && isEnglishLike(course)) &&
        !historicalCodes.has(course.code.trim()),
    )
    .filter(countsTowardSemesterMinimum)
    .reduce((sum, course) => sum + course.credits, 0);

  const confirmedDegreeNames = collectConfirmedDegreeNames(
    targetCourses,
    historicalRecords,
    plan,
    designationMap,
  );
  const gaps = calculateProgramGaps({
    plan,
    track,
    summary: {
      publicRequiredDegreeCredits: summary.publicRequiredDegreeCredits,
      publicRequiredNonDegreeCredits: summary.publicRequiredNonDegreeCredits,
      professionalDegreeCredits: summary.professionalDegreeCredits,
      professionalElectiveCredits: summary.professionalElectiveCredits,
      publicElectiveCredits: summary.publicElectiveCredits,
      innovationCredits: summary.innovationCredits,
    },
    courseCounts: {
      coreCount: counts.coreCount,
      professionalCount: counts.professionalCount,
    },
    confirmedDegreeNames,
    effectiveCredits,
    semesterTarget,
    springPlannedCourseNames,
  });
  return {
    allCourses: targetCourses,
    effectiveCredits,
    summary,
    counts,
    confirmedDegreeNames,
    gaps,
  };
}

function isEnglishLike(course: CourseRecord) {
  return (
    /050200MB001/i.test(course.code) || course.name.startsWith('英语')
  );
}

/** 已确认（degree + eligible）学位课课程名（体检/推荐共用口径）。 */
export function collectConfirmedDegreeNames(
  targetCourses: CourseRecord[],
  historicalRecords: HistoricalRecord[],
  plan: ProgramPlan,
  designations: Record<string, CourseDesignation>,
) {
  const names = new Set<string>();
  const tryAdd = (courseLike: CourseLike) => {
    if (getDegreeEligibility(courseLike, plan).status === 'eligible') {
      names.add(baseName(courseLike.name));
    }
  };
  targetCourses.forEach((course) => {
    const courseLike = toCourseLike(course);
    const designation = getCourseDesignation(courseLike, designations, plan);
    if (designation === 'degree') tryAdd(courseLike);
  });
  historicalRecords.forEach((record) => {
    if (record.designation === 'degree' && record.courseName) {
      tryAdd({
        id: record.id,
        code: record.courseCode,
        name: record.courseName,
        category: record.category,
        subject: record.subject ?? '',
        credits: record.credits,
        module: getCourseModule({ code: record.courseCode, name: record.courseName }),
      });
    }
  });
  return [...names];
}

function modeIntro(mode: PlanMode): { name: string; intro: string } {
  if (mode === 'requirement-first') {
    return {
      name: '推荐方案',
      intro: '优先补齐本学期硬性缺口与本专业学位课缺口，兼顾少而必要的课程。',
    };
  }
  if (mode === 'balanced') {
    return {
      name: '均衡方案',
      intro: '在满足学期门槛的前提下分散考核压力，避免闭卷/报告集中在同一时段。',
    };
  }
  return {
    name: '时间集中方案',
    intro: '在满足学期门槛的前提下尽量集中上课天数、减少周末与早课。',
  };
}

function scoreCandidate(
  candidate: Candidate,
  state: {
    semNeed: number;
    mandatoryMissing: Set<string>;
  },
  gaps: ProgramGaps,
  mode: PlanMode,
): number {
  let score = 0;
  const course = candidate.course;
  const semNeed = state.semNeed;

  if (state.mandatoryMissing.has(baseName(course.name))) score += 100_000;
  if (semNeed > 0 && candidate.fillsSemesterCredits) {
    score += 1500 + Math.min(course.credits, semNeed) * 30;
  }

  if (candidate.roles.includes('core-degree')) {
    const coreOpen = gaps.coreMinimum !== null && gaps.coreCount < gaps.coreMinimum;
    const degreeCreditOpen = gaps.degreeCreditsShort;
    const springHasCore = (gaps.springOpportunity.core ?? 0) > 0;
    if (coreOpen) {
      score += 2400 + (springHasCore ? 0 : 400);
    } else if (degreeCreditOpen) {
      score += 500 + course.credits * 10;
    } else {
      score -= 1400; // overFulfillmentPenalty：核心已满足不再因“核心课”得高分
    }
  } else if (candidate.roles.includes('professional-degree')) {
    const proOpen =
      gaps.professionalMinimum !== null &&
      gaps.professionalCount < gaps.professionalMinimum;
    const degreeCreditOpen = gaps.degreeCreditsShort;
    const springHasPro = (gaps.springOpportunity.professional ?? 0) > 0;
    if (proOpen) {
      score += 2200 + (springHasPro ? 0 : 400);
    } else if (degreeCreditOpen) {
      score += 500 + course.credits * 10;
    } else {
      score -= 1400;
    }
  }

  if (candidate.roles.includes('public-required-degree')) {
    const bucket = gaps.publicRequired.find((item) => item.id === 'degree');
    score += bucket && bucket.target !== null && bucket.current < bucket.target ? 900 : -300;
  }
  if (candidate.roles.includes('public-required-non-degree')) {
    const bucket = gaps.publicRequired.find((item) => item.id === 'non-degree');
    score += bucket && bucket.target !== null && bucket.current < bucket.target ? 700 : -300;
  }
  if (candidate.roles.includes('innovation')) {
    score += gaps.innovationCredits < (gaps.innovationTarget ?? 0) ? 1100 : -400;
  } else if (candidate.roles.includes('public-elective')) {
    score += gaps.publicElectiveCredits < (gaps.publicElectiveTarget ?? 0) ? 700 : -200;
  }
  if (candidate.roles.includes('professional-elective')) {
    const target = gaps.professionalNonDegreeTarget;
    if (target !== null && gaps.professionalNonDegreeCredits < target) score += 600;
    else if (target === null) score += 150;
    else score -= 200;
  }

  const remaining = gaps.specialRules.flatMap((rule) => rule.remainingCandidates);
  if (remaining.some((name) => baseName(name) === baseName(course.name))) {
    score += 900;
  }

  if (mode === 'balanced') {
    if (/闭卷/.test(course.examMode ?? '')) score -= 120;
    if (/报告|论文/.test(course.examMode ?? '')) score += 80;
  }
  if (mode === 'compact') {
    if (course.schedules.some((s) => s.dayIndex >= 5 && s.weeks.length > 0)) {
      score -= 2000;
    }
    if (course.schedules.some((s) => s.start <= 2)) score -= 300;
  }

  if (!candidate.hasSchedule) score -= 20;
  if (candidate.levelNote) score -= 100;
  return score;
}

/**
 * 生成候选方案：逐次迭代 + 有限启发式（每次最多 maxAdditionsPerPlan 门新增）。
 */
export function generateRecommendationPlans(
  request: RecommendationRequest,
  candidates: Candidate[],
): RecommendationResult {
  const {
    selectedCourses,
    selectedIds,
    plan,
    track,
    designations,
    historicalRecords = [],
    exemptionStatus = 'normal',
    semesterTarget,
    springPlannedCourseNames = [],
    maxAdditionsPerPlan = 6,
  } = request;

  const locked = selectedCourses.filter((course) => selectedIds.includes(course.id));
  const initialProjection = projectState(
    locked,
    designations,
    historicalRecords,
    exemptionStatus,
    plan,
    track,
    semesterTarget,
    springPlannedCourseNames,
  );
  const mandatoryMissing = missingMandatoryForPlan(request, locked);
  const modes: PlanMode[] = ['requirement-first', 'balanced', 'compact'];
  const plans: GeneratedPlan[] = [];

  for (const mode of modes) {
    const state = {
      added: [] as CourseRecord[],
      concrete: [...locked],
      semNeed:
        semesterTarget === null
          ? 0
          : Math.max(0, semesterTarget - initialProjection.effectiveCredits),
      mandatoryMissing: new Set(mandatoryMissing),
    };
    const additions: Addition[] = [];
    const addedCanonical = new Set(
      locked.map((course) => canonicalCourseId(course)),
    );
    const reasonsLog: string[] = [];

    for (let step = 0; step < maxAdditionsPerPlan; step += 1) {
      const projection =
        state.added.length > 0
          ? projectState(
              [...locked, ...state.added],
              designations,
              historicalRecords,
              exemptionStatus,
              plan,
              track,
              semesterTarget,
              springPlannedCourseNames,
            )
          : initialProjection;
      const gaps = projection.gaps;

      const semesterDone =
        projection.effectiveCredits >= (semesterTarget ?? Number.POSITIVE_INFINITY) ||
        state.semNeed <= 0;
      const mandatoryDone = state.mandatoryMissing.size === 0;
      // “只能本学期解决”的缺口：核心/专业仍有缺口且春季计划中没有机会
      const urgentCoreOpen =
        gaps.coreMinimum !== null &&
        gaps.coreCount < gaps.coreMinimum &&
        (gaps.springOpportunity.core ?? 0) === 0;
      const urgentProOpen =
        gaps.professionalMinimum !== null &&
        gaps.professionalCount < gaps.professionalMinimum &&
        (gaps.springOpportunity.professional ?? 0) === 0;
      if (semesterDone && mandatoryDone && !urgentCoreOpen && !urgentProOpen) {
        break;
      }
      if (!semesterDone && state.semNeed <= 0) {
        break;
      }

      // 计算每个候选的分数并选择（班次自动避开冲突）
      const scored: Array<{
        candidate: Candidate;
        section: CourseRecord;
        note?: string;
        score: number;
      }> = [];
      for (const candidate of candidates) {
        if (addedCanonical.has(candidate.canonicalId)) continue;
        // 与已锁 + 已加课程冲突（无排课数据不判冲突）
        const sectionChoice = chooseSection(candidate, state.concrete);
        if (hasUsableSchedule(sectionChoice.section)) {
          const conflictsWithExisting = state.concrete.some((existing) => {
            if (canonicalCourseId(existing) === candidate.canonicalId) return true;
            if (!hasUsableSchedule(existing)) return true;
            return coursesOverlap(sectionChoice.section, existing);
          });
          if (conflictsWithExisting) continue;
        }
        scored.push({
          candidate,
          section: sectionChoice.section,
          note: sectionChoice.note,
          score: scoreCandidate(candidate, state, gaps, mode),
        });
      }
      scored.sort((left, right) => right.score - left.score);
      if (!scored.length || scored[0].score <= -2000) break;

      const best = scored[0];
      state.added.push(best.section);
      state.concrete.push(best.section);
      addedCanonical.add(canonicalCourseId(best.section));
      if (best.candidate.fillsSemesterCredits) {
        state.semNeed = Math.max(0, state.semNeed - best.section.credits);
      }
      if (state.mandatoryMissing.has(baseName(best.section.name))) {
        state.mandatoryMissing.delete(baseName(best.section.name));
      }
      const reasons = buildReasons(best.section, best.candidate, gaps);
      reasonsLog.push(...reasons);
      additions.push({
        course: best.section,
        reasons,
        sectionNote: best.note,
      });
    }

    const finalProjection = state.added.length
      ? projectState(
          [...locked, ...state.added],
          designations,
          historicalRecords,
          exemptionStatus,
          plan,
          track,
          semesterTarget,
          springPlannedCourseNames,
        )
      : initialProjection;

    const metrics: PlanMetrics = {
      totalCredits: finalProjection.summary.selectionCredits,
      effectiveCredits: finalProjection.effectiveCredits,
      coreCount: finalProjection.counts.coreCount,
      coreMinimum: finalProjection.gaps.coreMinimum,
      professionalCount: finalProjection.counts.professionalCount,
      professionalMinimum: finalProjection.gaps.professionalMinimum,
      professionalDegreeCredits: finalProjection.summary.professionalDegreeCredits,
      degreeCourseCreditsTarget: finalProjection.gaps.degreeCourseCreditsTarget,
      professionalElectiveCredits: finalProjection.summary.professionalElectiveCredits,
      professionalNonDegreeTarget: finalProjection.gaps.professionalNonDegreeTarget,
      publicElectiveCredits: finalProjection.summary.publicElectiveCredits,
      publicElectiveTarget: finalProjection.gaps.publicElectiveTarget,
      innovationCredits: finalProjection.summary.innovationCredits,
      innovationTarget: finalProjection.gaps.innovationTarget,
      weekendCourses: weekendCourseCount(finalProjection.allCourses),
      closedExams: closedExamCount(finalProjection.allCourses),
      reportCourses: reportCourseCount(finalProjection.allCourses),
      longSessions: longSessionCount(finalProjection.allCourses),
      pendingTimeCourses: pendingTimeCourseCount(finalProjection.allCourses),
      conflicts: 0,
    };

    const meta = modeIntro(mode);
    plans.push({
      mode,
      name: meta.name,
      intro: meta.intro,
      additions,
      notes: buildPlanNotes(additions),
      reasonsTop: reasonsLog.slice(0, 3),
      metrics,
      projectedGaps: finalProjection.gaps,
      empty: additions.length === 0,
    });
  }

  return { candidates, plans };
}

function missingMandatoryForPlan(
  request: RecommendationRequest,
  locked: CourseRecord[],
): string[] {
  const learned = new Set(locked.map((course) => baseName(course.name)));
  (request.historicalRecords ?? []).forEach((record) => {
    if (record.courseName) learned.add(baseName(record.courseName));
  });
  const { plan, track, termId } = request;
  if (termSeason(termId) !== 'fall') return [];
  if (/博士/.test(plan.degree) && track === 'general_phd') return [];
  return ['新时代中国特色社会主义理论与实践', '自然辩证法概论'].filter(
    (name) => !learned.has(name),
  );
}

function buildReasons(course: CourseRecord, candidate: Candidate, gaps: ProgramGaps): string[] {
  const reasons: string[] = [];
  const name = baseName(course.name);
  if (name === '新时代中国特色社会主义理论与实践' || name === '自然辩证法概论') {
    reasons.push('一年级秋季必修课（本学期必须处理）。');
  }
  if (candidate.fillsSemesterCredits && (gaps.semesterCredits ?? 0) > 0) {
    reasons.push(
      `计入本学期有效学分 +${formatCredits(course.credits)}，可帮助达到 10 学分门槛。`,
    );
  }
  if (candidate.roles.includes('core-degree')) {
    reasons.push(
      (gaps.springOpportunity.core ?? 0) > 0
        ? '培养方案核心课候选（春季仍有多门计划核心课，也可留待春季完成）。'
        : '培养方案核心课候选，加入后自动建议设为“学位课”。',
    );
  } else if (candidate.roles.includes('professional-degree')) {
    reasons.push(
      (gaps.springOpportunity.professional ?? 0) > 0
        ? '培养方案专业课候选（春季仍有计划专业课，也可留待春季完成）。'
        : '培养方案专业课候选，加入后自动建议设为“学位课”。',
    );
  }
  if (candidate.roles.includes('public-required-degree')) {
    reasons.push('公共必修学位课候选，可补公共必修学位课学分。');
  }
  if (candidate.roles.includes('public-required-non-degree')) {
    reasons.push('公共必修非学位课（工程伦理）候选。');
  }
  if (candidate.roles.includes('innovation')) {
    reasons.push('创新创业模块课程候选（学分同属公共选修体系，不重复累计）。');
  } else if (candidate.roles.includes('public-elective')) {
    reasons.push('公共选修体系候选。');
  }
  if (
    candidate.roles.includes('professional-elective') &&
    !candidate.degreeEligibleInScope
  ) {
    reasons.push('只能作为非学位课，可计入专业选修（非学位）学分。');
  }
  if (!candidate.hasSchedule) {
    reasons.push('当前无排课数据：为计划课程/时间待定，冲突情况待春季正式课表确认。');
  }
  if (candidate.opportunity === 'both' || candidate.opportunity === 'spring') {
    reasons.push('该课程春季仍有开设机会，若本学期课时紧张可考虑延后。');
  }
  return reasons;
}

function buildPlanNotes(additions: Addition[]) {
  const notes: string[] = [];
  const switched = additions.filter((addition) => addition.sectionNote);
  if (switched.length) {
    notes.push(...switched.map((addition) => addition.sectionNote!));
  }
  const pending = additions.filter((addition) => !hasUsableSchedule(addition.course));
  if (pending.length) {
    notes.push(
      `${pending.map((addition) => addition.course.name).join('、')} 暂无正式排课数据，具体时间、班次与开设情况以春季正式课表及教务系统为准。`,
    );
  }
  if (!notes.length && additions.length) {
    notes.push('新增课程均已按时间与周次检查，不与当前课表冲突。');
  }
  return notes;
}

function formatCredits(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatProjectedGapLine(gaps: ProgramGaps) {
  const parts: string[] = [];
  parts.push(
    `专业学位 ${formatCredits(gaps.degreeCourseCreditsConfirmed)}/${gaps.degreeCourseCreditsTarget ?? '—'}`,
  );
  if (gaps.coreMinimum !== null) parts.push(`核心 ${gaps.coreCount}/${gaps.coreMinimum}`);
  if (gaps.professionalMinimum !== null) {
    parts.push(`专业 ${gaps.professionalCount}/${gaps.professionalMinimum}`);
  }
  return parts.join(' · ');
}
