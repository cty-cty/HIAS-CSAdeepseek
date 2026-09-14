/**
 * 课程数据导入 / 更新（计划课程 ↔ 正式课表）纯函数库。
 *
 * 关键约定（对应审计里「导入把同课程不同班次合并成一条」的高优先级问题）：
 * - 一门培养课程可以有多个正式教学班（如 -01/-02），导入时必须分别保留，
 *   否则用户无法换班，也看不到真实班次；
 * - 只有「计划占位记录」可以被同课程的正式记录替换 / 升级；
 * - 更新是增量合并：没有出现在新数据里的旧课程与用户选课一律保留，不静默删除；
 * - 匹配到多个班次时只提示、不替用户决定，由页面要求确认。
 *
 * 本模块不依赖 React，不读取浏览器存储。
 */
import {
  isPlaceholderCode,
  normalizeCourseBaseCode,
  normalizedCourseName,
  type CourseIdentityLike,
} from './course-identity';
import {
  designationLookupKey,
  getCourseDesignation,
  type CourseLike,
} from './credit-model';

/** 课程数据行：课程身份字段 + 计划/正式状态。 */
export type CourseDataRow = CourseIdentityLike &
  CourseLike & {
    /** 'planned' = 依据培养方案整理的计划课程；'confirmed' = 正式课表课程。 */
    scheduleStatus?: 'planned' | 'confirmed';
    /** 更明确的数据来源状态；显式正式状态优先于 scheduleStatus。 */
    dataStatus?: 'planned_course' | 'official_schedule';
  };

type DesignationMap = Parameters<typeof getCourseDesignation>[1];

/**
 * 正式课程基础编码。
 * 占位编码（SP2027-xxx / SP2027）与空值一律返回空串，
 * 表示“正式材料未给出课程编码”——此时按课程名 + 所属专业匹配。
 */
function officialBaseCode(course: CourseDataRow) {
  const raw = (course.officialCode || course.code || '').trim().toUpperCase();
  if (!raw || isPlaceholderCode(raw) || /^SP\d+$/i.test(raw)) return '';
  return normalizeCourseBaseCode(raw);
}

/** 英语类课程按同一 family 处理（不同学期/不同班次视为同一门）。 */
function isEnglishFamilyCourse(course: CourseDataRow) {
  return (
    /050200MB001/i.test(course.officialCode ?? '') ||
    /050200MB001/i.test(course.code ?? '') ||
    (course.name ?? '').startsWith('英语')
  );
}

/** 教学班编码：用于区分同一门课的不同班次。 */
function sectionCode(course: CourseDataRow) {
  const raw = (course.officialCode || course.code || '').trim().toUpperCase();
  return isPlaceholderCode(raw) ? '' : raw;
}

/**
 * 两门课程是否属于同一门培养课程。
 *
 * 口径与参考版一致：
 * 1. 英语按 family 特判；
 * 2. 双方都有正式编码 → 比较基础编码（去掉 -01/-02 班次后缀）；
 * 3. 双方都有编码但不相同 → 不同课程；
 * 4. 只要一方没有正式编码（计划占位）→ 退化为「标准化课程名 + 所属专业」比较，
 *    这是计划课程能被正式课表升级的关键。
 */
export function coursesShareIdentity(
  left: CourseDataRow,
  right: CourseDataRow,
) {
  if (isEnglishFamilyCourse(left) && isEnglishFamilyCourse(right)) return true;
  const leftCode = officialBaseCode(left);
  const rightCode = officialBaseCode(right);
  if (leftCode && rightCode) return leftCode === rightCode;
  return (
    normalizedCourseName(left.name) === normalizedCourseName(right.name) &&
    (left.subject ?? '').trim() === (right.subject ?? '').trim()
  );
}

/**
 * 是否为「计划课程」。
 * 显式正式状态优先：带 dataStatus=official_schedule 或 scheduleStatus=confirmed
 * 的旧格式记录会被当作正式课程，不会被计划记录覆盖。
 */
export function isPlannedCourse(
  course: Pick<CourseDataRow, 'scheduleStatus' | 'dataStatus'>,
) {
  if (
    course.dataStatus === 'official_schedule' ||
    course.scheduleStatus === 'confirmed'
  ) {
    return false;
  }
  return (
    course.dataStatus === 'planned_course' ||
    course.scheduleStatus === 'planned'
  );
}

/**
 * 合并课程行，保留不同教学班。
 * - 正式记录之间：只有同一教学班（同 id 或同班次编码）才算重复；
 * - 正式记录与计划占位：同课程身份时保留正式记录，丢弃计划占位；
 * - 计划记录之间：同课程身份即视为重复。
 */
export function mergeCourseRows<T extends CourseDataRow>(courses: T[]): T[] {
  const normalized = courses.map((course) => {
    const planned = isPlannedCourse(course);
    return {
      ...course,
      scheduleStatus: planned ? 'planned' : 'confirmed',
      dataStatus: planned ? 'planned_course' : 'official_schedule',
    } as T;
  });

  const result: T[] = [];
  for (const course of normalized) {
    const planned = isPlannedCourse(course);

    // 同课程已有正式记录时，计划占位直接丢弃，避免计划/正式重复显示两份。
    if (
      planned &&
      normalized.some(
        (other) => !isPlannedCourse(other) && coursesShareIdentity(other, course),
      )
    ) {
      continue;
    }

    const duplicate = result.findIndex((other) =>
      planned
        ? isPlannedCourse(other) && coursesShareIdentity(course, other)
        : !isPlannedCourse(other) &&
          (other.id === course.id ||
            (Boolean(sectionCode(course)) &&
              sectionCode(other) === sectionCode(course))),
    );

    if (duplicate < 0) result.push(course);
    else result[duplicate] = course;
  }
  return result;
}

export type CourseUpdateResult<T extends CourseDataRow> = {
  courses: T[];
  selectedIds: string[];
  designations: DesignationMap;
  /** 新数据里没有匹配到、因而保留原样的旧选课 / 旧课程名。 */
  retainedUnmatched: string[];
  /** 同课程匹配到多个班次时，需要用户确认的班次选择提示。 */
  sectionChoices: string[];
};

/**
 * 增量更新课程数据，并把已选 ID 与学位属性迁移到新的课程身份上。
 *
 * 不静默删除、不替用户选择全部班次：未匹配的旧数据保留并回报，
 * 多班次匹配只产出 `sectionChoices` 供页面确认。
 */
export function reconcileCourseUpdate<T extends CourseDataRow>(
  previous: T[],
  incoming: T[],
  selectedIds: string[],
  designations: DesignationMap,
): CourseUpdateResult<T> {
  const courses = mergeCourseRows([...previous, ...incoming]);
  const nextDesignations: DesignationMap = { ...designations };
  const retainedUnmatched: string[] = [];
  const sectionChoices: string[] = [];

  const nextSelected = selectedIds.map((id) => {
    const old = previous.find((course) => course.id === id);
    if (!old) {
      retainedUnmatched.push(id);
      return id;
    }

    // 只有存活下来的行才能承接选课：低优先级的计划导入绝不能把
    // 已选正式班次重定向到一条已被丢弃的占位记录上。
    const survivingIncoming = incoming
      .map((row) => courses.find((course) => course.id === row.id))
      .filter((row): row is T => Boolean(row));

    const exact = survivingIncoming.find(
      (course) =>
        course.id === id || (Boolean(old.code) && old.code === course.code),
    );
    const matches = survivingIncoming.filter((course) =>
      coursesShareIdentity(course, old),
    );
    const replacement = exact ?? matches[0];

    if (!exact && matches.length > 1) {
      sectionChoices.push(
        `${old.name} → ${replacement?.code || replacement?.id || ''}`,
      );
    }

    if (!replacement) {
      if (!courses.some((course) => course.id === id)) courses.push(old);
      retainedUnmatched.push(old.name);
      return id;
    }

    nextDesignations[designationLookupKey(replacement)] = getCourseDesignation(
      old,
      designations,
    );
    return replacement.id;
  });

  return {
    courses,
    selectedIds: [...new Set(nextSelected)],
    designations: nextDesignations,
    retainedUnmatched,
    sectionChoices,
  };
}
