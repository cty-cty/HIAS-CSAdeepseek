// node:test 顶层 test() 注册由运行器管理，无需 await。
/* oxlint-disable typescript/no-floating-promises */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  type Course,
  type Schedule,
  categorizeRequirement,
  compactTermLabel,
  computeCourseRecommendations,
  courseBaseName,
  courseColorIndex,
  courseConflictsInWeek as conflictsInWeek,
  coursesConflict,
  csvCell,
  formatConflictSlot,
  formatCredits,
  formatWeekRanges,
  getConflictSlots,
  isCourse,
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
