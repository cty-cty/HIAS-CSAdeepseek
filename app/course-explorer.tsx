'use client';

// 巨型历史组件：局部禁用 React Compiler 优化检查（与旧归档一致）。
// 培养规则全部由纯函数模块确定性执行，不受该禁用影响。
/* oxlint-disable react/react-compiler */

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookOpen,
  Plus,
  ArrowRight,
  Settings2,
  Undo2,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Info,
  MapPin,
  Presentation,
  Repeat2,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Trash2,
  Users,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PROGRAM_PLANS, type ProgramPlan } from '@/app/program-plans';
import {
  calculateCreditSummary,
  courseBaseName,
  courseFamilyKey,
  designationLookupKey,
  getDegreeEligibility,
  getCourseRequirementType,
  getCourseRequirementTypeLabel,
  getCourseRoleEligibility,
  getCourseDesignation,
  isCoreDegreeType,
  isProfessionalDegreeType,
  getPlanCourseCounts,
  isEnglishCourse,
  isInnovationCourse,
  getCourseModule,
  type CourseDesignation,
  type CourseModule,
  type CourseRequirementType,
  type DegreeRole,
  type ExemptionStatus,
  type HistoricalModule,
  type HistoricalRecord,
} from '@/app/credit-model';
import { getGraduateProgramScopeLabel } from '@/app/graduate-program-mapping';
import {
  canonicalCourseId,
  displayCourseCode,
} from './course-identity';
import {
  calculateSemesterCheckup,
  type SemesterCheckup,
} from './program-rules';
import {
  buildCandidates,
  collectConfirmedDegreeNames,
  generateRecommendationPlans,
  type GeneratedPlan,
  type RecommendationResult,
} from './recommendation-engine';
import springCoursesData from './courses-spring.json';

type Schedule = {
  day: string;
  dayIndex: number;
  start: number;
  end: number;
  weeks: number[];
  weeksText: string;
  periodText: string;
  room: string;
};

type Course = {
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
  /** 与源课表一致的开课校区 / 首席教授 / 助教（部分课程可能为空）。 */
  campus?: string;
  chiefProfessor?: string;
  assistant?: string;
  /**
   * 学校正式课程编码（可空）。占位编码（SP2027-xxx）只允许在 code 字段内部使用，
   * 展示时请使用 course-identity 的 displayCourseCode，避免把占位码当成正式编码。
   */
  officialCode?: string | null;
  /**
   * 课程数据状态：
   * 'planned' = 依据培养方案整理的春季计划课程（时间/班次/最终开设待正式课表）；
   * 'confirmed' / 缺省 = 当前学期正式课表课程。
   */
  scheduleStatus?: 'planned' | 'confirmed';
  /** 学期标注（春 / 秋、春 / 秋），课程数据文件提供时可选。 */
  semesterNote?: string;
  schedules: Schedule[];
  module?: CourseModule;
  requirementType?: CourseRequirementType;
  degreeRole?: DegreeRole;
};

type CourseDataset = {
  id: string;
  label: string;
  shortLabel?: string;
  courses: Course[];
  updatedAt?: string;
  audience?: string;
};

/** 春季学期内置课程（依据《物光学院2026—2027课程按专业合并整理》中开课学期含“春”的课程）。 */
const springDefaultCourses: Course[] = springCoursesData as Course[];

const DEFAULT_TERM_ID = '2026-fall';
const DEFAULT_TERM_LABEL = '2026—2027学年(秋)第一学期';
const TERM_TEMPLATES = [
  {
    id: DEFAULT_TERM_ID,
    label: DEFAULT_TERM_LABEL,
    shortLabel: '26—27 秋季',
  },
  {
    id: '2027-spring',
    label: '2026—2027学年(春)第二学期',
    shortLabel: '26—27 春季',
  },
  {
    id: '2027-summer',
    label: '2026—2027学年(夏)第三学期',
    shortLabel: '26—27 夏季',
  },
] as const;
const TERM_TEMPLATE_IDS = new Set<string>(
  TERM_TEMPLATES.map((term) => term.id),
);
const COURSE_DATASETS_STORAGE_KEY = 'hias-course-datasets-v1';
const ACTIVE_TERM_STORAGE_KEY = 'hias-active-term-v1';
const SELECTED_BY_TERM_STORAGE_KEY = 'hias-selected-by-term-v1';
const DESIGNATIONS_BY_TERM_STORAGE_KEY = 'hias-designations-by-term-v1';
const PROGRAM_PLANS_STORAGE_KEY = 'hias-program-plans-v1';
const HISTORICAL_RECORDS_STORAGE_KEY = 'hias-historical-records-v1';
const ENGLISH_EXEMPTION_STORAGE_KEY = 'hias-english-exemption-v1';
const ACTIVE_PROGRAM_STORAGE_KEY = 'hias-active-program-v1';
const INITIAL_SETTINGS_STORAGE_KEY = 'hias-initial-settings-completed-v1';
const DOCTOR_TRACK_STORAGE_KEY = 'hias-doctor-track-v1';
const LEGACY_SELECTED_STORAGE_KEY = 'ucas-hangzhou-selected';
const BACKUP_VERSION = 2;
const EMPTY_SELECTED_IDS: string[] = [];
const EMPTY_DESIGNATIONS: Record<string, CourseDesignation> = {};

function createTermTemplateDataset(
  termId: string,
  defaultCourses: Course[],
): CourseDataset | null {
  const template = TERM_TEMPLATES.find((term) => term.id === termId);
  if (!template) return null;
  return {
    id: template.id,
    label: template.label,
    shortLabel: template.shortLabel,
    courses:
      template.id === DEFAULT_TERM_ID
        ? defaultCourses
        : template.id === '2027-spring'
          ? springDefaultCourses
          : [],
    updatedAt: '',
    audience: '2026 级研一新生专用',
  };
}

type ConflictSlot = {
  day: string;
  start: number;
  end: number;
  weeks: number[];
};

type ConflictPair = {
  left: Course;
  right: Course;
  slots: ConflictSlot[];
};

type ExamBucketId = 'closed' | 'open' | 'report' | 'practical' | 'other';

type ExamBucket = {
  id: ExamBucketId;
  label: string;
  description: string;
  tone: string;
};

type NoticeSection = {
  title: string;
  items: Array<{ label: string; detail: string }>;
};

type WebMcpContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: {
        readOnlyHint: boolean;
        untrustedContentHint: boolean;
      };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};

type BackupPayload = {
  version: number;
  app: 'HIAS-CSA';
  savedAt: string;
  activeTermId: string;
  customDatasets: CourseDataset[];
  selectedByTerm: Record<string, string[]>;
  designationsByTerm: Record<string, Record<string, CourseDesignation>>;
  programPlans: ProgramPlan[];
  historicalRecords: HistoricalRecord[];
  englishExemptionStatus: ExemptionStatus;
};

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const PAGE_SIZE = 24;
const EXAM_BUCKETS: ExamBucket[] = [
  {
    id: 'closed',
    label: '闭卷考试',
    description: '需要集中复习与笔试准备',
    tone: 'rose',
  },
  {
    id: 'open',
    label: '开卷考试',
    description: '重在资料整理与理解应用',
    tone: 'blue',
  },
  {
    id: 'report',
    label: '报告 / 论文',
    description: '需要持续阅读、写作或汇报',
    tone: 'amber',
  },
  {
    id: 'practical',
    label: '实践 / 技能',
    description: '以操作、设计或技能考核为主',
    tone: 'emerald',
  },
  {
    id: 'other',
    label: '其他考核',
    description: '以课程文件中的具体说明为准',
    tone: 'slate',
  },
];
const NOTICE_SECTIONS: NoticeSection[] = [
  {
    title: '关键时间节点',
    items: [
      {
        label: '网络选课开始',
        detail: '2026 年 9 月 4 日 12:30',
      },
      {
        label: '选课提交与审核截止',
        detail:
          '2026 年 9 月 18 日 12:30；提交后还需完成导师、培养单位和院系审核。',
      },
      {
        label: '增选课程',
        detail:
          '课程开课两周内提出申请，并关注各审核角色在提交后 10 天内完成审核。',
      },
      {
        label: '退选课程',
        detail: '课程学时完成一半前提出申请；超过时限原则上不再受理。',
      },
      {
        label: '学位课属性变更',
        detail: '课程考核前 10 天提出申请，考核后不能变更。',
      },
    ],
  },
  {
    title: '学分与课程认定',
    items: [
      {
        label: '学期选课量',
        detail:
          '秋季、春季学期原则上均不少于 10 学分；HIAS 讲堂和科学前沿讲座学分不计入该门槛，夏季学期按需选课。',
      },
      {
        label: '核心课与专业课',
        detail:
          '硕士和直博生至少选择 2 门核心课（编号第14位为 1 或 2）和 2 门专业课（编号第14位为 3）作为学位课，具体以个人培养方案为准。',
      },
      {
        label: '非学位课程',
        detail:
          '课程编号第14位为 4、5、6、7 的研讨、实验、实践、科学前沿讲座，以及人文系列讲座（HIAS讲堂），只能作为非学位课修读。编号第14位为 B/X 的公共课程也不计入专业学位课。',
      },
      {
        label: '专业硕士公选课',
        detail:
          '专业型硕士公共选修课至少 3 学分，其中创新创业模块课程 1 学分；程序中的培养方案卡片会分项显示。',
      },
      {
        label: '体育类公选课',
        detail: '每学期限选 1 门；课程编号第 14 位为 X 的课程属于公共选修课。',
      },
    ],
  },
  {
    title: '选课与成绩提醒',
    items: [
      {
        label: '确认前检查',
        detail:
          '在导师和培养单位指导下确定学位/非学位属性，提交后及时提醒导师完成审核；未完成提交或审核的选课可能无法进入名单。',
      },
      {
        label: '课程评估',
        detail:
          '课程进行到约 2/3 时开始课程评估，授课教师学时完成一半后进行教师评估；未按时评估可能影响成绩查询。',
      },
      {
        label: '考试信息',
        detail:
          '考试日期和具体安排以选课系统及学校通知为准；本页的考试压力视图只按课程文件中的考核方式分类。',
      },
      {
        label: '问题咨询',
        detail:
          '其它选课问题可咨询杭高院教务处：0571-86088963；选课系统登录问题可咨询网络中心：010-88256622。',
      },
    ],
  },
];
const COURSE_COLORS = [
  ['#dff2ee', '#147d6f'],
  ['#e9e5fb', '#6251a4'],
  ['#ffe8dd', '#a85834'],
  ['#dceafb', '#326da8'],
  ['#f8edca', '#91701e'],
  ['#f3dfe9', '#9c4b72'],
];

function countsTowardSemesterMinimum(course: Course) {
  return !/科学前沿讲座|HIAS讲堂|人文系列讲座/.test(
    `${course.category} ${course.name}`,
  );
}

function designationLabel(value: CourseDesignation) {
  if (value === 'degree') return '学位课';
  if (value === 'non-degree') return '非学位课';
  return '未确定';
}

function intersects<T>(left: T[], right: T[]) {
  const lookup = new Set(left);
  return right.some((item) => lookup.has(item));
}

function schedulesConflict(left: Schedule, right: Schedule) {
  return (
    left.dayIndex === right.dayIndex &&
    left.start <= right.end &&
    right.start <= left.end &&
    intersects(left.weeks, right.weeks)
  );
}

function coursesConflict(left: Course, right: Course) {
  return left.schedules.some((a) =>
    right.schedules.some((b) => schedulesConflict(a, b)),
  );
}

function getExamBucket(examMode: string): ExamBucketId {
  if (/闭卷/.test(examMode)) return 'closed';
  if (/开卷/.test(examMode)) return 'open';
  if (/报告|论文|综述|汇报|大作业/.test(examMode)) return 'report';
  if (/实践|技能|实验|设计|作品|答辩/.test(examMode)) return 'practical';
  return 'other';
}

function courseConflictsInWeek(left: Course, right: Course, week: number) {
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

function getConflictSlots(left: Course, right: Course) {
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

function formatWeekRanges(weeks: number[]) {
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

function formatConflictSlot(slot: ConflictSlot) {
  const periods =
    slot.start === slot.end
      ? `第${slot.start}节`
      : `第${slot.start}-${slot.end}节`;
  return `${slot.day} ${periods} · ${formatWeekRanges(slot.weeks)}`;
}

function formatCredits(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatRequirementProgress(
  actual: number,
  target: number | null | undefined,
) {
  return target === null || target === undefined
    ? `${formatCredits(actual)} 学分 / 待核验`
    : `${formatCredits(actual)} / ${formatCredits(target)} 学分`;
}

function formatEnrollment(course: Course) {
  if (course.scheduleStatus === 'planned') {
    return '名额信息待春季正式课表公布';
  }
  const capacity = course.capacity > 0 ? course.capacity : null;
  const enrolled = course.enrolled > 0 ? course.enrolled : null;
  if (capacity && enrolled !== null) {
    return `余量 ${Math.max(0, capacity - enrolled)} / ${capacity}（非实时）`;
  }
  if (capacity) return `限选人数 ${capacity} · 已选人数暂无`;
  if (enrolled !== null) return `已选人数 ${enrolled} · 限选人数未提供`;
  return '名额信息未提供';
}

/**
 * 课程编码展示：占位码（SP2027-xxx）与缺失编码都不会伪装成学校正式编码，
 * 统一显示为“内部占位编码 / 待春季正式课表公布”。
 */
function courseCodeDisplayText(
  course: Pick<Course, 'code' | 'officialCode'>,
) {
  const shown = displayCourseCode(course);
  if (shown.text) return shown.text;
  if (shown.kind === 'placeholder') return '内部占位编码（待正式课程编码）';
  return '待春季正式课表公布';
}

function courseColor(courseId: string) {
  let hash = 0;
  for (const character of courseId) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length];
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function templateWeekText(schedule: Schedule) {
  return schedule.weeksText
    .trim()
    .replace(/^第/, '')
    .replace(/周$/, '')
    .replaceAll(',', '、');
}

function isCourse(value: unknown): value is Course {
  if (!value || typeof value !== 'object') return false;
  const course = value as Partial<Course>;
  return (
    typeof course.id === 'string' &&
    typeof course.code === 'string' &&
    typeof course.name === 'string' &&
    typeof course.credits === 'number' &&
    Number.isFinite(course.credits) &&
    course.credits >= 0 &&
    typeof course.englishName === 'string' &&
    typeof course.college === 'string' &&
    typeof course.category === 'string' &&
    typeof course.level === 'string' &&
    typeof course.subject === 'string' &&
    typeof course.hours === 'string' &&
    typeof course.capacity === 'number' &&
    Number.isFinite(course.capacity) &&
    course.capacity >= 0 &&
    typeof course.enrolled === 'number' &&
    Number.isFinite(course.enrolled) &&
    course.enrolled >= 0 &&
    typeof course.teachingMode === 'string' &&
    typeof course.examMode === 'string' &&
    typeof course.teacher === 'string' &&
    Array.isArray(course.schedules) &&
    course.schedules.every((schedule) => {
      if (!schedule || typeof schedule !== 'object') return false;
      const item = schedule as Partial<Schedule>;
      return (
        typeof item.day === 'string' &&
        typeof item.dayIndex === 'number' &&
        Number.isInteger(item.dayIndex) &&
        item.dayIndex >= -1 &&
        item.dayIndex <= 6 &&
        typeof item.start === 'number' &&
        Number.isFinite(item.start) &&
        typeof item.end === 'number' &&
        Number.isFinite(item.end) &&
        item.start >= 0 &&
        item.end >= 0 &&
        item.start <= item.end &&
        Array.isArray(item.weeks) &&
        item.weeks.every(
          (weekValue) =>
            Number.isInteger(weekValue) && weekValue >= 1 && weekValue <= 20,
        ) &&
        typeof item.weeksText === 'string' &&
        typeof item.periodText === 'string' &&
        typeof item.room === 'string'
      );
    })
  );
}

function validateCourseRows(rawCourses: unknown[]) {
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const errors: string[] = [];

  rawCourses.forEach((value, index) => {
    const row = index + 1;
    if (!isCourse(value)) {
      errors.push(`第 ${row} 门课程的字段不完整或格式不正确`);
      return;
    }
    if (
      [
        value.id,
        value.code,
        value.name,
        value.college,
        value.category,
        value.level,
        value.subject,
        value.teacher,
        value.teachingMode,
        value.examMode,
      ].some((field) => !field.trim())
    ) {
      errors.push(`第 ${row} 门课程包含空的关键字段`);
    }
    if (value.capacity > 0 && value.enrolled > value.capacity) {
      errors.push(
        `第 ${row} 门课程的已选人数超过限选人数：${value.enrolled}/${value.capacity}`,
      );
    }
    if (seenIds.has(value.id))
      errors.push(`第 ${row} 门课程的 id 重复：${value.id}`);
    if (seenCodes.has(value.code)) {
      errors.push(`第 ${row} 门课程的课程编码重复：${value.code}`);
    }
    seenIds.add(value.id);
    seenCodes.add(value.code);
    value.schedules.forEach((schedule, scheduleIndex) => {
      if (schedule.dayIndex >= 0 && (schedule.start < 1 || schedule.end > 13)) {
        errors.push(
          `第 ${row} 门课程的第 ${scheduleIndex + 1} 条上课安排节次超出 1—13 节`,
        );
      }
    });
  });

  if (errors.length) {
    const preview = errors.slice(0, 6).join('；');
    throw new Error(
      `课程数据校验失败：${preview}${errors.length > 6 ? `（另有 ${errors.length - 6} 项问题）` : ''}`,
    );
  }
}

function isProgramPlan(value: unknown): value is ProgramPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<ProgramPlan>;
  const isNonNegativeNumber = (candidate: unknown) =>
    typeof candidate === 'number' &&
    Number.isFinite(candidate) &&
    candidate >= 0;
  const textFields = [
    plan.id,
    plan.label,
    plan.degree,
    plan.program,
    plan.code,
  ];
  const creditFields = [
    plan.totalCredits,
    plan.publicRequiredCredits,
    plan.publicRequiredDegreeCredits,
    plan.publicRequiredNonDegreeCredits,
    plan.degreeCourseCredits,
    plan.professionalNonDegreeCredits,
    plan.publicElectiveCredits,
    plan.innovationCredits,
    plan.coreMinimum,
    plan.professionalMinimum,
  ];
  return (
    textFields.every((value) => typeof value === 'string' && value.trim()) &&
    creditFields.every(
      (value) =>
        value === undefined || value === null || isNonNegativeNumber(value),
    ) &&
    (plan.publicRequiredCredits === null ||
      isNonNegativeNumber(plan.publicRequiredCredits)) &&
    (plan.publicRequiredDegreeCredits === undefined ||
      plan.publicRequiredDegreeCredits === null ||
      isNonNegativeNumber(plan.publicRequiredDegreeCredits)) &&
    (plan.publicRequiredNonDegreeCredits === undefined ||
      plan.publicRequiredNonDegreeCredits === null ||
      isNonNegativeNumber(plan.publicRequiredNonDegreeCredits)) &&
    (plan.professionalNonDegreeCredits === null ||
      isNonNegativeNumber(plan.professionalNonDegreeCredits)) &&
    (plan.innovationCredits === null ||
      isNonNegativeNumber(plan.innovationCredits)) &&
    Array.isArray(plan.coreCourses) &&
    plan.coreCourses.length > 0 &&
    plan.coreCourses.every(
      (course) => typeof course === 'string' && course.trim(),
    ) &&
    Array.isArray(plan.professionalCourses) &&
    plan.professionalCourses.length > 0 &&
    plan.professionalCourses.every(
      (course) => typeof course === 'string' && course.trim(),
    ) &&
    (plan.source === undefined || typeof plan.source === 'string') &&
    (plan.updatedAt === undefined || typeof plan.updatedAt === 'string') &&
    (plan.note === undefined || typeof plan.note === 'string') &&
    (plan.requiredPublicRequiredNonDegreeCourses === undefined ||
      (Array.isArray(plan.requiredPublicRequiredNonDegreeCourses) &&
        plan.requiredPublicRequiredNonDegreeCourses.every(
          (course) => typeof course === 'string' && course.trim(),
        )))
  );
}

function parseProgramPlans(text: string): ProgramPlan[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('培养方案文件不是有效的 JSON。');
  }
  const record =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  const rawPlans = Array.isArray(parsed) ? parsed : record?.plans;
  if (!Array.isArray(rawPlans) || !rawPlans.length) {
    throw new Error(
      '没有找到培养方案数组。请上传方案数组或包含 plans 字段的 JSON。',
    );
  }
  if (!rawPlans.every(isProgramPlan)) {
    throw new Error(
      '培养方案字段不完整，至少需要 id、label、degree、program、code、学分要求和课程名称列表。',
    );
  }
  const ids = rawPlans.map((plan) => plan.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('培养方案 id 不能重复，请检查导入文件。');
  }
  return rawPlans;
}

function termIdFromLabel(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'imported-' + Date.now();
}

function parseCourseDataset(text: string, fileName: string): CourseDataset {
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
  validateCourseRows(rawCourses);

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
    audience:
      typeof record?.audience === 'string' && record.audience.trim()
        ? record.audience.trim()
        : undefined,
  };
}

function ScheduleLines({ schedules }: { schedules: Schedule[] }) {
  if (!schedules.length) {
    return (
      <p className="text-xs leading-5 text-slate-500">
        上课时间与地点待定，请以选课系统公布的最新安排为准。
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {schedules.map((schedule, index) => {
        const dayLabel = schedule.day || '';
        // periodText 形如“周四(3-4)”，把开头的周几拆出来单独强调
        const periodSuffix = schedule.periodText.startsWith(dayLabel)
          ? schedule.periodText.slice(dayLabel.length)
          : schedule.periodText;
        return (
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
            key={`${schedule.periodText}-${index}`}
          >
            <span className="font-semibold text-slate-900">{dayLabel}</span>
            {periodSuffix && (
              <span className="text-slate-600">{periodSuffix}</span>
            )}
            <span className="text-slate-500">{schedule.weeksText}</span>
            <span className="inline-flex items-center gap-1 text-slate-500">
              <MapPin className="size-3.5" /> {schedule.room}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function CourseExplorer({
  initialCourses: defaultCourses,
}: {
  initialCourses: Course[];
}) {
  const [customDatasets, setCustomDatasets] = useState<CourseDataset[]>([]);
  const [activeTermId, setActiveTermId] = useState(DEFAULT_TERM_ID);
  const [selectedByTerm, setSelectedByTerm] = useState<
    Record<string, string[]>
  >({});
  const [designationsByTerm, setDesignationsByTerm] = useState<
    Record<string, Record<string, CourseDesignation>>
  >({});
  const [query, setQuery] = useState('');
  const [college, setCollege] = useState('全部院系');
  const [subject, setSubject] = useState('全部学科/专业');
  const [category, setCategory] = useState('全部类别');
  const [day, setDay] = useState('全部星期');
  const [storageReady, setStorageReady] = useState(false);
  const [dataMessage, setDataMessage] = useState('');
  const [dataError, setDataError] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [onlyNoConflict, setOnlyNoConflict] = useState(false);
  const [view, setViewState] = useState<
    'courses' | 'guide' | 'notice' | 'exams' | 'data'
  >('courses');
  const [timetableOpen, setTimetableOpen] = useState(false);
  const [customProgramPlans, setCustomProgramPlans] = useState<ProgramPlan[]>(
    [],
  );
  const [programPlanId, setProgramPlanId] = useState('optical-master');
  const [programPlanMessage, setProgramPlanMessage] = useState('');
  const [programPlanError, setProgramPlanError] = useState('');
  const [week, setWeek] = useState(2);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [detailCourse, setDetailCourse] = useState<Course | null>(null);
  const [historicalRecords, setHistoricalRecords] = useState<
    HistoricalRecord[]
  >([]);
  const [englishExemptionStatus, setEnglishExemptionStatus] =
    useState<ExemptionStatus>('normal');
  const [selectionMessage, setSelectionMessage] = useState('');
  // 选课操作提示（加入/移除/替换/清空等）3 秒后自动消失
  useEffect(() => {
    if (!selectionMessage) return;
    const timer = window.setTimeout(() => setSelectionMessage(''), 3000);
    return () => window.clearTimeout(timer);
  }, [selectionMessage]);
  // 移动端：切换视图后把当前激活的顶部 Tab 横向滚入可视区
  useEffect(() => {
    const active = document.querySelector<HTMLElement>(
      '.workspace-tab[data-active]',
    );
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [view]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isInitialSetup, setIsInitialSetup] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [sportsLimitOpen, setSportsLimitOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /**
   * 博士培养类型（普博 general_phd / 直博 direct_phd / 硕博连读 combined_phd）。
   * 仅当培养方案为博士时有意义；普博的学院级规则未明确 → 页面按待确认展示。
   */
  const [doctorTrack, setDoctorTrack] = useState<
    'general_phd' | 'direct_phd' | 'combined_phd' | undefined
  >(undefined);
  /** 智能补全方案中等待用户确认应用的方案。 */
  const [applyPlan, setApplyPlan] = useState<GeneratedPlan | null>(null);
  const [undoSelection, setUndoSelection] = useState<{
    termId: string;
    ids: string[];
    designations: Record<string, CourseDesignation>;
  } | null>(null);
  const [recommendationDialogOpen, setRecommendationDialogOpen] =
    useState(false);
  const [dataManagementMessage, setDataManagementMessage] = useState('');
  const [dataManagementError, setDataManagementError] = useState('');
  const [restorePreview, setRestorePreview] = useState<{
    payload: BackupPayload;
    summary: string[];
  } | null>(null);
  const [historyDraft, setHistoryDraft] = useState({
    term: '',
    courseName: '',
    courseCode: '',
    credits: '',
    category: '公共必修课',
    designation: 'unknown' as HistoricalRecord['designation'],
    module: 'unknown' as HistoricalModule,
  });
  const [hiasDraft, setHiasDraft] = useState({
    term: '',
    attendanceCount: '',
  });
  const dataFileRef = useRef<HTMLInputElement>(null);
  const programPlanFileRef = useRef<HTMLInputElement>(null);
  const backupFileRef = useRef<HTMLInputElement>(null);
  const activeDataset =
    customDatasets.find((dataset) => dataset.id === activeTermId) ??
    createTermTemplateDataset(activeTermId, defaultCourses) ??
    createTermTemplateDataset(DEFAULT_TERM_ID, defaultCourses)!;
  const isDefaultTerm = activeDataset.id === DEFAULT_TERM_ID;
  const activeTermDisplayLabel =
    activeDataset.shortLabel || activeDataset.label;
  const audienceLabel =
    activeDataset.audience ||
    (isDefaultTerm ? '2026 级研一新生专用' : '适用对象以课程数据说明为准');
  const isSpringTerm = activeTermId === '2027-spring';
  const planCourseDataNote =
    activeTermId === '2027-spring'
      ? ' 当前春季专业/公共课程为依据 2026—2027 培养方案整理的“春季计划课程”；课程时间、班次、容量与最终开设情况以春季正式课表及教务系统为准。'
      : '';
  const heroDescription = isDefaultTerm
    ? '课程数据依据已整理的 2026 年秋季课表与培养方案材料，仅供参考，用于帮助大家模拟选课、查看冲突与规划学分；最终课程安排请以学校正式通知和选课系统为准。'
    : activeDataset.courses.length
      ? `当前使用“${activeDataset.label}”课程数据，仅供参考，用于模拟选课、查看冲突与规划学分；适用年级、培养要求和最终课程安排请以对应学校通知及选课系统为准。${planCourseDataNote}`
      : `当前为“${activeDataset.label}”学期模板，尚未载入课程数据；可在“数据管理”中导入本学期课表。培养要求、选课规则和最终课程安排请以对应学校通知及选课系统为准。`;
  const initialCourses = useMemo(
    () =>
      activeDataset.courses.map((course) => ({
        ...course,
        module: getCourseModule(course),
      })),
    [activeDataset.courses],
  );
  const availableDatasets = useMemo(() => {
    const datasetMap = new Map<string, CourseDataset>();
    TERM_TEMPLATES.forEach((term) => {
      const dataset = createTermTemplateDataset(term.id, defaultCourses);
      if (dataset) datasetMap.set(term.id, dataset);
    });
    customDatasets.forEach((dataset) => datasetMap.set(dataset.id, dataset));
    return [...datasetMap.values()];
  }, [customDatasets, defaultCourses]);
  const selectedIds = selectedByTerm[activeTermId] ?? EMPTY_SELECTED_IDS;
  const activeDesignations =
    designationsByTerm[activeTermId] ?? EMPTY_DESIGNATIONS;
  const selectedIdsRef = useRef(selectedIds);
  const availableProgramPlans = useMemo(() => {
    const planMap = new Map<string, ProgramPlan>();
    [...PROGRAM_PLANS, ...customProgramPlans].forEach((plan) =>
      planMap.set(plan.id, plan),
    );
    return [...planMap.values()];
  }, [customProgramPlans]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    const storedDatasets = window.localStorage.getItem(
      COURSE_DATASETS_STORAGE_KEY,
    );
    const storedActiveTerm = window.localStorage.getItem(
      ACTIVE_TERM_STORAGE_KEY,
    );
    const storedSelections = window.localStorage.getItem(
      SELECTED_BY_TERM_STORAGE_KEY,
    );
    const storedDesignations = window.localStorage.getItem(
      DESIGNATIONS_BY_TERM_STORAGE_KEY,
    );
    const legacySelected = window.localStorage.getItem(
      LEGACY_SELECTED_STORAGE_KEY,
    );
    const storedProgramPlans = window.localStorage.getItem(
      PROGRAM_PLANS_STORAGE_KEY,
    );
    const storedHistoricalRecords = window.localStorage.getItem(
      HISTORICAL_RECORDS_STORAGE_KEY,
    );
    const storedEnglishExemption = window.localStorage.getItem(
      ENGLISH_EXEMPTION_STORAGE_KEY,
    );

    let parsedDatasets: CourseDataset[] = [];
    if (storedDatasets) {
      try {
        const parsed = JSON.parse(storedDatasets);
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (dataset) =>
              dataset &&
              typeof dataset.id === 'string' &&
              typeof dataset.label === 'string' &&
              Array.isArray(dataset.courses) &&
              dataset.courses.every(isCourse) &&
              (dataset.audience === undefined ||
                typeof dataset.audience === 'string'),
          )
        ) {
          parsedDatasets = parsed;
        }
      } catch {
        window.localStorage.removeItem(COURSE_DATASETS_STORAGE_KEY);
      }
    }

    let parsedSelections: Record<string, string[]> = {};
    if (storedSelections) {
      try {
        const parsed = JSON.parse(storedSelections);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsedSelections = Object.fromEntries(
            Object.entries(parsed).filter(
              ([, ids]) =>
                Array.isArray(ids) && ids.every((id) => typeof id === 'string'),
            ),
          ) as Record<string, string[]>;
        }
      } catch {
        window.localStorage.removeItem(SELECTED_BY_TERM_STORAGE_KEY);
      }
    }

    let parsedDesignations: Record<
      string,
      Record<string, CourseDesignation>
    > = {};
    if (storedDesignations) {
      try {
        const parsed = JSON.parse(storedDesignations);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsedDesignations = Object.fromEntries(
            Object.entries(parsed)
              .filter(
                ([, values]) =>
                  values &&
                  typeof values === 'object' &&
                  !Array.isArray(values),
              )
              .map(([termId, values]) => [
                termId,
                Object.fromEntries(
                  Object.entries(values as Record<string, unknown>).filter(
                    ([, value]) =>
                      value === 'degree' ||
                      value === 'non-degree' ||
                      value === 'unset',
                  ),
                ),
              ]),
          ) as Record<string, Record<string, CourseDesignation>>;
        }
      } catch {
        window.localStorage.removeItem(DESIGNATIONS_BY_TERM_STORAGE_KEY);
      }
    }

    let parsedProgramPlans: ProgramPlan[] = [];
    if (storedProgramPlans) {
      try {
        const parsed = JSON.parse(storedProgramPlans);
        if (
          Array.isArray(parsed) &&
          parsed.every(isProgramPlan) &&
          new Set(parsed.map((plan) => plan.id)).size === parsed.length
        ) {
          parsedProgramPlans = parsed;
        }
      } catch {
        window.localStorage.removeItem(PROGRAM_PLANS_STORAGE_KEY);
      }
    }

    let parsedHistoricalRecords: HistoricalRecord[] = [];
    if (storedHistoricalRecords) {
      try {
        const parsed = JSON.parse(storedHistoricalRecords);
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (record) =>
              record &&
              typeof record.id === 'string' &&
              typeof record.term === 'string' &&
              typeof record.courseName === 'string' &&
              typeof record.courseCode === 'string' &&
              typeof record.credits === 'number' &&
              Number.isFinite(record.credits) &&
              record.credits >= 0 &&
              typeof record.category === 'string' &&
              ['degree', 'non-degree', 'unknown'].includes(
                record.designation,
              ) &&
              ['regular', 'innovation', 'hias', 'unknown'].includes(
                record.module,
              ) &&
              (record.hours === undefined ||
                (typeof record.hours === 'number' &&
                  Number.isFinite(record.hours) &&
                  record.hours >= 0)) &&
              (record.attendanceCount === undefined ||
                (typeof record.attendanceCount === 'number' &&
                  Number.isFinite(record.attendanceCount) &&
                  record.attendanceCount >= 0)) &&
              (record.courseCount === null ||
                typeof record.courseCount === 'number'),
          )
        ) {
          parsedHistoricalRecords = parsed;
        }
      } catch {
        window.localStorage.removeItem(HISTORICAL_RECORDS_STORAGE_KEY);
      }
    }
    const parsedExemption: ExemptionStatus =
      storedEnglishExemption === 'planned' ||
      storedEnglishExemption === 'approved'
        ? storedEnglishExemption
        : 'normal';
    if (!Object.keys(parsedSelections).length && legacySelected) {
      try {
        const legacyIds = JSON.parse(legacySelected);
        if (
          Array.isArray(legacyIds) &&
          legacyIds.every((id) => typeof id === 'string')
        ) {
          parsedSelections[DEFAULT_TERM_ID] = legacyIds;
        }
      } catch {
        window.localStorage.removeItem(LEGACY_SELECTED_STORAGE_KEY);
      }
    }

    const nextActiveTerm =
      storedActiveTerm &&
      (TERM_TEMPLATE_IDS.has(storedActiveTerm) ||
        parsedDatasets.some((dataset) => dataset.id === storedActiveTerm))
        ? storedActiveTerm
        : DEFAULT_TERM_ID;
    const storedProgram = window.localStorage.getItem(
      ACTIVE_PROGRAM_STORAGE_KEY,
    );
    if (
      [...PROGRAM_PLANS, ...parsedProgramPlans].some(
        (plan) => plan.id === storedProgram,
      )
    ) {
      setProgramPlanId(storedProgram!);
    }
    const storedDoctorTrack = window.localStorage.getItem(
      DOCTOR_TRACK_STORAGE_KEY,
    );
    if (
      storedDoctorTrack === 'general_phd' ||
      storedDoctorTrack === 'direct_phd' ||
      storedDoctorTrack === 'combined_phd'
    ) {
      setDoctorTrack(storedDoctorTrack);
    }
    setCustomDatasets(parsedDatasets);
    setCustomProgramPlans(parsedProgramPlans);
    setActiveTermId(nextActiveTerm ?? DEFAULT_TERM_ID);
    setSelectedByTerm(parsedSelections);
    setDesignationsByTerm(parsedDesignations);
    setHistoricalRecords(parsedHistoricalRecords);
    setEnglishExemptionStatus(parsedExemption);
    setStorageReady(true);
    const needsInitialSetup =
      window.localStorage.getItem(INITIAL_SETTINGS_STORAGE_KEY) !== '1';
    setIsInitialSetup(needsInitialSetup);
    setSettingsOpen(needsInitialSetup);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      COURSE_DATASETS_STORAGE_KEY,
      JSON.stringify(customDatasets),
    );
    window.localStorage.setItem(ACTIVE_TERM_STORAGE_KEY, activeTermId);
  }, [activeTermId, customDatasets, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      SELECTED_BY_TERM_STORAGE_KEY,
      JSON.stringify(selectedByTerm),
    );
  }, [selectedByTerm, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      DESIGNATIONS_BY_TERM_STORAGE_KEY,
      JSON.stringify(designationsByTerm),
    );
  }, [designationsByTerm, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      PROGRAM_PLANS_STORAGE_KEY,
      JSON.stringify(customProgramPlans),
    );
  }, [customProgramPlans, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      HISTORICAL_RECORDS_STORAGE_KEY,
      JSON.stringify(historicalRecords),
    );
    window.localStorage.setItem(
      ENGLISH_EXEMPTION_STORAGE_KEY,
      englishExemptionStatus,
    );
  }, [englishExemptionStatus, historicalRecords, storageReady]);

  const setSelectedIdsForActive = useCallback(
    (next: string[] | ((current: string[]) => string[])) => {
      setSelectedByTerm((current) => {
        const currentIds = current[activeTermId] ?? [];
        const nextIds = typeof next === 'function' ? next(currentIds) : next;
        selectedIdsRef.current = nextIds;
        return { ...current, [activeTermId]: nextIds };
      });
    },
    [activeTermId],
  );

  function courseDesignation(course: Course): CourseDesignation {
    return getCourseDesignation(course, activeDesignations, activePlan);
  }

  function courseRequirementType(course: Course): CourseRequirementType {
    return getCourseRequirementType(
      course,
      courseDesignation(course),
      activePlan,
    );
  }

  function setCourseDesignation(
    course: Course,
    designation: CourseDesignation,
  ) {
    setUndoSelection(null);
    const nextDesignation =
      getCourseRoleEligibility(course, activePlan).status === 'ineligible'
        ? 'non-degree'
        : designation;
    setDesignationsByTerm((current) => {
      const termMap = { ...current[activeTermId] };
      // 学位属性按“课程”整体标记：写入 family key，并清理该课程各班次的旧编码键
      const familyKey = designationLookupKey(course);
      const family = courseFamilyKey(course);
      const legacyCodes = new Set(
        initialCourses
          .filter((item) => courseFamilyKey(item) === family)
          .map((item) => item.code),
      );
      legacyCodes.add(course.code);
      legacyCodes.forEach((code) => delete termMap[code]);
      if (nextDesignation !== 'unset') {
        termMap[familyKey] = nextDesignation;
      } else {
        delete termMap[familyKey];
      }
      return { ...current, [activeTermId]: termMap };
    });
  }

  async function handleCourseDataImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setDataError('');
    setDataMessage('');
    try {
      const parsedDataset = parseCourseDataset(await file.text(), file.name);
      const isGenericFile = /^courses?$/i.test(
        file.name.replace(/\.[^/.]+$/, '').trim(),
      );
      const dataset = isGenericFile
        ? {
            ...parsedDataset,
            id: activeTermId,
            label: activeDataset.label,
            shortLabel: activeDataset.shortLabel,
          }
        : parsedDataset;
      const previousDataset = availableDatasets.find(
        (item) => item.id === dataset.id,
      );
      const previousSelectedIds = selectedByTerm[dataset.id] ?? [];
      const previousSelectedCodes = new Set(
        (previousDataset?.courses ?? [])
          .filter((course) => previousSelectedIds.includes(course.id))
          .map((course) => course.code),
      );
      const restoredIds = dataset.courses
        .filter((course) => previousSelectedCodes.has(course.code))
        .map((course) => course.id);
      // 2027 春季：内置“计划课程”(sp1…)与导入的正式课表课程按
      // officialCode → canonicalCourseId → 名称匹配升级，避免计划/正式重复显示。
      const isSpringTarget = dataset.id === '2027-spring';
      let matchedPlannedCount = 0;
      if (isSpringTarget) {
        const plannedById = new Map(
          springDefaultCourses.map((course) => [course.id, course]),
        );
        previousSelectedIds.forEach((oldId) => {
          const planned = plannedById.get(oldId);
          if (!planned) return;
          const official = dataset.courses.find((course) => {
            if (
              course.officialCode &&
              planned.officialCode &&
              course.officialCode === planned.officialCode
            ) {
              return true;
            }
            return canonicalCourseId(course) === canonicalCourseId(planned);
          });
          if (official && !restoredIds.includes(official.id)) {
            restoredIds.push(official.id);
            matchedPlannedCount += 1;
          }
        });
      }
      setUndoSelection(null);
      setSelectionMessage('');
      setCustomDatasets((current) => [
        ...current.filter((item) => item.id !== dataset.id),
        dataset,
      ]);
      setActiveTermId(dataset.id);
      setSelectedByTerm((current) => ({
        ...current,
        [dataset.id]: restoredIds,
      }));
      clearFilters();
      setDetailCourse(null);
      const unmatchedCount = previousSelectedIds.filter(
        (oldId) => !restoredIds.includes(oldId),
      ).length;
      setDataMessage(
        '已加载“' +
          dataset.label +
          '”的 ' +
          dataset.courses.length +
          ` 门课程；按课程身份保留了 ${restoredIds.length} 门已选课程。` +
          (isSpringTarget
            ? matchedPlannedCount > 0
              ? ` 其中 ${matchedPlannedCount} 门春季计划课程已与正式课表匹配升级，不再重复显示。`
              : ' 内置春季计划课程与导入数据按编码/课程名匹配升级，具体以导入课表为准。'
            : '') +
          (unmatchedCount > 0
            ? ` ${unmatchedCount} 门课程因编码/课程身份未匹配而未恢复。`
            : ''),
      );
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : '课程数据读取失败，请检查文件格式。',
      );
    }
  }

  async function handleProgramPlanImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setProgramPlanError('');
    setProgramPlanMessage('');
    try {
      const plans = parseProgramPlans(await file.text());
      setUndoSelection(null);
      const importedIds = new Set(plans.map((plan) => plan.id));
      setCustomProgramPlans((current) => [
        ...current.filter((plan) => !importedIds.has(plan.id)),
        ...plans.map((plan) => ({
          ...plan,
          updatedAt: plan.updatedAt || new Date().toISOString(),
        })),
      ]);
      if (!availableProgramPlans.some((plan) => plan.id === programPlanId)) {
        setProgramPlanId(plans[0].id);
      }
      setProgramPlanMessage(
        `已导入 ${plans.length} 个培养方向，已保存在当前浏览器。`,
      );
    } catch (error) {
      setProgramPlanError(
        error instanceof Error
          ? error.message
          : '培养方案读取失败，请检查文件格式。',
      );
    }
  }

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMcpContext })
      .modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    const courseByCode = new Map(
      initialCourses.map((course) => [course.code, course]),
    );

    const registrations = [
      context.registerTool(
        {
          name: 'replace_selected_courses',
          title: '替换已选课程',
          description:
            '按课程编码批量替换当前已选课程，并立即更新页面中的学分统计和模拟课表。',
          inputSchema: {
            type: 'object',
            properties: {
              courseCodes: {
                type: 'array',
                items: { type: 'string' },
                uniqueItems: true,
              },
            },
            required: ['courseCodes'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: false,
          },
          async execute(input) {
            const codes = (input as { courseCodes?: unknown })?.courseCodes;
            if (
              !Array.isArray(codes) ||
              !codes.every((code) => typeof code === 'string')
            ) {
              throw new Error('courseCodes 必须是课程编码字符串数组。');
            }
            const unknownCodes = codes.filter(
              (code) => !courseByCode.has(code),
            );
            if (unknownCodes.length) {
              throw new Error(`未找到课程编码：${unknownCodes.join('、')}`);
            }
            const ids = codes.map((code) => courseByCode.get(code)!.id);
            setUndoSelection(null);
            setSelectionMessage('');
            selectedIdsRef.current = ids;
            setSelectedIdsForActive(ids);
            await new Promise<void>((resolve) =>
              window.requestAnimationFrame(() => resolve()),
            );
            return { selectedCount: ids.length, courseCodes: codes };
          },
        },
        { signal: lifecycle.signal },
      ),
      context.registerTool(
        {
          name: 'read_selected_courses',
          title: '读取已选课程',
          description: '读取当前页面中已经加入模拟课表的课程编码。',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: false,
          },
          execute() {
            const courses = initialCourses.filter((course) =>
              selectedIdsRef.current.includes(course.id),
            );
            return {
              selectedCount: courses.length,
              courseCodes: courses.map((course) => course.code),
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ];

    Promise.all(registrations.map((item) => Promise.resolve(item))).catch(
      () => undefined,
    );
    return () => lifecycle.abort();
  }, [initialCourses, setSelectedIdsForActive]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    query,
    college,
    subject,
    category,
    day,
    onlySelected,
    onlyNoConflict,
    activeTermId,
  ]);

  useEffect(() => {
    if (storageReady)
      window.localStorage.setItem(ACTIVE_PROGRAM_STORAGE_KEY, programPlanId);
  }, [programPlanId, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    if (doctorTrack) {
      window.localStorage.setItem(DOCTOR_TRACK_STORAGE_KEY, doctorTrack);
    } else {
      window.localStorage.removeItem(DOCTOR_TRACK_STORAGE_KEY);
    }
  }, [doctorTrack, storageReady]);

  const colleges = useMemo(
    () => [...new Set(initialCourses.map((course) => course.college))].sort(),
    [initialCourses],
  );
  const categories = useMemo(
    () => [...new Set(initialCourses.map((course) => course.category))].sort(),
    [initialCourses],
  );
  const subjects = useMemo(
    () => [...new Set(initialCourses.map((course) => course.subject))].sort(),
    [initialCourses],
  );
  const selectedCourses = useMemo(
    () => initialCourses.filter((course) => selectedIds.includes(course.id)),
    [initialCourses, selectedIds],
  );
  const activePlan =
    availableProgramPlans.find((plan) => plan.id === programPlanId) ??
    availableProgramPlans[0] ??
    PROGRAM_PLANS[0];
  // 选定培养方案后，本专业核心课/专业课（学位课范围内）默认“学位课”：
  // 加入时立即自动标记；切换培养方案/学期时对当前已选补一次默认。仅当未手动设置过属性时生效。
  // oxlint-disable-next-line react/react-compiler -- 巨型组件本地抑制；规则引擎与规则数据保持确定性
  useEffect(() => {
    if (!storageReady) return;
    setDesignationsByTerm((current) => {
      const termMap = { ...current[activeTermId] };
      let changed = false;
      for (const course of initialCourses) {
        if (!selectedIds.includes(course.id)) continue;
        if (!(isCoreDegreeType(course) || isProfessionalDegreeType(course))) {
          continue;
        }
        if (
          getCourseRoleEligibility(course, activePlan).status !== 'eligible'
        ) {
          continue;
        }
        const key = designationLookupKey(course);
        const alreadySet =
          termMap[key] !== undefined || termMap[course.code] !== undefined;
        if (alreadySet) continue;
        termMap[key] = 'degree';
        changed = true;
      }
      return changed ? { ...current, [activeTermId]: termMap } : current;
    });
  }, [
    activeTermId,
    activePlan,
    initialCourses,
    programPlanId,
    selectedIds,
    storageReady,
  ]);
  // 英语免修免考 = 直接记为“已获得/已修得”学分，不进入任何学期的“预选课程学分”。
  // 做法：合成一条“硕士学位英语 3 学分（2026 秋季已获得）”的历史记录参与培养统计；
  // 已手动录入过英语历史成绩时不重复合成。
  const syntheticExemptionHistory = useMemo(() => {
    if (englishExemptionStatus !== 'approved') return null;
    const hasEnglishHistory = historicalRecords.some(
      (record) =>
        record.credits > 0 && /050200MB001/i.test(record.courseCode),
    );
    if (hasEnglishHistory) return null;
    const record: HistoricalRecord = {
      id: 'exemption-earned',
      term: '2026—2027学年(秋)第一学期',
      courseName: '硕士学位英语',
      courseCode: '280216050200MB001',
      credits: 3,
      category: '公共必修课',
      subject: '外国语言文学',
      designation: 'degree',
      module: 'regular',
      hours: 0,
      courseCount: 1,
      source: '英语免修免考·已获得学分（自动计入，不可删除）',
    };
    return record;
  }, [englishExemptionStatus, historicalRecords]);
  const exemptionHistory = useMemo(
    () =>
      syntheticExemptionHistory
        ? [...historicalRecords, syntheticExemptionHistory]
        : historicalRecords,
    [historicalRecords, syntheticExemptionHistory],
  );
  const exemptionEarnedCredits = syntheticExemptionHistory?.credits ?? 0;
  const englishQualificationDetail =
    englishExemptionStatus === 'approved'
      ? exemptionEarnedCredits > 0
        ? '已获得资格：硕士学位英语免修免考 3 学分按“2026 秋季学期已获得学分”计入历史已修，不计入任何学期的预选课程学分。'
        : '已获得资格；历史英语课程已计入，免修免考学分不重复累计。'
      : '未计入英语免修免考学分，公共必修学位课不增加免修免考的 3 学分。';
  const creditSummary = useMemo(
    () =>
      calculateCreditSummary({
        selectedCourses,
        designations: activeDesignations,
        historicalRecords: exemptionHistory,
        exemptionStatus: englishExemptionStatus,
        plan: activePlan,
      }),
    [
      activeDesignations,
      englishExemptionStatus,
      exemptionHistory,
      selectedCourses,
      activePlan,
    ],
  );
  const hiasHistorySummary = useMemo(() => {
    const records = historicalRecords.filter(
      (record) => record.module === 'hias',
    );
    const hours = records.reduce(
      (sum, record) => sum + (record.hours ?? record.credits * 20),
      0,
    );
    const attendanceCount = records.reduce(
      (sum, record) =>
        sum +
        (record.attendanceCount ?? (record.hours ?? record.credits * 20) / 2),
      0,
    );
    return {
      attendanceCount,
      hours,
      credits: records.reduce((sum, record) => sum + record.credits, 0),
    };
  }, [historicalRecords]);
  const hiasPreview = useMemo(() => {
    const attendanceCount = Number(hiasDraft.attendanceCount);
    if (!Number.isInteger(attendanceCount) || attendanceCount <= 0) {
      return null;
    }
    const hours = attendanceCount * 2;
    return { attendanceCount, hours, credits: hours / 20 };
  }, [hiasDraft.attendanceCount]);
  const countedSelectedCourses = useMemo(() => {
    const historicalCourseCodes = new Set(
      historicalRecords
        .map((record) => record.courseCode.trim())
        .filter(Boolean),
    );
    return selectedCourses.filter(
      (course) =>
        !(englishExemptionStatus === 'approved' && isEnglishCourse(course)) &&
        !historicalCourseCodes.has(course.code.trim()),
    );
  }, [englishExemptionStatus, historicalRecords, selectedCourses]);

  // ---- 跨学期培养进度：所有学期的选课都计入（前序 + 当前 + 已规划的后续学期）----
  // 培养方案进度看“所有学期的选课数”：本学季只是“当学期”视图（预选学分/10分门槛/冲突/课表
  // 仍只看当学期），但“分类学分/学位课门数/缺口/预计累计”聚合全部学期已选课程。
  // 历史记录与英语免修的口径与本学期一致；同课程跨学期只保留一份。
  const otherTermContext = useMemo(() => {
    const activeIndex = availableDatasets.findIndex(
      (dataset) => dataset.id === activeTermId,
    );
    const courses: Course[] = [];
    const records: HistoricalRecord[] = [];
    if (activeIndex < 0) return { courses, records };
    const historicalCourseCodes = new Set(
      historicalRecords
        .map((record) => record.courseCode.trim())
        .filter(Boolean),
    );
    const currentKeys = new Set(
      countedSelectedCourses.map((course) => canonicalCourseId(course)),
    );
    const seen = new Set<string>();
    for (let index = 0; index < availableDatasets.length; index += 1) {
      if (index === activeIndex) continue; // 当前学期由 countedSelectedCourses 统计
      const dataset = availableDatasets[index];
      const ids = selectedByTerm[dataset.id] ?? [];
      if (!ids.length) continue;
      const termDesignations = designationsByTerm[dataset.id] ?? {};
      for (const course of dataset.courses) {
        if (!ids.includes(course.id)) continue;
        if (
          englishExemptionStatus === 'approved' &&
          isEnglishCourse(course)
        ) {
          continue;
        }
        if (historicalCourseCodes.has(course.code.trim())) continue;
        const key = canonicalCourseId(course);
        // 与当前学期（或其它学期）同课程只保留一份，避免跨学期重复累计
        if (currentKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        courses.push(course);
        records.push({
          id: `carried-${course.id}`,
          term: dataset.label,
          courseName: course.name,
          courseCode: course.code,
          credits: course.credits,
          category: course.category,
          subject: course.subject,
          designation: getCourseDesignation(course, termDesignations, activePlan),
          module: getCourseModule({ code: course.code, name: course.name }),
          courseCount: 1,
          source: '自动带入·其它学期已选（以实际成绩为准）',
        });
      }
    }
    return { courses, records };
  }, [
    activePlan,
    availableDatasets,
    activeTermId,
    countedSelectedCourses,
    designationsByTerm,
    englishExemptionStatus,
    historicalRecords,
    selectedByTerm,
  ]);
  const carriedTermCourses = otherTermContext.courses;
  const carriedHistoryRecords = otherTermContext.records;
  const carriedCourseCredits = carriedTermCourses.reduce(
    (sum, course) => sum + course.credits,
    0,
  );

  // 培养进度统计集合 = 其它学期已选（前序/后续，全部跨学期）+ 本学期已选（历史记录由 credit-model 内部并入）
  const programCourses = useMemo(
    () => [...carriedTermCourses, ...countedSelectedCourses],
    [carriedTermCourses, countedSelectedCourses],
  );
  // 培养进度的学位属性 = 全部学期的属性合并（当前学期最后覆盖）
  const programDesignations = useMemo(() => {
    const activeIndex = availableDatasets.findIndex(
      (dataset) => dataset.id === activeTermId,
    );
    const merged: Record<string, CourseDesignation> = {};
    for (let index = 0; index < availableDatasets.length; index += 1) {
      if (index === activeIndex) continue;
      Object.assign(merged, designationsByTerm[availableDatasets[index].id] ?? {});
    }
    Object.assign(merged, activeDesignations);
    return merged;
  }, [
    activeDesignations,
    availableDatasets,
    activeTermId,
    designationsByTerm,
  ]);
  /** 培养进度版学分统计（前序+本学期+历史+免修已获得），用于“培养要求/学位课门数/缺口引擎”。 */
  const programCreditSummary = useMemo(
    () =>
      calculateCreditSummary({
        selectedCourses: programCourses,
        designations: programDesignations,
        historicalRecords: exemptionHistory,
        exemptionStatus: englishExemptionStatus,
        plan: activePlan,
      }),
    [
      activePlan,
      englishExemptionStatus,
      exemptionHistory,
      programCourses,
      programDesignations,
    ],
  );
  /** 培养进度版核心/专业学位课门数统计。 */
  const programPlanCourseCounts = useMemo(
    () =>
      getPlanCourseCounts({
        courses: programCourses,
        plan: activePlan,
        designations: programDesignations,
        historicalRecords: exemptionHistory,
      }),
    [activePlan, exemptionHistory, programCourses, programDesignations],
  );
  // 专业学位课学分口径拆分：确认部分（本专业 eligible）与跨专业待审核补充部分
  const professionalDegreeConfirmedCredits =
    programCreditSummary.professionalDegreeCredits -
    programCreditSummary.professionalDegreePendingApprovalCredits;
  const professionalDegreePendingApprovalCredits =
    programCreditSummary.professionalDegreePendingApprovalCredits;
  // 当学期“预选”方案学分合计：免修免考的 3 学分不进入任何学期的预选学分
  // （它已作为“已获得/历史已修”计入，见 exemptionHistory）。
  const selectedCredits = creditSummary.selectionCredits;
  const selectedCreditBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    countedSelectedCourses.forEach((course) => {
      totals.set(
        course.category,
        (totals.get(course.category) ?? 0) + course.credits,
      );
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]);
  }, [countedSelectedCourses]);
  const selectedRequirementBreakdown = useMemo(() => {
    const totals = new Map<CourseRequirementType, number>();
    countedSelectedCourses.forEach((course) => {
      const designation = getCourseDesignation(
        course,
        activeDesignations,
        activePlan,
      );
      const requirementType = getCourseRequirementType(
        course,
        designation,
        activePlan,
      );
      totals.set(
        requirementType,
        (totals.get(requirementType) ?? 0) + course.credits,
      );
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]);
  }, [countedSelectedCourses, activeDesignations, activePlan]);
  const planCoreCourses = useMemo(
    () =>
      initialCourses.filter((course) =>
        activePlan.coreCourses.includes(course.name),
      ),
    [activePlan, initialCourses],
  );
  const planProfessionalCourses = useMemo(
    () =>
      initialCourses.filter((course) =>
        activePlan.professionalCourses.includes(course.name),
      ),
    [activePlan, initialCourses],
  );
  const selectedPlanCoreCount = countedSelectedCourses.filter((course) =>
    activePlan.coreCourses.includes(course.name),
  ).length;
  const selectedPlanProfessionalCount = countedSelectedCourses.filter(
    (course) => activePlan.professionalCourses.includes(course.name),
  ).length;
  const examGroups = useMemo(
    () =>
      EXAM_BUCKETS.map((bucket) => ({
        ...bucket,
        courses: selectedCourses.filter(
          (course) => getExamBucket(course.examMode) === bucket.id,
        ),
      })),
    [selectedCourses],
  );
  const closedExamCount =
    examGroups.find((group) => group.id === 'closed')?.courses.length ?? 0;
  const examPressureMessage = !selectedCourses.length
    ? '选择课程后，这里会分析考核方式结构。'
    : closedExamCount >= 3
      ? `已选课程中有 ${closedExamCount} 门闭卷考试，建议预留集中复习时间。`
      : closedExamCount > 0
        ? `已选课程中有 ${closedExamCount} 门闭卷考试，其余考核可分散准备。`
        : '当前已选课程没有标注为闭卷考试，但仍需关注报告、实践和其他考核。';
  const programCourseGroups: Array<{
    title: string;
    courses: Course[];
    kind: 'core' | 'professional';
  }> = [
    { title: '本学期方案核心课', courses: planCoreCourses, kind: 'core' },
    {
      title: '本学期方案专业课',
      courses: planProfessionalCourses,
      kind: 'professional',
    },
  ];

  const conflictingIds = useMemo(() => {
    const result = new Set<string>();
    selectedCourses.forEach((course, index) => {
      selectedCourses.slice(index + 1).forEach((other) => {
        if (coursesConflict(course, other)) {
          result.add(course.id);
          result.add(other.id);
        }
      });
    });
    return result;
  }, [selectedCourses]);

  const conflictPairs = useMemo<ConflictPair[]>(() => {
    const pairs: ConflictPair[] = [];
    selectedCourses.forEach((course, index) => {
      selectedCourses.slice(index + 1).forEach((other) => {
        const slots = getConflictSlots(course, other);
        if (slots.length) pairs.push({ left: course, right: other, slots });
      });
    });
    return pairs;
  }, [selectedCourses]);

  const semesterMinimumTarget = /秋|春/.test(activeDataset.label) ? 10 : null;
  const semesterEligibleCredits = countedSelectedCourses
    .filter(countsTowardSemesterMinimum)
    .reduce((sum, course) => sum + course.credits, 0);
  const selectedSportsCourses = countedSelectedCourses.filter(
    (course) => course.subject === '体育学',
  );
  // 学位课门数（培养进度口径 = 所有学期已选，含前序、当前与后续 + 历史）
  const selectedDegreeCoreCount = programPlanCourseCounts.coreCount;
  const selectedDegreeProfessionalCount =
    programPlanCourseCounts.professionalCount;
  const unsetDesignationCount = countedSelectedCourses.filter(
    (course) =>
      getCourseDesignation(course, activeDesignations, activePlan) === 'unset',
  ).length;
  const publicElectiveTarget =
    activePlan.publicElectiveCredits + (activePlan.innovationCredits ?? 0);
  const publicRequiredDegreeTarget =
    activePlan.publicRequiredDegreeCredits ?? null;
  const publicRequiredNonDegreeTarget =
    activePlan.publicRequiredNonDegreeCredits ?? null;
  const conflictPeers = useMemo(() => {
    const peers = new Map<string, Course[]>();
    conflictPairs.forEach(({ left, right }) => {
      peers.set(left.id, [...(peers.get(left.id) ?? []), right]);
      peers.set(right.id, [...(peers.get(right.id) ?? []), left]);
    });
    return peers;
  }, [conflictPairs]);

  const currentWeekConflicts = useMemo(() => {
    const result = new Set<string>();
    selectedCourses.forEach((course, index) => {
      selectedCourses.slice(index + 1).forEach((other) => {
        if (courseConflictsInWeek(course, other, week)) {
          result.add(course.id);
          result.add(other.id);
        }
      });
    });
    return result;
  }, [selectedCourses, week]);

  const filteredCourses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return initialCourses.filter((course) => {
      const matchesQuery =
        !normalized ||
        [
          course.name,
          course.englishName,
          course.code,
          course.officialCode ?? '',
          course.teacher,
          course.college,
          course.subject,
          ...course.schedules.map((schedule) => schedule.room),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalized);
      const matchesCollege =
        college === '全部院系' || course.college === college;
      const matchesSubject =
        subject === '全部学科/专业' || course.subject === subject;
      const matchesCategory =
        category === '全部类别' || course.category === category;
      const matchesDay =
        day === '全部星期' ||
        course.schedules.some((schedule) => schedule.day === day);
      const matchesSelected = !onlySelected || selectedIds.includes(course.id);
      const matchesConflict =
        !onlyNoConflict ||
        selectedCourses.every(
          (selected) =>
            courseFamilyKey(selected) === courseFamilyKey(course) ||
            !coursesConflict(course, selected),
        );
      return (
        matchesQuery &&
        matchesCollege &&
        matchesSubject &&
        matchesCategory &&
        matchesDay &&
        matchesSelected &&
        matchesConflict
      );
    });
  }, [
    initialCourses,
    query,
    college,
    subject,
    category,
    day,
    onlySelected,
    onlyNoConflict,
    selectedIds,
    selectedCourses,
  ]);

  const springPlannedCourseNames = useMemo(
    () =>
      springDefaultCourses
        .filter(
          (course) =>
            course.semesterNote === 'spring' || course.semesterNote === 'both',
        )
        .map((course) => course.name),
    [],
  );
  const isDoctorPlan = /博士/.test(activePlan.degree);
  // 博士培养类型：直博/硕博连读与普博口径不同；旧用户无记录时默认直博口径并展示说明
  const effectiveTrack = isDoctorPlan
    ? doctorTrack ?? 'direct_phd'
    : undefined;
  const learnedCourseNames = useMemo(() => {
    const names = new Set<string>();
    // 所有学期已选课程都视为已规划/已修读（成绩以实际为准），参与培养进度与后续规划
    programCourses.forEach((course) =>
      names.add(courseBaseName(course.name)),
    );
    exemptionHistory.forEach((record) => {
      if (record.courseName) names.add(courseBaseName(record.courseName));
    });
    return [...names];
  }, [exemptionHistory, programCourses]);
  /** 同一门课程被选入多个班次的“多余班次数”。 */
  const extraSectionCount = useMemo(() => {
    const counts = new Map<string, number>();
    selectedCourses.forEach((course) => {
      const key = canonicalCourseId(course);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.values()].reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    );
  }, [selectedCourses]);
  /** 已确认（degree + eligible）学位课课程名（培养进度口径，特殊规则/体检/推荐同源）。 */
  const confirmedDegreeNames = useMemo(
    () =>
      collectConfirmedDegreeNames(
        programCourses,
        exemptionHistory,
        activePlan,
        programDesignations,
      ),
    [activePlan, exemptionHistory, programCourses, programDesignations],
  );
  const pendingDegreeNames = useMemo(() => {
    const approval: string[] = [];
    const verification: string[] = [];
    countedSelectedCourses.forEach((course) => {
      if (getCourseDesignation(course, activeDesignations, activePlan) !== 'degree') {
        return;
      }
      const status = getDegreeEligibility(course, activePlan).status;
      if (status === 'approval_required') approval.push(course.name);
      if (status === 'verification') verification.push(course.name);
    });
    return { approval, verification };
  }, [activeDesignations, activePlan, countedSelectedCourses]);
  /** 方案体检：红=本学期必须处理；黄/绿=培养进度；琥珀=待确认（与推荐共用缺口引擎）。 */
  const semesterCheckup = useMemo<SemesterCheckup>(
    () =>
      calculateSemesterCheckup({
        plan: activePlan,
        track: effectiveTrack,
        summary: {
          publicRequiredDegreeCredits:
            programCreditSummary.publicRequiredDegreeCredits,
          publicRequiredNonDegreeCredits:
            programCreditSummary.publicRequiredNonDegreeCredits,
          professionalDegreeCredits:
            programCreditSummary.professionalDegreeCredits,
          professionalDegreePendingApprovalCredits:
            programCreditSummary.professionalDegreePendingApprovalCredits,
          professionalElectiveCredits:
            programCreditSummary.professionalElectiveCredits,
          publicElectiveCredits: programCreditSummary.publicElectiveCredits,
          innovationCredits: programCreditSummary.innovationCredits,
        },
        courseCounts: {
          coreCount: selectedDegreeCoreCount,
          professionalCount: selectedDegreeProfessionalCount,
        },
        confirmedDegreeNames,
        effectiveCredits: semesterEligibleCredits,
        semesterTarget: semesterMinimumTarget,
        springPlannedCourseNames,
        termId: activeTermId,
        conflictsCount: conflictPairs.length,
        duplicateSectionCount: extraSectionCount,
        sportsCourseCount: selectedSportsCourses.length,
        approvalRequiredNames: pendingDegreeNames.approval,
        verificationNames: pendingDegreeNames.verification,
        fallLearnedNames: learnedCourseNames,
      }),
    [
      activePlan,
      activeTermId,
      confirmedDegreeNames,
      conflictPairs.length,
      programCreditSummary,
      effectiveTrack,
      extraSectionCount,
      learnedCourseNames,
      pendingDegreeNames.approval,
      pendingDegreeNames.verification,
      selectedDegreeCoreCount,
      selectedDegreeProfessionalCount,
      selectedSportsCourses.length,
      semesterEligibleCredits,
      semesterMinimumTarget,
      springPlannedCourseNames,
    ],
  );

  /**
   * 智能补全方案（旧“补充建议”入口保留，改为可生成 2~3 个完整方案）。
   * 惰性计算：仅在打开补全方案对话框时运行，避免每次渲染/每次英语免修等设置改动都
   * 同步执行完整推荐引擎造成卡顿。
   */
  const smartRecommendation = useMemo<RecommendationResult | null>(() => {
    if (!recommendationDialogOpen) return null;
    if (!selectedCourses.length) return null;
    // 培养进度口径包含其它学期已选与英语免修“已获得”：推荐缺口、学期课程去重与投影都要考虑
    const historyForProgram = [
      ...exemptionHistory,
      ...carriedHistoryRecords,
    ];
    const candidates = buildCandidates({
      termId: activeTermId,
      courses: initialCourses,
      selectedCourses,
      selectedIds,
      plan: activePlan,
      track: effectiveTrack,
      historicalRecords: historyForProgram,
      designations: activeDesignations,
      exemptionStatus: englishExemptionStatus,
      semesterTarget: semesterMinimumTarget,
      springPlannedCourseNames,
    });
    if (!candidates.length) {
      return { candidates, plans: [] };
    }
    return generateRecommendationPlans(
      {
        termId: activeTermId,
        courses: initialCourses,
        selectedCourses,
        selectedIds,
        plan: activePlan,
        track: effectiveTrack,
        historicalRecords: historyForProgram,
        designations: activeDesignations,
        exemptionStatus: englishExemptionStatus,
        semesterTarget: semesterMinimumTarget,
        springPlannedCourseNames,
      },
      candidates,
    );
  }, [
    activeDesignations,
    activePlan,
    activeTermId,
    carriedHistoryRecords,
    effectiveTrack,
    englishExemptionStatus,
    exemptionHistory,
    initialCourses,
    recommendationDialogOpen,
    selectedCourses,
    selectedIds,
    semesterMinimumTarget,
    springPlannedCourseNames,
  ]);
  const smartPlans = smartRecommendation?.plans ?? [];

  /** 智能补全方案：把某一推荐方案应用到当前课表（默认保留已选课程）。 */
  function applyGeneratedPlan(plan: GeneratedPlan) {
    rememberSelection();
    const additions = plan.additions;
    const newIds = [...selectedIds];
    additions.forEach((addition) => {
      if (!newIds.includes(addition.course.id)) newIds.push(addition.course.id);
    });
    // 学位属性：按加入课表的自动规则设置（eligible 核心/专业课 → degree，强制非学位 → non-degree）
    const designationsNext = { ...activeDesignations };
    additions.forEach((addition) => {
      const course = addition.course;
      const autoDesignation =
        getCourseDesignation(course, {}, activePlan) === 'non-degree'
          ? 'non-degree'
          : (isCoreDegreeType(course) || isProfessionalDegreeType(course)) &&
              getDegreeEligibility(course, activePlan).status === 'eligible'
            ? 'degree'
            : null;
      if (autoDesignation) {
        const key = designationLookupKey(course);
        if (designationsNext[key] === undefined) {
          designationsNext[key] = autoDesignation;
        }
      }
    });
    setDesignationsByTerm((current) => ({
      ...current,
      [activeTermId]: designationsNext,
    }));
    setSelectedIdsForActive(newIds);
    setApplyPlan(null);
    setRecommendationDialogOpen(false);
    setSelectionMessage(
      `已应用「${plan.name}」：新增 ${additions.length} 门课程。` +
        (plan.notes.length ? ` ${plan.notes.join(' ')}` : ''),
    );
  }

  function openRecommendationDialog() {
    setApplyPlan(null);
    setRecommendationDialogOpen(true);
  }

  function toggleCourse(id: string) {
    const course = initialCourses.find((item) => item.id === id);
    if (!course) return;
    const previousSelection = {
      termId: activeTermId,
      ids: [...selectedIds],
      designations: { ...activeDesignations },
    };
    const removing = selectedIds.includes(id);
    const sameCourse = selectedCourses.find(
      (selected) =>
        selected.id !== id &&
        courseFamilyKey(selected) === courseFamilyKey(course),
    );
    const peers = selectedCourses.filter(
      (selected) =>
        selected.id !== id &&
        selected.id !== sameCourse?.id &&
        coursesConflict(course, selected),
    );
    // 体育类课程每学期限选一门：再选其他体育课时弹窗提示并阻止加入
    if (
      !removing &&
      course.subject === '体育学' &&
      selectedSportsCourses.some(
        (selected) =>
          selected.id !== id &&
          courseFamilyKey(selected) !== courseFamilyKey(course),
      )
    ) {
      setSportsLimitOpen(true);
      return;
    }
    if (
      !removing &&
      // 仅对“强制只能非学位”的课程（研讨/实验/实践/讲座、公选、工程伦理、HIAS 等）
      // 自动落为非学位课；范围外专业课程保持“未归类”，留待用户决定。
      getCourseDesignation(course, {}, activePlan) === 'non-degree' &&
      activeDesignations[designationLookupKey(course)] === undefined &&
      activeDesignations[course.code] === undefined
    ) {
      setCourseDesignation(course, 'non-degree');
    }
    // 本专业核心课/专业课（学位课范围 eligible）加入时自动默认“学位课”（未手动设置过的前提下）
    if (
      !removing &&
      (isCoreDegreeType(course) || isProfessionalDegreeType(course)) &&
      getCourseRoleEligibility(course, activePlan).status === 'eligible' &&
      activeDesignations[designationLookupKey(course)] === undefined &&
      activeDesignations[course.code] === undefined
    ) {
      setCourseDesignation(course, 'degree');
    }
    setUndoSelection(previousSelection);
    setSelectedIdsForActive((current) =>
      removing
        ? current.filter((item) => item !== id)
        : [...current.filter((item) => item !== sameCourse?.id), id],
    );
    setSelectionMessage(
      removing
        ? '已移除「' + course.name + '」'
        : sameCourse
          ? '已将「' +
            sameCourse.name +
            '」换为「' +
            course.name +
            '」' +
            (peers.length ? '；有时间冲突，请检查课表。' : '')
          : '已加入「' +
            course.name +
            '」' +
            (peers.length
              ? '；与 ' +
                peers.map((peer) => peer.name).join('、') +
                ' 时间冲突。'
              : ''),
    );
  }

  function rememberSelection() {
    setUndoSelection({
      termId: activeTermId,
      ids: [...selectedIds],
      designations: { ...activeDesignations },
    });
  }

  function undoLastSelection() {
    if (!undoSelection || undoSelection.termId !== activeTermId) return;
    setSelectedIdsForActive(undoSelection.ids);
    setDesignationsByTerm((current) => ({
      ...current,
      [activeTermId]: undoSelection.designations,
    }));
    setUndoSelection(null);
    setSelectionMessage('已撤销上一步选课操作');
  }

  function showSelectedCourses() {
    clearFilters();
    setOnlySelected(true);
    setView('courses');
  }

  function setView(nextView: typeof view) {
    setViewState(nextView);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function replaceCourse(sourceId: string, replacementId: string) {
    rememberSelection();
    const source = initialCourses.find((course) => course.id === sourceId);
    const replacement = initialCourses.find(
      (course) => course.id === replacementId,
    );
    if (source && replacement) {
      setSelectionMessage(
        '已将「' + source.name + '」换为「' + replacement.name + '」',
      );
      const designation = courseDesignation(source);
      const sourceFamily = courseFamilyKey(source);
      const replacementFamily = courseFamilyKey(replacement);
      const role =
        getCourseRoleEligibility(replacement, activePlan).status ===
        'ineligible'
          ? 'non-degree'
          : designation;
      setDesignationsByTerm((current) => {
        const next = { ...current[activeTermId] };
        // 同一门课不同班级仍用同一 family key，换班后学位属性自动延续；
        // 顺带清理两门课各班次的旧编码键。
        initialCourses
          .filter(
            (item) =>
              courseFamilyKey(item) === sourceFamily ||
              courseFamilyKey(item) === replacementFamily,
          )
          .forEach((item) => delete next[item.code]);
        if (sourceFamily !== replacementFamily) {
          delete next[designationLookupKey(source)];
        }
        next[designationLookupKey(replacement)] = role;
        return { ...current, [activeTermId]: next };
      });
    }
    setSelectedIdsForActive((current) => [
      ...current.filter((id) => id !== sourceId && id !== replacementId),
      replacementId,
    ]);
  }

  function getConflictAlternatives(source: Course) {
    const baseName = courseFamilyKey(source);
    return initialCourses.filter((candidate) => {
      if (
        candidate.id === source.id ||
        courseFamilyKey(candidate) !== baseName
      ) {
        return false;
      }
      return selectedCourses.every(
        (selected) =>
          selected.id === source.id ||
          selected.id === candidate.id ||
          !coursesConflict(candidate, selected),
      );
    });
  }

  function clearFilters() {
    setQuery('');
    setCollege('全部院系');
    setSubject('全部学科/专业');
    setCategory('全部类别');
    setDay('全部星期');
    setOnlySelected(false);
    setOnlyNoConflict(false);
  }

  function switchTerm(termId: string) {
    setActiveTermId(termId);
    setSelectionMessage('');
    setUndoSelection(null);
    setClearDialogOpen(false);
    clearFilters();
    setDetailCourse(null);
    setDataError('');
    setDataMessage('');
  }

  function clearSelectedCourses() {
    if (!selectedCourses.length) return;
    rememberSelection();
    setSelectedIdsForActive([]);
    setDesignationsByTerm((current) => ({ ...current, [activeTermId]: {} }));
    setClearDialogOpen(false);
    setSelectionMessage('已清空「' + activeTermDisplayLabel + '」的已选课程');
  }

  function exportSelected() {
    const header = [
      '课程名称',
      '星期',
      '开始节数',
      '结束节数',
      '老师',
      '地点',
      '周数',
    ];
    const rows = selectedCourses.flatMap((course) =>
      course.schedules.length
        ? course.schedules.map((schedule) => [
            course.name,
            schedule.dayIndex >= 0 ? schedule.dayIndex + 1 : '',
            schedule.start || '',
            schedule.end || '',
            course.teacher,
            schedule.room,
            templateWeekText(schedule),
          ])
        : [[course.name, '', '', '', course.teacher, '', '']],
    );
    const csv = `\ufeff${[header, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\n')}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '我的课程表.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadJson(fileName: string, payload: unknown) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportBackup() {
    const payload: BackupPayload = {
      version: BACKUP_VERSION,
      app: 'HIAS-CSA',
      savedAt: new Date().toISOString(),
      activeTermId,
      customDatasets,
      selectedByTerm,
      designationsByTerm,
      programPlans: customProgramPlans,
      historicalRecords,
      englishExemptionStatus,
    };
    downloadJson('HIAS-CSA-备份-v2.json', payload);
    setDataManagementMessage(
      '备份已导出，包含选课、属性、培养方案、历史记录和免修状态。',
    );
    setDataManagementError('');
  }

  function parseBackupPayload(raw: unknown): BackupPayload {
    if (!raw || typeof raw !== 'object') throw new Error('备份文件不是对象。');
    const value = raw as Partial<BackupPayload>;
    if (value.app !== 'HIAS-CSA' || value.version !== BACKUP_VERSION) {
      throw new Error(`仅支持 HIAS-CSA v${BACKUP_VERSION} 备份文件。`);
    }
    if (
      !Array.isArray(value.customDatasets) ||
      !value.customDatasets.every(
        (dataset) =>
          dataset &&
          typeof dataset.id === 'string' &&
          typeof dataset.label === 'string' &&
          Array.isArray(dataset.courses) &&
          dataset.courses.every(isCourse),
      )
    ) {
      throw new Error('备份中的课程数据格式不完整。');
    }
    if (
      !value.selectedByTerm ||
      typeof value.selectedByTerm !== 'object' ||
      !value.designationsByTerm ||
      typeof value.designationsByTerm !== 'object' ||
      !Array.isArray(value.programPlans) ||
      !value.programPlans.every(isProgramPlan) ||
      !Array.isArray(value.historicalRecords) ||
      !value.historicalRecords.every(
        (record) =>
          record &&
          typeof record.id === 'string' &&
          typeof record.term === 'string' &&
          typeof record.courseName === 'string' &&
          typeof record.courseCode === 'string' &&
          typeof record.credits === 'number' &&
          typeof record.category === 'string',
      ) ||
      !['normal', 'planned', 'approved'].includes(
        value.englishExemptionStatus || '',
      )
    ) {
      throw new Error('备份中的选课、培养方案或历史记录格式不完整。');
    }
    return value as BackupPayload;
  }

  async function handleBackupImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setDataManagementError('');
    setDataManagementMessage('');
    try {
      const payload = parseBackupPayload(JSON.parse(await file.text()));
      const currentCourseIds = new Set(
        [...availableDatasets, ...payload.customDatasets].flatMap((dataset) =>
          dataset.courses.map((course) => course.id),
        ),
      );
      const importedSelected = Object.values(payload.selectedByTerm).flat();
      const unmatched = importedSelected.filter(
        (id) => !currentCourseIds.has(id),
      );
      const existingDatasetIds = new Set(
        availableDatasets.map((dataset) => dataset.id),
      );
      const added = payload.customDatasets.filter(
        (dataset) => !existingDatasetIds.has(dataset.id),
      ).length;
      const replaced = payload.customDatasets.length - added;
      setRestorePreview({
        payload,
        summary: [
          `将新增 ${added} 个课程数据集，替换 ${replaced} 个同名数据集。`,
          `将恢复 ${importedSelected.length} 条按学期保存的选课记录。`,
          unmatched.length
            ? `${unmatched.length} 条选课记录在当前内置数据中无法匹配，应用后会保留记录但不加入当前课程表。`
            : '所有备份中的课程记录都能在当前数据中匹配。',
          `将恢复 ${payload.historicalRecords.length} 条历史记录和英语免修状态。`,
        ],
      });
    } catch (error) {
      setDataManagementError(
        error instanceof Error ? error.message : '备份读取失败，请检查文件。',
      );
    }
  }

  function applyRestore() {
    if (!restorePreview) return;
    setUndoSelection(null);
    setSelectionMessage('');
    const { payload } = restorePreview;
    setCustomDatasets(payload.customDatasets);
    setActiveTermId(
      TERM_TEMPLATE_IDS.has(payload.activeTermId) ||
        payload.customDatasets.some(
          (dataset) => dataset.id === payload.activeTermId,
        )
        ? payload.activeTermId
        : DEFAULT_TERM_ID,
    );
    setSelectedByTerm(payload.selectedByTerm);
    setDesignationsByTerm(payload.designationsByTerm);
    setCustomProgramPlans(payload.programPlans);
    setHistoricalRecords(payload.historicalRecords);
    setEnglishExemptionStatus(payload.englishExemptionStatus);
    setRestorePreview(null);
    setDataManagementMessage(
      '备份已恢复；原有内置课程数据仍保留，无法匹配的记录未被删除。',
    );
  }

  function addHistoricalRecord() {
    const credits = Number(historyDraft.credits);
    if (!Number.isFinite(credits) || credits <= 0) {
      setDataManagementError('请填写大于 0 的历史学分。');
      return;
    }
    const matchedCourse = initialCourses.find(
      (course) => course.code === historyDraft.courseCode.trim(),
    );
    setHistoricalRecords((current) => [
      ...current,
      {
        id: `history-${Date.now()}`,
        term: historyDraft.term.trim() || '学期待补充',
        courseName: historyDraft.courseName.trim(),
        courseCode: historyDraft.courseCode.trim(),
        credits,
        category: historyDraft.category,
        subject: matchedCourse?.subject,
        designation: historyDraft.designation,
        module: historyDraft.module,
        courseCount: historyDraft.courseName.trim() ? 1 : null,
        source: '用户手动录入',
      },
    ]);
    setHistoryDraft((current) => ({
      ...current,
      courseName: '',
      courseCode: '',
      credits: '',
    }));
    setDataManagementError('');
    setDataManagementMessage('历史记录已加入，统计会立即更新。');
  }

  function addHiasRecord() {
    const attendanceCount = Number(hiasDraft.attendanceCount);
    if (!Number.isInteger(attendanceCount) || attendanceCount <= 0) {
      setDataManagementError('请填写大于 0 的整数参加次数。');
      return;
    }
    const hours = attendanceCount * 2;
    const credits = hours / 20;
    setHistoricalRecords((current) => [
      ...current,
      {
        id: `history-hias-${Date.now()}`,
        term: hiasDraft.term.trim() || '学期待补充',
        courseName: 'HIAS讲堂',
        courseCode: 'HIAS-LECTURE',
        credits,
        category: '专业选修课',
        subject: '人文系列讲座',
        designation: 'non-degree',
        module: 'hias',
        hours,
        attendanceCount,
        courseCount: 0,
        source: '用户手动录入·按 2 学时/次、20 学时/学分换算',
      },
    ]);
    setHiasDraft((current) => ({ term: current.term, attendanceCount: '' }));
    setDataManagementError('');
    setDataManagementMessage(
      `已加入 ${attendanceCount} 次 HIAS 讲堂（${hours} 学时，${formatCredits(credits)} 学分），归入专业非学位课（专业选修，非学位；不计入学期 10 学分门槛与公共选修体系）。`,
    );
  }

  function setEnglishStatus(status: ExemptionStatus) {
    setUndoSelection(null);
    setEnglishExemptionStatus(status);
    setSelectionMessage(
      status === 'normal'
        ? '已设置为未获得英语免修免考资格；已选英语课程仍保留。'
        : status === 'planned'
          ? '旧版备份中的拟申请状态按未获得英语免修免考资格处理；已选英语课程仍保留。'
          : '已标记为已获得英语免修免考资格：按培养要求计入，已选英语课程保留但不重复计分，请按学校审核结果核对。',
    );
  }

  function completeSettings() {
    try {
      window.localStorage.setItem(ACTIVE_PROGRAM_STORAGE_KEY, programPlanId);
      window.localStorage.setItem(
        ENGLISH_EXEMPTION_STORAGE_KEY,
        englishExemptionStatus,
      );
      window.localStorage.setItem(INITIAL_SETTINGS_STORAGE_KEY, '1');
      setIsInitialSetup(false);
    } catch {
      setSelectionMessage(
        '设置已在本次打开期间生效，但浏览器未能保存；下次打开时可能需要重新确认。',
      );
    }
    setSettingsOpen(false);
  }

  const activeFilterChips = [
    ...(query.trim()
      ? [{ label: '搜索：' + query.trim(), clear: () => setQuery('') }]
      : []),
    ...(college !== '全部院系'
      ? [{ label: college, clear: () => setCollege('全部院系') }]
      : []),
    ...(subject !== '全部学科/专业'
      ? [{ label: subject, clear: () => setSubject('全部学科/专业') }]
      : []),
    ...(category !== '全部类别'
      ? [{ label: category, clear: () => setCategory('全部类别') }]
      : []),
    ...(day !== '全部星期'
      ? [{ label: day, clear: () => setDay('全部星期') }]
      : []),
    ...(onlyNoConflict
      ? [{ label: '避开时间冲突', clear: () => setOnlyNoConflict(false) }]
      : []),
  ];
  const navigation = [
    { value: 'courses', label: '选课程', icon: BookOpen },
    { value: 'guide', label: '培养要求', icon: GraduationCap },
    { value: 'exams', label: '考试压力', icon: BarChart3 },
    { value: 'notice', label: '选课须知', icon: Info },
    { value: 'data', label: '数据管理', icon: RefreshCw },
  ] as const;

  return (
    <main className="course-app">
      <a className="skip-link" href="#workspace-content">
        跳到主要内容
      </a>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-identity">
            <div className="app-monogram" aria-hidden="true">
              <BookOpen />
            </div>
            <div>
              <div className="app-wordmark">
                HIAS-CSA <span>杭州高等研究院</span>
              </div>
              <h1>预选课助手</h1>
            </div>
          </div>
          <div className="header-context">
            <button
              type="button"
              className="header-selection"
              onClick={showSelectedCourses}
              aria-label={`查看已选 ${selectedCourses.length} 门课程，方案合计 ${formatCredits(selectedCredits)} 学分`}
              title={'查看已选课程（预选学分不含英语免修免考；免修学分计入“历史已修/已获得”）'}
            >
              <span className="header-selection-icon" aria-hidden="true">
                <Star />
              </span>
              <span className="header-selection-metric">
                已选 <strong>{selectedCourses.length}</strong> 门
              </span>
              <span className="header-selection-divider" aria-hidden="true" />
              <span className="header-selection-metric">
                <strong>{formatCredits(selectedCredits)}</strong> 学分
              </span>
              <ArrowRight
                className="header-selection-arrow"
                aria-hidden="true"
              />
            </button>
            <NativeSelect
              id="term-select"
              aria-label="切换课程数据学期"
              value={activeTermId}
              onChange={(event) => switchTerm(event.target.value)}
            >
              {availableDatasets.map((dataset) => (
                <NativeSelectOption key={dataset.id} value={dataset.id}>
                  {dataset.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 />
              <span>培养设置</span>
            </Button>
          </div>
        </header>
        <div className="context-caption">
          <span>{audienceLabel} · 非官方模拟选课</span>
          <span>最终课程安排以学校正式通知为准</span>
        </div>
        <Tabs
          className="workspace-tabs"
          value={view}
          onValueChange={(value) => {
            setView(value as typeof view);
            window.scrollTo({ top: 0, behavior: 'instant' });
          }}
        >
          <div className="workspace-nav">
            <TabsList className="workspace-tab-list" aria-label="选课助手导航">
              {navigation.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="workspace-tab"
                >
                  <Icon />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {(dataMessage || dataError) && view !== 'data' && (
            <div
              className={'workspace-feedback ' + (dataError ? 'is-error' : '')}
              role={dataError ? 'alert' : 'status'}
            >
              {dataError || dataMessage}
            </div>
          )}
          {conflictPairs.length > 0 && (
            <Collapsible className="conflict-panel workspace-conflicts">
              <CollapsibleTrigger className="conflict-disclosure">
                <TriangleAlert />
                <strong>发现 {conflictPairs.length} 组时间冲突</strong>
                <span>查看冲突与替代班次</span>
                <ChevronDown />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="conflict-list">
                  {conflictPairs.map(({ left, right, slots }) => {
                    const alternatives = [left, right]
                      .map((source) => ({
                        source,
                        courses: getConflictAlternatives(source),
                      }))
                      .filter((group) => group.courses.length > 0);
                    return (
                      <div
                        className="conflict-row"
                        key={`${left.id}-${right.id}`}
                      >
                        <div className="conflict-courses">
                          <button
                            onClick={() => setDetailCourse(left)}
                            type="button"
                          >
                            {left.name}
                          </button>
                          <span>与</span>
                          <button
                            onClick={() => setDetailCourse(right)}
                            type="button"
                          >
                            {right.name}
                          </button>
                          <strong>冲突</strong>
                        </div>
                        <div className="conflict-slots">
                          {slots.map((slot, index) => (
                            <span key={`${formatConflictSlot(slot)}-${index}`}>
                              <Clock3 /> {formatConflictSlot(slot)}
                            </span>
                          ))}
                        </div>
                        {alternatives.length > 0 ? (
                          <div className="conflict-alternatives">
                            <div className="conflict-alternatives-title">
                              <Repeat2 /> 无冲突替代班次
                            </div>
                            {alternatives.map(({ source, courses }) => (
                              <div
                                className="alternative-group"
                                key={source.id}
                              >
                                <span>替换 {source.name}</span>
                                <div>
                                  {courses.slice(0, 4).map((candidate) => (
                                    <button
                                      key={candidate.id}
                                      onClick={() =>
                                        replaceCourse(source.id, candidate.id)
                                      }
                                      type="button"
                                    >
                                      换成 {candidate.name}
                                      <small>
                                        {candidate.schedules
                                          .map((item) => item.periodText)
                                          .join('、')}
                                      </small>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="conflict-no-alternative">
                            暂无可直接替换的同课无冲突班次
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          <div
            className={
              'workspace-layout ' + (view === 'courses' ? 'with-selection' : '')
            }
          >
            <TabsContent
              value={view}
              id="workspace-content"
              className="workspace-content"
              tabIndex={0}
            >
              {view === 'courses' ? (
                <section className="py-6">
                  <div className="section-heading mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2>
                        {onlySelected ? '已选课程' : '选择本学期课程'}{' '}
                        <span className="result-count">
                          {filteredCourses.length}
                        </span>
                      </h2>
                      <div className="section-description">
                        {onlySelected
                          ? '查看已选安排，点击课程名称核对详情。'
                          : isSpringTerm
                            ? '春季计划课程：依据 2026—2027 培养方案整理，时间/班次/容量待春季正式课表公布。'
                            : '按课程、教师或上课时间查找，加入你的模拟课表。'}
                      </div>
                    </div>
                    <p className="text-sm text-slate-500">
                      已显示 {Math.min(visibleCount, filteredCourses.length)} /{' '}
                      {filteredCourses.length}
                    </p>
                  </div>

                  <div className="catalog-filters">
                    <div className="search-row">
                      <div className="search-field">
                        <Search aria-hidden="true" />
                        <Input
                          id="course-search"
                          aria-label="搜索课程"
                          placeholder="课程名称、编码、教师或教室"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                        />
                        {query && (
                          <button
                            type="button"
                            aria-label="清空搜索关键词"
                            onClick={() => setQuery('')}
                          >
                            <X />
                          </button>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        className="filter-toggle"
                        aria-expanded={filtersOpen}
                        aria-controls="advanced-filters"
                        onClick={() => setFiltersOpen((open) => !open)}
                      >
                        <SlidersHorizontal /> 筛选
                        {activeFilterChips.length > 0 && (
                          <b>{activeFilterChips.length}</b>
                        )}
                      </Button>
                    </div>
                    <Collapsible
                      open={filtersOpen}
                      onOpenChange={setFiltersOpen}
                    >
                      <CollapsibleContent id="advanced-filters">
                        <div className="advanced-filters">
                          {' '}
                          <NativeSelect
                            aria-label="按开课院系筛选"
                            className="w-full [&>select]:h-11"
                            onChange={(event) => setCollege(event.target.value)}
                            value={college}
                          >
                            <NativeSelectOption value="全部院系">
                              全部院系
                            </NativeSelectOption>
                            {colleges.map((item) => (
                              <NativeSelectOption key={item} value={item}>
                                {item}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                          <NativeSelect
                            aria-label="按所属学科或专业筛选"
                            className="w-full [&>select]:h-11"
                            onChange={(event) => setSubject(event.target.value)}
                            value={subject}
                          >
                            <NativeSelectOption value="全部学科/专业">
                              全部学科/专业
                            </NativeSelectOption>
                            {subjects.map((item) => (
                              <NativeSelectOption key={item} value={item}>
                                {item}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                          <NativeSelect
                            aria-label="按课程类别筛选"
                            className="w-full [&>select]:h-11"
                            onChange={(event) =>
                              setCategory(event.target.value)
                            }
                            value={category}
                          >
                            <NativeSelectOption value="全部类别">
                              全部课程类别
                            </NativeSelectOption>
                            {categories.map((item) => (
                              <NativeSelectOption key={item} value={item}>
                                {item}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                          <NativeSelect
                            aria-label="按星期筛选"
                            className="w-full [&>select]:h-11"
                            onChange={(event) => setDay(event.target.value)}
                            value={day}
                          >
                            <NativeSelectOption value="全部星期">
                              全部星期
                            </NativeSelectOption>
                            {DAYS.map((item) => (
                              <NativeSelectOption key={item} value={item}>
                                {item}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    <div className="filter-bottom-row">
                      <div className="catalog-scope" aria-label="课程范围">
                        <button
                          type="button"
                          aria-pressed={!onlySelected}
                          onClick={() => setOnlySelected(false)}
                        >
                          全部课程
                        </button>
                        <button
                          type="button"
                          aria-pressed={onlySelected}
                          onClick={showSelectedCourses}
                        >
                          已选 <b>{selectedCourses.length}</b>
                        </button>
                      </div>
                      <label className="conflict-filter">
                        <input
                          type="checkbox"
                          checked={onlyNoConflict}
                          onChange={(event) =>
                            setOnlyNoConflict(event.target.checked)
                          }
                        />
                        避开时间冲突
                      </label>
                    </div>
                    {activeFilterChips.length > 0 && (
                      <div
                        className="active-filters"
                        aria-label="已启用的筛选条件"
                      >
                        {activeFilterChips.map((chip) => (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={chip.clear}
                            aria-label={'取消筛选：' + chip.label}
                          >
                            {chip.label}
                            <X />
                          </button>
                        ))}
                        <button
                          type="button"
                          className="reset-filters"
                          onClick={clearFilters}
                        >
                          重置筛选
                        </button>
                      </div>
                    )}
                  </div>

                  {onlySelected && selectedCourses.length > 0 && (
                    <div className="selected-toolbar">
                      <Button
                        variant="outline"
                        onClick={() => setTimetableOpen(true)}
                      >
                        <CalendarDays />
                        查看课表
                      </Button>
                      <Button variant="outline" onClick={exportSelected}>
                        <Download />
                        导出 CSV
                      </Button>
                      {selectedCourses.length > 0 && (
                        <Button
                          variant="outline"
                          onClick={openRecommendationDialog}
                        >
                          <Sparkles />
                          智能补全方案
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="text-rose-700"
                        onClick={() => setClearDialogOpen(true)}
                      >
                        <Trash2 />
                        清空本学期
                      </Button>
                    </div>
                  )}
                  {filteredCourses.length ? (
                    <div className="catalog-grid">
                      {filteredCourses.slice(0, visibleCount).map((course) => {
                        const selected = selectedIds.includes(course.id);
                        const conflict =
                          selected && conflictingIds.has(course.id);
                        const peers = selected
                          ? (conflictPeers.get(course.id) ?? [])
                          : selectedCourses.filter(
                              (other) =>
                                courseFamilyKey(other) !==
                                  courseFamilyKey(course) &&
                                coursesConflict(course, other),
                            );
                        return (
                          <article
                            className={`course-card ${selected ? 'course-card-selected' : ''} ${conflict ? 'course-card-conflict' : ''}`}
                            key={course.id}
                          >
                            <div className="course-card-heading">
                              <h3>
                                <button
                                  className="course-title"
                                  onClick={() => setDetailCourse(course)}
                                  type="button"
                                >
                                  {course.name}
                                </button>
                              </h3>
                              <div className="course-credit">
                                <strong>{formatCredits(course.credits)}</strong>
                                <span>学分</span>
                              </div>
                            </div>
                            <div className="course-tags">
                              <Badge variant="secondary">
                                {course.category}
                              </Badge>
                              {activePlan.coreCourses.includes(course.name) ? (
                                <Badge
                                  className="bg-indigo-50 text-indigo-700"
                                  variant="secondary"
                                >
                                  方案核心课
                                </Badge>
                              ) : activePlan.professionalCourses.includes(
                                  course.name,
                                ) ? (
                                <Badge
                                  className="bg-indigo-50 text-indigo-700"
                                  variant="secondary"
                                >
                                  方案专业课
                                </Badge>
                              ) : null}
                              {isInnovationCourse(course) && (
                                <Badge variant="secondary">创新创业</Badge>
                              )}
                              {course.scheduleStatus === 'planned' && (
                                <Badge
                                  className="bg-teal-50 text-teal-700"
                                  variant="secondary"
                                  title="依据2026—2027培养方案整理的春季计划课程，具体以春季正式课表为准"
                                >
                                  春季计划
                                </Badge>
                              )}
                              {selected && (
                                <Badge variant="secondary">
                                  {designationLabel(courseDesignation(course))}
                                </Badge>
                              )}
                            </div>
                            <div className="my-3.5 h-px bg-slate-100" />
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div className="info-pair">
                                <Users />
                                <span>
                                  <strong>{course.teacher}</strong>
                                  <small>任课教师</small>
                                </span>
                              </div>
                              <div className="info-pair">
                                <GraduationCap />
                                <span>
                                  <strong>{course.subject}</strong>
                                  <small>{course.college}</small>
                                </span>
                              </div>
                            </div>
                            <div className="course-extra mt-4">
                              <span>
                                <ClipboardCheck />{' '}
                                {course.examMode || '考试方式待定'}
                              </span>
                              <span>
                                <Presentation />{' '}
                                {course.teachingMode || '授课方式待定'}
                              </span>
                              <span>
                                <Clock3 /> {course.hours || '学时待定'}
                              </span>
                            </div>
                            {peers.length > 0 && (
                              <div className="course-conflict-note">
                                <Zap />
                                <span>
                                  与 {peers.map((peer) => peer.name).join('、')}{' '}
                                  的上课时间冲突
                                </span>
                              </div>
                            )}
                            <div className="course-time-block">
                              <ScheduleLines schedules={course.schedules} />
                            </div>
                            <div className="course-enrollment">
                              {formatEnrollment(course)}
                            </div>
                            <div className="course-card-footer">
                              <button
                                className="course-detail-link"
                                type="button"
                                onClick={() => setDetailCourse(course)}
                              >
                                课程详情
                                <ArrowRight />
                              </button>
                              <Button
                                disabled={!storageReady}
                                variant={selected ? 'outline' : 'default'}
                                aria-pressed={selected}
                                aria-label={
                                  (selected ? '移除' : '选择') + course.name
                                }
                                onClick={() => toggleCourse(course.id)}
                              >
                                {selected ? <CheckCircle2 /> : <Plus />}
                                {selected ? '已选 · 移除' : '加入课表'}
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <SlidersHorizontal />
                      <h3>
                        {!initialCourses.length
                          ? '本学期尚未载入课程数据'
                          : onlySelected && !selectedCourses.length
                            ? '还没有选择课程'
                            : '没有找到匹配课程'}
                      </h3>
                      <p>
                        {initialCourses.length
                          ? onlySelected && !selectedCourses.length
                            ? '切换到全部课程，找到想学的课程后点击「加入课表」。'
                            : '试试缩短关键词，或取消上方的筛选条件。'
                          : '请在“数据管理”中导入本学期课程 JSON；当前学期的选课记录会独立保存。'}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button onClick={clearFilters} variant="outline">
                          {onlySelected && !selectedCourses.length
                            ? '浏览全部课程'
                            : '重置筛选'}
                        </Button>
                        {!initialCourses.length && (
                          <Button
                            onClick={() => setView('data')}
                            variant="outline"
                          >
                            打开数据管理
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {visibleCount < filteredCourses.length && (
                    <div className="mt-6 flex justify-center">
                      <Button
                        className="h-11 rounded-xl px-6"
                        onClick={() =>
                          setVisibleCount((count) => count + PAGE_SIZE)
                        }
                        variant="outline"
                      >
                        <ChevronDown /> 显示更多课程
                      </Button>
                    </div>
                  )}
                </section>
              ) : view === 'data' ? (
                <section className="py-6">
                  <div className="section-heading mb-5">
                    <p>DATA MANAGEMENT</p>
                    <h2>数据管理</h2>
                    <div className="section-description">
                      更新课程数据、导出/恢复个人备份都在这里完成。所有数据仍只保存在当前浏览器；导入失败不会覆盖原数据。
                    </div>
                  </div>
                  {(dataManagementMessage ||
                    dataManagementError ||
                    dataMessage ||
                    dataError) && (
                    <div
                      className={`mb-4 rounded-xl border px-3 py-2.5 text-sm leading-6 ${
                        dataManagementError || dataError
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}
                      role={
                        dataManagementError || dataError ? 'alert' : 'status'
                      }
                    >
                      {dataManagementError ||
                        dataError ||
                        dataManagementMessage ||
                        dataMessage}
                    </div>
                  )}
                  <div className="data-management-grid">
                    <article className="data-management-card">
                      <div className="data-management-card-head">
                        <GraduationCap />
                        <div>
                          <h3>导入培养方案</h3>
                          <p>
                            添加其他培养方向的方案，导入后可在“培养设置”中选择。
                          </p>
                        </div>
                      </div>
                      <input
                        accept=".json,application/json"
                        className="sr-only"
                        onChange={handleProgramPlanImport}
                        ref={programPlanFileRef}
                        type="file"
                      />
                      <Button
                        className="mt-4 h-10"
                        variant="outline"
                        onClick={() => programPlanFileRef.current?.click()}
                      >
                        <RefreshCw />
                        选择培养方案 JSON
                      </Button>
                      {(programPlanMessage || programPlanError) && (
                        <p
                          className="mt-3 text-sm"
                          role={programPlanError ? 'alert' : 'status'}
                        >
                          {programPlanError || programPlanMessage}
                        </p>
                      )}
                    </article>

                    <article className="data-management-card">
                      <div className="data-management-card-head">
                        <RefreshCw />
                        <div>
                          <h3>更新课程数据</h3>
                          <p>
                            支持课程
                            JSON；按课程编码尝试保留对应学期的已选记录。
                          </p>
                        </div>
                      </div>
                      <input
                        accept=".json,application/json"
                        className="sr-only"
                        onChange={handleCourseDataImport}
                        ref={dataFileRef}
                        type="file"
                      />
                      <Button
                        className="mt-4 h-10 rounded-xl"
                        onClick={() => dataFileRef.current?.click()}
                      >
                        选择课程数据 JSON
                      </Button>
                      <p className="data-management-note">
                        更新同一学期时，会尝试保留已选课程；切换学期后，各学期的选课记录独立保存。
                      </p>
                    </article>
                    <article className="data-management-card">
                      <div className="data-management-card-head">
                        <Download />
                        <div>
                          <h3>备份与恢复</h3>
                          <p>
                            备份版本 v{BACKUP_VERSION}{' '}
                            包含学期课程、选课、属性、培养方案、历史记录和免修状态。
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          className="h-10 rounded-xl"
                          onClick={exportBackup}
                        >
                          <Download /> 导出完整备份
                        </Button>
                        <input
                          accept=".json,application/json"
                          className="sr-only"
                          onChange={handleBackupImport}
                          ref={backupFileRef}
                          type="file"
                        />
                        <Button
                          className="h-10 rounded-xl"
                          onClick={() => backupFileRef.current?.click()}
                          variant="outline"
                        >
                          <RefreshCw /> 选择备份恢复
                        </Button>
                      </div>
                      {restorePreview && (
                        <section
                          className="restore-preview"
                          aria-label="确认恢复备份"
                        >
                          <strong>恢复前预览</strong>
                          <ul>
                            {restorePreview.summary.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              className="h-9 rounded-lg"
                              onClick={applyRestore}
                            >
                              确认应用恢复
                            </Button>
                            <Button
                              className="h-9 rounded-lg"
                              onClick={() => setRestorePreview(null)}
                              variant="outline"
                            >
                              取消
                            </Button>
                          </div>
                        </section>
                      )}
                    </article>
                    <article className="data-management-card sm:col-span-2">
                      <div className="data-management-card-head">
                        <ClipboardList />
                        <div>
                          <h3>历史学分与 HIAS 讲堂</h3>
                          <p>补录已修学分与讲堂次数，均计入培养要求进度；数据仅存本机。</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-slate-700">
                              历史已修
                            </h4>
                            <Badge variant="secondary">
                              {formatCredits(creditSummary.historicalCredits)}{' '}
                              学分
                            </Badge>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <NativeSelect
                              aria-label="历史学期"
                              onChange={(event) =>
                                setHistoryDraft((current) => ({
                                  ...current,
                                  term: event.target.value,
                                }))
                              }
                              value={historyDraft.term}
                            >
                              <NativeSelectOption value="" disabled>
                                选择学期
                              </NativeSelectOption>
                              {availableDatasets.map((dataset) => (
                                <NativeSelectOption
                                  key={dataset.id}
                                  value={dataset.label}
                                >
                                  {dataset.label}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                            <Input
                              aria-label="历史学分"
                              onChange={(event) =>
                                setHistoryDraft((current) => ({
                                  ...current,
                                  credits: event.target.value,
                                }))
                              }
                              placeholder="学分"
                              type="number"
                              value={historyDraft.credits}
                            />
                            <Input
                              aria-label="历史课程名称，可留空"
                              onChange={(event) =>
                                setHistoryDraft((current) => ({
                                  ...current,
                                  courseName: event.target.value,
                                }))
                              }
                              placeholder="课程名称（可留空）"
                              value={historyDraft.courseName}
                            />
                            <NativeSelect
                              aria-label="历史课程类别"
                              onChange={(event) =>
                                setHistoryDraft((current) => ({
                                  ...current,
                                  category: event.target.value,
                                }))
                              }
                              value={historyDraft.category}
                            >
                              {[
                                '公共必修课',
                                '公共选修课',
                                '专业核心课',
                                '学科核心课',
                                '专业课',
                                '研讨课',
                                '实验课',
                              ].map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                  {value}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                            <NativeSelect
                              aria-label="历史课程学位属性"
                              className="col-span-2"
                              onChange={(event) =>
                                setHistoryDraft((current) => ({
                                  ...current,
                                  designation: event.target
                                    .value as HistoricalRecord['designation'],
                                }))
                              }
                              value={historyDraft.designation}
                            >
                              <NativeSelectOption value="unknown">
                                学位属性待核验
                              </NativeSelectOption>
                              <NativeSelectOption value="degree">
                                学位课
                              </NativeSelectOption>
                              <NativeSelectOption value="non-degree">
                                非学位课
                              </NativeSelectOption>
                            </NativeSelect>
                          </div>
                          <Button
                            className="mt-2 h-9 w-full"
                            onClick={addHistoricalRecord}
                          >
                            <ClipboardList /> 添加历史记录
                          </Button>
                          {historicalRecords.length > 0 && (
                            <div className="history-record-list mt-2">
                              {historicalRecords.map((record) => (
                                <div key={record.id}>
                                  <span>
                                    {record.courseName || '分类学分'} ·{' '}
                                    {record.term}
                                  </span>
                                  <b>{formatCredits(record.credits)} 学分</b>
                                  <button
                                    aria-label={`删除${record.courseName || record.category}历史记录`}
                                    onClick={() =>
                                      setHistoricalRecords((current) =>
                                        current.filter(
                                          (item) => item.id !== record.id,
                                        ),
                                      )
                                    }
                                    type="button"
                                  >
                                    <X />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {syntheticExemptionHistory && (
                            <div className="history-record-list mt-2">
                              <div className="text-amber-700">
                                <span>
                                  硕士学位英语 · 2026—2027学年(秋)第一学期
                                  （英语免修免考 · 自动计入，不可删除）
                                </span>
                                <b>
                                  {formatCredits(syntheticExemptionHistory.credits)}{' '}
                                  学分
                                </b>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-slate-700">
                              HIAS 讲堂
                            </h4>
                            <Badge variant="secondary">专业非学位课（专业选修）</Badge>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <NativeSelect
                              aria-label="HIAS讲堂学期"
                              onChange={(event) =>
                                setHiasDraft((current) => ({
                                  ...current,
                                  term: event.target.value,
                                }))
                              }
                              value={hiasDraft.term}
                            >
                              <NativeSelectOption value="" disabled>
                                选择学期
                              </NativeSelectOption>
                              {availableDatasets.map((dataset) => (
                                <NativeSelectOption
                                  key={dataset.id}
                                  value={dataset.label}
                                >
                                  {dataset.label}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                            <Input
                              aria-label="HIAS讲堂参加次数"
                              min="1"
                              onChange={(event) =>
                                setHiasDraft((current) => ({
                                  ...current,
                                  attendanceCount: event.target.value,
                                }))
                              }
                              placeholder="参加次数"
                              type="number"
                              value={hiasDraft.attendanceCount}
                            />
                          </div>
                          <div className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-500">
                            本次换算：
                            {hiasPreview
                              ? `${hiasPreview.hours} 学时 = ${formatCredits(hiasPreview.credits)} 学分`
                              : '填写次数后自动换算'}
                          </div>
                          <Button
                            className="mt-2 h-9 w-full"
                            onClick={addHiasRecord}
                          >
                            <ClipboardList /> 添加讲堂记录
                          </Button>
                          <p className="mt-2 text-xs text-slate-500">
                            已累计：{hiasHistorySummary.attendanceCount} 次 ·{' '}
                            {hiasHistorySummary.hours} 学时 ·{' '}
                            {formatCredits(hiasHistorySummary.credits)} 学分
                          </p>
                        </div>
                      </div>
                    </article>
                  </div>
                  <div className="source-compare-note mt-5">
                    <ShieldCheck />
                    <span>
                      恢复会替换备份中包含的自定义数据和个人记录；内置课程与培养方案不会被删除。无法匹配的课程记录会在备份中保留，需重新导入对应课程数据后再使用。
                    </span>
                  </div>
                </section>
              ) : view === 'notice' ? (
                <section className="py-6">
                  <div className="section-heading mb-5">
                    <p>COURSE SELECTION GUIDE</p>
                    <h2>选课须知</h2>
                    <div className="section-description">
                      根据《国科大杭州高等研究院课程学习与选课须知（2026-2027
                      学年）》整理，供模拟选课时快速查阅；正式安排仍以学校通知和选课系统为准。
                    </div>
                  </div>

                  <div className="notice-grid">
                    {NOTICE_SECTIONS.map((section) => (
                      <article className="notice-card" key={section.title}>
                        <div className="notice-card-title">
                          <Info />
                          <h3>{section.title}</h3>
                        </div>
                        <div className="notice-list">
                          {section.items.map((item) => (
                            <div className="notice-item" key={item.label}>
                              <strong>{item.label}</strong>
                              <p>{item.detail}</p>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="source-compare-note mt-5">
                    <FileSpreadsheet />
                    <span>
                      本页内容来源于课程须知
                      PDF，重点用于提醒时间节点和通用规则，不会替代个人培养方案。若学院要求更高学分或有特殊规定，应以学院要求为准。
                    </span>
                  </div>
                </section>
              ) : view === 'guide' ? (
                <section className="guide-page py-6">
                  <div className="guide-plan-summary">
                    <div className="program-summary-header">
                      <div>
                        <Badge variant="secondary">{activePlan.degree}</Badge>
                        <h2>{activePlan.program}</h2>
                        <p>{activePlan.code}</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setSettingsOpen(true)}
                      >
                        <Settings2 />
                        培养设置
                      </Button>
                    </div>
                    <div className="program-summary-totals">
                      <div>
                        <span>毕业总学分要求</span>
                        <strong>
                          ≥ {activePlan.totalCredits}
                          <small>学分</small>
                        </strong>
                      </div>
                      <div>
                        <span>加入计划后预计累计</span>
                        <strong>
                          {formatCredits(programCreditSummary.estimatedCredits)}
                          <small>学分</small>
                        </strong>
                      </div>
                      <div>
                        <span>总学分差额</span>
                        <strong>
                          {formatCredits(
                            Math.max(
                              0,
                              activePlan.totalCredits -
                                programCreditSummary.estimatedCredits,
                            ),
                          )}
                          <small>学分</small>
                        </strong>
                      </div>
                    </div>
                    <div className="program-summary-breakdown">
                      <div>
                        <span>历史已修</span>
                        <strong>
                          {formatCredits(creditSummary.historicalCredits)} 学分
                        </strong>
                      </div>
                      <div>
                        <span>本学期预选课程</span>
                        <strong>
                          {formatCredits(creditSummary.plannedCredits)} 学分
                        </strong>
                      </div>
                      {carriedCourseCredits > 0 && (
                        <div>
                          <span>其它学期已选（计入培养进度）</span>
                          <strong>
                            {formatCredits(carriedCourseCredits)} 学分
                          </strong>
                        </div>
                      )}
                      <a href="#guide-pending">
                        <span>待确认学位属性</span>
                        <strong>
                          {unsetDesignationCount} 门 <ArrowRight />
                        </strong>
                      </a>
                    </div>
                    <div className="program-summary-exemption">
                      <Info />
                      <p>
                        <strong>
                          英语免修免考：
                          {englishExemptionStatus === 'approved'
                            ? '已获得'
                            : '未获得'}
                        </strong>
                        <span>{englishQualificationDetail}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                      >
                        修改资格
                      </button>
                    </div>
                    <p className="program-summary-note">
                      预计累计包含历史已修、其它学期已选（跨学期自动计入培养进度，成绩以实际为准）、本学期预选与英语免修免考；
                      毕业仍需分别满足下方分类学分与学位课门数要求，以学校最终审核为准。
                    </p>
                  </div>
                  {(programPlanMessage || programPlanError) && (
                    <div
                      className={`guide-feedback mb-4 rounded-xl border px-3 py-2.5 text-sm leading-6 ${
                        programPlanError
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}
                      role={programPlanError ? 'alert' : 'status'}
                    >
                      {programPlanError || programPlanMessage}
                    </div>
                  )}

                  {isSpringTerm && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm leading-6 text-teal-800">
                      <Info className="mt-0.5 size-4 shrink-0" />
                      <span>
                        当前为春季学期：本页课程为<strong>春季计划课程</strong>（依据
                        2026—2027 培养方案整理），课程时间、班次、容量与最终开设情况以春季正式课表及教务系统为准。
                      </span>
                    </div>
                  )}

                  {semesterCheckup.mustFix.length > 0 && (
                    <section
                      aria-label="本学期必须处理"
                      className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/70 p-4"
                    >
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-rose-800">
                        <TriangleAlert className="size-4" />
                        本学期必须处理（{semesterCheckup.mustFix.length}）
                      </h3>
                      <div className="space-y-2">
                        {semesterCheckup.mustFix.map((issue) => (
                          <div
                            className="rounded-xl border border-rose-200 bg-white px-3 py-2"
                            key={issue.id}
                          >
                            <p className="text-sm font-semibold text-rose-800">
                              {issue.title}
                            </p>
                            <p className="mt-0.5 text-xs leading-5 text-rose-700">
                              {issue.detail}
                            </p>
                            {issue.action && (
                              <p className="mt-1 text-xs leading-5 text-rose-600">
                                {issue.action}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {semesterCheckup.pending.length > 0 && (
                    <section
                      aria-label="待确认事项"
                      className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
                    >
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-800">
                        <ClipboardCheck className="size-4" />
                        待确认事项（{semesterCheckup.pending.length}）
                      </h3>
                      <div className="space-y-2">
                        {semesterCheckup.pending.map((issue) => (
                          <div
                            className="rounded-xl border border-amber-200 bg-white px-3 py-2"
                            key={issue.id}
                          >
                            <p className="text-sm font-semibold text-amber-800">
                              {issue.title}
                            </p>
                            <p className="mt-0.5 text-xs leading-5 text-amber-700">
                              {issue.detail}
                            </p>
                            {issue.action && (
                              <p className="mt-1 text-xs leading-5 text-amber-700">
                                {issue.action}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {semesterCheckup.progress.some(
                    (issue) => issue.tone === 'amber' || issue.tone === 'slate',
                  ) && (
                    <section
                      aria-label="培养方案进度提醒"
                      className="mb-4 rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                        <Target className="size-4 text-amber-600" />
                        培养方案进度提醒（非本学期选课错误）
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2.5 rounded-full bg-amber-400" />
                          琥珀色卡片 = 培养方案尚未完成（可后续学期/可留待春季）
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2.5 rounded-full border border-dashed border-slate-400 bg-white" />
                          灰色虚线卡片 = 材料未明确最低值（待核验，不判为错误）
                        </span>
                        <span>红色项目只出现在上方“本学期必须处理”，需本学期处理。</span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {semesterCheckup.progress
                          .filter(
                            (issue) =>
                              issue.tone === 'amber' || issue.tone === 'slate',
                          )
                          .map((issue) => {
                            const isPending = issue.tone === 'slate';
                            return (
                              <div
                                className={
                                  isPending
                                    ? 'rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2'
                                    : 'rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2'
                                }
                                key={issue.id}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p
                                    className={
                                      'text-sm font-semibold ' +
                                      (isPending
                                        ? 'text-slate-600'
                                        : 'text-amber-900')
                                    }
                                  >
                                    {issue.title}
                                  </p>
                                  {issue.counted !== undefined &&
                                    issue.target !== null && (
                                      <Badge
                                        className={
                                          'shrink-0 ' +
                                          (isPending
                                            ? ''
                                            : 'border-amber-300 bg-amber-100 text-amber-800')
                                        }
                                        variant={isPending ? 'secondary' : 'outline'}
                                      >
                                        {issue.counted} / {issue.target}
                                      </Badge>
                                    )}
                                </div>
                                <p
                                  className={
                                    'mt-0.5 text-xs leading-5 ' +
                                    (isPending
                                      ? 'text-slate-500'
                                      : 'text-amber-800')
                                  }
                                >
                                  {issue.detail}
                                </p>
                                {issue.action && (
                                  <p
                                    className={
                                      'mt-1 text-[11px] leading-4 ' +
                                      (isPending
                                        ? 'text-slate-500'
                                        : 'text-amber-700')
                                    }
                                  >
                                    {issue.action}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </section>
                  )}

                  <div className="guide-progress">
                    <h3>分类学分要求</h3>
                    <div className="section-description">
                      各项显示“当前已计入学分 /
                      培养方案要求”；统计口径 = 历史已修 + 全部学期已选（前序与已规划的后续学期，自动计入，成绩以实际为准） + 本学期已选。
                      “必修”与“学位课”分别判断，待核验项目不会自动判定为已满足。
                    </div>
                    <div className="requirement-grid mt-3">
                      {[
                        {
                          label: '公共必修学位课',
                          value: formatRequirementProgress(
                            programCreditSummary.publicRequiredDegreeCredits,
                            publicRequiredDegreeTarget,
                          ),
                        },
                        {
                          label: '专业学位课',
                          value: formatRequirementProgress(
                            professionalDegreeConfirmedCredits,
                            activePlan.degreeCourseCredits,
                          ),
                          meta:
                            professionalDegreePendingApprovalCredits > 0
                              ? `＋${formatCredits(professionalDegreePendingApprovalCredits)} 学分跨专业待审核`
                              : undefined,
                        },
                        {
                          label: '专业非学位课（专业选修）',
                          value: formatRequirementProgress(
                            programCreditSummary.professionalElectiveCredits,
                            activePlan.professionalNonDegreeCredits,
                          ),
                        },
                        {
                          label: '公共选修体系（普通公选 + 创新创业）',
                          value: formatRequirementProgress(
                            programCreditSummary.publicElectiveCredits,
                            publicElectiveTarget,
                          ),
                        },
                        {
                          label: '公共必修非学位课（工程伦理）',
                          value: formatRequirementProgress(
                            programCreditSummary.publicRequiredNonDegreeCredits,
                            publicRequiredNonDegreeTarget,
                          ),
                        },
                        {
                          label: '其中：创新创业模块课',
                          value: formatRequirementProgress(
                            programCreditSummary.innovationCredits,
                            activePlan.innovationCredits,
                          ),
                        },
                      ].map((item) => (
                        <div
                          className="requirement-item"
                          key={`progress-${item.label}`}
                        >
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                          {item.meta && (
                            <em className="text-[11px] font-semibold not-italic leading-4 text-amber-700">
                              {item.meta}
                            </em>
                          )}
                        </div>
                      ))}
                    </div>
                    {professionalDegreePendingApprovalCredits > 0 && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                        专业学位课中含{' '}
                        {formatCredits(professionalDegreePendingApprovalCredits)}{' '}
                        学分来自<strong>其它专业</strong>的核心课/专业课（你已设为“学位课”）：
                        可计入“专业学位课 ≥{' '}
                        {formatCredits(activePlan.degreeCourseCredits)} 学分”的补充总量，但需
                        导师/学院审核确认；本专业“2 门核心 + 2 门专业”门数仍须由本专业课程满足。
                      </p>
                    )}
                  </div>

                  <div className="guide-coverage">
                    <h3>学位课门数要求</h3>
                    <div className="degree-rule-grid">
                      {[
                        {
                          label: '核心课',
                          minimum: activePlan.coreMinimum,
                          counted: selectedDegreeCoreCount,
                          selected: selectedPlanCoreCount,
                          available: planCoreCourses.length,
                          springCount:
                            semesterCheckup.gaps.springOpportunity.core ?? 0,
                        },
                        {
                          label: '专业课',
                          minimum: activePlan.professionalMinimum,
                          counted: selectedDegreeProfessionalCount,
                          selected: selectedPlanProfessionalCount,
                          available: planProfessionalCourses.length,
                          springCount:
                            semesterCheckup.gaps.springOpportunity.professional ??
                            0,
                        },
                      ].map((rule) => {
                        const met =
                          rule.minimum !== null &&
                          rule.counted >= rule.minimum;
                        const unknown = rule.minimum === null;
                        return (
                          <article
                            className="degree-rule-card"
                            key={rule.label}
                          >
                            <div className="degree-rule-heading">
                              <h4>
                                <Target />
                                {rule.label}
                              </h4>
                              <span
                                className={
                                  met
                                    ? 'rule-met'
                                    : unknown
                                      ? 'text-amber-700'
                                      : 'text-amber-700'
                                }
                              >
                                {met
                                  ? '门数已满足'
                                  : unknown
                                    ? '待核验（口径待确认）'
                                    : '尚差 ' +
                                      (rule.minimum === null
                                        ? 0
                                        : rule.minimum - rule.counted) +
                                      ' 门'}
                              </span>
                            </div>
                            {unknown ? (
                              <p className="degree-rule-minimum">
                                学院级最低门数<strong>待核验</strong>
                                <span>
                                  本工具不自动套用“2 门核心 + 2 门专业”，请以学院培养方案为准
                                </span>
                              </p>
                            ) : (
                              <p className="degree-rule-minimum">
                                至少 <strong>{rule.minimum}</strong> 门
                                <span>作为学位课</span>
                              </p>
                            )}
                            <div className="degree-rule-status">
                              <span>
                                当前计入 <b>{rule.counted}</b> 门
                              </span>
                              <span>
                                要求 ≥{' '}
                                {rule.minimum === null ? '—（待确认）' : rule.minimum}{' '}
                                门
                              </span>
                            </div>
                            <p className="degree-rule-context">
                              本学期已选 {rule.selected} 门 · 本学期课程库{' '}
                              {rule.available} 门可选
                            </p>
                            {!met && !unknown && rule.springCount > 0 && (
                              <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-5 text-amber-800">
                                {rule.label}进度 {rule.counted} /{' '}
                                {rule.minimum}；2027 春季培养方案仍计划开设{' '}
                                {rule.springCount} 门，可在春季继续完成（非本学期选课错误）。
                              </p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                    <p className="degree-rule-note">
                      门数按已修记录与当前方案中符合要求的学位课统计，待确认属性的课程暂不计入。
                      <a href="#guide-pending">
                        确认课程属性 <ArrowRight />
                      </a>
                    </p>
                  </div>
                  <div
                    id="guide-pending"
                    className="guide-pending designation-panel"
                  >
                    <div className="designation-panel-head">
                      <div>
                        <p>COURSE DESIGNATION</p>
                        <h3>设置学位课属性</h3>
                        <span>
                          在下方把每门已选课程标记为学位课 / 非学位课 /
                          未确定；研讨课、实验课等按规则只能作为非学位课。该设置仅保存在当前浏览器，正式选课时仍需在选课系统中再次确认。
                        </span>
                      </div>
                      <Badge variant="secondary">
                        {selectedCourses.length - unsetDesignationCount} /{' '}
                        {selectedCourses.length} 门已设置
                      </Badge>
                    </div>

                    {selectedCourses.length ? (
                      <div className="designation-list">
                        {selectedCourses.map((course) => {
                          const designation = courseDesignation(course);
                          const degreeEligibility = getCourseRoleEligibility(
                            course,
                            activePlan,
                          );
                          const degreeSelectable =
                            degreeEligibility.status !== 'ineligible';
                          return (
                            <div className="designation-row" key={course.id}>
                              <button
                                onClick={() => setDetailCourse(course)}
                                type="button"
                              >
                                <strong>{course.name}</strong>
                                <span>
                                  {course.category} ·{' '}
                                  {formatCredits(course.credits)} 学分 ·{' '}
                                  {getCourseRequirementTypeLabel(
                                    courseRequirementType(course),
                                  )}
                                  {isInnovationCourse(course)
                                    ? ' · 创新创业课'
                                    : ''}
                                </span>
                              </button>
                              <div className="designation-control">
                                <NativeSelect
                                  aria-label={`设置${course.name}的学位课属性`}
                                  className="w-full min-w-36 [&>select]:h-10"
                                  onChange={(event) =>
                                    setCourseDesignation(
                                      course,
                                      event.target.value as CourseDesignation,
                                    )
                                  }
                                  value={designation}
                                >
                                  <NativeSelectOption
                                    disabled={!degreeSelectable}
                                    value="unset"
                                  >
                                    未确定
                                  </NativeSelectOption>
                                  <NativeSelectOption
                                    disabled={!degreeSelectable}
                                    value="degree"
                                  >
                                    学位课
                                  </NativeSelectOption>
                                  <NativeSelectOption value="non-degree">
                                    非学位课
                                  </NativeSelectOption>
                                </NativeSelect>
                                {degreeEligibility.status !== 'eligible' && (
                                  <small>{degreeEligibility.reason}</small>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="designation-empty">
                        <ClipboardList />
                        <div>
                          <strong>还没有已选课程</strong>
                          <span>先从课程列表选择课程，再回来设置学位课属性。</span>
                        </div>
                        <Button
                          onClick={() => setView('courses')}
                          variant="outline"
                        >
                          去选择课程
                        </Button>
                      </div>
                    )}
                  </div>

                  {activePlan.note && (
                    <div className="guide-note program-note mt-4">
                      <Info /> {activePlan.note}
                    </div>
                  )}

                  <div className="guide-course-library mt-7 grid gap-5 xl:grid-cols-2">
                    {programCourseGroups.map(({ title, courses, kind }) => (
                      <div className="program-course-group" key={title}>
                        <div className="program-course-group-title">
                          <div>
                            <h3>{title}</h3>
                            <p>已按培养方案课程库与本学期正式课表交叉匹配</p>
                          </div>
                          <Badge variant="secondary">{courses.length} 门</Badge>
                        </div>
                        <div className="program-course-list">
                          {courses.map((course) => {
                            const selected = selectedIds.includes(course.id);
                            return (
                              <div
                                className="program-course-row"
                                key={course.id}
                              >
                                <button
                                  onClick={() => setDetailCourse(course)}
                                  type="button"
                                >
                                  <strong>{course.name}</strong>
                                  <span>
                                    {course.teacher} ·{' '}
                                    {formatCredits(course.credits)} 学分 ·{' '}
                                    {course.schedules[0]?.periodText}
                                  </span>
                                </button>
                                <Button
                                  aria-label={
                                    selected
                                      ? `移除${course.name}`
                                      : `选择${course.name}`
                                  }
                                  className={
                                    selected
                                      ? 'program-select program-select-active'
                                      : 'program-select'
                                  }
                                  onClick={() => toggleCourse(course.id)}
                                  size="sm"
                                  variant="outline"
                                >
                                  <Star
                                    className={selected ? 'fill-current' : ''}
                                  />
                                  {selected ? '已选' : '选择'}
                                </Button>
                              </div>
                            );
                          })}
                          {!courses.length && (
                            <div className="program-course-empty">
                              本学期课表中没有匹配到该类课程。
                            </div>
                          )}
                        </div>
                        <p className="program-course-footnote">
                          培养方案共列{' '}
                          {
                            (kind === 'core'
                              ? activePlan.coreCourses
                              : activePlan.professionalCourses
                            ).length
                          }{' '}
                          门，未出现的课程可能安排在春季。
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="guide-source source-compare-note mt-5">
                    <Info />
                    <span>
                      培养要求与课程库依据{' '}
                      {activePlan.source || '已整理的培养方案材料'}；
                      本学期课程的学分、教师、时间和教室仍以当前课程数据为准。
                      课程属性规则按课程编号第14位解释：1/2为核心课、3为专业课、4-7为强制非学位课、B/X为公共课程；无法解析的编码显示为待核验。
                      {` ${getGraduateProgramScopeLabel(activePlan)}`}
                      课程类别、培养要求分类和学位属性分开保存；《工程伦理》按公共必修非学位课统计，不计入学位课程。
                      创新创业课程编码依据“2026创新创业课秋季课表.xlsx”标记为“创新创业课”模块，仍按公共选修体系归属，学分只累计一次。
                      HIAS讲堂（人文系列讲座）与科学前沿讲座均按“专业非学位课（专业选修，非学位）”计分：可按参加次数登记（每次2学时、20学时折算1学分），计入专业非学位课学分，不计入公共选修体系、不计入秋季/春季最低10学分的有效学分。
                      春季（2027-spring）专业课数据为依据2026—2027培养方案整理的春季计划课程，课程时间、班次、容量与最终开设情况以春季正式课表及教务系统为准。
                      {activePlan.program === '物理电子学' &&
                        ' 两份文件中“主被动光谱探测技术”的学分分别为2与2.5，本页采用秋季课表的2.5学分并保留此提示。'}
                    </span>
                  </div>
                </section>
              ) : view === 'exams' ? (
                <section className="py-6">
                  <div className="section-heading mb-5">
                    <p>ASSESSMENT LOAD</p>
                    <h2>考试压力视图</h2>
                    <div className="section-description">
                      按课程文件中的考核方式整理已选课程，帮助你识别闭卷、报告、实践等任务的结构分布。
                    </div>
                  </div>

                  <div className="exam-summary">
                    <div className="exam-summary-icon">
                      <BarChart3 />
                    </div>
                    <div>
                      <span>当前考核结构提示</span>
                      <strong>{examPressureMessage}</strong>
                    </div>
                    <div className="exam-summary-total">
                      <b>{selectedCourses.length}</b>
                      <span>门已选课程</span>
                    </div>
                  </div>

                  {selectedCourses.length ? (
                    <div className="exam-grid mt-5">
                      {examGroups.map((group) => {
                        const credits = group.courses.reduce(
                          (sum, course) => sum + course.credits,
                          0,
                        );
                        return (
                          <article
                            className="exam-card"
                            data-tone={group.tone}
                            key={group.id}
                          >
                            <div className="exam-card-head">
                              <div>
                                <span>{group.label}</span>
                                <strong>{group.courses.length} 门</strong>
                              </div>
                              <b>{formatCredits(credits)} 学分</b>
                            </div>
                            <p>{group.description}</p>
                            <div className="exam-course-list">
                              {group.courses.map((course) => (
                                <button
                                  key={course.id}
                                  onClick={() => setDetailCourse(course)}
                                  type="button"
                                >
                                  <span>{course.name}</span>
                                  <small>
                                    {course.examMode || '考试方式待定'}
                                  </small>
                                </button>
                              ))}
                              {!group.courses.length && (
                                <span className="exam-course-empty">
                                  暂无已选课程
                                </span>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state mt-5">
                      <BarChart3 />
                      <h3>还没有可分析的课程</h3>
                      <p>
                        先选择课程，再回来查看闭卷、开卷、报告和实践考核的分布。
                      </p>
                      <Button onClick={() => setView('courses')}>
                        去选择课程
                      </Button>
                    </div>
                  )}

                  <div className="source-compare-note mt-5">
                    <FileSpreadsheet />
                    <span>
                      考试方式来自 {activeDataset.label}{' '}
                      课程数据；这里仅分析考核类型，不包含考试日期、实际难度或课程作业量，不能替代正式考试安排。
                    </span>
                  </div>
                </section>
              ) : null
              }
            </TabsContent>
            {view === 'courses' && (
              <aside className="selection-sidebar" aria-label="本学期选课方案">
                <div className="selection-summary-head">
                  <span>我的预选方案</span>
                  <span className="local-save-state">
                    {storageReady ? '保存在本机' : '正在恢复…'}
                  </span>
                </div>
                <div className="selection-numbers">
                  <div>
                    <strong>{formatCredits(selectedCredits)}</strong>
                    <span>方案学分合计</span>
                  </div>
                  <button type="button" onClick={showSelectedCourses}>
                    <strong>{selectedCourses.length}</strong>
                    <span>
                      已选课程 <ArrowRight />
                    </span>
                  </button>
                </div>
                {semesterMinimumTarget !== null && (
                  <p className="selection-exemption-note">
                    <CheckCircle2 />
                    计入学期最低要求的有效学分{' '}
                    <strong>
                      {formatCredits(semesterEligibleCredits)} /{' '}
                      {semesterMinimumTarget}
                    </strong>
                    {semesterEligibleCredits >= semesterMinimumTarget
                      ? ' ✓'
                      : '（还差 ' +
                        formatCredits(
                          semesterMinimumTarget - semesterEligibleCredits,
                        ) +
                        '；HIAS讲堂/科学前沿讲座不计入）'}
                  </p>
                )}
                <button
                  type="button"
                  className="plan-context-link"
                  onClick={() => setSettingsOpen(true)}
                >
                  <GraduationCap />
                  <span>
                    {activePlan.label}
                    <small>
                      英语免修免考：
                      {englishExemptionStatus === 'approved'
                        ? '已获得（3 学分计入历史已修，不含在预选学分中）'
                        : '未获得'}
                    </small>
                  </span>
                  <Settings2 />
                </button>
                {selectedCourses.length ? (
                  <>
                    <div className="selection-list-heading">
                      <h3>已选课程</h3>
                      <button type="button" onClick={showSelectedCourses}>
                        查看全部
                      </button>
                    </div>
                    <div className="selection-list">
                      {selectedCourses.map((course) => (
                        <div
                          key={course.id}
                          className={
                            conflictingIds.has(course.id) ? 'has-conflict' : ''
                          }
                        >
                          <button
                            type="button"
                            onClick={() => setDetailCourse(course)}
                          >
                            <strong>{course.name}</strong>
                            <span>
                              {formatCredits(course.credits)} 学分 ·{' '}
                              {course.schedules[0]?.periodText || '时间待定'}
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={'移除' + course.name}
                            onClick={() => toggleCourse(course.id)}
                          >
                            <X />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Collapsible className="credit-details">
                      <CollapsibleTrigger>
                        学分分类明细
                        <ChevronDown />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <h4>课程类别</h4>
                        <div className="credit-breakdown">
                          {selectedCreditBreakdown.map(([label, credits]) => (
                            <span key={label}>
                              {label} {formatCredits(credits)}
                            </span>
                          ))}
                        </div>
                        <h4>培养要求归属</h4>
                        <div className="credit-breakdown">
                          {selectedRequirementBreakdown.map(
                            ([type, credits]) => (
                              <span key={type}>
                                {getCourseRequirementTypeLabel(type)}{' '}
                                {formatCredits(credits)}
                              </span>
                            ),
                          )}
                        </div>
                        {creditSummary.duplicatePlannedCourseCount > 0 && (
                          <p>
                            有 {creditSummary.duplicatePlannedCourseCount}{' '}
                            门已修课程，已避免重复计分。
                          </p>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </>
                ) : (
                  <div className="selection-empty">
                    <CalendarDays />
                    <p>把想学的课程加入课表</p>
                    <span>这里会实时汇总学分与安排</span>
                  </div>
                )}
                <div className="selection-actions">
                  <Button onClick={() => setTimetableOpen(true)}>
                    <CalendarDays />
                    查看我的课表
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!selectedCourses.length}
                    onClick={exportSelected}
                  >
                    <Download />
                    导出课表 CSV
                  </Button>
                </div>
                <p className="export-hint">CSV 可导入 WakeUp 课程表</p>
                {selectedCourses.length > 0 && (
                  <button
                    type="button"
                    className="recommendation-link"
                    onClick={openRecommendationDialog}
                  >
                    <Sparkles />
                    智能补全方案
                    <ArrowRight />
                  </button>
                )}
                <button
                  type="button"
                  className="clear-selection"
                  disabled={!selectedCourses.length}
                  onClick={() => setClearDialogOpen(true)}
                >
                  <Trash2 />
                  清空当前学期
                </button>
              </aside>
            )}
          </div>
        </Tabs>

        <section aria-labelledby="disclaimer-title" className="disclaimer-card">
          <div className="disclaimer-icon" aria-hidden="true">
            <ShieldCheck />
          </div>
          <div>
            <h2 id="disclaimer-title">免责声明</h2>
            <p>
              本工具仅面向国科大杭州高等研究院 2026
              级研一新生使用，是非官方选课辅助项目，不代表国科大杭州高等研究院或学校教务部门。其他年级、其他入学年份或培养阶段的同学不应直接据此安排课程。
            </p>
            <p>
              课程、学分、培养要求、考试方式、选课人数及时间地点等信息可能存在更新延迟、遗漏或整理误差，最终请以学校教务系统、培养方案原文件和正式通知为准。
            </p>
            <p>
              使用者应在正式选课前自行核验关键信息。本工具不会将个人已选课程上传到服务器，相关选择记录仅保存在当前设备的浏览器中。
            </p>
          </div>
        </section>

        <footer className="mb-4 mt-2 flex flex-col gap-2 border-t border-slate-200 py-5 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>HIAS-CSA · {activeDataset.label}预选课辅助工具</span>
          <span>HIAS-CSA · Course Selection Assistant</span>
        </footer>
      </div>

      <div className="mobile-selection-bar" aria-label="选课快捷操作">
        <button type="button" onClick={showSelectedCourses}>
          <Star />
          <span>
            已选 {selectedCourses.length} 门
            <strong>{formatCredits(selectedCredits)} 学分</strong>
          </span>
        </button>
        <Button onClick={() => setTimetableOpen(true)}>
          <CalendarDays />
          课表
        </Button>
        <Button
          variant="outline"
          disabled={!selectedCourses.length}
          onClick={exportSelected}
          aria-label="导出课表 CSV"
        >
          <Download />
        </Button>
      </div>
      {selectionMessage && (
        <div className="selection-toast" key={selectionMessage}>
          <output>{selectionMessage}</output>
          {undoSelection && undoSelection.termId === activeTermId && (
            <button type="button" onClick={undoLastSelection}>
              <Undo2 />
              撤销
            </button>
          )}
          <button
            type="button"
            aria-label="关闭操作提示"
            onClick={() => {
              setSelectionMessage('');
              setUndoSelection(null);
            }}
          >
            <X />
          </button>
        </div>
      )}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>
              {isInitialSetup ? '先确认你的培养设置' : '培养设置'}
            </DialogTitle>
            <DialogDescription>
              {isInitialSetup
                ? '请选择培养方向，并确认是否已获得英语免修免考资格。完成后即可开始选课。'
                : '培养方向决定课程归属和学分要求，请选择自己的方案。'}
            </DialogDescription>
          </DialogHeader>
          <label className="settings-field">
            培养方向
            <NativeSelect
              aria-label="设置培养方向"
              value={programPlanId}
              onChange={(event) => setProgramPlanId(event.target.value)}
            >
              {availableProgramPlans.map((plan) => (
                <NativeSelectOption key={plan.id} value={plan.id}>
                  {plan.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          {isDoctorPlan && (
            <fieldset className="settings-qualification">
              <legend id="settings-track-label">博士培养类型</legend>
              <RadioGroup
                aria-labelledby="settings-track-label"
                value={effectiveTrack ?? 'direct_phd'}
                onValueChange={(value) =>
                  setDoctorTrack(
                    value as 'general_phd' | 'direct_phd' | 'combined_phd',
                  )
                }
              >
                <label className="settings-qualification-option">
                  <RadioGroupItem value="direct_phd" />
                  <span>
                    直博<small>本科直博，公共必修按 11 学分（含硕士基础课）口径</small>
                  </span>
                </label>
                <label className="settings-qualification-option">
                  <RadioGroupItem value="combined_phd" />
                  <span>
                    硕博连读<small>硕转博连读，口径与直博一致</small>
                  </span>
                </label>
                <label className="settings-qualification-option">
                  <RadioGroupItem value="general_phd" />
                  <span>
                    普通招考博士（普博）<small>学院级规则材料未明确，页面按校级口径待确认展示</small>
                  </span>
                </label>
              </RadioGroup>
            </fieldset>
          )}
          <fieldset className="settings-qualification">
            <legend id="settings-qualification-label">
              是否已获得英语免修免考资格？
            </legend>
            <RadioGroup
              aria-labelledby="settings-qualification-label"
              value={
                englishExemptionStatus === 'approved' ? 'approved' : 'normal'
              }
              onValueChange={(value) =>
                setEnglishStatus(value === 'approved' ? 'approved' : 'normal')
              }
            >
              <label className="settings-qualification-option">
                <RadioGroupItem value="normal" />
                <span>
                  未获得<small>未申请、待审核或未通过审核</small>
                </span>
              </label>
              <label className="settings-qualification-option">
                <RadioGroupItem value="approved" />
                <span>
                  已获得<small>学校已审核通过免修免考资格</small>
                </span>
              </label>
            </RadioGroup>
          </fieldset>
          <p className="settings-explanation">
            {englishQualificationDetail}
            {englishExemptionStatus === 'approved' &&
              exemptionEarnedCredits > 0 &&
              ' 计入规则：该 3 学分直接计入“历史已修 / 已获得学分”（2026 秋季），不进入任何学期的预选课程学分；英语课不再需要选课。'}
          </p>
          <p className="settings-explanation">{heroDescription}</p>
          <DialogFooter>
            <Button onClick={completeSettings} disabled={!storageReady}>
              {isInitialSetup ? '完成设置，开始选课' : '完成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空当前学期的选课？</AlertDialogTitle>
            <AlertDialogDescription>
              将移除「{activeDataset.label}」的 {selectedCourses.length}{' '}
              门预选课程及其学位属性。其他学期和历史已修记录会保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>保留课程</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={clearSelectedCourses}
            >
              清空 {selectedCourses.length} 门课程
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={sportsLimitOpen} onOpenChange={setSportsLimitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>体育类课程每学期限选一门</AlertDialogTitle>
            <AlertDialogDescription>
              你已在本学期选择了一门体育类课程。体育类公共选修课每个学期只允许选修
              1 门，请先移除已选的体育课再选择其他体育课。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>知道了</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setApplyPlan(null);
          setRecommendationDialogOpen(open);
        }}
        open={recommendationDialogOpen}
      >
        <DialogContent className="recommendation-dialog max-w-4xl">
          <DialogHeader>
            <DialogTitle>智能补全方案</DialogTitle>
            <DialogDescription>
              已选课程默认锁定保留；系统只负责“新增建议”，不会自动删除或替换课程。
              {semesterCheckup.gaps.semesterCredits !== null &&
                semesterCheckup.gaps.semesterCredits > 0 &&
                ` 当前有效选课学分 ${formatCredits(semesterEligibleCredits)} / 10，还需补充 ${formatCredits(semesterCheckup.gaps.semesterCredits)} 学分。`}
              春季计划课程的最终时间、班次与开设情况以春季正式课表及教务系统为准。
            </DialogDescription>
          </DialogHeader>

          {applyPlan ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div>
                <strong className="text-base">{applyPlan.name}</strong>
                <p className="text-sm leading-6 text-slate-600">
                  {applyPlan.intro}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center gap-2">
                  <strong className="text-sm">应用前确认：将新增以下课程</strong>
                  <Badge variant="secondary">
                    {applyPlan.additions.length} 门 · 保留当前已选
                    {selectedCourses.length} 门
                  </Badge>
                </div>
                {applyPlan.additions.map((addition) => (
                  <div
                    className="border-t border-slate-100 py-2 text-sm"
                    key={addition.course.id}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-1">
                      <span className="font-semibold text-slate-800">
                        {addition.course.name}
                      </span>
                      <span className="text-slate-500">
                        {addition.course.category} ·{' '}
                        {formatCredits(addition.course.credits)} 学分 ·{' '}
                        {addition.course.schedules[0]?.periodText ||
                          '时间待定'}
                      </span>
                    </div>
                    {addition.reasons.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs leading-5 text-slate-500">
                        {addition.reasons.map((reason) => (
                          <li key={reason}>· {reason}</li>
                        ))}
                      </ul>
                    )}
                    {addition.sectionNote && (
                      <p className="mt-1 text-xs text-blue-700">
                        {addition.sectionNote}
                      </p>
                    )}
                  </div>
                ))}
                {applyPlan.notes.length > 0 && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                    {applyPlan.notes.join(' ')}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  onClick={() => setApplyPlan(null)}
                  variant="outline"
                >
                  返回方案列表
                </Button>
                <Button onClick={() => applyGeneratedPlan(applyPlan)}>
                  <CheckCircle2 /> 确认应用（可撤销）
                </Button>
              </div>
            </div>
          ) : (
            <>
              {smartPlans.some((plan) => !plan.empty) ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {smartPlans
                    .filter((plan) => !plan.empty)
                    .map((plan) => (
                      <div
                        className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                        key={plan.mode}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <strong>{plan.name}</strong>
                          <Badge variant="secondary">
                            +{plan.additions.length} 门
                          </Badge>
                        </div>
                        <p className="text-xs leading-5 text-slate-500">
                          {plan.intro}
                        </p>
                        <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                          <span className="block">
                            总学分 {formatCredits(plan.metrics.totalCredits)} ·{' '}
                            有效{' '}
                            {formatCredits(plan.metrics.effectiveCredits)}
                          </span>
                          <span className="block">
                            专业学位{' '}
                            {formatCredits(plan.metrics.professionalDegreeCredits)}
                            {plan.metrics.degreeCourseCreditsTarget !== null &&
                              ` / ${plan.metrics.degreeCourseCreditsTarget}`}
                          </span>
                          <span className="block">
                            核心{' '}
                            {plan.metrics.coreMinimum === null
                              ? `${plan.metrics.coreCount} 门`
                              : `${plan.metrics.coreCount}/${plan.metrics.coreMinimum} 门`}
                            · 专业{' '}
                            {plan.metrics.professionalMinimum === null
                              ? `${plan.metrics.professionalCount} 门`
                              : `${plan.metrics.professionalCount}/${plan.metrics.professionalMinimum} 门`}
                          </span>
                          <span className="block">
                            公共选修体系{' '}
                            {plan.metrics.publicElectiveCredits}
                            {plan.metrics.publicElectiveTarget !== null &&
                              ` / ${plan.metrics.publicElectiveTarget}`}
                            {plan.metrics.innovationTarget !== null &&
                              `（创新 ${plan.metrics.innovationCredits}/${plan.metrics.innovationTarget}）`}
                          </span>
                          <span className="block">
                            周末课 {plan.metrics.weekendCourses} · 闭卷{' '}
                            {plan.metrics.closedExams} · 报告{' '}
                            {plan.metrics.reportCourses} · 长课时{' '}
                            {plan.metrics.longSessions} · 待确认时间{' '}
                            {plan.metrics.pendingTimeCourses}
                          </span>
                        </div>
                        <div className="mt-2 flex-1 space-y-1 border-t border-slate-100 pt-2">
                          {plan.additions.map((addition) => (
                            <p
                              className="text-xs leading-5 text-slate-700"
                              key={addition.course.id}
                            >
                              <strong>{addition.course.name}</strong>
                              <span className="text-slate-400">
                                {' '}
                                · {formatCredits(addition.course.credits)} 学分
                              </span>
                            </p>
                          ))}
                        </div>
                        {plan.notes.length > 0 && (
                          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-800">
                            {plan.notes.join(' ')}
                          </p>
                        )}
                        <Button
                          className="mt-3 h-9 rounded-lg"
                          onClick={() => setApplyPlan(plan)}
                          size="sm"
                        >
                          预览与确认
                        </Button>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="recommendation-empty">
                  当前没有可推荐的补充课程。已满足本学期硬性要求时，可考虑在后续学期继续完成培养方案缺口；计划课程的开设以春季正式课表为准。
                </div>
              )}

              {(smartRecommendation?.candidates.length ?? 0) > 0 && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="size-4 text-blue-600" />
                    <strong className="text-sm">候选课程（供手动挑选）</strong>
                  </div>
                  <div className="space-y-2">
                    {smartRecommendation!.candidates
                      .slice(0, 8)
                      .map(({ course }) => (
                        <div
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2"
                          key={course.id}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 text-sm">
                              <strong>{course.name}</strong>
                              {course.scheduleStatus === 'planned' && (
                                <Badge
                                  className="bg-teal-50 text-teal-700"
                                  variant="secondary"
                                >
                                  春季计划
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {course.category} ·{' '}
                              {formatCredits(course.credits)} 学分 ·{' '}
                              {course.schedules[0]?.periodText || '时间待定'}
                            </p>
                          </div>
                          <Button
                            className="h-9 shrink-0 rounded-lg"
                            onClick={() => toggleCourse(course.id)}
                            size="sm"
                            variant="outline"
                          >
                            <Plus /> 加入
                          </Button>
                        </div>
                      ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-slate-400">
                    候选已按培养缺口、时间冲突、重复班次与名额过滤；仅列出部分供参考。
                  </p>
                </div>
              )}
            </>
          )}

          <DialogFooter>
            <Button
              onClick={() => {
                setApplyPlan(null);
                setRecommendationDialogOpen(false);
              }}
              variant="outline"
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={timetableOpen} onOpenChange={setTimetableOpen}>
        <DialogContent
          className="flex min-w-0 flex-col w-[min(94vw,1520px)] max-w-none sm:max-w-none max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>我的模拟课程表</DialogTitle>
            <DialogDescription>
              共 {selectedCourses.length} 门课程 · 预选方案合计{' '}
              {formatCredits(selectedCredits)} 学分
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-slate-500">
              桌面端横向滚动可查看完整一周；点击课程块可查看课程详情。
            </p>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              查看周次
              <NativeSelect
                aria-label="查看周次"
                className="min-w-28 [&>select]:h-10"
                onChange={(event) => setWeek(Number(event.target.value))}
                value={week}
              >
                {Array.from(
                  { length: 20 },
                  (_, index) => index + 1,
                ).map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    第 {value} 周
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          </div>

          {selectedCourses.length ? (
            <div className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              {currentWeekConflicts.size > 0 && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <Zap className="size-4" /> 本周有{' '}
                  {currentWeekConflicts.size}{' '}
                  门课程时间重叠，已用红色标出。
                </div>
              )}
              <div className="w-full min-w-0 overflow-x-auto pb-2">
                <div className="timetable-grid">
                  <div className="timetable-corner">节次</div>
                  {DAYS.map((label, index) => (
                    <div
                      className="timetable-day"
                      key={label}
                      style={{ gridColumn: index + 2, gridRow: 1 }}
                    >
                      {label}
                    </div>
                  ))}
                  {Array.from(
                    { length: 13 },
                    (_, index) => index + 1,
                  ).map((period) => (
                    <div
                      className="timetable-period"
                      key={period}
                      style={{ gridColumn: 1, gridRow: period + 1 }}
                    >
                      <strong>{period}</strong>
                      <span>第 {period} 节</span>
                    </div>
                  ))}
                  {DAYS.flatMap((_, dayIndex) =>
                    Array.from(
                      { length: 13 },
                      (_, index) => index + 1,
                    ).map((period) => (
                      <div
                        className="timetable-cell"
                        key={`${dayIndex}-${period}`}
                        style={{
                          gridColumn: dayIndex + 2,
                          gridRow: period + 1,
                        }}
                      />
                    )),
                  )}
                  {selectedCourses.flatMap((course) =>
                    course.schedules
                      .filter((schedule) =>
                        schedule.weeks.includes(week),
                      )
                      .map((schedule, scheduleIndex) => {
                        const color = courseColor(course.id);
                        const conflict = currentWeekConflicts.has(
                          course.id,
                        );
                        return (
                          <button
                            className={`timetable-course ${conflict ? 'timetable-course-conflict' : ''}`}
                            key={`${course.id}-${scheduleIndex}`}
                            onClick={() => setDetailCourse(course)}
                            style={{
                              gridColumn: schedule.dayIndex + 2,
                              gridRow: `${schedule.start + 1} / ${schedule.end + 2}`,
                              backgroundColor: conflict
                                ? '#ffe4e6'
                                : color[0],
                              borderColor: conflict
                                ? '#e11d48'
                                : color[1],
                              color: conflict ? '#9f1239' : color[1],
                            }}
                            type="button"
                          >
                            <strong>{course.name}</strong>
                            <span>{schedule.room}</span>
                          </button>
                        );
                      }),
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <CalendarDays />
              <h3>课表还是空的</h3>
              <p>回到课程列表，点击课程卡片右上角的星标即可加入。</p>
              <Button
                onClick={() => {
                  setTimetableOpen(false);
                  setView('courses');
                }}
              >
                去选择课程
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Sheet
        onOpenChange={(open) => {
          if (!open) setDetailCourse(null);
        }}
        open={Boolean(detailCourse)}
      >
        <SheetContent className="w-full max-w-xl overflow-y-auto border-l-slate-200 bg-white p-0 sm:max-w-xl">
          {detailCourse && (
            <>
              <SheetHeader className="border-b border-slate-100 p-6 pr-14">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge
                    className="bg-blue-50 text-blue-700"
                    variant="secondary"
                  >
                    {detailCourse.category}
                  </Badge>
                  <Badge
                    className="bg-teal-50 text-teal-700"
                    variant="secondary"
                  >
                    {getCourseRequirementTypeLabel(
                      getCourseRequirementType(
                        detailCourse,
                        selectedIds.includes(detailCourse.id)
                          ? courseDesignation(detailCourse)
                          : getCourseDesignation(detailCourse, {}, activePlan),
                        activePlan,
                      ),
                    )}
                  </Badge>
                  {isInnovationCourse(detailCourse) && (
                    <Badge
                      className="bg-fuchsia-50 text-fuchsia-700"
                      variant="secondary"
                    >
                      创新创业课
                    </Badge>
                  )}
                  {detailCourse.scheduleStatus === 'planned' && (
                    <Badge
                      className="bg-teal-50 text-teal-700"
                      variant="secondary"
                    >
                      春季计划课程
                    </Badge>
                  )}
                  <Badge variant="outline">{detailCourse.level}</Badge>
                  <Badge className="source-badge" variant="secondary">
                    <FileSpreadsheet />{' '}
                    {detailCourse.scheduleStatus === 'planned'
                      ? '2026—2027 培养方案 · 春季计划'
                      : isDefaultTerm
                        ? '2026 秋季课表数据'
                        : '当前学期课表数据'}
                  </Badge>
                </div>
                <SheetTitle className="text-2xl font-bold leading-tight">
                  {detailCourse.name}
                </SheetTitle>
                <SheetDescription>
                  {detailCourse.englishName ||
                    courseCodeDisplayText(detailCourse)}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 p-6">
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ['开课院系', detailCourse.college],
                      ['课程编码', courseCodeDisplayText(detailCourse)],
                      ['课程属性', detailCourse.category],
                      ['培养层次', detailCourse.level],
                      ['所属学科/专业', detailCourse.subject],
                      [
                        '课时/学分',
                        `${detailCourse.hours || '—'} 学时 / ${formatCredits(detailCourse.credits)} 学分`,
                      ],
                      [
                        '限选人数',
                        detailCourse.scheduleStatus === 'planned'
                          ? '待春季正式课表公布'
                          : detailCourse.capacity > 0
                            ? `${detailCourse.capacity} 人`
                            : '—',
                      ],
                      [
                        '教室',
                        [
                          ...new Set(
                            (detailCourse.schedules ?? [])
                              .map((schedule) => schedule.room)
                              .filter(Boolean),
                          ),
                        ].join('、') || '—',
                      ],
                      ['授课方式', detailCourse.teachingMode],
                      ['考试方式', detailCourse.examMode],
                      ['首席教授', detailCourse.chiefProfessor],
                      ['主讲教师', detailCourse.teacher],
                      ['助教', detailCourse.assistant],
                    ] as [string, string | undefined][]
                  ).map(([label, value]) => (
                    <div className="detail-field" key={label}>
                      <span>{label}</span>
                      <strong>{value || '—'}</strong>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="mb-3 flex items-center gap-2 font-bold">
                    <Clock3 className="size-4 text-blue-600" /> 上课安排
                  </h3>
                  <div className="space-y-2">
                    {detailCourse.schedules.length ? (
                      detailCourse.schedules.map((schedule, index) => (
                        <div
                          className="schedule-detail"
                          key={`${schedule.periodText}-${index}`}
                        >
                          <div>
                            <strong>{schedule.periodText}</strong>
                            <span>{schedule.weeksText}</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-slate-500">
                            <MapPin className="size-4" /> {schedule.room}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs leading-5 text-slate-500">
                        上课时间与地点待定，请以选课系统公布的最新安排为准。
                      </p>
                    )}
                  </div>
                </div>
                {selectedIds.includes(detailCourse.id) && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <label
                      className="text-sm font-semibold text-slate-700"
                      htmlFor="detail-course-designation"
                    >
                      学位课属性
                      <NativeSelect
                        aria-label={`设置${detailCourse.name}的学位课属性`}
                        className="mt-2 w-full [&>select]:h-10"
                        id="detail-course-designation"
                        onChange={(event) =>
                          setCourseDesignation(
                            detailCourse,
                            event.target.value as CourseDesignation,
                          )
                        }
                        value={courseDesignation(detailCourse)}
                      >
                        <NativeSelectOption
                          disabled={
                            getCourseRoleEligibility(detailCourse, activePlan)
                              .status === 'ineligible'
                          }
                          value="unset"
                        >
                          未确定
                        </NativeSelectOption>
                        <NativeSelectOption
                          disabled={
                            getCourseRoleEligibility(detailCourse, activePlan)
                              .status === 'ineligible'
                          }
                          value="degree"
                        >
                          学位课
                        </NativeSelectOption>
                        <NativeSelectOption value="non-degree">
                          非学位课
                        </NativeSelectOption>
                      </NativeSelect>
                    </label>
                    {getCourseRoleEligibility(detailCourse, activePlan)
                      .status !== 'eligible' && (
                      <p className="mt-2 text-xs leading-5 text-amber-700">
                        {
                          getCourseRoleEligibility(detailCourse, activePlan)
                            .reason
                        }
                      </p>
                    )}
                  </div>
                )}
                <Button
                  className="h-11 w-full rounded-xl"
                  onClick={() => toggleCourse(detailCourse.id)}
                  variant={
                    selectedIds.includes(detailCourse.id)
                      ? 'outline'
                      : 'default'
                  }
                >
                  <Star
                    className={
                      selectedIds.includes(detailCourse.id)
                        ? 'fill-current'
                        : ''
                    }
                  />
                  {selectedIds.includes(detailCourse.id)
                    ? '从已选中移除'
                    : '加入我的课表'}
                </Button>
                <div className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  开课校区：国科大杭州高等研究院。
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
