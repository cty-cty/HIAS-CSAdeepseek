// Pure, dependency-free course planning logic shared by the app and its
// unit tests. No React, no DOM, no storage — everything here is testable
// with `node --test`.

export type Schedule = {
  day: string;
  dayIndex: number;
  start: number;
  end: number;
  weeks: number[];
  weeksText: string;
  periodText: string;
  room: string;
};

export type Course = {
  id: string;
  code: string;
  name: string;
  englishName: string;
  college: string;
  category: string;
  level: string;
  subject: string;
  hours: string;
  credits: number;
  capacity: number;
  enrolled: number;
  teachingMode: string;
  examMode: string;
  teacher: string;
  schedules: Schedule[];
};

export type CourseDataset = {
  id: string;
  label: string;
  courses: Course[];
  updatedAt: string;
};

export type ConflictSlot = {
  day: string;
  start: number;
  end: number;
  weeks: number[];
};

export type RequirementBucketId =
  | 'publicRequired'
  | 'degree'
  | 'professionalNonDegree'
  | 'publicElective'
  | 'innovation'
  | 'other';

export const DEGREE_CATEGORIES = ['专业核心课', '学科核心课', '专业课'];
export const NON_DEGREE_CATEGORIES = ['研讨课', '实验课'];
export const COURSE_CATEGORY_ORDER = [
  '公共必修课',
  '公共选修课',
  '专业核心课',
  '学科核心课',
  '专业课',
  '研讨课',
  '实验课',
  '创新创业课',
];

// 2026-2027 学年创新创业模块课程（《课程学习及选课须知》），在课表中其
// 课程属性为公共选修课，但对专业学位硕士是单独的 1 学分要求。
export const INNOVATION_MODULE_COURSES = new Set([
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

export function intersects<T>(left: T[], right: T[]) {
  const lookup = new Set(left);
  return right.some((item) => lookup.has(item));
}

export function schedulesConflict(left: Schedule, right: Schedule) {
  return (
    left.dayIndex === right.dayIndex &&
    left.start <= right.end &&
    right.start <= left.end &&
    intersects(left.weeks, right.weeks)
  );
}

export function coursesConflict(left: Course, right: Course) {
  return left.schedules.some((a) =>
    right.schedules.some((b) => schedulesConflict(a, b)),
  );
}

export function courseConflictsInWeek(
  left: Course,
  right: Course,
  week: number,
) {
  return left.schedules.some((a) =>
    right.schedules.some(
      (b) =>
        a.dayIndex === b.dayIndex &&
        a.start <= b.end &&
        b.start <= a.end &&
        a.weeks.includes(week) &&
        b.weeks.includes(week),
    ),
  );
}

export function getConflictSlots(
  left: Course,
  right: Course,
): ConflictSlot[] {
  const slots: ConflictSlot[] = [];
  left.schedules.forEach((a) => {
    right.schedules.forEach((b) => {
      if (!schedulesConflict(a, b)) return;
      const weeks = a.weeks.filter((item) => b.weeks.includes(item));
      slots.push({
        day: a.day,
        start: Math.max(a.start, b.start),
        end: Math.min(a.end, b.end),
        weeks,
      });
    });
  });
  return slots;
}

export function courseBaseName(name: string) {
  // 剥离分班/分节编号，如 “-01班”“-12班”，包括 “英语A-01班-学术读写” 这类中间班次。
  return name.replace(/[-—－]?\d+班(?=[-—－]|$)/g, '');
}

export function formatWeekRanges(weeks: number[]) {
  if (!weeks.length) return '周次待定';
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = current;
    previous = current;
  }
  return `第${ranges.join('、')}周`;
}

export function formatConflictSlot(slot: ConflictSlot) {
  const periods =
    slot.start === slot.end
      ? `第${slot.start}节`
      : `第${slot.start}-${slot.end}节`;
  return `${slot.day} ${periods} · ${formatWeekRanges(slot.weeks)}`;
}

export function formatCredits(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function templateWeekText(schedule: Schedule) {
  return schedule.weeksText
    .trim()
    .replace(/^第/, '')
    .replace(/周$/, '')
    .replaceAll(',', '、');
}

export function isSchedule(value: unknown): value is Schedule {
  if (!value || typeof value !== 'object') return false;
  const schedule = value as Partial<Schedule>;
  return (
    typeof schedule.dayIndex === 'number' &&
    typeof schedule.start === 'number' &&
    typeof schedule.end === 'number' &&
    Array.isArray(schedule.weeks) &&
    schedule.weeks.every((week) => typeof week === 'number')
  );
}

export function isCourse(value: unknown): value is Course {
  if (!value || typeof value !== 'object') return false;
  const course = value as Partial<Course>;
  return (
    typeof course.id === 'string' &&
    typeof course.code === 'string' &&
    typeof course.name === 'string' &&
    typeof course.credits === 'number' &&
    Array.isArray(course.schedules) &&
    course.schedules.every(isSchedule)
  );
}

// Stable color index from a string id within a palette of `size` colors.
// `Number(id) % size` breaks when ids are non-numeric (imported datasets),
// so hash the string instead.
export function courseColorIndex(id: string, size: number) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % size;
}

export function termIdFromLabel(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'imported-' + Date.now();
}

// 官方学期命名如 “2026—2027学年(秋)第一学期”，用于标题/徽章的紧凑缩写为 “26—27 秋季”。
const ACADEMIC_TERM = /^(\d{4})—(\d{4})学年\(([春夏秋])\)第[一二三]学期$/;

export function compactTermLabel(label: string) {
  const match = label.trim().match(ACADEMIC_TERM);
  if (!match) return label;
  const season = match[3] === '秋' ? '秋季' : match[3] === '春' ? '春季' : '夏季';
  return `${match[1].slice(2)}—${match[2].slice(2)} ${season}`;
}

export const MASTER_ENGLISH_CREDITS = 3;

// 硕士学位英语班级课程（英语A/英语B 分班、读写/听说类），免修认定后无需修读。
export function isMasterEnglishCourseName(name: string) {
  return /^英语[AB]-|^英语[AB]\d|^硕士学位英语/.test(name.trim());
}

export type PlanForRecommendation = {
  coreCourses: string[];
  professionalCourses: string[];
  coreMinimum: number;
  professionalMinimum: number;
  degreeCourseCredits: number;
  professionalNonDegreeCredits: number | null;
  publicRequiredCredits: number;
  publicElectiveCredits: number;
  innovationCredits: number | null;
  homeCollege: string;
};

export type RecommendationInput = {
  courses: Course[];
  selectedCourses: Course[];
  selectedIds: string[];
  earnedByBucket: Partial<Record<RequirementBucketId, number>>;
  plan: PlanForRecommendation;
  englishExemption: boolean;
};

export type CourseRecommendation = {
  course: Course;
  bucket: RequirementBucketId;
  reason: string;
};

export type RecommendationResult = {
  rows: CourseRecommendation[];
  unsatisfied: {
    bucket: RequirementBucketId;
    label: string;
    remaining: number;
  }[];
};

const RECOMMENDATION_LABELS: Record<RequirementBucketId, string> = {
  publicRequired: '公共必修课',
  degree: '专业学位课',
  professionalNonDegree: '专业非学位课',
  publicElective: '公共选修课',
  innovation: '创新创业课',
  other: '未归类课程',
};

function bucketLabel(bucket: RequirementBucketId) {
  return RECOMMENDATION_LABELS[bucket];
}

function isFull(course: Course) {
  return course.capacity > 0 && course.enrolled >= course.capacity;
}

function firstPeriod(course: Course) {
  return Math.min(...course.schedules.map((s) => s.start));
}

function lastPeriod(course: Course) {
  return Math.max(...course.schedules.map((s) => s.end));
}

function span(course: Course) {
  return lastPeriod(course) - firstPeriod(course);
}

function earlyLatePenalty(course: Course) {
  let penalty = 0;
  for (const s of course.schedules) {
    if (s.start <= 2) penalty += 1;
    if (s.end >= 12) penalty += 1;
  }
  return penalty;
}

function sectionNumber(name: string) {
  return name.match(/[-—－]?0*(\d+)班/)?.[1] ?? name;
}

export function computeCourseRecommendations(
  input: RecommendationInput,
): RecommendationResult {
  const { courses, selectedCourses, selectedIds, earnedByBucket, plan } = input;
  const englishExemption = input.englishExemption;
  const selectedIdSet = new Set<string>(selectedIds);
  const blocked = [...selectedCourses];
  const chosen: CourseRecommendation[] = [];
  const usedBase = new Set<string>(
    selectedCourses.map((c) => courseBaseName(c.name)),
  );

  const coreSet = new Set(plan.coreCourses);
  const proSet = new Set(plan.professionalCourses);
  const librarySet = new Set([...plan.coreCourses, ...plan.professionalCourses]);

  const bucketOf = (course: Course): RequirementBucketId => {
    const b = categorizeRequirement(course.category, course.name);
    return b === 'innovation' && plan.innovationCredits === null
      ? 'publicElective'
      : b;
  };
  const isCore = (c: Course) => coreSet.has(c.name);
  const isPro = (c: Course) => proSet.has(c.name);
  const isMasterEnglish = (c: Course) => isMasterEnglishCourseName(c.name);

  const valid = (c: Course) =>
    c.credits > 0 &&
    c.schedules.length > 0 &&
    !isFull(c) &&
    !(englishExemption && isMasterEnglish(c));

  const selByBucket = new Map<RequirementBucketId, number>();
  let selCoreCount = 0;
  let selProCount = 0;
  let selCoreCredits = 0;
  let selProCredits = 0;
  for (const c of selectedCourses) {
    const b = bucketOf(c);
    selByBucket.set(b, (selByBucket.get(b) ?? 0) + c.credits);
    if (b === 'degree') {
      if (isCore(c)) {
        selCoreCount += 1;
        selCoreCredits += c.credits;
      } else if (isPro(c)) {
        selProCount += 1;
        selProCredits += c.credits;
      }
    }
  }
  const sel = (b: RequirementBucketId) => selByBucket.get(b) ?? 0;
  const earned = (b: RequirementBucketId) => earnedByBucket[b] ?? 0;
  const englishExemptCredits = englishExemption ? MASTER_ENGLISH_CREDITS : 0;

  const publicRequiredGap =
    plan.publicRequiredCredits -
    earned('publicRequired') -
    sel('publicRequired') -
    englishExemptCredits;
  const nonDegreeGap =
    plan.professionalNonDegreeCredits === null
      ? 0
      : plan.professionalNonDegreeCredits -
        earned('professionalNonDegree') -
        sel('professionalNonDegree');
  const publicElectiveGap =
    plan.publicElectiveCredits - earned('publicElective') - sel('publicElective');
  const innovationGap =
    plan.innovationCredits === null
      ? 0
      : plan.innovationCredits - earned('innovation') - sel('innovation');

  const needCoreCount = Math.max(0, plan.coreMinimum - selCoreCount);
  const needProCount = Math.max(0, plan.professionalMinimum - selProCount);
  const degreeCreditsGap = Math.max(
    0,
    plan.degreeCourseCredits - earned('degree') - selCoreCredits - selProCredits,
  );
  let remainingCoreCount = needCoreCount;
  let remainingProCount = needProCount;

  const pools: { bucket: RequirementBucketId; pool: Course[] }[] = [
    {
      bucket: 'publicRequired',
      pool: courses.filter((c) => valid(c) && bucketOf(c) === 'publicRequired'),
    },
    {
      bucket: 'degree',
      pool: courses.filter((c) => valid(c) && librarySet.has(c.name)),
    },
    {
      bucket: 'professionalNonDegree',
      pool: courses.filter(
        (c) =>
          valid(c) &&
          bucketOf(c) === 'professionalNonDegree' &&
          c.college === plan.homeCollege,
      ),
    },
    {
      bucket: 'publicElective',
      pool: courses.filter((c) => valid(c) && bucketOf(c) === 'publicElective'),
    },
    {
      bucket: 'innovation',
      pool:
        plan.innovationCredits === null
          ? []
          : courses.filter((c) => valid(c) && bucketOf(c) === 'innovation'),
    },
  ];

  const unsatisfied: RecommendationResult['unsatisfied'] = [];

  function bestOf(candidates: Course[]): Course | null {
    const passable = candidates.filter(
      (c) =>
        !selectedIdSet.has(c.id) &&
        !blocked.some((b) => b.id !== c.id && coursesConflict(c, b)),
    );
    if (!passable.length) return null;
    passable.sort((a, b) => {
      const ap = earlyLatePenalty(a);
      const bp = earlyLatePenalty(b);
      const capA = (a.capacity ?? 0) - (a.enrolled ?? 0);
      const capB = (b.capacity ?? 0) - (b.enrolled ?? 0);
      if (ap !== bp) return ap - bp;
      if (a.schedules.length !== b.schedules.length) {
        return a.schedules.length - b.schedules.length;
      }
      if (span(a) !== span(b)) return span(a) - span(b);
      if (capA !== capB) return capB - capA;
      return a.id.localeCompare(b.id);
    });
    return passable[0];
  }

  function add(bucket: RequirementBucketId, course: Course, reason: string) {
    const sectionCount = courses.filter(
      (c) =>
        valid(c) &&
        bucketOf(c) === bucket &&
        courseBaseName(c.name) === courseBaseName(course.name),
    ).length;
    const note =
      sectionCount > 1
        ? `同课程有 ${sectionCount} 个班次，推荐 ${sectionNumber(course.name)}班`
        : '';
    chosen.push({
      course,
      bucket,
      reason: note ? `${reason}；${note}` : reason,
    });
    blocked.push(course);
    selectedIdSet.add(course.id);
    usedBase.add(courseBaseName(course.name));
  }

  function grouped(pool: Course[]) {
    const map = new Map<string, Course[]>();
    for (const c of pool) {
      const base = courseBaseName(c.name);
      if (usedBase.has(base) || selectedIdSet.has(c.id)) continue;
      const arr = map.get(base) ?? [];
      arr.push(c);
      map.set(base, arr);
    }
    return [...map.values()];
  }

  function fillBucket(
    bucket: RequirementBucketId,
    pool: Course[],
    remaining: number,
    options: { coreOnly?: boolean; proOnly?: boolean; countLimit?: number },
  ) {
    let added = 0;
    while (remaining > 0 && (options.countLimit === undefined || added < options.countLimit)) {
      const groups = grouped(pool).filter((arr) => {
        if (options.coreOnly) return isCore(arr[0]);
        if (options.proOnly) return isPro(arr[0]);
        return true;
      });
      if (!groups.length) break;
      let best: Course | null = null;
      for (const arr of groups) {
        const cand = bestOf(arr);
        if (cand && (!best || cand.id.localeCompare(best.id) < 0)) {
          best = cand;
        }
      }
      if (!best) break;
      const credit = best.credits;
      add(bucket, best, reasonFor(bucket, best));
      added += 1;
      if (options.coreOnly && isCore(best)) {
        remainingCoreCount = Math.max(0, remainingCoreCount - 1);
      }
      if (options.proOnly && isPro(best)) {
        remainingProCount = Math.max(0, remainingProCount - 1);
      }
      remaining = Math.max(0, remaining - credit);
    }
    return remaining;
  }

  function reasonFor(bucket: RequirementBucketId, course: Course): string {
    if (bucket === 'degree') {
      if (isCore(course)) {
        return remainingCoreCount > 0
          ? `本专业核心课，核心课要求还差 ${remainingCoreCount} 门`
          : '本专业核心课，补齐专业学位课学分';
      }
      if (isPro(course)) {
        return remainingProCount > 0
          ? `本专业专业课，专业课要求还差 ${remainingProCount} 门`
          : '本专业专业课，补齐专业学位课学分';
      }
      return '本专业学位课，补齐专业学位课学分';
    }
    if (bucket === 'professionalNonDegree') {
      const cat = course.category || '课程';
      return `本学院${cat}，专业非学位课还缺学分`;
    }
    if (bucket === 'publicElective') return '公共选修课，选中可补足公共选修学分';
    if (bucket === 'innovation') return '创新创业模块课，选中可补足创新创业学分';
    return '公共必修课，选中可补足公共必修学分';
  }

  const publicRemaining = fillBucket('publicRequired', pools[0].pool, publicRequiredGap, {});
  if (publicRemaining > 0) {
    unsatisfied.push({ bucket: 'publicRequired', label: bucketLabel('publicRequired'), remaining: publicRemaining });
  }

  let degreeRemaining = degreeCreditsGap;
  // 先按门数：核心课门数不足则优先补核心课
  degreeRemaining = fillBucket('degree', pools[1].pool, degreeRemaining, {
    coreOnly: true,
    countLimit: needCoreCount,
  });
  // 专业课门数不足再补专业课
  degreeRemaining = fillBucket('degree', pools[1].pool, degreeRemaining, {
    proOnly: true,
    countLimit: needProCount,
  });
  // 门数满足但仍缺学分，从核心+专业课中补
  degreeRemaining = fillBucket('degree', pools[1].pool, degreeRemaining, {});
  if (degreeRemaining > 0) {
    unsatisfied.push({ bucket: 'degree', label: bucketLabel('degree'), remaining: degreeRemaining });
  }

  const nonDegreeRemaining = fillBucket('professionalNonDegree', pools[2].pool, nonDegreeGap, {});
  if (nonDegreeRemaining > 0) {
    unsatisfied.push({ bucket: 'professionalNonDegree', label: bucketLabel('professionalNonDegree'), remaining: nonDegreeRemaining });
  }

  const electiveRemaining = fillBucket('publicElective', pools[3].pool, publicElectiveGap, {});
  if (electiveRemaining > 0) {
    unsatisfied.push({ bucket: 'publicElective', label: bucketLabel('publicElective'), remaining: electiveRemaining });
  }

  const innovationRemaining = fillBucket('innovation', pools[4].pool, innovationGap, {});
  if (innovationRemaining > 0) {
    unsatisfied.push({ bucket: 'innovation', label: bucketLabel('innovation'), remaining: innovationRemaining });
  }

  // 校验：重复 / 跨专业 / 跨学院 / 英语免修 / 与已选冲突
  const idSeen = new Set<string>();
  const baseSeen = new Set<string>();
  const validated = chosen.filter((rec) => {
    const c = rec.course;
    if (idSeen.has(c.id)) return false;
    if (baseSeen.has(courseBaseName(c.name))) return false;
    if (rec.bucket === 'degree' && !librarySet.has(c.name)) return false;
    if (
      rec.bucket === 'professionalNonDegree' &&
      (c.college !== plan.homeCollege || bucketOf(c) !== 'professionalNonDegree')
    ) {
      return false;
    }
    if (englishExemption && isMasterEnglish(c)) return false;
    if (selectedCourses.some((s) => coursesConflict(s, c))) return false;
    idSeen.add(c.id);
    baseSeen.add(courseBaseName(c.name));
    return true;
  });
  // 推荐课程彼此不得冲突
  const finalRows = validated.filter(
    (rec, index) =>
      !validated
        .slice(index + 1)
        .some((other) => coursesConflict(rec.course, other.course)),
  );

  return { rows: finalRows.slice(0, 10), unsatisfied };
}

export function categorizeRequirement(
  category: string,
  courseName = '',
): RequirementBucketId {
  if (category === '公共必修课') return 'publicRequired';
  if (category === '公共选修课') {
    return INNOVATION_MODULE_COURSES.has(courseName)
      ? 'innovation'
      : 'publicElective';
  }
  if (DEGREE_CATEGORIES.includes(category)) return 'degree';
  if (NON_DEGREE_CATEGORIES.includes(category)) return 'professionalNonDegree';
  if (category === '创新创业课') return 'innovation';
  return 'other';
}

export function parseCourseDataset(
  text: string,
  fileName: string,
): CourseDataset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('数据文件不是有效的 JSON。请使用课程数据 courses.json。');
  }

  const isObject =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed);
  const record = isObject ? (parsed as Record<string, unknown>) : null;
  const rawCourses = Array.isArray(parsed) ? parsed : record?.courses;
  if (!Array.isArray(rawCourses) || !rawCourses.length) {
    throw new Error(
      '没有找到课程数组。支持直接上传 courses.json，或上传包含 courses 字段的 JSON 文件。',
    );
  }
  if (!rawCourses.every(isCourse)) {
    const scheduleProblem = rawCourses.some(
      (course) =>
        course &&
        typeof course === 'object' &&
        Array.isArray((course as { schedules?: unknown }).schedules) &&
        !(course as { schedules: unknown[] }).schedules.every(isSchedule),
    );
    throw new Error(
      scheduleProblem
        ? '部分课程的上课安排（schedules）结构不正确：每条安排需要包含数字类型的 dayIndex、start、end 和数字数组 weeks。'
        : '课程数据字段不完整，至少需要 id、code、name、credits 和 schedules。',
    );
  }

  const baseName = fileName.replace(/\.[^/.]+$/, '').trim();
  const labelValue =
    (typeof record?.label === 'string' && record.label.trim()) ||
    (typeof record?.termLabel === 'string' && record.termLabel.trim()) ||
    (typeof record?.term === 'string' && record.term.trim()) ||
    baseName ||
    '导入课程数据';
  const idValue =
    (typeof record?.termId === 'string' && record.termId.trim()) || labelValue;

  return {
    id: termIdFromLabel(idValue),
    label: labelValue,
    courses: rawCourses,
    updatedAt: new Date().toISOString(),
  };
}

// Parse an "already earned" credits file. Accepts:
//   - an array of course objects (needs `category` + positive `credits`),
//   - `{ courses: [...] }` (e.g. a term dataset),
//   - a plain `{ category: credits }` map.
// Returns totals grouped by course category.
export function parseEarnedImport(text: string): Record<string, number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      '文件不是有效的 JSON。请提供已修课程数组、含 courses 字段的对象，或 {课程属性: 学分} 映射。',
    );
  }

  const result: Record<string, number> = {};
  const addCourse = (item: unknown): boolean => {
    if (!item || typeof item !== 'object') return false;
    const record = item as { category?: unknown; credits?: unknown };
    if (typeof record.category !== 'string' || !record.category.trim()) {
      return false;
    }
    if (
      typeof record.credits !== 'number' ||
      !Number.isFinite(record.credits) ||
      record.credits <= 0
    ) {
      return false;
    }
    const category = record.category.trim();
    result[category] = (result[category] ?? 0) + record.credits;
    return true;
  };

  if (Array.isArray(parsed)) {
    const matched = parsed.filter(addCourse).length;
    if (!matched) {
      throw new Error('数组中没有识别到带 category 与正数 credits 的已修课程。');
    }
  } else if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.courses)) {
      const matched = record.courses.filter(addCourse).length;
      if (!matched) {
        throw new Error(
          'courses 中没有识别到带 category 与正数 credits 的已修课程。',
        );
      }
    } else {
      const entries = Object.entries(record).filter(
        ([category, credits]) =>
          category.trim() &&
          typeof credits === 'number' &&
          Number.isFinite(credits) &&
          credits > 0,
      );
      if (!entries.length) {
        throw new Error(
          '对象既不是 {课程属性: 学分} 映射，也没有可用的 courses 数组。',
        );
      }
      entries.forEach(([category, credits]) => {
        result[category.trim()] =
          (result[category.trim()] ?? 0) + (credits as number);
      });
    }
  } else {
    throw new Error('文件内容无法识别为已修学分数据。');
  }
  return result;
}

export type BackupPayload = {
  app?: string;
  version?: number;
  exportedAt?: string;
  activeTermId?: string;
  selectedByTerm?: Record<string, string[]>;
  earnedCredits?: Record<string, number>;
  customDatasets?: CourseDataset[];
  englishExemption?: boolean;
};

// Parse and validate a full backup file produced by "导出备份".
export function parseBackupPayload(text: string): {
  activeTermId: string | null;
  selectedByTerm: Record<string, string[]>;
  earnedCredits: Record<string, number>;
  customDatasets: CourseDataset[];
  englishExemption: boolean;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效的 JSON。');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('备份文件内容不是有效的对象。');
  }
  const record = parsed as BackupPayload;

  let datasets: CourseDataset[] = [];
  if (record.customDatasets !== undefined) {
    if (!Array.isArray(record.customDatasets)) {
      throw new Error('备份中的学期数据（customDatasets）格式不正确。');
    }
    if (
      !record.customDatasets.every(
        (dataset) =>
          dataset &&
          typeof dataset.id === 'string' &&
          typeof dataset.label === 'string' &&
          typeof dataset.updatedAt === 'string' &&
          Array.isArray(dataset.courses) &&
          dataset.courses.every(isCourse),
      )
    ) {
      throw new Error('备份中的学期课程数据不完整，无法恢复。');
    }
    datasets = record.customDatasets;
  }

  let selectedByTerm: Record<string, string[]> = {};
  if (record.selectedByTerm !== undefined) {
    if (!record.selectedByTerm || typeof record.selectedByTerm !== 'object') {
      throw new Error('备份中的选课记录（selectedByTerm）格式不正确。');
    }
    const entries = Object.entries(record.selectedByTerm).filter(
      ([, ids]) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'),
    );
    if (entries.length !== Object.keys(record.selectedByTerm).length) {
      throw new Error('备份中的部分选课记录格式不正确，无法恢复。');
    }
    selectedByTerm = Object.fromEntries(entries) as Record<string, string[]>;
  }

  let earnedCredits: Record<string, number> = {};
  if (record.earnedCredits !== undefined) {
    if (!record.earnedCredits || typeof record.earnedCredits !== 'object') {
      throw new Error('备份中的已修学分（earnedCredits）格式不正确。');
    }
    const entries = Object.entries(record.earnedCredits).filter(
      ([category, credits]) =>
        category.trim() &&
        typeof credits === 'number' &&
        Number.isFinite(credits) &&
        credits > 0,
    );
    if (entries.length !== Object.keys(record.earnedCredits).length) {
      throw new Error('备份中的部分已修学分格式不正确，无法恢复。');
    }
    earnedCredits = Object.fromEntries(entries) as Record<string, number>;
  }

  const hasContent =
    datasets.length > 0 ||
    Object.keys(selectedByTerm).length > 0 ||
    Object.keys(earnedCredits).length > 0 ||
    record.englishExemption === true;
  if (!hasContent) {
    throw new Error('备份文件中没有可恢复的数据。');
  }

  return {
    activeTermId:
      typeof record.activeTermId === 'string' ? record.activeTermId : null,
    selectedByTerm,
    earnedCredits,
    customDatasets: datasets,
    englishExemption: record.englishExemption === true,
  };
}
