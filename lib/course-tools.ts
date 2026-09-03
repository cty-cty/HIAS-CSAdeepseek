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
