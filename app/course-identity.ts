/**
 * 课程身份（course identity）纯函数库 —— 统一“课程”与“教学班”概念。
 *
 * - 一门课程可以有多个教学班（section），同一门课的班次不是两门课程；
 * - canonicalCourseId 用于：防止重复选课、推荐去重、学位课属性、培养方案计数、
 *   历史课程去重、换班、秋季必修检测、春季 planned→official 匹配；
 * - 课程编号缺失时才回退到 “标准化课程名称 + 所属专业/学科”。
 *
 * 本模块不依赖 React，不读取浏览器存储。
 */

export type CourseIdentityLike = {
  id?: string;
  code?: string;
  officialCode?: string | null;
  name?: string;
  subject?: string;
};

/** 内部占位编码（如 SP2027-001）。这类编码不能伪装成学校正式课程编码。 */
const PLACEHOLDER_CODE_PATTERN = /^SP\d{4}-/i;

export function isPlaceholderCode(code?: string | null) {
  return Boolean(code && PLACEHOLDER_CODE_PATTERN.test(code.trim()));
}

/**
 * 课程正式编码：优先 officialCode；其次课程 code 中非占位、且形如学校编码
 * （含课程性质位，长度≥14）的值；都没有则返回空字符串。
 * 返回空串表示“正式材料未给出课程编码”，UI 应显示“待春季正式课表公布/待正式编码”，
 * 而不是显示 SP2027-xxx 或自行推算。
 */
export function officialCourseCode(course: CourseIdentityLike) {
  if (course.officialCode && course.officialCode.trim()) {
    return course.officialCode.trim();
  }
  const code = (course.code ?? '').trim();
  if (!code || isPlaceholderCode(code)) return '';
  // 学校编码形如 280216120500PB002-01：数字/字母混合，至少 14 位。
  if (/^[0-9A-Za-z-]{14,}$/.test(code)) return code.replace(/-\d+$/, '');
  return '';
}

/** 去掉教学班后缀后的课程基础编码（如 -01/-02/S02/W01）。 */
export function normalizeCourseBaseCode(code?: string | null) {
  const value = (code ?? '').trim().toUpperCase();
  // 280216120500PB002-01 -> 280216120500PB002；280216050200MB001-S02 -> MB001
  const base = value.replace(/-(?:[A-Z]*\d+|[A-Za-z]?\d{1,2})$/i, '');
  return isPlaceholderCode(base) ? '' : base;
}

/** 标准化课程名称（去班号/空白，英文课保留 family 特判）。 */
export function normalizedCourseName(name?: string | null) {
  return (name ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[-—－]?\d+班$/, '');
}

function isEnglishFamily(course: CourseIdentityLike) {
  return (
    /050200MB001/i.test(course.code ?? '') ||
    /050200MB001/i.test(course.officialCode ?? '') ||
    (course.name ?? '').startsWith('英语')
  );
}

/**
 * 同一门课的稳定身份键。
 *
 * 规则：
 * 1. 英语类课程（family 逻辑保留）→ 固定 'english:280216050200MB001'；
 * 2. 有可解析学校编码 → 'code:' + 基础编码；
 * 3. 否则（如 SP2027-xxx 占位/缺编码）→ 'name:' + 标准化名称 + '|' + 标准化 subject。
 */
export function canonicalCourseId(course: CourseIdentityLike) {
  if (isEnglishFamily(course)) return 'english:280216050200MB001';
  const baseCode = normalizeCourseBaseCode(
    course.officialCode || course.code,
  );
  if (baseCode && !/^SP\d{4}/i.test(baseCode)) {
    return `code:${baseCode}`;
  }
  const subject = (course.subject ?? '').trim().replace(/\s+/g, '');
  return `name:${normalizedCourseName(course.name)}|${subject}`;
}

export function sameCanonicalCourse(
  left: CourseIdentityLike,
  right: CourseIdentityLike,
) {
  return canonicalCourseId(left) === canonicalCourseId(right);
}

export type CourseCodeDisplay = {
  /** 展示给用户的正式编码文本；空字符串表示没有可展示的正式编码。 */
  text: string;
  /** 展示辅助状态。 */
  kind: 'official' | 'placeholder' | 'missing';
};

/**
 * 课程编码展示助手：占位编码（SP2027-xxx）永不伪装为学校正式编码。
 * 需要显示“内部占位/待正式编码”说明时由调用方基于 kind 渲染文案。
 */
export function displayCourseCode(course: CourseIdentityLike): CourseCodeDisplay {
  const official = officialCourseCode(course);
  if (official) return { text: official, kind: 'official' };
  const raw = (course.code ?? '').trim();
  if (raw && !isPlaceholderCode(raw)) {
    return { text: raw, kind: 'official' };
  }
  return { text: '', kind: raw ? 'placeholder' : 'missing' };
}

export type CourseTermAvailability =
  | 'fall'
  | 'spring'
  | 'both'
  | 'unknown';

/** 由课程的学期标注推导“秋/春/秋春/未知”（semesterNote 与 label 兼容）。 */
export function courseTermAvailability(
  course: CourseIdentityLike & { semesterNote?: string; label?: string },
): CourseTermAvailability {
  const value = String(course.semesterNote || course.label || '').trim();
  if (/秋/.test(value) && /春/.test(value)) return 'both';
  if (/春/.test(value)) return 'spring';
  if (/秋/.test(value)) return 'fall';
  return 'unknown';
}
