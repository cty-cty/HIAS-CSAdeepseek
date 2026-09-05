import type { ProgramPlan } from './program-plans';
import {
  getAcademicAllowedSubjects,
  getGraduateProgramKind,
  getGraduateProgramMapping,
} from './graduate-program-mapping';

export type CourseDesignation = 'degree' | 'non-degree' | 'unset';
export type DegreeRole = 'degree' | 'nonDegree';
export type CourseRequirementType =
  | 'publicRequiredDegree'
  | 'professionalDegree'
  | 'professionalElective'
  | 'publicElective'
  | 'publicRequiredNonDegree'
  | 'pending';
export type ExemptionStatus = 'normal' | 'planned' | 'approved';
export type HistoricalModule = 'regular' | 'innovation' | 'hias' | 'unknown';
export type CourseModule = 'regular' | 'innovation' | 'hias';

export type CourseLike = {
  id: string;
  code: string;
  name: string;
  category: string;
  subject: string;
  credits: number;
  module?: CourseModule;
  requirementType?: CourseRequirementType;
  degreeRole?: DegreeRole;
};

export type DegreeEligibilityStatus = 'eligible' | 'verification' | 'ineligible';

export type DegreeEligibility = {
  status: DegreeEligibilityStatus;
  reason: string;
};

export type CourseClassification = {
  requirementType: CourseRequirementType;
  degreeRole: DegreeRole | null;
};

export type HistoricalRecord = {
  id: string;
  term: string;
  courseName: string;
  courseCode: string;
  credits: number;
  category: string;
  subject?: string;
  designation: CourseDesignation | 'unknown';
  module: HistoricalModule;
  hours?: number;
  attendanceCount?: number;
  courseCount: number | null;
  source?: string;
};

export type CourseCodeCategory =
  | 'subject-core'
  | 'professional-core'
  | 'professional'
  | 'seminar'
  | 'lab'
  | 'practice'
  | 'frontier-lecture'
  | 'public-required'
  | 'public-elective'
  | 'unknown';

const COURSE_CODE_CATEGORY_BY_MARKER: Record<string, CourseCodeCategory> = {
  '1': 'subject-core',
  '2': 'professional-core',
  '3': 'professional',
  '4': 'seminar',
  '5': 'lab',
  '6': 'practice',
  '7': 'frontier-lecture',
  B: 'public-required',
  X: 'public-elective',
};

export function getCourseCodeMarker(code: string) {
  return code.trim().toUpperCase()[13] || '';
}

export function getCourseCodeCategory(code: string): CourseCodeCategory {
  return COURSE_CODE_CATEGORY_BY_MARKER[getCourseCodeMarker(code)] || 'unknown';
}

export function getCourseCodeCategoryLabel(code: string) {
  const labels: Record<CourseCodeCategory, string> = {
    'subject-core': '学科核心课',
    'professional-core': '专业核心课',
    professional: '专业课',
    seminar: '研讨课',
    lab: '实验课',
    practice: '实践课',
    'frontier-lecture': '科学前沿讲座',
    'public-required': '公共必修课',
    'public-elective': '公共选修课',
    unknown: '待核验',
  };
  return labels[getCourseCodeCategory(code)];
}

export const COURSE_REQUIREMENT_TYPE_LABELS: Record<
  CourseRequirementType,
  string
> = {
  publicRequiredDegree: '公共必修学位课',
  professionalDegree: '专业学位课',
  professionalElective: '专业选修课',
  publicElective: '公共选修课',
  publicRequiredNonDegree: '公共必修非学位课',
  pending: '培养要求归属待确认',
};

export function getCourseRequirementTypeLabel(
  requirementType: CourseRequirementType,
) {
  return COURSE_REQUIREMENT_TYPE_LABELS[requirementType];
}

export function isEngineeringEthics(
  course: Pick<CourseLike, 'name'>,
) {
  return course.name.replace(/[-—－]?\d+班$/, '') === '工程伦理';
}

export function isPublicRequiredCourse(
  course: Pick<CourseLike, 'code' | 'category'>,
) {
  return (
    getCourseCodeCategory(course.code) === 'public-required' ||
    (getCourseCodeCategory(course.code) === 'unknown' &&
      course.category === '公共必修课')
  );
}

export function isPublicElectiveCourse(
  course: Pick<CourseLike, 'code' | 'category'>,
) {
  return (
    getCourseCodeCategory(course.code) === 'public-elective' ||
    (getCourseCodeCategory(course.code) === 'unknown' &&
      course.category === '公共选修课')
  );
}

export function isDegreeEligibleByCode(
  course: Pick<CourseLike, 'code' | 'category'>,
) {
  const codeCategory = getCourseCodeCategory(course.code);
  if (codeCategory !== 'unknown') {
    return (
      codeCategory === 'subject-core' ||
      codeCategory === 'professional-core' ||
      codeCategory === 'professional'
    );
  }
  return ['学科核心课', '专业核心课', '专业课'].includes(course.category);
}

export function getDegreeEligibility(
  course: Pick<CourseLike, 'code' | 'category' | 'name' | 'subject'>,
  plan?: ProgramPlan,
): DegreeEligibility {
  if (!isDegreeEligibleByCode(course)) {
    return {
      status: 'ineligible',
      reason: '课程编号第14位不是 1、2、3，只能作为非学位课。',
    };
  }
  if (!plan) {
    return {
      status: 'verification',
      reason: '尚未匹配培养方向，学位属性待核验。',
    };
  }

  const kind = getGraduateProgramKind(plan);
  const mapping = getGraduateProgramMapping(plan);
  if (!mapping || kind === 'unknown') {
    return {
      status: 'verification',
      reason: '培养方向未在研究生专业映射表中匹配，暂不能自动核定学位课范围。',
    };
  }

  if (kind === 'academic') {
    const allowedSubjects = getAcademicAllowedSubjects(plan);
    if (allowedSubjects?.has(course.subject)) {
      return {
        status: 'eligible',
        reason: `属于一级学科“${mapping.firstLevel}”及其已映射二级学科范围。`,
      };
    }
    return {
      status: 'verification',
      reason: `课程学科“${course.subject}”未在该一级学科的映射范围内，需核对培养方案或学院认定。`,
    };
  }

  const isListed =
    plan.coreCourses.includes(course.name) ||
    plan.professionalCourses.includes(course.name);
  if (!isListed) {
    return {
      status: 'ineligible',
      reason: `专硕仅允许“${plan.program}”本专业培养方案列出的核心课或专业课作为学位课。`,
    };
  }
  return {
    status: 'eligible',
    reason: `属于“${plan.program}”本专业培养方案列出的核心课或专业课。`,
  };
}

export function isCourseEligibleAsDegree(
  course: Pick<CourseLike, 'code' | 'category' | 'name' | 'subject'>,
  plan?: ProgramPlan,
) {
  return getDegreeEligibility(course, plan).status === 'eligible';
}

export function getCourseRoleEligibility(
  course: Pick<
    CourseLike,
    'code' | 'category' | 'name' | 'subject' | 'module'
  >,
  plan?: ProgramPlan,
): DegreeEligibility {
  if (isEngineeringEthics(course)) {
    return {
      status: 'ineligible',
      reason: '《工程伦理》是公共必修非学位课，不能设置为学位课。',
    };
  }
  if (isHiasCourse(course)) {
    return {
      status: 'ineligible',
      reason: 'HIAS讲堂按专业非学位课学分登记，不能设置为学位课。',
    };
  }
  if (isPublicRequiredCourse(course)) {
    return {
      status: 'eligible',
      reason: '公共必修课可按培养方案归入公共必修学位课；特殊课程以明确规则为准。',
    };
  }
  if (isPublicElectiveCourse(course) || isNonDegreeOnly(course)) {
    return {
      status: 'ineligible',
      reason: '公共选修课、研讨课、实验课、实践课和科学前沿讲座属于非学位课程。',
    };
  }
  return getDegreeEligibility(course, plan);
}

// 来源：2026创新创业课秋季课表.xlsx。课程编码优先于课程名称，避免同名课程或不同班次被误归类。
export const INNOVATION_COURSE_CODES = new Set([
  '280216120100MX001',
  '280216120100MX003',
  '280216120100MX005',
  '280216120100MX006',
  '280216120100MX009',
  '280216120100MX010',
  '280216120100MX011',
  '280216120100MX017',
  '280216120200MX033',
]);

export const INNOVATION_COURSE_NAMES = new Set([
  '创业管理',
  '创业启程',
  '生物医药数字科创的未来',
  '创新型个性发展心理学',
  '创新创业实践及案例研究',
  '创业融资入门',
  '科技成果转移转化探究与实践',
  '科技创新及方法',
  '品牌与营销管理',
  '创新创业训练营',
  '技术发展与产品创新管理',
  '军工航天领域的商业模式和案例',
  '人工智能产品技术创新及应用案例',
  '创造性思维',
  '思维创新与设计',
  '技术创业',
  '科创产业前沿与人才科技政策体系',
  '前沿科技融合与创新发展',
  '技术创新创业投资与资本运作',
  '科技创业领导力',
]);

export const NON_DEGREE_ONLY_CATEGORIES = new Set([
  '研讨课',
  '实验课',
  '实践课',
  '科学前沿讲座',
]);

export function courseBaseName(name: string) {
  return name.replace(/[-—－]?\d+班$/, '');
}

export function courseFamilyKey(course: Pick<CourseLike, 'code' | 'name'>) {
  if (/050200MB001/i.test(course.code) || course.name.startsWith('英语')) {
    return 'english-degree-course';
  }
  return courseBaseName(course.name) || course.code.replace(/-\d+$/, '');
}

export function isEnglishCourse(course: Pick<CourseLike, 'code' | 'name'>) {
  return /050200MB001/i.test(course.code) || course.name.startsWith('英语');
}

function normalizeCourseCode(code: string) {
  return code.trim().toUpperCase().replace(/-\d+$/, '');
}

export function isInnovationCourse(
  course: Pick<CourseLike, 'code' | 'name'>,
) {
  return (
    INNOVATION_COURSE_CODES.has(normalizeCourseCode(course.code)) ||
    INNOVATION_COURSE_NAMES.has(courseBaseName(course.name))
  );
}

export function isHiasCourse(
  course: Pick<CourseLike, 'name'> & { module?: CourseModule },
) {
  return course.module === 'hias' || /HIAS讲堂|人文系列讲座/.test(course.name);
}

export function getCourseModule(
  course: Pick<CourseLike, 'code' | 'name'>,
): CourseModule {
  if (/HIAS讲堂|人文系列讲座/.test(course.name)) return 'hias';
  return isInnovationCourse(course) ? 'innovation' : 'regular';
}

export function isInnovationHistoryRecord(
  record: Pick<HistoricalRecord, 'courseCode' | 'courseName' | 'module'>,
) {
  return (
    record.module === 'innovation' ||
    (record.module === 'unknown' &&
      isInnovationCourse({ code: record.courseCode, name: record.courseName }))
  );
}

export function isNonDegreeOnly(
  course: Pick<CourseLike, 'code' | 'category' | 'name' | 'module'>,
) {
  const codeCategory = getCourseCodeCategory(course.code);
  return (
    ['seminar', 'lab', 'practice', 'frontier-lecture'].includes(codeCategory) ||
    (codeCategory === 'unknown' &&
      NON_DEGREE_ONLY_CATEGORIES.has(course.category)) ||
    isHiasCourse(course) || /科学前沿讲座/.test(course.name)
  );
}

export function getCourseDesignation(
  course: Pick<
    CourseLike,
    'code' | 'category' | 'name' | 'subject' | 'module'
  >,
  designations: Record<string, CourseDesignation>,
  plan?: ProgramPlan,
) {
  const stored = designations[course.code];
  if (isEngineeringEthics(course)) {
    return 'non-degree';
  }
  if (isHiasCourse(course)) {
    return 'non-degree';
  }
  if (isPublicRequiredCourse(course)) {
    return stored === 'non-degree' ? 'non-degree' : 'degree';
  }
  if (isPublicElectiveCourse(course) || isNonDegreeOnly(course)) {
    return 'non-degree';
  }
  if (
    stored === 'degree' &&
    getCourseRoleEligibility(course, plan).status === 'ineligible'
  ) {
    return 'non-degree';
  }
  return (
    stored ||
    (isNonDegreeOnly(course) ? 'non-degree' : 'unset')
  );
}

export function getCourseRequirementType(
  course: Pick<
    CourseLike,
    'code' | 'category' | 'name' | 'subject' | 'module'
  >,
  designation: CourseDesignation | 'unknown',
  plan?: ProgramPlan,
): CourseRequirementType {
  if (isEngineeringEthics(course)) {
    return 'publicRequiredNonDegree';
  }
  if (isHiasCourse(course)) {
    return 'professionalElective';
  }
  if (isPublicRequiredCourse(course)) {
    return designation === 'non-degree'
      ? 'publicRequiredNonDegree'
      : 'publicRequiredDegree';
  }
  if (isPublicElectiveCourse(course)) {
    return 'publicElective';
  }
  if (isNonDegreeOnly(course)) {
    return 'professionalElective';
  }

  if (designation === 'degree') {
    return getDegreeEligibility(course, plan).status === 'eligible'
      ? 'professionalDegree'
      : 'pending';
  }
  if (designation === 'non-degree') {
    return 'professionalElective';
  }
  return 'pending';
}

export function classifyCourseRequirement(
  course: Pick<
    CourseLike,
    'code' | 'category' | 'name' | 'subject' | 'module'
  >,
  designation: CourseDesignation | 'unknown',
  plan?: ProgramPlan,
): CourseClassification {
  const requirementType = getCourseRequirementType(
    course,
    designation,
    plan,
  );
  return {
    requirementType,
    degreeRole:
      designation === 'degree'
        ? 'degree'
        : designation === 'non-degree'
          ? 'nonDegree'
          : null,
  };
}

export type CreditSummary = {
  historicalCredits: number;
  plannedCredits: number;
  /** Planned courses plus approved exemption credits, excluding historical credits. */
  selectionCredits: number;
  duplicatePlannedCredits: number;
  duplicatePlannedCourseCount: number;
  pendingDesignationCredits: number;
  confirmedPlannedCredits: number;
  approvedExemptionCredits: number;
  plannedExemptionCredits: number;
  estimatedCredits: number;
  historicalCategoryCredits: Record<string, number>;
  plannedCategoryCredits: Record<string, number>;
  historicalRequirementCredits: Record<CourseRequirementType, number>;
  plannedRequirementCredits: Record<CourseRequirementType, number>;
  historicalDegreeCredits: number;
  plannedDegreeCredits: number;
  historicalProfessionalDegreeCredits: number;
  plannedProfessionalDegreeCredits: number;
  historicalNonDegreeCredits: number;
  plannedNonDegreeCredits: number;
  publicRequiredCredits: number;
  publicRequiredDegreeCredits: number;
  publicRequiredNonDegreeCredits: number;
  professionalDegreeCredits: number;
  professionalElectiveCredits: number;
  publicElectiveCredits: number;
  innovationCredits: number;
  sportsCourseCount: number;
  pendingHistoryCourseCount: boolean;
  historicalRecords: HistoricalRecord[];
};

function sumCredits(records: Array<{ credits: number }>) {
  return records.reduce((sum, record) => sum + record.credits, 0);
}

function addCategoryCredits(
  target: Record<string, number>,
  category: string,
  credits: number,
) {
  target[category] = (target[category] ?? 0) + credits;
}

function addRequirementCredits(
  target: Record<CourseRequirementType, number>,
  requirementType: CourseRequirementType,
  credits: number,
) {
  target[requirementType] = (target[requirementType] ?? 0) + credits;
}

function historicalCourseLike(record: HistoricalRecord) {
  const module: CourseModule =
    record.module === 'hias'
      ? 'hias'
      : record.module === 'innovation'
        ? 'innovation'
        : 'regular';
  return {
    code: record.courseCode,
    name: record.courseName,
    category: record.category,
    subject: record.subject ?? '',
    module,
  };
}

export function calculateCreditSummary({
  selectedCourses,
  designations,
  historicalRecords,
  exemptionStatus,
  plan,
}: {
  selectedCourses: CourseLike[];
  designations: Record<string, CourseDesignation>;
  historicalRecords: HistoricalRecord[];
  exemptionStatus: ExemptionStatus;
  plan?: ProgramPlan;
}): CreditSummary {
  const completedHistory = historicalRecords.filter(
    (record) => record.credits > 0,
  );
  const historicalCourseCodes = new Set(
    completedHistory
      .map((record) => record.courseCode.trim())
      .filter(Boolean),
  );
  const duplicateSelected = selectedCourses.filter(
    (course) => historicalCourseCodes.has(course.code.trim()),
  );
  const countedSelected = selectedCourses.filter(
    (course) =>
      !(exemptionStatus === 'approved' && isEnglishCourse(course)) &&
      !historicalCourseCodes.has(course.code.trim()),
  );
  const historicalCategoryCredits: Record<string, number> = {};
  completedHistory.forEach((record) =>
    addCategoryCredits(
      historicalCategoryCredits,
      record.category,
      record.credits,
    ),
  );
  const plannedCategoryCredits: Record<string, number> = {};
  countedSelected.forEach((course) =>
    addCategoryCredits(plannedCategoryCredits, course.category, course.credits),
  );
  const historicalRequirementCredits: Record<CourseRequirementType, number> =
    {
      publicRequiredDegree: 0,
      professionalDegree: 0,
      professionalElective: 0,
      publicElective: 0,
      publicRequiredNonDegree: 0,
      pending: 0,
    };
  const plannedRequirementCredits: Record<CourseRequirementType, number> = {
    publicRequiredDegree: 0,
    professionalDegree: 0,
    professionalElective: 0,
    publicElective: 0,
    publicRequiredNonDegree: 0,
    pending: 0,
  };
  const historicalClassifications = completedHistory.map((record) => {
    const course = historicalCourseLike(record);
    const designation = getCourseDesignation(
      course,
      record.designation === 'unknown'
        ? {}
        : { [record.courseCode]: record.designation },
      plan,
    );
    return {
      record,
      classification: classifyCourseRequirement(course, designation, plan),
    };
  });
  const plannedClassifications = countedSelected.map((course) => {
    const designation = getCourseDesignation(course, designations, plan);
    return {
      course,
      classification: classifyCourseRequirement(course, designation, plan),
    };
  });
  historicalClassifications.forEach(({ record, classification }) =>
    addRequirementCredits(
      historicalRequirementCredits,
      classification.requirementType,
      record.credits,
    ),
  );
  plannedClassifications.forEach(({ course, classification }) =>
    addRequirementCredits(
      plannedRequirementCredits,
      classification.requirementType,
      course.credits,
    ),
  );

  const historicalEnglishCredits = sumCredits(
    completedHistory.filter((record) =>
      /050200MB001/i.test(record.courseCode),
    ),
  );
  const hasHistoricalEnglish = historicalEnglishCredits > 0;
  const approvedExemptionCredits =
    exemptionStatus === 'approved' && !hasHistoricalEnglish ? 3 : 0;
  const plannedExemptionCredits =
    exemptionStatus === 'planned' && !hasHistoricalEnglish ? 3 : 0;

  const historicalDegreeCredits = sumCredits(
    historicalClassifications
      .filter(({ classification }) => classification.degreeRole === 'degree')
      .map(({ record }) => record),
  );
  const historicalProfessionalDegreeCredits =
    historicalRequirementCredits.professionalDegree;
  const historicalNonDegreeCredits = sumCredits(
    historicalClassifications
      .filter(({ classification }) => classification.degreeRole === 'nonDegree')
      .map(({ record }) => record),
  );
  const plannedDegreeCredits = sumCredits(
    plannedClassifications
      .filter(({ classification }) => classification.degreeRole === 'degree')
      .map(({ course }) => course),
  );
  const plannedProfessionalDegreeCredits =
    plannedRequirementCredits.professionalDegree;
  const plannedNonDegreeCredits = sumCredits(
    plannedClassifications
      .filter(({ classification }) => classification.degreeRole === 'nonDegree')
      .map(({ course }) => course),
  );
  const publicRequiredDegreeCredits =
    historicalRequirementCredits.publicRequiredDegree +
    plannedRequirementCredits.publicRequiredDegree +
    approvedExemptionCredits;
  const publicRequiredNonDegreeCredits =
    historicalRequirementCredits.publicRequiredNonDegree +
    plannedRequirementCredits.publicRequiredNonDegree;
  const professionalDegreeCredits =
    historicalRequirementCredits.professionalDegree +
    plannedRequirementCredits.professionalDegree;
  const professionalElectiveCredits =
    historicalRequirementCredits.professionalElective +
    plannedRequirementCredits.professionalElective;
  const publicElectiveCredits =
    historicalRequirementCredits.publicElective +
    plannedRequirementCredits.publicElective;

  return {
    historicalCredits: sumCredits(completedHistory),
    plannedCredits: sumCredits(countedSelected),
    selectionCredits: sumCredits(countedSelected) + approvedExemptionCredits,
    duplicatePlannedCredits: sumCredits(duplicateSelected),
    duplicatePlannedCourseCount: duplicateSelected.length,
    pendingDesignationCredits: sumCredits(
      countedSelected.filter(
        (course) => getCourseDesignation(course, designations, plan) === 'unset',
      ),
    ),
    confirmedPlannedCredits:
      sumCredits(countedSelected) -
      sumCredits(
        countedSelected.filter(
          (course) => getCourseDesignation(course, designations, plan) === 'unset',
        ),
      ),
    approvedExemptionCredits,
    plannedExemptionCredits,
    estimatedCredits:
      sumCredits(completedHistory) +
      sumCredits(countedSelected) +
      approvedExemptionCredits,
    historicalCategoryCredits,
    plannedCategoryCredits,
    historicalRequirementCredits,
    plannedRequirementCredits,
    historicalDegreeCredits,
    plannedDegreeCredits,
    historicalProfessionalDegreeCredits,
    plannedProfessionalDegreeCredits,
    historicalNonDegreeCredits,
    plannedNonDegreeCredits,
    publicRequiredCredits:
      publicRequiredDegreeCredits +
      publicRequiredNonDegreeCredits,
    publicRequiredDegreeCredits,
    publicRequiredNonDegreeCredits,
    professionalDegreeCredits,
    professionalElectiveCredits,
    publicElectiveCredits,
    innovationCredits:
      completedHistory
        .filter(isInnovationHistoryRecord)
        .reduce((sum, record) => sum + record.credits, 0) +
      countedSelected
        .filter(isInnovationCourse)
        .reduce((sum, course) => sum + course.credits, 0),
    sportsCourseCount: countedSelected.filter(
      (course) => course.subject === '体育学',
    ).length,
    pendingHistoryCourseCount: historicalRecords.some(
      (record) => record.courseCount === null,
    ),
    historicalRecords: completedHistory,
  };
}

export function getPlanCourseCounts({
  courses,
  plan,
  designations,
  historicalRecords,
}: {
  courses: CourseLike[];
  plan: ProgramPlan;
  designations: Record<string, CourseDesignation>;
  historicalRecords: HistoricalRecord[];
}) {
  const selectedCoreCount = courses.filter(
    (course) =>
      getCourseDesignation(course, designations, plan) === 'degree' &&
      getDegreeEligibility(course, plan).status === 'eligible' &&
      ['subject-core', 'professional-core'].includes(
        getCourseCodeCategory(course.code),
      ),
  ).length;
  const selectedProfessionalCount = courses.filter(
    (course) =>
      getCourseDesignation(course, designations, plan) === 'degree' &&
      getDegreeEligibility(course, plan).status === 'eligible' &&
      getCourseCodeCategory(course.code) === 'professional',
  ).length;
  const historicalCoreCount = historicalRecords.filter(
    (record) =>
      record.courseName &&
      record.designation === 'degree' &&
      getDegreeEligibility(
        {
          code: record.courseCode,
          name: record.courseName,
          category: record.category,
          subject: record.subject ?? '',
        },
        plan,
      ).status === 'eligible' &&
      ['subject-core', 'professional-core'].includes(
        getCourseCodeCategory(record.courseCode),
      ),
  ).length;
  const historicalProfessionalCount = historicalRecords.filter(
    (record) =>
      record.courseName &&
      record.designation === 'degree' &&
      getDegreeEligibility(
        {
          code: record.courseCode,
          name: record.courseName,
          category: record.category,
          subject: record.subject ?? '',
        },
        plan,
      ).status === 'eligible' &&
      getCourseCodeCategory(record.courseCode) === 'professional',
  ).length;
  return {
    coreCount: selectedCoreCount + historicalCoreCount,
    professionalCount: selectedProfessionalCount + historicalProfessionalCount,
    historicalCoreCount,
    historicalProfessionalCount,
  };
}
