/**
 * 课程数据导入 / 更新规则验证（无新增依赖）。
 *
 * 重点回归审计里点名的两个高优先级问题：
 * 1. 导入把同课程的不同正式教学班（-01/-02）合并成一条；
 * 2. 计划记录与正式记录同时存在，重复显示两份 / 用户选课被丢弃。
 *
 * 运行方式：npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { designationLookupKey, type CourseDesignation } from '../app/credit-model';
import {
  coursesShareIdentity,
  isPlannedCourse,
  mergeCourseRows,
  reconcileCourseUpdate,
  type CourseDataRow,
} from '../app/course-data';

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

function row(partial: Partial<CourseDataRow> & { id: string }): CourseDataRow {
  return {
    code: '',
    name: 'FPGA电路软硬件设计',
    category: '专业课',
    subject: '光电信息工程',
    credits: 2.5,
    ...partial,
  } as CourseDataRow;
}

const sec01 = row({
  id: 'sec-01',
  code: '280216085408P3005-01',
  officialCode: '280216085408P3005-01',
  scheduleStatus: 'confirmed',
});
const sec02 = row({
  id: 'sec-02',
  code: '280216085408P3005-02',
  officialCode: '280216085408P3005-02',
  scheduleStatus: 'confirmed',
});
const planned = row({
  id: 'plan-fpga',
  code: 'SP2027-003',
  name: 'FPGA电路软硬件设计',
  subject: '光电信息工程',
  scheduleStatus: 'planned',
  dataStatus: 'planned_course',
});

// 1) 同一门课的两个正式教学班必须分别保留（审计问题 2 的直接回归）
const mergedSections = mergeCourseRows([sec01, sec02]);
eq(mergedSections.length, 2, 'S1 两个正式教学班都保留，不合并成一条');
eq(
  mergedSections.map((c) => c.id).sort(),
  ['sec-01', 'sec-02'],
  'S1b 两个班次 id 都在',
);

// 2) 计划占位被同课程正式记录升级替换，不重复显示两份
const mergedUpgrade = mergeCourseRows([planned, sec01]);
eq(mergedUpgrade.length, 1, 'S2 计划占位被正式记录替换，不重复两份');
eq(mergedUpgrade[0]?.id, 'sec-01', 'S2b 保留的是正式记录');

// 3) 缺少状态字段的旧格式记录按正式课程处理，同样能升级计划占位
const legacyOfficial = row({
  id: 'legacy-01',
  code: '280216085408P3005-01',
});
ok(
  isPlannedCourse(legacyOfficial) === false,
  'S3 缺少状态字段的旧格式记录按正式课程处理',
);
eq(
  mergeCourseRows([planned, legacyOfficial]).length,
  1,
  'S3b 旧格式正式记录同样升级计划占位',
);

// 4) 同课程的多条计划记录去重为一条
const plannedAlt = row({
  id: 'plan-fpga-2',
  code: 'SP2027-004',
  name: 'FPGA电路软硬件设计',
  subject: '光电信息工程',
  scheduleStatus: 'planned',
});
eq(
  mergeCourseRows([planned, plannedAlt]).length,
  1,
  'S4 同课程的两条计划记录去重为一条',
);

// 5) 不同课程不能被合并
const otherCourse = row({
  id: 'other-01',
  code: '280216085408P3006-01',
  officialCode: '280216085408P3006-01',
  name: '量子光学',
  scheduleStatus: 'confirmed',
});
eq(mergeCourseRows([sec01, otherCourse]).length, 2, 'S5 不同课程不被合并');
ok(
  coursesShareIdentity(planned, sec01) === true,
  'S5b 计划占位按“课程名 + 所属专业”匹配正式课程',
);
ok(
  coursesShareIdentity(sec01, otherCourse) === false,
  'S5c 正式编码不同 → 不同课程',
);
ok(
  coursesShareIdentity(sec01, sec02) === true,
  'S5d 同课程不同班次属于同一门培养课程',
);

// 6) 计划 → 正式升级时，选课与学位属性跟着迁移
const designations: Record<string, CourseDesignation> = {
  [designationLookupKey(planned)]: 'degree',
};
const upgrade = reconcileCourseUpdate(
  [planned],
  [sec01],
  ['plan-fpga'],
  designations,
);
eq(upgrade.selectedIds, ['sec-01'], 'S6 选课从计划记录迁移到正式班次');
eq(
  upgrade.designations[designationLookupKey(sec01)],
  'degree',
  'S6b 学位属性随课程身份迁移',
);
eq(upgrade.retainedUnmatched, [], 'S6c 升级成功时不报未匹配');

// 7) 新数据里没有的旧选课必须保留，不静默删除
const goneCourse = row({
  id: 'gone-01',
  code: '280216999999P9999',
  officialCode: '280216999999P9999',
  name: '已停开课程',
  scheduleStatus: 'confirmed',
});
const retained = reconcileCourseUpdate([goneCourse], [sec01], ['gone-01'], {});
eq(retained.selectedIds, ['gone-01'], 'S7 未匹配的旧选课保留原 id');
eq(retained.retainedUnmatched, ['已停开课程'], 'S7b 未匹配项被回报');
ok(
  retained.courses.some((c) => c.id === 'gone-01'),
  'S7c 未匹配的旧课程保留在课程数据里',
);

// 8) 同课程匹配到多个班次时只提示，不替用户决定
const ambiguous = reconcileCourseUpdate(
  [planned],
  [sec01, sec02],
  ['plan-fpga'],
  {},
);
eq(ambiguous.sectionChoices.length, 1, 'S8 多班次匹配产出待确认提示');
eq(ambiguous.selectedIds.length, 1, 'S8b 只落到一个班次，不重复选课');

// 9) 合成夹具回归：真实内置的春季计划 FPGA 被两条正式教学班升级替换
//    （夹具见 scripts/fixtures/spring-sections-test.json，不是正式课表）
const appDir = join(process.cwd(), 'app');
const builtInSpring = JSON.parse(
  readFileSync(join(appDir, 'courses-spring.json'), 'utf8'),
) as CourseDataRow[];
const sectionsFixture = JSON.parse(
  readFileSync(
    join(process.cwd(), 'scripts', 'fixtures', 'spring-sections-test.json'),
    'utf8',
  ),
) as { courses: CourseDataRow[] };

const plannedFpga = builtInSpring.find(
  (course) => course.name === 'FPGA电路软硬件设计',
) as CourseDataRow;
ok(Boolean(plannedFpga), 'S9 内置春季数据里有 FPGA 计划课程');
ok(isPlannedCourse(plannedFpga), 'S9b 内置 FPGA 记录是计划状态');

const fixtureResult = reconcileCourseUpdate(
  [plannedFpga],
  sectionsFixture.courses,
  [plannedFpga.id],
  { [designationLookupKey(plannedFpga)]: 'degree' },
);
eq(
  fixtureResult.courses.length,
  2,
  'S9c 正式导入保留两个教学班，计划占位被替换（不剩三份）',
);
eq(
  fixtureResult.courses.map((course) => course.id).sort(),
  ['fixture-fpga-01', 'fixture-fpga-02'],
  'S9d 两个正式班次都在',
);
eq(fixtureResult.sectionChoices.length, 1, 'S9e 两个班次匹配时提示用户确认');
eq(fixtureResult.selectedIds.length, 1, 'S9f 只落到一个班次，不重复选课');
eq(
  fixtureResult.designations[
    designationLookupKey(sectionsFixture.courses[0] as CourseDataRow)
  ],
  'degree',
  'S9g 学位属性迁移到正式班次',
);

// ---------- 汇总 ----------
console.log(`\n课程数据验证结果：通过 ${passed} 项，失败 ${failed} 项`);
if (failures.length) {
  console.log('失败明细：');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
