// node:test 顶层 test() 注册由运行器管理，无需 await。
/* oxlint-disable typescript/no-floating-promises */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  type Course,
  type Schedule,
  bucketForRole,
  categorizeRequirement,
  compactTermLabel,
  computeCourseRecommendations,
  courseBaseName,
  courseColorIndex,
  courseConflictsInWeek as conflictsInWeek,
  courseDegreeRoleKind,
  courseMatchesSubject,
  courseSubjectDisplay,
  courseSubjectNames,
  coursesConflict,
  csvCell,
  formatConflictSlot,
  formatCredits,
  formatWeekRanges,
  getConflictSlots,
  isCourse,
  isDegreeCourseInScope,
  isDegreeRoleSettable,
  isForcedNonDegreeCategory,
  isMasterEnglishCourseName,
  isSchedule,
  parseBackupPayload,
  parseCourseDataset,
  parseEarnedImport,
  schedulesConflict,
  templateWeekText,
} from '../lib/course-tools.ts';

const DAY_LABELS = '一二三四五六日';

function makeSchedule(
  dayIndex: number,
  start: number,
  end: number,
  weeks: number[],
  extra: Partial<Schedule> = {},
): Schedule {
  const day = `周${DAY_LABELS[dayIndex] ?? '?'}`;
  return {
    day,
    dayIndex,
    start,
    end,
    weeks,
    weeksText: weeks.join(','),
    periodText: `${day}(${start}-${end})`,
    room: '13-101',
    ...extra,
  };
}

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: '1',
    code: 'C001',
    name: '示例课程',
    englishName: 'Sample',
    college: '公共课教学中心',
    category: '专业课',
    level: '硕士',
    subject: '示例学科',
    hours: '30',
    credits: 2,
    capacity: 100,
    enrolled: 0,
    teachingMode: '课堂讲授为主',
    examMode: '闭卷考试',
    teacher: '张三',
    schedules: [makeSchedule(1, 3, 5, [1, 2, 3])],
    ...overrides,
  };
}

test('schedulesConflict: 同星期同时段同周次才冲突', () => {
  const a = makeSchedule(1, 3, 5, [1, 2, 3]);
  assert.equal(schedulesConflict(a, makeSchedule(1, 3, 5, [1, 2, 3])), true);
  assert.equal(schedulesConflict(a, makeSchedule(1, 5, 6, [1, 2, 3])), true); // 首尾相接也算重叠
  assert.equal(schedulesConflict(a, makeSchedule(1, 6, 7, [1, 2, 3])), false);
  assert.equal(schedulesConflict(a, makeSchedule(2, 3, 5, [1, 2, 3])), false); // 不同星期
  assert.equal(schedulesConflict(a, makeSchedule(1, 3, 5, [5, 6])), false); // 不同周次
  assert.equal(
    schedulesConflict(a, makeSchedule(1, 3, 5, [2, 6, 8])),
    true, // 周次有交集(第2周)
  );
});

test('coursesConflict: 任一组上课安排重叠即冲突', () => {
  const a = makeCourse({
    schedules: [makeSchedule(1, 1, 2, [1]), makeSchedule(3, 3, 5, [1, 2])],
  });
  const b = makeCourse({
    schedules: [makeSchedule(2, 1, 2, [1]), makeSchedule(4, 1, 2, [1, 2])],
  });
  assert.equal(coursesConflict(a, b), false);
  const c = makeCourse({
    schedules: [makeSchedule(2, 1, 2, [1]), makeSchedule(3, 4, 6, [2])],
  });
  assert.equal(coursesConflict(a, c), true);
});

test('courseConflictsInWeek: 只在重叠周才判冲突', () => {
  const a = makeCourse({ schedules: [makeSchedule(1, 3, 5, [1, 2, 3])] });
  const b = makeCourse({ schedules: [makeSchedule(1, 4, 6, [2, 3])] });
  assert.equal(conflictsInWeek(a, b, 1), false);
  assert.equal(conflictsInWeek(a, b, 2), true);
  assert.equal(conflictsInWeek(a, b, 3), true);
});

test('getConflictSlots: 返回重叠时段与重叠周', () => {
  const a = makeCourse({ schedules: [makeSchedule(1, 3, 5, [1, 2, 3, 4])] });
  const b = makeCourse({ schedules: [makeSchedule(1, 4, 6, [2, 3, 5])] });
  const slots = getConflictSlots(a, b);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].start, 4);
  assert.equal(slots[0].end, 5);
  assert.deepEqual(slots[0].weeks, [2, 3]);
  assert.equal(slots[0].day, '周二');
  const disjoint = makeCourse({ schedules: [makeSchedule(2, 4, 6, [2])] });
  assert.equal(getConflictSlots(a, disjoint).length, 0);
});

test('formatWeekRanges: 连续周压缩、隔断拆开、去重排序', () => {
  assert.equal(formatWeekRanges([]), '周次待定');
  assert.equal(formatWeekRanges([3, 4, 6, 7, 8, 9, 10, 11, 12, 13]), '第3-4、6-13周');
  assert.equal(formatWeekRanges([1]), '第1周');
  assert.equal(formatWeekRanges([9, 5, 5, 6, 7]), '第5-7、9周');
});

test('formatConflictSlot: 单节与多节的文案', () => {
  const slot = { day: '周一', start: 3, end: 3, weeks: [1, 2] };
  assert.equal(formatConflictSlot(slot), '周一 第3节 · 第1-2周');
  assert.equal(
    formatConflictSlot({ ...slot, start: 3, end: 5 }),
    '周一 第3-5节 · 第1-2周',
  );
});

test('courseBaseName: 去掉分班后缀（含中间班次）', () => {
  assert.equal(courseBaseName('高等数学-01班'), '高等数学');
  assert.equal(courseBaseName('健身气功《八段锦》-02班'), '健身气功《八段锦》');
  assert.equal(courseBaseName('学术道德与学术写作规范1班'), '学术道德与学术写作规范');
  assert.equal(courseBaseName('英语A-01班-学术读写'), '英语A-学术读写');
  assert.equal(courseBaseName('英语A-03班-学术读写'), '英语A-学术读写');
  assert.equal(courseBaseName('高级英语口语（1）-02班'), '高级英语口语（1）');
  assert.equal(courseBaseName('量子场论'), '量子场论');
});

test('csvCell 与 templateWeekText: CSV 转义与 WakeUp 周次格式', () => {
  assert.equal(csvCell('含"引号"'), '"含""引号"""');
  assert.equal(csvCell(2.5), '"2.5"');
  const schedule = makeSchedule(1, 3, 5, [1, 2], {
    weeksText: ' 第3-4,6-13周 ',
  });
  assert.equal(templateWeekText(schedule), '3-4、6-13');
});

test('formatCredits: 整数不带小数', () => {
  assert.equal(formatCredits(2), '2');
  assert.equal(formatCredits(2.5), '2.5');
});

test('isSchedule / isCourse: 结构校验', () => {
  assert.equal(isSchedule(makeSchedule(1, 1, 2, [1])), true);
  assert.equal(
    isSchedule({
      ...makeSchedule(1, 1, 2, [1]),
      weeks: '1-2' as unknown as number[],
    }),
    false,
  );
  assert.equal(
    isSchedule({ ...makeSchedule(1, 1, 2, [1]), dayIndex: '1' }),
    false,
  );
  const valid = makeCourse();
  assert.equal(isCourse(valid), true);
  assert.equal(isCourse({ ...valid, credits: '2' }), false);
  assert.equal(
    isCourse({
      ...valid,
      schedules: [{ ...valid.schedules[0], weeks: '3-4' }],
    }),
    false,
  );
});

test('categorizeRequirement: 课程属性归类（含创新创业模块课）', () => {
  assert.equal(categorizeRequirement('公共必修课'), 'publicRequired');
  assert.equal(categorizeRequirement('公共选修课'), 'publicElective');
  assert.equal(
    categorizeRequirement('公共选修课', '创业管理'),
    'innovation',
  );
  assert.equal(
    categorizeRequirement('公共选修课', '创新创业实践及案例研究'),
    'innovation',
  );
  assert.equal(
    categorizeRequirement('公共选修课', '心理学与心理健康'),
    'publicElective',
  );
  assert.equal(categorizeRequirement('专业核心课'), 'degree');
  assert.equal(categorizeRequirement('学科核心课'), 'degree');
  assert.equal(categorizeRequirement('专业课'), 'degree');
  assert.equal(categorizeRequirement('研讨课'), 'professionalNonDegree');
  assert.equal(categorizeRequirement('实验课'), 'professionalNonDegree');
  assert.equal(categorizeRequirement('创新创业课'), 'innovation');
  assert.equal(categorizeRequirement('未知类别'), 'other');
});

test('courseColorIndex: 稳定、越界安全', () => {
  assert.equal(courseColorIndex('1', 6), courseColorIndex('1', 6));
  assert.equal(courseColorIndex('PHY-101', 6), courseColorIndex('PHY-101', 6));
  for (const id of ['1', 'abc', 'PHY-101', '']) {
    const index = courseColorIndex(id, 6);
    assert.ok(Number.isInteger(index) && index >= 0 && index < 6, id);
  }
});

test('parseCourseDataset: 数组与学期对象', () => {
  const valid = [makeCourse(), makeCourse({ id: '2', name: '第二门' })];
  const parsed = parseCourseDataset(JSON.stringify(valid), 'courses.json');
  assert.equal(parsed.courses.length, 2);
  assert.equal(parsed.label, 'courses');
  assert.ok(parsed.id.startsWith('courses'));

  const wrapped = parseCourseDataset(
    JSON.stringify({
      termId: '2027-spring',
      label: '2027 春季',
      courses: valid,
    }),
    '任意文件名.json',
  );
  assert.equal(wrapped.id, '2027-spring');
  assert.equal(wrapped.label, '2027 春季');

  assert.throws(
    () => parseCourseDataset('{bad json', 'x.json'),
    /不是有效的 JSON/,
  );
  assert.throws(
    () => parseCourseDataset(JSON.stringify({ label: 'x' }), 'x.json'),
    /没有找到课程数组/,
  );
  assert.throws(
    () => parseCourseDataset(JSON.stringify([]), 'x.json'),
    /没有找到课程数组/,
  );
  const broken = makeCourse({
    schedules: [
      {
        ...makeSchedule(1, 1, 2, [1]),
        weeks: '1-2' as unknown as number[],
      },
    ],
  });
  assert.throws(
    () => parseCourseDataset(JSON.stringify([broken]), 'x.json'),
    /schedules/,
  );
  assert.throws(
    () =>
      parseCourseDataset(
        JSON.stringify([{ ...makeCourse(), credits: 'x' }]),
        'x.json',
      ),
    /字段不完整/,
  );
});

test('parseEarnedImport: 三种格式都识别并累计', () => {
  const courseJson = JSON.stringify([
    { category: '公共必修课', credits: 3 },
    { category: '专业核心课', credits: 2.5 },
    { category: '专业核心课', credits: 2 },
  ]);
  assert.deepEqual(parseEarnedImport(courseJson), {
    公共必修课: 3,
    专业核心课: 4.5,
  });
  assert.deepEqual(
    parseEarnedImport(
      JSON.stringify({ termId: '2026-fall', courses: JSON.parse(courseJson) }),
    ),
    { 公共必修课: 3, 专业核心课: 4.5 },
  );
  assert.deepEqual(
    parseEarnedImport(
      JSON.stringify({ 公共必修课: 7, 研讨课: 2, bad: 'x' }),
    ),
    { 公共必修课: 7, 研讨课: 2 },
  );
  assert.throws(() => parseEarnedImport('oops'), /不是有效的 JSON/);
  assert.throws(
    () => parseEarnedImport(JSON.stringify([{ category: '公共必修课' }])),
    /没有识别到/,
  );
  assert.throws(
    () => parseEarnedImport(JSON.stringify({ 公共必修课: '3' })),
    /不是 \{课程属性/,
  );
});

test('parseBackupPayload: 完整备份往返与容错', () => {
  const payload = {
    app: 'hias-csadeepseek',
    version: 1,
    exportedAt: '2026-09-03T00:00:00.000Z',
    activeTermId: '2026-fall',
    selectedByTerm: { '2026-fall': ['1', '2'] },
    earnedCredits: { 公共必修课: 7 },
    customDatasets: [],
  };
  const backup = parseBackupPayload(JSON.stringify(payload));
  assert.deepEqual(backup.selectedByTerm, { '2026-fall': ['1', '2'] });
  assert.deepEqual(backup.earnedCredits, { 公共必修课: 7 });
  assert.equal(backup.activeTermId, '2026-fall');

  const course = makeCourse();
  const withDataset = parseBackupPayload(
    JSON.stringify({
      ...payload,
      customDatasets: [
        {
          id: '2026-fall',
          label: '2026 秋季',
          updatedAt: '2026-09-01T00:00:00.000Z',
          courses: [course],
        },
      ],
    }),
  );
  assert.equal(withDataset.customDatasets.length, 1);

  assert.throws(
    () => parseBackupPayload('nope'),
    /不是有效的 JSON/,
  );
  assert.throws(
    () => parseBackupPayload(JSON.stringify({})),
    /没有可恢复的数据/,
  );
  assert.throws(
    () =>
      parseBackupPayload(
        JSON.stringify({
          customDatasets: [{ id: 'x', label: 'x', updatedAt: 'x', courses: [{}] }],
        }),
      ),
    /不完整/,
  );
  assert.throws(
    () =>
      parseBackupPayload(
        JSON.stringify({
          selectedByTerm: { t: ['1', 2] },
          earnedCredits: { a: 1 },
        }),
      ),
    /选课记录/,
  );
});

test('compactTermLabel: 官方学期名 → 紧凑缩写', () => {
  assert.equal(
    compactTermLabel('2026—2027学年(秋)第一学期'),
    '26—27 秋季',
  );
  assert.equal(
    compactTermLabel('2026—2027学年(春)第二学期'),
    '26—27 春季',
  );
  assert.equal(
    compactTermLabel('2026—2027学年(夏)第三学期'),
    '26—27 夏季',
  );
  assert.equal(compactTermLabel('2027 春季'), '2027 春季');
  assert.equal(compactTermLabel('导入课程数据'), '导入课程数据');
});

test('isMasterEnglishCourseName: 识别英语学位班级课', () => {
  assert.equal(isMasterEnglishCourseName('英语A-02班-学术听说'), true);
  assert.equal(isMasterEnglishCourseName('英语A-01班-学术读写'), true);
  assert.equal(isMasterEnglishCourseName('英语B-01班-学术读写'), true);
  assert.equal(isMasterEnglishCourseName('高级英语口语（1）-01班'), false);
  assert.equal(isMasterEnglishCourseName('心理学与心理健康'), false);
});

test('computeCourseRecommendations: 遵循硬性约束', () => {
  const colHome = '物理与光电工程学院';
  const mk = (
    id: string,
    category: string,
    name: string,
    extra: Partial<Course> = {},
  ) => makeCourse({ id, category, name, college: colHome, credits: 2, ...extra });

  const core1 = mk('c1', '专业核心课', '本专业核心一', { credits: 3 });
  const pro1 = mk('p1', '专业课', '本专业专业课一', { credits: 2 });
  const cross = mk('x1', '专业核心课', '他专业核心', { credits: 3 });
  const nonDeg = mk('n1', '研讨课', '本学院研讨');
  const nonDegOther = mk('n2', '研讨课', '外院研讨', { college: '化材学院' });
  const pub = mk('r1', '公共必修课', '自然辩证法概论-01班', { credits: 1 });
  const pub2 = mk('r2', '公共必修课', '自然辩证法概论-02班', { credits: 1 });
  const elect = mk('e1', '公共选修课', '心理学与心理健康', { credits: 1 });
  const innov = mk('i1', '公共选修课', '创业管理', { credits: 1 });
  const courses = [core1, pro1, cross, nonDeg, nonDegOther, pub, pub2, elect, innov];

  const plan = {
    coreCourses: ['本专业核心一'],
    professionalCourses: ['本专业专业课一'],
    coreMinimum: 1,
    professionalMinimum: 1,
    degreeCourseCredits: 3,
    professionalNonDegreeCredits: 2,
    publicRequiredCredits: 1,
    publicElectiveCredits: 0,
    innovationCredits: 1,
    homeCollege: colHome,
  };
  const res = computeCourseRecommendations({
    courses,
    selectedCourses: [],
    selectedIds: [],
    earnedByBucket: {},
    plan,
    englishExemption: false,
  });
  const names = res.rows.map((r) => r.course.name);
  // 学位课仅限本专业课程库
  for (const r of res.rows) {
    if (r.bucket === 'degree') {
      assert.ok(
        plan.coreCourses.includes(r.course.name) ||
          plan.professionalCourses.includes(r.course.name),
      );
    }
  }
  assert.ok(!names.includes('他专业核心'));
  // 专业非学位课仅限本学院
  for (const r of res.rows) {
    if (r.bucket === 'professionalNonDegree') {
      assert.equal(r.course.college, colHome);
    }
  }
  assert.ok(!names.includes('外院研讨'));
  // 公共必修同课不同班只出现一节 + 无重复 id
  const pubBases = res.rows
    .filter((r) => r.bucket === 'publicRequired')
    .map((r) => courseBaseName(r.course.name));
  assert.equal(new Set(pubBases).size, pubBases.length);
  const ids = res.rows.map((r) => r.course.id);
  assert.equal(new Set(ids).size, ids.length);

  // 英语免修：不推荐英语课程
  const en = mk('en1', '公共必修课', '英语A-01班-学术读写', { credits: 3 });
  const res2 = computeCourseRecommendations({
    courses: [...courses, en],
    selectedCourses: [],
    selectedIds: [],
    earnedByBucket: { publicRequired: 0 },
    plan: { ...plan, publicRequiredCredits: 4 },
    englishExemption: true,
  });
  assert.ok(
    res2.rows.every((r) => !isMasterEnglishCourseName(r.course.name)),
  );

  // 已选某班次后，其它班次不再推荐
  const res3 = computeCourseRecommendations({
    courses: [pub, pub2],
    selectedCourses: [pub],
    selectedIds: [pub.id],
    earnedByBucket: {},
    plan: { ...plan, publicRequiredCredits: 1 },
    englishExemption: false,
  });
  assert.ok(
    res3.rows.every((r) => courseBaseName(r.course.name) !== '自然辩证法概论'),
  );
});

test('数据事实: courses.json 不应有课程级冲突缺陷（回归锚点）', () => {
  // 保证样例 fixture 自身结构被 isCourse 接受
  assert.equal(isCourse(makeCourse()), true);
});

test('degreeRole 归类: 核心课可设学位/非学位，研讨课强制非学位，公共课不适用', () => {
  assert.equal(isDegreeRoleSettable('专业核心课'), true);
  assert.equal(isDegreeRoleSettable('学科核心课'), true);
  assert.equal(isDegreeRoleSettable('专业课'), true);
  assert.equal(isDegreeRoleSettable('研讨课'), false);
  assert.equal(isForcedNonDegreeCategory('研讨课'), true);
  assert.equal(isForcedNonDegreeCategory('实验课'), true);
  assert.equal(isForcedNonDegreeCategory('实践课'), true);
  assert.equal(isForcedNonDegreeCategory('科学前沿讲座'), true);
  assert.equal(isForcedNonDegreeCategory('专业核心课'), false);

  assert.equal(courseDegreeRoleKind({ category: '专业课', name: 'X' }), 'settable');
  assert.equal(courseDegreeRoleKind({ category: '研讨课', name: 'X' }), 'forcedNonDegree');
  assert.equal(courseDegreeRoleKind({ category: '公共必修课', name: 'X' }), 'none');

  // bucketForRole: 核心课+degree → 学位课；核心课+nonDegree → 专业非学位课；未设置 → null
  assert.equal(bucketForRole('专业核心课', 'X', 'degree', true), 'degree');
  assert.equal(bucketForRole('专业课', 'X', 'nonDegree', true), 'professionalNonDegree');
  assert.equal(bucketForRole('学科核心课', 'X', null, true), null);
  // 研讨课强制非学位
  assert.equal(bucketForRole('研讨课', 'X', null, true), 'professionalNonDegree');
  assert.equal(bucketForRole('实验课', 'X', 'degree', true), 'professionalNonDegree');
  // 公共课不受 degreeRole 影响
  assert.equal(bucketForRole('公共必修课', 'X', null, true), 'publicRequired');
});

test('courseSubjects / 多专业归属与筛选', () => {
  const multi = makeCourse({
    subject: '计算机技术',
    subjects: [
      { code: '085404', name: '计算机技术' },
      { code: '085410', name: '人工智能' },
    ],
  });
  assert.deepEqual(courseSubjectNames(multi), ['计算机技术', '人工智能']);
  assert.equal(
    courseSubjectDisplay(multi),
    '085404 计算机技术、085410 人工智能',
  );
  assert.equal(courseMatchesSubject(multi, '085410'), true);
  assert.equal(courseMatchesSubject(multi, '人工智能'), true);
  assert.equal(courseMatchesSubject(multi, '物理电子学'), false);

  // 兼容旧数据：只有 subject 字段时
  const single = makeCourse({ subject: '物理电子学' });
  assert.deepEqual(courseSubjectNames(single), ['物理电子学']);
  assert.equal(courseMatchesSubject(single, '物理电子学'), true);
});

test('computeCourseRecommendations: 学位课缺口只统计标记为学位课的已选核心/专业课', () => {
  const colHome = '物理与光电工程学院';
  const mk = (id: string, category: string, name: string) =>
    makeCourse({ id, category, name, college: colHome, credits: 3 });
  const coreA = mk('c1', '专业核心课', '本专业核心一');
  const proA = mk('p1', '专业课', '本专业专业课一');
  const plan = {
    coreCourses: ['本专业核心一'],
    professionalCourses: ['本专业专业课一'],
    coreMinimum: 1,
    professionalMinimum: 1,
    degreeCourseCredits: 12,
    professionalNonDegreeCredits: null,
    publicRequiredCredits: 0,
    publicElectiveCredits: 0,
    innovationCredits: null,
    homeCollege: colHome,
  };
  const base = {
    courses: [coreA, proA],
    selectedIds: ['c1', 'p1'],
    earnedByBucket: {},
    plan,
    englishExemption: false,
  };
  // 已选但未标记学位属性 → degreeRolePendingCount = 2，学位课缺口仍存在
  const resPending = computeCourseRecommendations({
    ...base,
    selectedCourses: [coreA, proA],
  });
  assert.equal(resPending.degreeRolePendingCount, 2);
  // 已选并标记为学位课 → pending 归零，缺学分时按 core/pro 补齐推荐
  const resDegree = computeCourseRecommendations({
    ...base,
    selectedCourses: [coreA, proA],
    degreeRoles: { c1: 'degree', p1: 'degree' },
  });
  assert.equal(resDegree.degreeRolePendingCount, 0);
  const names = resDegree.rows.map((r) => r.course.name);
  assert.equal(
    names.some((n) => n === '本专业核心一' || n === '本专业专业课一'),
    false, // 已选的同基础课程不会再推荐
  );
});

test('computeCourseRecommendations: coreFrom 来源集合优先推荐（人工智能方向）', () => {
  const colHome = '物理与光电工程学院';
  const mk = (id: string, name: string, extra: Partial<Course> = {}) =>
    makeCourse({ id, name, college: colHome, credits: 3, ...extra });
  const coreNLP = mk('n1', '自然语言处理', { category: '专业核心课' });
  const coreAI = mk('n2', '高级人工智能', { category: '专业核心课' });
  const coreMath = mk('n3', '人工智能的数学基础与应用', {
    category: '专业核心课',
  });
  const plan = {
    coreCourses: ['自然语言处理', '高级人工智能', '人工智能的数学基础与应用'],
    professionalCourses: [],
    coreMinimum: 2,
    professionalMinimum: 0,
    degreeCourseCredits: 12,
    professionalNonDegreeCredits: null,
    publicRequiredCredits: 0,
    publicElectiveCredits: 0,
    innovationCredits: null,
    homeCollege: colHome,
    coreFrom: ['高级人工智能', '自然语言处理'],
  };
  const res = computeCourseRecommendations({
    courses: [coreNLP, coreAI, coreMath],
    selectedCourses: [],
    selectedIds: [],
    earnedByBucket: {},
    plan,
    englishExemption: false,
  });
  const names = res.rows.map((r) => r.course.name);
  // 优先从来源集合（高级人工智能/自然语言处理）推荐
  assert.ok(
    names[0] === '高级人工智能' || names[0] === '自然语言处理',
    `期望来源集合课程优先，实际 ${names.join('、')}`,
  );
  // 同课不同班只推一个
  const resDup = computeCourseRecommendations({
    courses: [
      mk('a1', '英语A-01班-学术读写', { category: '公共必修课', credits: 3 }),
      mk('a2', '英语A-02班-学术读写', { category: '公共必修课', credits: 3 }),
    ],
    selectedCourses: [],
    selectedIds: [],
    earnedByBucket: {},
    plan: {
      ...plan,
      coreCourses: [],
      professionalCourses: [],
      coreMinimum: 0,
      publicRequiredCredits: 3,
    },
    englishExemption: false,
  });
  assert.equal(resDup.rows.length, 1);
});

test('computeCourseRecommendations: 同课带班号只推荐一个班、已选某班不推其他班', () => {
  const home = '物理与光电工程学院';
  const mkSection = (id: string, name: string, start: number) =>
    makeCourse({
      id,
      name,
      college: home,
      category: '专业核心课',
      credits: 3,
      schedules: [makeSchedule(0, start, start + 1, [1, 2, 3])],
    });
  const sec1 = mkSection('s1', '核心一-01班', 3);
  const sec2 = mkSection('s2', '核心一-02班', 5);
  const plan = {
    coreCourses: ['核心一'],
    professionalCourses: [],
    coreMinimum: 1,
    professionalMinimum: 0,
    degreeCourseCredits: 6,
    professionalNonDegreeCredits: null,
    publicRequiredCredits: 0,
    publicElectiveCredits: 0,
    innovationCredits: null,
    homeCollege: home,
  };
  // 两个班互不冲突 → 只推荐其中一个班
  const res = computeCourseRecommendations({
    courses: [sec1, sec2],
    selectedCourses: [],
    selectedIds: [],
    earnedByBucket: {},
    plan,
    englishExemption: false,
  });
  assert.equal(res.rows.length, 1);
  assert.ok(/核心一/.test(res.rows[0].course.name));
  // 已选 01 班后不再推荐 02 班
  const resSelected = computeCourseRecommendations({
    courses: [sec1, sec2],
    selectedCourses: [sec1],
    selectedIds: [sec1.id],
    earnedByBucket: {},
    plan,
    englishExemption: false,
  });
  assert.ok(
    resSelected.rows.every(
      (row) => courseBaseName(row.course.name) !== '核心一',
    ),
  );
});

test('parseBackupPayload: 学位属性（degreeRoles）往返与容错', () => {
  const payload = {
    app: 'hias-csadeepseek',
    version: 2,
    activeTermId: '2026-fall',
    degreeRoles: { '2026-fall': { c1: 'degree', p1: 'nonDegree' } },
    englishExemption: true,
  };
  const backup = parseBackupPayload(JSON.stringify(payload));
  assert.deepEqual(backup.degreeRoles, {
    '2026-fall': { c1: 'degree', p1: 'nonDegree' },
  });
  // 非法角色 → 解析失败
  assert.throws(
    () =>
      parseBackupPayload(
        JSON.stringify({
          ...payload,
          degreeRoles: { '2026-fall': { c1: 'bogus' } },
        }),
      ),
    /学位属性/,
  );
  // 旧备份（无 degreeRoles 字段）仍可解析
  const legacy = parseBackupPayload(
    JSON.stringify({
      app: 'hias-csadeepseek',
      version: 1,
      activeTermId: '2026-fall',
      selectedByTerm: { '2026-fall': ['1'] },
    }),
  );
  assert.deepEqual(legacy.degreeRoles, {});
});

test('major scope: 学术型允许一级学科及所属二级学科课程作学位课', () => {
  // 课程属于二级学科「物理电子学」（一级=电子科学与技术）
  const course = makeCourse({
    category: '专业课',
    subject: '物理电子学',
  });
  const scope = {
    planCourses: [],
    // 学术型物理电子学：一级=电子科学与技术 + 二级=物理电子学
    academicMajors: ['电子科学与技术', '物理电子学'],
    academic: true,
  };
  assert.equal(isDegreeCourseInScope(course, scope), true);

  // 属于一级学科名的课程也允许（如 电子科学与技术）
  const firstLevelCourse = makeCourse({
    category: '专业核心课',
    subject: '电子科学与技术',
  });
  assert.equal(isDegreeCourseInScope(firstLevelCourse, scope), true);

  // 专硕：academic=false 且无 academicMajors → 只认培养方案课程名单
  const profScope = {
    planCourses: ['本专业核心一'],
    academicMajors: [],
    academic: false,
  };
  const inPlan = makeCourse({ name: '本专业核心一', subject: '任意学科' });
  assert.equal(isDegreeCourseInScope(inPlan, profScope), true);
  // 外专业课程不能作为学位课
  const outPlan = makeCourse({ name: '其他专业课程', subject: '理论物理' });
  assert.equal(isDegreeCourseInScope(outPlan, profScope), false);
});

test('major map: academicScopeMajors 返回一级+二级学科集合', async () => {
  const { academicScopeMajors, PROFESSIONAL_SCOPES } = await import(
    '../app/major-map.ts'
  );
  assert.deepEqual(academicScopeMajors('物理电子学'), [
    '电子科学与技术',
    '物理电子学',
  ]);
  assert.deepEqual(academicScopeMajors('理论物理'), [
    '物理学',
    '理论物理',
    '精密测量物理',
  ]);
  // 找不到映射时退回仅本专业
  assert.deepEqual(academicScopeMajors('未知方向'), ['未知方向']);
  assert.ok(
    PROFESSIONAL_SCOPES.some(
      (scope) =>
        scope.category === '电子信息' &&
        scope.fields.includes('光电信息工程') &&
        scope.fields.includes('人工智能'),
    ),
  );
});
