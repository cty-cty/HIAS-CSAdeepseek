/* oxlint-disable react/react-compiler -- 巨型客户端组件触发编译器整体 bail，PreserveManualMemo 全量误报；React Compiler 未实际启用 */
/* oxlint-enable 说明：其余文件仍启用该规则 */'use client';

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
  BarChart3,
  CalendarDays,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  Download,
  FileSpreadsheet,
  GraduationCap,
  History,
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
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';

import {
  type ConflictSlot,
  type Course,
  type CourseDataset,
  type DegreeRole,
  type RequirementBucketId,
  type Schedule,
  bucketForRole,
  categorizeRequirement,
  compactTermLabel,
  computeCourseRecommendations,
  courseBaseName,
  courseColorIndex,
  courseConflictsInWeek,
  courseDegreeRoleKind,
  courseMatchesSubject,
  courseSubjectDisplay,
  courseSubjectNames,
  coursesConflict,
  COURSE_CATEGORY_ORDER,
  csvCell,
  formatConflictSlot,
  formatCredits,
  getConflictSlots,
  isAcademicDegree,
  isCourse,
  isDegreeCourseInScope,
  isDegreeRoleSettable,
  isMasterEnglishCourseName,
  MASTER_ENGLISH_CREDITS,
  parseBackupPayload,
  parseCourseDataset,
  parseEarnedImport,
  templateWeekText,
} from '@/lib/course-tools';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import EnrollmentNotice from '@/app/enrollment-notice';
import { PROGRAM_PLANS } from '@/app/program-plans';
import { academicScopeMajors } from '@/app/major-map';

// 智能选课建议开关：置 true 开启（推荐算法见 lib/course-tools.ts）。
const SHOW_SMART_SUGGESTIONS = true;
const DEFAULT_TERM_ID = '2026-fall';
const DEFAULT_TERM_LABEL = '2026—2027学年(秋)第一学期';
// 当前学年后续学期（暂无数据，选到即显示"无课程数据"，可导入覆盖）
const EMPTY_TERMS: { id: string; label: string }[] = [
  { id: '2026-2027-spring', label: '2026—2027学年(春)第二学期' },
  { id: '2026-2027-summer', label: '2026—2027学年(夏)第三学期' },
];
const COURSE_DATASETS_STORAGE_KEY = 'hias-course-datasets-v1';
const ACTIVE_TERM_STORAGE_KEY = 'hias-active-term-v1';
const SELECTED_BY_TERM_STORAGE_KEY = 'hias-selected-by-term-v1';
const LEGACY_SELECTED_STORAGE_KEY = 'ucas-hangzhou-selected';
const EARNED_CREDITS_STORAGE_KEY = 'hias-earned-credits-v1';
const ENGLISH_EXEMPTION_STORAGE_KEY = 'hias-english-exempt-v1';
const DEGREE_ROLES_STORAGE_KEY = 'hias-degree-roles-v1';
const EMPTY_SELECTED_IDS: string[] = [];

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
const COURSE_COLORS = [
  ['#dff2ee', '#147d6f'],
  ['#e9e5fb', '#6251a4'],
  ['#ffe8dd', '#a85834'],
  ['#dceafb', '#326da8'],
  ['#f8edca', '#91701e'],
  ['#f3dfe9', '#9c4b72'],
];

// 移动端竖版卡片视图用：一门课程在某天的一个上课安排。
type WeekScheduleCard = {
  course: Course;
  schedule: Schedule;
  tone: string[];
  conflict: boolean;
};

function getExamBucket(examMode: string): ExamBucketId {
  if (/闭卷/.test(examMode)) return 'closed';
  if (/开卷/.test(examMode)) return 'open';
  if (/报告|论文|综述|汇报|大作业/.test(examMode)) return 'report';
  if (/实践|技能|实验|设计|作品|答辩/.test(examMode)) return 'practical';
  return 'other';
}

function safeSetItem(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function ScheduleLines({ schedules }: { schedules: Schedule[] }) {
  return (
    <div className="space-y-1.5">
      {schedules.map((schedule, index) => (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1"
          key={`${schedule.periodText}-${index}`}
        >
          <span className="font-medium text-slate-800">
            {schedule.periodText}
          </span>
          <span className="text-slate-500">{schedule.weeksText}</span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            <MapPin className="size-3.5" /> {schedule.room}
          </span>
        </div>
      ))}
    </div>
  );
}

type RequirementBucket = {
  id: RequirementBucketId;
  label: string;
  selected: number;
  earned: number;
  exempt?: number;
  required: number | null;
  hint: string;
  nullText: string;
  /** 专业学位课专属：已选学位课/待确认属性的门数与“来源集合”命中数。 */
  role?: {
    coreDegree: number;
    proDegree: number;
    fromDegree: number;
    pending: number;
  };
};

type DegreeRoleOption = 'degree' | 'nonDegree';

/**
 * 学位属性切换：学位课 / 非学位课 二选一，再次点击当前项可取消（回到待确认）。
 * 仅对“可设属性”的核心课/专业课展示；研讨/实验等强制非学位课不经过此控件。
 */
function DegreeRoleControl({
  value,
  onChange,
  compact = false,
}: {
  value: DegreeRole | null;
  onChange: (role: DegreeRole | null) => void;
  compact?: boolean;
}) {
  const options: { role: DegreeRoleOption; label: string }[] = [
    { role: 'degree', label: '学位课' },
    { role: 'nonDegree', label: '非学位课' },
  ];
  const cls = compact
    ? 'rounded-md px-1.5 py-0.5 text-[0.7rem]'
    : 'rounded-lg px-2.5 py-1 text-xs';
  return (
    <fieldset
      className="inline-flex items-center gap-1"
      aria-label="学位课属性"
    >
      <legend className="sr-only">学位课属性</legend>
      {options.map((option) => {
        const active = value === option.role;
        return (
          <button
            aria-pressed={active}
            className={`${cls} border font-medium transition ${
              active
                ? option.role === 'degree'
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-amber-500 bg-amber-500 text-white'
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
            key={option.role}
            onClick={() => onChange(active ? null : option.role)}
            type="button"
          >
            {active && <span className="mr-0.5" aria-hidden="true">✓ </span>}
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

type PlanSuggestion = {
  course: Course;
  gapLabel: string;
  reason: string;
  /** 该建议对应的需求桶（用于加入时自动设置学位属性）。 */
  bucket: RequirementBucketId;
};

type PlanGap = {
  label: string;
  remaining: number;
};

// 免修(英语) + 历史已修 + 本学期已选 的累计构成文案
function accumulatedComposition(
  exempt: number,
  earned: number,
  selected: number,
) {
  const parts: string[] = [];
  if (exempt > 0) parts.push(`英语免修 ${formatCredits(exempt)}`);
  if (earned > 0) parts.push(`已修 ${formatCredits(earned)}`);
  parts.push(`已选 ${formatCredits(selected)}`);
  return parts.join(' + ');
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
  const [query, setQuery] = useState('');
  const [college, setCollege] = useState('全部院系');
  const [subject, setSubject] = useState('全部学科/专业');
  const [category, setCategory] = useState('全部类别');
  const [day, setDay] = useState('全部星期');
  const [storageReady, setStorageReady] = useState(false);
  const [dataMessage, setDataMessage] = useState('');
  const [dataError, setDataError] = useState('');
  const [storageNotice, setStorageNotice] = useState('');
  const [earnedCredits, setEarnedCredits] = useState<Record<string, number>>(
    {},
  );
  const [englishExemption, setEnglishExemption] = useState(false);
  const [earnedMessage, setEarnedMessage] = useState('');
  const [earnedError, setEarnedError] = useState('');
  // 已选课程的“学位属性”标记：degree = 作为学位课，nonDegree = 作为非学位课。
  // 结构：{ [termId]: { [courseId]: DegreeRole } }，仅保存用户显式选择。
  const [degreeRolesByTerm, setDegreeRolesByTerm] = useState<
    Record<string, Record<string, DegreeRole>>
  >({});
  const earnedFileRef = useRef<HTMLInputElement>(null);
  const backupFileRef = useRef<HTMLInputElement>(null);
  const [onlySelected, setOnlySelected] = useState(false);
  const [onlyNoConflict, setOnlyNoConflict] = useState(false);
  const [view, setView] = useState<
    'courses' | 'guide' | 'notice' | 'exams' | 'timetable'
  >('guide');
  const [programPlanId, setProgramPlanId] = useState('optical-master');
  const [week, setWeek] = useState(2);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [detailCourse, setDetailCourse] = useState<Course | null>(null);
  const dataFileRef = useRef<HTMLInputElement>(null);
  const activeDataset = customDatasets.find(
    (dataset) => dataset.id === activeTermId,
  ) ?? {
    ...(EMPTY_TERMS.find((term) => term.id === activeTermId) ?? {
      id: DEFAULT_TERM_ID,
      label: DEFAULT_TERM_LABEL,
    }),
    courses:
      activeTermId === DEFAULT_TERM_ID ? defaultCourses : [],
    updatedAt: '',
  };
  const initialCourses = activeDataset.courses;
  const availableDatasets = useMemo(
    () => {
      const list: CourseDataset[] = [
        customDatasets.find((dataset) => dataset.id === DEFAULT_TERM_ID) ?? {
          id: DEFAULT_TERM_ID,
          label: DEFAULT_TERM_LABEL,
          courses: defaultCourses,
          updatedAt: '',
        },
      ];
      for (const term of EMPTY_TERMS) {
        list.push(
          customDatasets.find((dataset) => dataset.id === term.id) ?? {
            ...term,
            courses: [],
            updatedAt: '',
          },
        );
      }
      customDatasets.forEach((dataset) => {
        if (!list.some((item) => item.id === dataset.id)) list.push(dataset);
      });
      return list;
    },
    [customDatasets, defaultCourses],
  );
  const selectedIds = selectedByTerm[activeTermId] ?? EMPTY_SELECTED_IDS;
  const selectedIdsRef = useRef(selectedIds);

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
    const legacySelected = window.localStorage.getItem(
      LEGACY_SELECTED_STORAGE_KEY,
    );
    const storedEarned = window.localStorage.getItem(
      EARNED_CREDITS_STORAGE_KEY,
    );
    const storedEnglishExemption = window.localStorage.getItem(
      ENGLISH_EXEMPTION_STORAGE_KEY,
    );
    const storedDegreeRoles = window.localStorage.getItem(
      DEGREE_ROLES_STORAGE_KEY,
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
              dataset.courses.every(isCourse),
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

    let parsedEarned: Record<string, number> = {};
    if (storedEarned) {
      try {
        const parsed = JSON.parse(storedEarned);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsedEarned = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).filter(
              ([, credits]) =>
                typeof credits === 'number' &&
                Number.isFinite(credits) &&
                credits > 0,
            ),
          ) as Record<string, number>;
        }
      } catch {
        window.localStorage.removeItem(EARNED_CREDITS_STORAGE_KEY);
      }
    }

    let parsedDegreeRoles: Record<string, Record<string, DegreeRole>> = {};
    if (storedDegreeRoles) {
      try {
        const parsed = JSON.parse(storedDegreeRoles);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsedDegreeRoles = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).filter(
              ([, termRoles]) => {
                if (
                  !termRoles ||
                  typeof termRoles !== 'object' ||
                  Array.isArray(termRoles)
                ) {
                  return false;
                }
                return Object.values(
                  termRoles as Record<string, unknown>,
                ).every(
                  (role) => role === 'degree' || role === 'nonDegree',
                );
              },
            ),
          ) as Record<string, Record<string, DegreeRole>>;
        }
      } catch {
        window.localStorage.removeItem(DEGREE_ROLES_STORAGE_KEY);
      }
    }

    const nextActiveTerm =
      storedActiveTerm === DEFAULT_TERM_ID ||
      parsedDatasets.some((dataset) => dataset.id === storedActiveTerm)
        ? storedActiveTerm
        : DEFAULT_TERM_ID;
    queueMicrotask(() => {
      setCustomDatasets(parsedDatasets);
      setActiveTermId(nextActiveTerm ?? DEFAULT_TERM_ID);
      setSelectedByTerm(parsedSelections);
      setEarnedCredits(parsedEarned);
      setEnglishExemption(storedEnglishExemption === 'true');
      setDegreeRolesByTerm(parsedDegreeRoles);
      setStorageReady(true);
    });
  }, []);

  const storageFailureRef = useRef(false);
  const persistToStorage = useCallback((key: string, value: unknown) => {
    const ok = safeSetItem(key, value);
    const hadFailure = storageFailureRef.current;
    storageFailureRef.current = !ok;
    if (hadFailure && ok) {
      queueMicrotask(() => setStorageNotice(''));
    } else if (!ok) {
      queueMicrotask(() =>
        setStorageNotice(
          '浏览器本地存储写入失败（空间可能不足），最近的改动可能没有保存，请及时导出 CSV 备份选课结果。',
        ),
      );
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    persistToStorage(COURSE_DATASETS_STORAGE_KEY, customDatasets);
    persistToStorage(ACTIVE_TERM_STORAGE_KEY, activeTermId);
  }, [activeTermId, customDatasets, persistToStorage, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    persistToStorage(SELECTED_BY_TERM_STORAGE_KEY, selectedByTerm);
  }, [persistToStorage, selectedByTerm, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    persistToStorage(DEGREE_ROLES_STORAGE_KEY, degreeRolesByTerm);
  }, [degreeRolesByTerm, persistToStorage, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    persistToStorage(EARNED_CREDITS_STORAGE_KEY, earnedCredits);
  }, [earnedCredits, persistToStorage, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    persistToStorage(ENGLISH_EXEMPTION_STORAGE_KEY, englishExemption);
  }, [englishExemption, persistToStorage, storageReady]);

  const [showBackTop, setShowBackTop] = useState(false);
  const backTopShownRef = useRef(false);
  useEffect(() => {
    const onScroll = () => {
      const shown = window.scrollY > 560;
      if (shown !== backTopShownRef.current) {
        backTopShownRef.current = shown;
        setShowBackTop(shown);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

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
        ? { ...parsedDataset, id: activeTermId, label: activeDataset.label }
        : parsedDataset;
      const sameTermReimport = dataset.id in selectedByTerm;
      const previousIds = selectedByTerm[dataset.id] ?? EMPTY_SELECTED_IDS;
      const validIds = new Set(dataset.courses.map((item) => item.id));
      const keptIds = sameTermReimport
        ? previousIds.filter((id) => validIds.has(id))
        : [];
      const droppedCount = previousIds.length - keptIds.length;
      setCustomDatasets((current) => [
        ...current.filter((item) => item.id !== dataset.id),
        dataset,
      ]);
      setActiveTermId(dataset.id);
      setSelectedByTerm((current) => {
        if (!(dataset.id in current)) {
          return { ...current, [dataset.id]: [] };
        }
        const existing = current[dataset.id] ?? [];
        const kept = existing.filter((id) => validIds.has(id));
        return kept.length === existing.length
          ? current
          : { ...current, [dataset.id]: kept };
      });
      clearFilters();
      setDetailCourse(null);
      const resultSuffix = !sameTermReimport
        ? '；该学期的已选课程已单独保存'
        : previousIds.length === 0
          ? '；该学期还没有已选课程'
          : `；保留 ${keptIds.length} 门仍在课程表中的已选课程` +
            (droppedCount > 0
              ? `，移除 ${droppedCount} 门已不在课表中的课程`
              : '');
      setDataMessage(
        `已加载“${dataset.label}”的 ${dataset.courses.length} 门课程${resultSuffix}。`,
      );
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : '课程数据读取失败，请检查文件格式。',
      );
    }
  }

  async function handleEarnedImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setEarnedError('');
    setEarnedMessage('');
    try {
      const parsed = parseEarnedImport(await file.text());
      const totalImported = Object.values(parsed).reduce(
        (sum, credits) => sum + credits,
        0,
      );
      setEarnedCredits((current) => {
        const next = { ...current };
        Object.entries(parsed).forEach(([category, credits]) => {
          next[category] = (next[category] ?? 0) + credits;
        });
        return next;
      });
      const detail = Object.entries(parsed)
        .map(([category, credits]) => `${category} ${formatCredits(credits)}`)
        .join('、');
      setEarnedMessage(
        `已累计导入 ${formatCredits(totalImported)} 学分（${detail}），已计入上方达成度进度。`,
      );
    } catch (error) {
      setEarnedError(
        error instanceof Error
          ? error.message
          : '已修学分数据读取失败，请检查文件格式。',
      );
    }
  }

  function updateEarnedCategory(category: string, raw: string) {
    const credits = Number(raw);
    setEarnedCredits((current) => {
      const next = { ...current };
      if (raw.trim() !== '' && Number.isFinite(credits) && credits > 0) {
        next[category] = Math.round(credits * 100) / 100;
      } else {
        delete next[category];
      }
      return next;
    });
  }

  function clearEarned() {
    if (!earnedTotal) return;
    const confirmed = window.confirm('确定清空全部历史已修学分记录吗？');
    if (!confirmed) return;
    setEarnedCredits({});
    setEarnedMessage('');
    setEarnedError('');
  }

  function toggleEnglishExemption() {
    const next = !englishExemption;
    setEnglishExemption(next);
    if (next) {
      const removedIds = selectedCourses
        .filter((course) => isMasterEnglishCourseName(course.name))
        .map((course) => course.id);
      if (removedIds.length) {
        setSelectedIdsForActive((current) =>
          current.filter((id) => !removedIds.includes(id)),
        );
        setDataMessage(
          `已开启硕士学位英语免修免考，自动移除了 ${removedIds.length} 门英语班级课程，公共必修按已获 3 学分计算。`,
        );
      } else {
        setDataMessage(
          '已开启硕士学位英语免修免考：公共必修课按已获 3 学分计算，英语班级课程不再进入排课推荐。',
        );
      }
    } else {
      setDataMessage('已关闭硕士学位英语免修免考。');
    }
  }

  function exportBackup() {
    const payload = {
      app: 'hias-csadeepseek',
      version: 2,
      exportedAt: new Date().toISOString(),
      activeTermId,
      selectedByTerm,
      earnedCredits,
      customDatasets,
      englishExemption,
      degreeRoles: degreeRolesByTerm,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `HIAS-CSAdeepseek-数据备份-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleBackupRestore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setDataError('');
    setDataMessage('');
    setEarnedError('');
    setEarnedMessage('');
    try {
      const backup = parseBackupPayload(await file.text());
      const selectedCount = Object.values(backup.selectedByTerm).reduce(
        (sum, ids) => sum + ids.length,
        0,
      );
      const earnedSum = Object.values(backup.earnedCredits).reduce(
        (sum, credits) => sum + credits,
        0,
      );
      const confirmed = window.confirm(
        `备份内容：${backup.customDatasets.length} 套学期数据、${selectedCount} 门已选课程、${formatCredits(earnedSum)} 已修学分${backup.englishExemption ? '、英语免修已开启' : ''}。恢复将覆盖当前浏览器中的全部本地数据，确定继续吗？`,
      );
      if (!confirmed) return;
      const nextActiveTerm =
        backup.activeTermId !== null &&
        (backup.activeTermId === DEFAULT_TERM_ID ||
          backup.customDatasets.some(
            (dataset) => dataset.id === backup.activeTermId,
          ))
          ? backup.activeTermId
          : DEFAULT_TERM_ID;
      setCustomDatasets(backup.customDatasets);
      setActiveTermId(nextActiveTerm);
      setSelectedByTerm(backup.selectedByTerm);
      setEarnedCredits(backup.earnedCredits);
      setEnglishExemption(backup.englishExemption);
      setDegreeRolesByTerm(backup.degreeRoles);
      clearFilters();
      setDetailCourse(null);
      setDataMessage(
        '备份已恢复：学期数据、选课记录、已修学分、学位属性与英语免修状态均已更新。',
      );
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : '备份恢复失败，请检查文件格式。',
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
    const frame = window.requestAnimationFrame(() => setVisibleCount(PAGE_SIZE));
    return () => window.cancelAnimationFrame(frame);
  }, [query, college, subject, category, day, onlySelected, onlyNoConflict]);

  const colleges = useMemo(
    () => [...new Set(initialCourses.map((course) => course.college))].sort(),
    [initialCourses],
  );
  const categories = useMemo(
    () => [...new Set(initialCourses.map((course) => course.category))].sort(),
    [initialCourses],
  );
  const subjects = useMemo(
    () =>
      [...new Set(initialCourses.flatMap((course) => courseSubjectNames(course)))].sort(),
    [initialCourses],
  );
  const selectedCourses = useMemo(
    () => initialCourses.filter((course) => selectedIds.includes(course.id)),
    [initialCourses, selectedIds],
  );
  const selectedCredits = selectedCourses.reduce(
    (sum, course) => sum + course.credits,
    0,
  );
  const selectedCreditBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    selectedCourses.forEach((course) => {
      totals.set(
        course.category,
        (totals.get(course.category) ?? 0) + course.credits,
      );
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]);
  }, [selectedCourses]);
  const activePlan =
    PROGRAM_PLANS.find((plan) => plan.id === programPlanId) ?? PROGRAM_PLANS[0];
  // 创新创业模块课的归属取决于培养方向：专硕单列为“创新创业课”1 学分；
  // 学硕/博士未单列时，它们仍属公共选修课学分。
  const planSeparatesInnovation = activePlan.innovationCredits !== null;
  // 本方向“可作为专业学位课”的范围：
  // - 培养方案课程库（coreCourses ∪ professionalCourses）始终允许；
  // - 学术型（学硕/博士）额外允许“一级学科及其映射内所属二级学科”的课程；
  // - 专硕只允许本专业培养方案课程（academicMajors 传空）。
  const degreeCourseScope = useMemo(
    () => ({
      planCourses: [
        ...activePlan.coreCourses,
        ...activePlan.professionalCourses,
      ],
      academicMajors: isAcademicDegree(activePlan.degree)
        ? academicScopeMajors(activePlan.program)
        : [],
      academic: isAcademicDegree(activePlan.degree),
    }),
    [activePlan],
  );
  const canUseAsDegreeCourse = useCallback(
    (course: Course) =>
      isDegreeRoleSettable(course.category) &&
      isDegreeCourseInScope(course, degreeCourseScope),
    [degreeCourseScope],
  );
  // 已选课程的学位属性（仅保存用户显式设置；未设置为 null）
  const degreeRolesOfTerm = useMemo(
    () => degreeRolesByTerm[activeTermId] ?? {},
    [activeTermId, degreeRolesByTerm],
  );
  const degreeRoleOf = useCallback(
    (course: Course): DegreeRole | null => {
      const kind = courseDegreeRoleKind(course);
      if (kind === 'forcedNonDegree') return 'nonDegree';
      if (kind === 'none') return null;
      // 核心课/专业课：若不在本方向可作学位课的范围（如专硕选了外专业课程），
      // 只允许作为非学位课，防止误计入学分。
      if (!canUseAsDegreeCourse(course)) return 'nonDegree';
      return degreeRolesOfTerm[course.id] ?? null;
    },
    [canUseAsDegreeCourse, degreeRolesOfTerm],
  );
  const setDegreeRoleForActive = useCallback(
    (courseId: string, role: DegreeRole | null) => {
      setDegreeRolesByTerm((current) => {
        const currentRoles = current[activeTermId];
        const termRoles = currentRoles ? { ...currentRoles } : {};
        if (role === null) {
          delete termRoles[courseId];
        } else {
          termRoles[courseId] = role;
        }
        return { ...current, [activeTermId]: termRoles };
      });
    },
    [activeTermId],
  );
  // 已选课程的桶：核心课/专业课按 degreeRole 归入学位/非学位桶；未设置返回 null（提示确认）。
  const bucketOfSelectedCourse = useCallback(
    (course: Course): RequirementBucketId | null =>
      bucketForRole(
        course.category,
        course.name,
        degreeRoleOf(course),
        planSeparatesInnovation,
      ),
    [degreeRoleOf, planSeparatesInnovation],
  );
  const bucketOfEarnedCategory = useCallback(
    (category: string): RequirementBucketId => {
      const bucket = categorizeRequirement(category);
      return bucket === 'innovation' && !planSeparatesInnovation
        ? 'publicElective'
        : bucket;
    },
    [planSeparatesInnovation],
  );
  // 方案课程名单按去班号后的基础名匹配课程（与推荐引擎口径一致，兼容“XX-01班”）
  const planCoreBaseNames = useMemo(
    () => new Set(activePlan.coreCourses.map((name) => courseBaseName(name))),
    [activePlan],
  );
  const planProBaseNames = useMemo(
    () =>
      new Set(activePlan.professionalCourses.map((name) => courseBaseName(name))),
    [activePlan],
  );
  const planCoreFromBaseNames = useMemo(
    () =>
      new Set((activePlan.coreFrom ?? []).map((name) => courseBaseName(name))),
    [activePlan],
  );
  const isPlanCoreName = useCallback(
    (name: string) => planCoreBaseNames.has(courseBaseName(name)),
    [planCoreBaseNames],
  );
  const isPlanProName = useCallback(
    (name: string) => planProBaseNames.has(courseBaseName(name)),
    [planProBaseNames],
  );
  const isPlanCoreFromName = useCallback(
    (name: string) => planCoreFromBaseNames.has(courseBaseName(name)),
    [planCoreFromBaseNames],
  );
  const planCoreCourses = useMemo(
    () => initialCourses.filter((course) => isPlanCoreName(course.name)),
    [initialCourses, isPlanCoreName],
  );
  const planProfessionalCourses = useMemo(
    () => initialCourses.filter((course) => isPlanProName(course.name)),
    [initialCourses, isPlanProName],
  );
  const selectedPlanCoreCount = selectedCourses.filter((course) =>
    isPlanCoreName(course.name),
  ).length;
  const selectedPlanProfessionalCount = selectedCourses.filter((course) =>
    isPlanProName(course.name),
  ).length;
  const selectedPlanCredits = selectedCourses
    .filter(
      (course) =>
        isPlanCoreName(course.name) || isPlanProName(course.name),
    )
    .reduce((sum, course) => sum + course.credits, 0);
  const earnedTotal = Object.values(earnedCredits).reduce(
    (sum, credits) => sum + credits,
    0,
  );
  const englishExemptCredits = englishExemption
    ? MASTER_ENGLISH_CREDITS
    : 0;
  const effectiveEarnedTotal = earnedTotal + englishExemptCredits;
  const effectiveAccumulatedCredits =
    effectiveEarnedTotal + selectedCredits;
  const earnedByBucket = useMemo(() => {
    const totals = new Map<RequirementBucketId, number>();
    Object.entries(earnedCredits).forEach(([category, credits]) => {
      const bucket = bucketOfEarnedCategory(category);
      totals.set(bucket, (totals.get(bucket) ?? 0) + credits);
    });
    return totals;
  }, [bucketOfEarnedCategory, earnedCredits]);
  const requirementBuckets = useMemo<RequirementBucket[]>(() => {
    const selectedByBucket = new Map<RequirementBucketId, number>();
    // 已选且“学位属性未确认”的核心课/专业课（不计入任何学位桶，需界面提示）。
    const pendingRoleCourses: Course[] = [];
    // 学位课相关门数（只计 degreeRole==='degree' 的课程）
    let coreDegree = 0;
    let proDegree = 0;
    let fromDegree = 0;
    selectedCourses.forEach((course) => {
      const bucket = bucketOfSelectedCourse(course);
      if (bucket === null) {
        if (isDegreeRoleSettable(course.category)) pendingRoleCourses.push(course);
        return;
      }
      selectedByBucket.set(
        bucket,
        (selectedByBucket.get(bucket) ?? 0) + course.credits,
      );
      if (bucket === 'degree') {
        if (isPlanCoreName(course.name)) {
          coreDegree += 1;
          if (isPlanCoreFromName(course.name)) fromDegree += 1;
        } else if (isPlanProName(course.name)) {
          proDegree += 1;
        }
      }
    });
    const selected = (id: RequirementBucketId) =>
      selectedByBucket.get(id) ?? 0;
    const earned = (id: RequirementBucketId) => earnedByBucket.get(id) ?? 0;
    const buckets: RequirementBucket[] = [
      {
        id: 'publicRequired',
        label: '公共必修课',
        selected: selected('publicRequired'),
        earned: earned('publicRequired'),
        exempt: englishExemptCredits,
        required: activePlan.publicRequiredCredits,
        hint: '',
        nullText: '不限',
      },
      {
        id: 'degree',
        label: '专业学位课',
        selected: selected('degree'),
        earned: earned('degree'),
        required: activePlan.degreeCourseCredits,
        hint:
          activePlan.coreMinimum === null && activePlan.professionalMinimum === null
            ? isAcademicDegree(activePlan.degree)
              ? '学位课须为培养方案核心课/专业课，或本一级学科/所属二级学科课程，并勾选“作为学位课”'
              : '学位课仅限本专业培养方案核心课/专业课，并勾选“作为学位课”'
            : `其中至少 ${activePlan.coreMinimum} 门核心课、${activePlan.professionalMinimum} 门专业课`,
        nullText: '不限',
        role: { coreDegree, proDegree, fromDegree, pending: pendingRoleCourses.length },
      },
      {
        id: 'professionalNonDegree',
        label: '专业非学位课',
        selected: selected('professionalNonDegree'),
        earned: earned('professionalNonDegree'),
        required: activePlan.professionalNonDegreeCredits,
        hint: '含研讨课、实验课及被标记为“非学位课”的核心课/专业课',
        nullText: '不限',
      },
      {
        id: 'publicElective',
        label: '公共选修课',
        selected: selected('publicElective'),
        earned: earned('publicElective'),
        required: activePlan.publicElectiveCredits,
        hint: planSeparatesInnovation
          ? '创新创业模块课程按下方单项另计'
          : '创新创业模块课程计入公共选修学分',
        nullText: '不限',
      },
    ];
    if (planSeparatesInnovation) {
      buckets.push({
        id: 'innovation',
        label: '创新创业课',
        selected: selected('innovation'),
        earned: earned('innovation'),
        required: activePlan.innovationCredits,
        hint: '如《创业管理》《创业启程》等，属性为公共选修课',
        nullText: '未单列',
      });
    }
    if (selected('other') + earned('other') > 0) {
      buckets.push({
        id: 'other',
        label: '未归类课程',
        selected: selected('other'),
        earned: earned('other'),
        required: null,
        hint: '课程属性未匹配到上述类别',
        nullText: '未计入',
      });
    }
    return buckets;
  }, [
    activePlan,
    bucketOfSelectedCourse,
    earnedByBucket,
    englishExemptCredits,
    isPlanCoreFromName,
    isPlanCoreName,
    isPlanProName,
    planSeparatesInnovation,
    selectedCourses,
  ]);
  const suggestions = useMemo<{
    rows: PlanSuggestion[];
    unsatisfied: PlanGap[];
    degreeRolePending: number;
  }>(() => {
    const degreeRolesMap: Record<string, DegreeRole | null> = {};
    selectedCourses.forEach((course) => {
      degreeRolesMap[course.id] = degreeRoleOf(course);
    });
    const result = computeCourseRecommendations({
      courses: initialCourses,
      selectedCourses,
      selectedIds,
      earnedByBucket: Object.fromEntries(earnedByBucket) as Record<
        RequirementBucketId,
        number
      >,
      degreeRoles: degreeRolesMap,
      plan: {
        coreCourses: activePlan.coreCourses,
        professionalCourses: activePlan.professionalCourses,
        coreMinimum: activePlan.coreMinimum,
        professionalMinimum: activePlan.professionalMinimum,
        degreeCourseCredits: activePlan.degreeCourseCredits,
        professionalNonDegreeCredits:
          activePlan.professionalNonDegreeCredits,
        publicRequiredCredits: activePlan.publicRequiredCredits,
        publicElectiveCredits: activePlan.publicElectiveCredits,
        innovationCredits: activePlan.innovationCredits,
        homeCollege: activePlan.homeCollege ?? '',
        coreFrom: activePlan.coreFrom,
        // 学术型把一级/二级学科范围传给推荐，专硕为空（仅培养方案课程库）
        degreeMajors: degreeCourseScope.academic
          ? degreeCourseScope.academicMajors
          : [],
      },
      englishExemption,
    });
    const labelOf = (bucket: RequirementBucketId) =>
      requirementBuckets.find((b) => b.id === bucket)?.label ?? bucket;
    return {
      rows: result.rows.map((r) => ({
        course: r.course,
        gapLabel: labelOf(r.bucket),
        reason: r.reason,
        bucket: r.bucket,
      })),
      unsatisfied: result.unsatisfied.map((u) => ({
        label: u.label,
        remaining: u.remaining,
      })),
      degreeRolePending: result.degreeRolePendingCount,
    };
  }, [
    activePlan,
    degreeCourseScope,
    degreeRoleOf,
    earnedByBucket,
    englishExemption,
    initialCourses,
    requirementBuckets,
    selectedCourses,
    selectedIds,
  ]);
  const degreeBucket = requirementBuckets.find(
    (bucket) => bucket.id === 'degree',
  );
  // 已选但尚未设置学位属性的核心课/专业课（引导用户逐个确认，设置后立即计入统计）
  const pendingDegreeRoleCourses = useMemo(
    () =>
      selectedCourses.filter(
        (course) =>
          isDegreeRoleSettable(course.category) && degreeRoleOf(course) === null,
      ),
    [degreeRoleOf, selectedCourses],
  );
  const graduationPercent = Math.min(
    100,
    Math.round(
      (effectiveAccumulatedCredits / activePlan.totalCredits) * 100,
    ),
  );
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

  // 移动端竖版卡片视图：只取“第 week 周有课”的安排，按星期分组并按时段排序。
  const weekSchedulesByDay = useMemo(() => {
    const grouped: WeekScheduleCard[][] = DAYS.map(() => []);
    selectedCourses.forEach((course) => {
      const tone = COURSE_COLORS[courseColorIndex(course.id, COURSE_COLORS.length)];
      const conflict = currentWeekConflicts.has(course.id);
      course.schedules.forEach((schedule) => {
        if (!schedule.weeks.includes(week)) return;
        grouped[schedule.dayIndex]?.push({ course, schedule, tone, conflict });
      });
    });
    grouped.forEach((cards) =>
      cards.sort(
        (left, right) =>
          left.schedule.start - right.schedule.start ||
          left.schedule.end - right.schedule.end,
      ),
    );
    return grouped;
  }, [currentWeekConflicts, selectedCourses, week]);

  const filteredCourses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return initialCourses.filter((course) => {
      const matchesQuery =
        !normalized ||
        [
          course.name,
          course.englishName,
          course.code,
          course.teacher,
          course.college,
          course.subject,
          ...courseSubjectNames(course),
          ...course.schedules.map((schedule) => schedule.room),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalized);
      const matchesCollege =
        college === '全部院系' || course.college === college;
      const matchesSubject = courseMatchesSubject(course, subject);
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
            selected.id === course.id || !coursesConflict(course, selected),
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

  function toggleCourse(id: string) {
    setSelectedIdsForActive((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    // 取消选择时同步清空该课程的学位属性标记，避免再次加入后残留旧属性。
    if (selectedIds.includes(id)) {
      setDegreeRoleForActive(id, null);
    }
  }

  // 从智能建议加入：若课程可设学位属性，则按建议桶自动标记。
  function joinSuggestedCourse(course: Course, bucket: RequirementBucketId) {
    const willBeSelected = !selectedIds.includes(course.id);
    toggleCourse(course.id);
    if (willBeSelected && isDegreeRoleSettable(course.category)) {
      const role =
        bucket === 'degree'
          ? 'degree'
          : bucket === 'professionalNonDegree'
            ? 'nonDegree'
            : null;
      if (role) setDegreeRoleForActive(course.id, role);
    }
  }

  function replaceCourse(sourceId: string, replacementId: string) {
    setSelectedIdsForActive((current) => [
      ...current.filter((id) => id !== sourceId && id !== replacementId),
      replacementId,
    ]);
  }

  function getConflictAlternatives(source: Course) {
    const baseName = courseBaseName(source.name);
    return initialCourses.filter((candidate) => {
      if (
        candidate.id === source.id ||
        courseBaseName(candidate.name) !== baseName
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
    clearFilters();
    setDetailCourse(null);
    setDataError('');
    setDataMessage('');
  }

  function clearSelectedCourses() {
    if (!selectedCourses.length) return;
    const confirmed = window.confirm(
      '确定清空“' + activeDataset.label + '”的全部已选课程吗？',
    );
    if (!confirmed) return;
    setSelectedIdsForActive([]);
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

  return (
    <main className="min-h-screen overflow-x-clip bg-[#f7f7f2] text-slate-900">
      <div className="mx-auto max-w-[1380px] px-3 py-4 sm:px-5 lg:px-7">
        <section className="hero-panel relative overflow-hidden rounded-[26px] border border-[#dce5de] px-5 py-6 shadow-[0_22px_65px_rgba(61,83,72,.10)] sm:px-8 sm:py-7">
          <div className="hero-blob hero-blob-a" aria-hidden="true" />
          <div className="hero-blob hero-blob-b" aria-hidden="true" />
          <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-stretch">
            <div>
              <div className="brand-lockup">
                <div aria-hidden="true" className="brand-mark">
                  HIAS-CSAdeepseek
                </div>
                <span>研究生预选课辅助工具</span>
              </div>
              <p className="mb-3.5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#bfe8dd]">
                <span className="inline-block size-1.5 rounded-full bg-[#7ad3bd]" />
                {compactTermLabel(activeDataset.label)} · 杭高院 HIAS
              </p>
              <h1 className="max-w-3xl text-[2rem] font-bold leading-[1.15] tracking-[-0.035em] text-white drop-shadow-[0_2px_10px_rgba(6,40,52,0.35)] sm:text-[2.6rem]">
                {compactTermLabel(activeDataset.label)}预选课助手
              </h1>
              <p className="mt-3.5 max-w-2xl text-[0.9rem] leading-7 text-[#c9ded9] sm:text-[0.97rem]">
                依据已整理的课表与培养方案材料，帮助 2026
                级研一新生模拟选课、检查冲突、规划学分；最终课程安排请以学校正式通知和选课系统为准。
              </p>
              <div className="hero-meta mt-5">
                <span>
                  <Users /> 2026 级研一新生专用
                </span>
                <span>
                  <FileSpreadsheet /> {compactTermLabel(activeDataset.label)}课表数据
                </span>
                <span>
                  <BookOpen /> {initialCourses.length} 门课程
                </span>
                <span>
                  <GraduationCap /> {subjects.length} 个学科/专业
                </span>
                <span>
                  <ClipboardList /> {PROGRAM_PLANS.length} 个培养方向
                </span>
                <span>
                  <Sparkles /> 自动冲突检查
                </span>
              </div>
            </div>
            <aside className="plan-summary">
              <div className="flex items-center gap-4">
                <div className="plan-ring" aria-hidden="true">
                  <svg viewBox="0 0 100 100">
                    <defs>
                      <linearGradient
                        id="plan-ring-grad"
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="1"
                      >
                        <stop offset="0%" stopColor="#8be8d0" />
                        <stop offset="100%" stopColor="#63c9f2" />
                      </linearGradient>
                    </defs>
                    <circle className="plan-ring-track" cx="50" cy="50" r="42" />
                    <circle
                      className="plan-ring-fill"
                      cx="50"
                      cy="50"
                      r="42"
                      strokeDasharray="263.9"
                      strokeDashoffset={`${263.9 * (1 - graduationPercent / 100)}`}
                    />
                  </svg>
                  <div className="plan-ring-label">
                    <strong>{graduationPercent}</strong>
                    <span>%</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="plan-kicker">毕业学分进度</p>
                  <p className="plan-total">
                    {effectiveEarnedTotal > 0
                      ? accumulatedComposition(
                          englishExemptCredits,
                          earnedTotal,
                          selectedCredits,
                        )
                      : `本学期已选 ${formatCredits(selectedCredits)} 学分`}
                  </p>
                  <p className="plan-sub">
                    累计 {formatCredits(effectiveAccumulatedCredits)} / ≥
                    {activePlan.totalCredits}
                  </p>
                </div>
              </div>
              {selectedCreditBreakdown.length > 0 && (
                <div className="plan-breakdown">
                  {selectedCreditBreakdown.map(([label, credits]) => (
                    <span key={label}>
                      {label} {formatCredits(credits)}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2">
                <div className="min-w-0 pr-1">
                  <p className="text-[0.8rem] font-semibold text-white/90">
                    硕士学位英语免修免考
                    {englishExemption && (
                      <span className="ml-1.5 rounded-full bg-[#7ad3bd]/25 px-1.5 py-0.5 text-[0.64rem] font-bold text-[#9fe9d6]">
                        已免修 +3 学分
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[0.66rem] leading-4 text-white/55">
                    符合免修条件（考研英语≥70 等）即可开启：英语班课不排课，公共必修计 3 分；是否取得免修资格须以学校最终审核结果为准
                  </p>
                </div>
                <button
                  aria-checked={englishExemption}
                  aria-label="硕士学位英语免修免考开关"
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                    englishExemption ? 'bg-[#7ad3bd]' : 'bg-white/25'
                  }`}
                  onClick={toggleEnglishExemption}
                  role="switch"
                  type="button"
                >
                  <span
                    className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ${
                      englishExemption ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="h-10 rounded-xl border-transparent bg-[#7ad3bd] text-[#0a3933] hover:bg-[#8fe0cb]"
                  onClick={() => setView('timetable')}
                >
                  <CalendarDays /> 我的课表
                </Button>
                <Button
                  className="h-10 rounded-xl border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/20"
                  disabled={!selectedCourses.length}
                  onClick={exportSelected}
                  variant="outline"
                >
                  <Download /> 导出 CSV
                </Button>
              </div>
              <p className="plan-note">
                导出格式与 WakeUp 模板一致，确认课程安排无误后再导入。
              </p>
              <Button
                className="h-9 w-full rounded-lg border-rose-300/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/25"
                disabled={!selectedCourses.length}
                onClick={clearSelectedCourses}
                variant="outline"
              >
                <Trash2 /> 清空当前学期已选课程
              </Button>
              {earnedTotal === 0 && englishExemptCredits === 0 && (
                <button
                  className="plan-earned-hint"
                  onClick={() => setView('guide')}
                  type="button"
                >
                  <History className="size-3" /> 有上学期已修学分？去「培养要求」导入
                </button>
              )}
            </aside>
          </div>
        </section>

        <section className="relative z-20 mt-3.5 rounded-[22px] border border-[#e1e5df] bg-white/94 p-3.5 shadow-[0_14px_40px_rgba(61,83,72,.07)] backdrop-blur sm:p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
            {/* 学期切换卡片 */}
            <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-[#e1e5df] bg-gradient-to-br from-[#fbfdfc] to-[#f4f9f6] p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6f4ee] text-[#147d6f]">
                  <CalendarDays className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    当前课程数据
                  </p>
                  <h2 className="truncate text-[0.95rem] font-bold text-slate-800">
                    选择浏览的学期
                  </h2>
                </div>
              </div>
              <NativeSelect
                aria-label="切换课程数据学期"
                className="w-full [&>select]:h-11"
                id="term-select"
                onChange={(event) => switchTerm(event.target.value)}
                value={activeTermId}
              >
                {availableDatasets.map((dataset) => (
                  <NativeSelectOption key={dataset.id} value={dataset.id}>
                    {dataset.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] leading-4 text-slate-500">
                <span className="inline-flex items-center gap-1 font-medium text-[#147d6f]">
                  <span className="size-1.5 rounded-full bg-[#7ad3bd]" />
                  {compactTermLabel(activeDataset.label)}
                </span>
                <span>·</span>
                <span>{initialCourses.length} 门课程</span>
                {activeDataset.updatedAt && (
                  <>
                    <span>·</span>
                    <span>更新于 {activeDataset.updatedAt.slice(0, 10)}</span>
                  </>
                )}
                <span>·</span>
                <span>已选课程按学期独立保存</span>
              </p>
            </div>

            {/* 课程数据与备份卡片 */}
            <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-[#e1e5df] bg-white p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <FileSpreadsheet className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    课程数据与备份
                  </p>
                  <h2 className="truncate text-[0.95rem] font-bold text-slate-800">
                    更新课表、导出或恢复
                  </h2>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={handleCourseDataImport}
                  ref={dataFileRef}
                  type="file"
                />
                <Button
                  className="h-10 rounded-xl border-blue-200 bg-blue-50 px-4 text-blue-700 hover:bg-blue-100"
                  onClick={() => dataFileRef.current?.click()}
                  variant="outline"
                >
                  <RefreshCw /> 更新课程数据
                </Button>
                <Button
                  className="h-10 rounded-xl border-slate-200 bg-white px-3 text-slate-600 hover:bg-slate-50"
                  onClick={exportBackup}
                  variant="outline"
                >
                  <Download /> 导出备份
                </Button>
                <Button
                  className="h-10 rounded-xl border-slate-200 bg-white px-3 text-slate-600 hover:bg-slate-50"
                  onClick={() => backupFileRef.current?.click()}
                  variant="outline"
                >
                  <Upload /> 恢复备份
                </Button>
                <input
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={handleBackupRestore}
                  ref={backupFileRef}
                  type="file"
                />
              </div>
              <p className="mt-auto text-[0.72rem] leading-4 text-slate-500">
                “更新课程数据”支持含 term、label、courses 字段的 JSON（也用于覆盖当前学期）；备份含学期数据、选课记录、学位属性与已修学分，可跨浏览器迁移。
              </p>
            </div>
          </div>
          {(dataMessage || dataError) && (
            <div
              className={`mb-3 rounded-xl border px-3 py-2.5 text-sm leading-6 ${
                dataError
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
              role={dataError ? 'alert' : 'status'}
            >
              {dataError || dataMessage}
            </div>
          )}
          {storageNotice && (
            <div
              className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-6 text-amber-800"
              role="alert"
            >
              <span>{storageNotice}</span>
              <button
                aria-label="关闭存储提示"
                className="shrink-0 rounded-md p-0.5 text-amber-600 hover:bg-amber-100 hover:text-amber-900"
                onClick={() => setStorageNotice('')}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#eef1ee] bg-[#fbfcfa] p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-600">
                <SlidersHorizontal className="size-4" />
                <span className="text-sm font-semibold text-slate-700">
                  筛选课程
                </span>
              </div>
              <button
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-rose-600"
                onClick={clearFilters}
                type="button"
              >
                <X className="size-3.5" /> 清空筛选
              </button>
            </div>
            <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(240px,1.5fr)_repeat(4,minmax(136px,.62fr))]">
            <label className="relative block" htmlFor="course-search">
              <span className="sr-only">搜索课程</span>
              <Search className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="course-search"
                className="h-11 rounded-xl border-slate-200 bg-slate-50/80 pl-10 shadow-none focus-visible:border-blue-400"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索课程名 / 编码 / 教师 / 教室…"
                value={query}
              />
            </label>
            <NativeSelect
              aria-label="按开课院系筛选"
              className="w-full [&>select]:h-11"
              onChange={(event) => setCollege(event.target.value)}
              value={college}
            >
              <NativeSelectOption value="全部院系">全部院系</NativeSelectOption>
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
              onChange={(event) => setCategory(event.target.value)}
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
              <NativeSelectOption value="全部星期">全部星期</NativeSelectOption>
              {DAYS.map((item) => (
                <NativeSelectOption key={item} value={item}>
                  {item}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          {conflictPairs.length > 0 && (
            <div className="conflict-panel mt-4" role="alert">
              <div className="conflict-panel-title">
                <Zap />
                <div>
                  <strong>发现 {conflictPairs.length} 组时间冲突</strong>
                  <span>下面这些课程不能同时按当前安排上课</span>
                </div>
              </div>
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
                            <div className="alternative-group" key={source.id}>
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
            </div>
          )}
          </div>
        </section>

        <div className="sticky top-2 z-40 mb-1 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-2.5 shadow-[0_10px_30px_rgba(20,48,88,0.07)] backdrop-blur-md md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className={
                onlySelected
                  ? 'filter-chip filter-chip-active'
                  : 'filter-chip'
              }
              onClick={() => setOnlySelected((value) => !value)}
              variant="outline"
            >
              <Star className={onlySelected ? 'fill-current' : ''} /> 仅看已选
            </Button>
            <Button
              className={
                onlyNoConflict
                  ? 'filter-chip filter-chip-active'
                  : 'filter-chip'
              }
              onClick={() => setOnlyNoConflict((value) => !value)}
              variant="outline"
            >
              <Zap /> 不与已选冲突
            </Button>
            {conflictingIds.size > 0 && (
              <Badge
                className="h-8 rounded-lg bg-rose-50 px-3 text-rose-700"
                variant="secondary"
              >
                {conflictPairs.length} 组课程冲突
              </Badge>
            )}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2.5 md:w-auto md:justify-end">
            <div className="selection-credit-pill" aria-live="polite">
              <Sparkles />
              <span>已选总计</span>
              <strong>{formatCredits(selectedCredits)}</strong>
              <b>学分</b>
              <small>{selectedCourses.length} 门课</small>
            </div>
            <div className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1 sm:w-auto sm:flex">
              <button
                className={`view-tab ${view === 'guide' ? 'view-tab-active' : ''}`}
                onClick={() => setView('guide')}
                type="button"
              >
                <ClipboardList /> 培养要求
              </button>
              <button
                className={`view-tab ${view === 'courses' ? 'view-tab-active' : ''}`}
                onClick={() => setView('courses')}
                type="button"
              >
                <BookOpen /> 课程列表
              </button>
              <button
                className={`view-tab ${view === 'notice' ? 'view-tab-active' : ''}`}
                onClick={() => setView('notice')}
                type="button"
              >
                <Info /> 选课须知
              </button>
              <button
                className={`view-tab ${view === 'exams' ? 'view-tab-active' : ''}`}
                onClick={() => setView('exams')}
                type="button"
              >
                <BarChart3 /> 考试压力
              </button>
              <button
                className={`view-tab ${view === 'timetable' ? 'view-tab-active' : ''}`}
                onClick={() => setView('timetable')}
                type="button"
              >
                <CalendarDays /> 模拟课表
              </button>
            </div>
          </div>
        </div>

        {view === 'notice' ? (
          <EnrollmentNotice />
        ) : view === 'courses' ? (
          <section className="py-6">
            <div className="section-heading mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p>COURSE RESULTS</p>
                <h2>找到 {filteredCourses.length} 门课程</h2>
              </div>
              <p className="text-sm text-slate-500">
                已显示 {Math.min(visibleCount, filteredCourses.length)} /{' '}
                {filteredCourses.length}
              </p>
            </div>
            <p className="mb-4 -mt-1 text-xs leading-5 text-slate-400">
              课程时间、教室、周次与学分以 SEP 选课系统最新信息为准；本页面数据基于
              2026—2027 学年秋季课表与学院课程设置整理，个别课程已在详情中标注来源与待核验状态。
            </p>

            {filteredCourses.length ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredCourses.slice(0, visibleCount).map((course) => {
                  const selected = selectedIds.includes(course.id);
                  const conflict = selected && conflictingIds.has(course.id);
                  const peers = conflictPeers.get(course.id) ?? [];
                  return (
                    <article
                      className={`course-card ${selected ? 'course-card-selected' : ''} ${conflict ? 'course-card-conflict' : ''}`}
                      key={course.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                            <Badge
                              className="bg-blue-50 text-blue-700"
                              variant="secondary"
                            >
                              {course.category}
                            </Badge>
                            {isPlanCoreName(course.name) && (
                              <Badge
                                className="bg-violet-50 text-violet-700"
                                variant="secondary"
                              >
                                方案核心课
                              </Badge>
                            )}
                            {isPlanProName(course.name) && (
                              <Badge
                                className="bg-amber-50 text-amber-700"
                                variant="secondary"
                              >
                                方案专业课
                              </Badge>
                            )}
                          </div>
                          <button
                            className="course-title text-left font-bold tracking-tight text-slate-900 hover:text-blue-700"
                            onClick={() => setDetailCourse(course)}
                            type="button"
                          >
                            {course.name}
                          </button>
                          <p className="course-subtitle">
                            <span>{course.englishName || course.code}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatCredits(course.credits)} 学分</span>
                            <span aria-hidden="true">·</span>
                            <span>{course.level}</span>
                          </p>
                        </div>
                        <button
                          aria-label={
                            selected
                              ? `移除${course.name}`
                              : `选择${course.name}`
                          }
                          className={`star-button ${selected ? 'star-button-selected' : ''}`}
                          onClick={() => toggleCourse(course.id)}
                          type="button"
                        >
                          <Star className={selected ? 'fill-current' : ''} />
                        </button>
                      </div>
                      {selected && isDegreeRoleSettable(course.category) && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-[0.7rem] font-semibold text-slate-600">
                              学位属性
                            </p>
                            <p
                              className={`text-[0.64rem] leading-4 ${
                                !canUseAsDegreeCourse(course)
                                  ? 'text-slate-500'
                                  : degreeRoleOf(course) === null
                                    ? 'font-medium text-amber-600'
                                    : 'text-slate-400'
                              }`}
                            >
                              {!canUseAsDegreeCourse(course)
                                ? isAcademicDegree(activePlan.degree)
                                  ? '本课程不属于本一级学科/所属二级学科，仅可作为非学位课'
                                  : '本课程不在本专业的学位课范围，仅可作为非学位课'
                                : degreeRoleOf(course) === null
                                  ? '未标记，暂不计入学分与门数'
                                  : degreeRoleOf(course) === 'degree'
                                    ? '计入专业学位课'
                                    : '计入专业非学位课'}
                            </p>
                          </div>
                          {canUseAsDegreeCourse(course) ? (
                            <DegreeRoleControl
                              compact
                              onChange={(role) =>
                                setDegreeRoleForActive(course.id, role)
                              }
                              value={degreeRoleOf(course)}
                            />
                          ) : (
                            <Badge variant="outline">仅非学位课</Badge>
                          )}
                        </div>
                      )}
                      {selected &&
                        courseDegreeRoleKind(course) === 'forcedNonDegree' && (
                          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[0.7rem] leading-4 text-slate-500">
                            研讨课/实验课/实践课/讲座：仅可作为非学位课修读
                          </div>
                        )}

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
                            <strong>{courseSubjectDisplay(course)}</strong>
                            <small>{course.college}</small>
                          </span>
                        </div>
                      </div>
                      <div className="course-meta-line">
                        <span>
                          <ClipboardCheck /> {course.examMode || '考试方式待定'}
                        </span>
                        <span>
                          <Presentation /> {course.teachingMode || '授课方式待定'}
                        </span>
                        <span>
                          <Clock3 /> {course.hours || '学时待定'}
                        </span>
                      </div>
                      {conflict && (
                        <div className="course-conflict-note">
                          <Zap />
                          <span>
                            与 {peers.map((peer) => peer.name).join('、')}{' '}
                            的上课时间冲突
                          </span>
                        </div>
                      )}
                      <div className="mt-3.5 rounded-xl bg-slate-50 p-3 text-xs leading-5">
                        <ScheduleLines schedules={course.schedules} />
                      </div>
                      <div className="mt-3.5 flex items-center justify-between text-xs text-slate-500">
                        <span className="font-mono">{course.code}</span>
                        <span>
                          余量 {Math.max(0, course.capacity - course.enrolled)}{' '}
                          / {course.capacity || '—'}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : !initialCourses.length ? (
              <div className="empty-state">
                <div className="empty-art empty-art-amber">
                  <CalendarDays />
                </div>
                <h3>本学期暂无课程数据</h3>
                <p>
                  「{compactTermLabel(activeDataset.label)}
                  」还没有录入课表。可点击右上角「一键更新课程数据」导入该学期 JSON，
                  或切换回已有数据的学期。
                </p>
                <Button
                  onClick={() => {
                    switchTerm(DEFAULT_TERM_ID);
                  }}
                  variant="outline"
                >
                  切回 {compactTermLabel(DEFAULT_TERM_LABEL)}
                </Button>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-art empty-art-blue">
                  <SlidersHorizontal />
                </div>
                <h3>没有找到匹配课程</h3>
                <p>试试缩短关键词，或清空部分筛选条件。</p>
                <Button onClick={clearFilters} variant="outline">
                  清空筛选
                </Button>
              </div>
            )}

            {visibleCount < filteredCourses.length && (
              <div className="mt-6 flex justify-center">
                <Button
                  className="h-11 rounded-xl px-6"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  variant="outline"
                >
                  <ChevronDown /> 显示更多课程
                </Button>
              </div>
            )}
          </section>
        ) : view === 'guide' ? (
          <section className="py-6">
            <div className="section-heading mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p>PROGRAM REQUIREMENTS</p>
                <h2>物光学院培养方案参考</h2>
                <div className="section-description">
                  根据《物光学院2026—2027年课程设置》整理，仅显示当前学期课表中可对应的课程。
                </div>
              </div>
              <label className="min-w-64 text-sm font-medium text-slate-600">
                培养方向
                <NativeSelect
                  aria-label="选择培养方向"
                  className="mt-2 w-full [&>select]:h-11"
                  onChange={(event) => setProgramPlanId(event.target.value)}
                  value={programPlanId}
                >
                  {PROGRAM_PLANS.map((plan) => (
                    <NativeSelectOption key={plan.id} value={plan.id}>
                      {plan.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            </div>

            <div className="program-hero">
              <div>
                <span>{activePlan.degree}</span>
                <h3>{activePlan.program}</h3>
                <p>{activePlan.code}</p>
              </div>
              <div className="program-credit-total">
                <strong>≥{activePlan.totalCredits}</strong>
                <span>毕业总学分</span>
              </div>
              <div className="program-selected-total">
                <strong>{formatCredits(selectedPlanCredits)}</strong>
                <span>本学期已选方案课学分</span>
              </div>
            </div>

            {/\(秋\)|\(春\)/.test(activeDataset.label) && selectedCredits < 10 && (
              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                <Zap className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <span>
                  {compactTermLabel(activeDataset.label)}要求选课学分不低于
                  10 学分（不含《人文系列讲座（HIAS讲堂）》《科学前沿讲座》）。
                  当前本学期已选 {formatCredits(selectedCredits)} 学分
                  {selectedCourses.length === 0
                    ? '，请先在「课程列表」加入课程。'
                    : `，还差 ${formatCredits(Math.max(0, 10 - selectedCredits))} 学分。`}
                </span>
              </div>
            )}

            {pendingDegreeRoleCourses.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex items-start gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600">
                    <ClipboardCheck className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-800">
                      待确认学位属性（{pendingDegreeRoleCourses.length} 门）
                    </h3>
                    <p className="mt-0.5 text-xs leading-5 text-slate-600">
                      以下已选课程在本方向可作为学位课的范围内，但尚未标记为“学位课”，因此暂未计入上方的专业学位课学分与门数。选择修读属性后会自动计入统计；研讨课/实验课等只能作为非学位课。
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  {pendingDegreeRoleCourses.map((course) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/70 bg-white px-3 py-2"
                      key={course.id}
                    >
                      <div className="min-w-0">
                        <button
                          className="text-left font-medium text-slate-800 hover:text-blue-700"
                          onClick={() => setDetailCourse(course)}
                          type="button"
                        >
                          {course.name}
                        </button>
                        <p className="text-xs leading-5 text-slate-500">
                          {course.category} · {formatCredits(course.credits)} 学分
                          {isPlanCoreName(course.name)
                            ? ' · 方案核心课'
                            : isPlanProName(course.name)
                              ? ' · 方案专业课'
                              : ''}
                        </p>
                      </div>
                      <DegreeRoleControl
                        onChange={(role) =>
                          setDegreeRoleForActive(course.id, role)
                        }
                        value={degreeRoleOf(course)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-bold">学分达成度</h3>
                <span className="text-sm text-slate-500">
                  {effectiveEarnedTotal > 0
                    ? `${accumulatedComposition(englishExemptCredits, earnedTotal, selectedCredits)} / ≥${activePlan.totalCredits}`
                    : `本学期已选 ${formatCredits(selectedCredits)} / ≥${activePlan.totalCredits}`}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (effectiveAccumulatedCredits / activePlan.totalCredits) *
                        100,
                    )}%`,
                  }}
                />
              </div>
              <div className="mt-4 grid gap-3">
                {requirementBuckets.map((bucket) => {
                  const required = bucket.required;
                  const effective =
                    bucket.selected + bucket.earned + (bucket.exempt ?? 0);
                  const creditsMet = required !== null && effective >= required;
                  // 专业学位课“完成”还需学位课门数与来源集合满足（如 AI 至少 1 门来自指定核心课）
                  const role = bucket.role;
                  const roleCountsOk =
                    !role ||
                    ((activePlan.coreMinimum === null ||
                      role.coreDegree >= (activePlan.coreMinimum ?? 0)) &&
                      (activePlan.professionalMinimum === null ||
                        role.proDegree >= (activePlan.professionalMinimum ?? 0)) &&
                      (!activePlan.coreFrom?.length ||
                        role.fromDegree >= 1));
                  const met = creditsMet && roleCountsOk;
                  const remaining =
                    required !== null
                      ? Math.max(0, required - effective)
                      : 0;
                  const rolePending = role && role.pending > 0 ? role.pending : 0;
                  const ratio =
                    required !== null && required > 0
                      ? effective / required
                      : 0;
                  const compositionParts: string[] = [];
                  if ((bucket.exempt ?? 0) > 0) {
                    compositionParts.push(
                      `英语免修 ${formatCredits(bucket.exempt ?? 0)}`,
                    );
                  }
                  if (bucket.earned > 0) {
                    compositionParts.push(`已修 ${formatCredits(bucket.earned)}`);
                  }
                  if (bucket.selected > 0) {
                    compositionParts.push(
                      `本学期已选 ${formatCredits(bucket.selected)}`,
                    );
                  }
                  const composition = compositionParts.length
                    ? `${compositionParts.join(' + ')} · `
                    : '';
                  let statusText: string;
                  if (met) {
                    statusText = '已达标';
                  } else if (required !== null && !creditsMet && rolePending > 0) {
                    statusText = `还差 ${formatCredits(remaining)} 学分，另有 ${rolePending} 门已选核心课/专业课待标记学位属性（标记后计入）`;
                  } else if (required !== null && !creditsMet) {
                    statusText = `还差 ${formatCredits(remaining)} 学分`;
                  } else if (role && rolePending > 0) {
                    statusText = `还有 ${rolePending} 门已选核心课/专业课未确认学位属性`;
                  } else if (role && !roleCountsOk) {
                    statusText = '学分已足，但学位课门数（或指定来源课程）未满足，请为对应课程设置“学位课”属性';
                  } else {
                    statusText = bucket.nullText;
                  }
                  return (
                    <div key={bucket.id}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{bucket.label}</span>
                        <span className="text-sm text-slate-600">
                          {required === null
                            ? `${formatCredits(effective)} 学分 · ${bucket.nullText}`
                            : `${formatCredits(effective)} / ${formatCredits(required)} 学分`}
                        </span>
                      </div>
                      {required !== null ? (
                        <>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all ${
                                met ? 'bg-emerald-500' : 'bg-sky-500'
                              }`}
                              style={{
                                width: `${Math.min(100, ratio * 100)}%`,
                              }}
                            />
                          </div>
                          <p
                            className={`mt-1 text-xs leading-5 ${
                              met ? 'text-emerald-600' : 'text-amber-600'
                            }`}
                          >
                            {composition}
                            {statusText}
                            {bucket.hint ? ` · ${bucket.hint}` : ''}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {composition}
                          {bucket.nullText}
                          {bucket.hint ? ` · ${bucket.hint}` : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {activePlan.publicRequiredNote && (
                <p className="mt-3 border-t border-slate-100 pt-2.5 text-[0.74rem] leading-5 text-slate-500">
                  {activePlan.publicRequiredNote}
                </p>
              )}
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold">历史已修学分</h3>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    记录上学期等已完成课程的学分，计入上方达成度；不影响本学期课表、冲突检查与选课统计。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">
                    已修合计{' '}
                    <strong className="text-slate-900">
                      {formatCredits(earnedTotal)}
                    </strong>{' '}
                    学分
                    {englishExemptCredits > 0 && (
                      <span className="ml-1 text-xs text-emerald-600">
                        （另含免修英语 {formatCredits(englishExemptCredits)}）
                      </span>
                    )}
                  </span>
                  <Button
                    className="h-9 rounded-lg border-rose-200 text-rose-600 hover:bg-rose-50"
                    disabled={!earnedTotal}
                    onClick={clearEarned}
                    variant="outline"
                  >
                    <Trash2 /> 清空
                  </Button>
                </div>
              </div>
              <input
                accept=".json,application/json"
                className="sr-only"
                onChange={handleEarnedImport}
                ref={earnedFileRef}
                type="file"
              />
              <Button
                className="mt-3 h-9 rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={() => earnedFileRef.current?.click()}
                variant="outline"
              >
                <FileSpreadsheet /> 导入上学期课程数据
              </Button>
              <span className="ml-2 text-xs leading-5 text-slate-400">
                支持课程 JSON 数组（自动按课程属性汇总），或 {`{`}课程属性: 学分{`}`}{' '}
                映射
              </span>
              {(earnedMessage || earnedError) && (
                <div
                  className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${
                    earnedError
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                  role={earnedError ? 'alert' : 'status'}
                >
                  {earnedError || earnedMessage}
                </div>
              )}
              <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {[
                  ...new Set([
                    ...COURSE_CATEGORY_ORDER.filter((category) =>
                      categories.includes(category),
                    ),
                    ...categories.filter(
                      (category) => !COURSE_CATEGORY_ORDER.includes(category),
                    ),
                    ...Object.keys(earnedCredits),
                  ]),
                ].map((category) => (
                  <label
                    className="flex items-center justify-between gap-3 text-sm text-slate-600"
                    key={category}
                  >
                    <span>{category}</span>
                    <span className="flex items-center gap-1">
                      <Input
                        aria-label={`${category}已修学分`}
                        className="h-9 w-24 rounded-lg text-right"
                        min={0}
                        onChange={(event) =>
                          updateEarnedCategory(category, event.target.value)
                        }
                        placeholder="0"
                        step={0.5}
                        type="number"
                        value={
                          earnedCredits[category]
                            ? String(earnedCredits[category])
                            : ''
                        }
                      />
                      <span className="text-xs text-slate-400">学分</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {SHOW_SMART_SUGGESTIONS && (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-bold">智能选课建议</h3>
                  <span className="text-xs text-slate-500">
                    已排除与当前已选冲突的班次，加入后列表自动更新
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  推荐口径：学术型方向（学硕/博士）可将本一级学科及其所属二级学科的课程作为学位课；专业型方向（专硕）只认可本专业培养方案列出的专业课/核心课作为学位课。智能推荐只在本方向上述范围内产生学位课建议；专业非学位课默认只推荐本学院开设的课程。跨范围/跨学院如需修读，请按培养方案及导师/学院意见手动选择。学位课数量按实际设置“学位课”的课程门数考核，已修学分不计入门数。
                </p>
              {suggestions.rows.length > 0 && (
                <>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    依据「{activePlan.label}」学分缺口（含历史已修与本学期已选）自动推荐。加入学位课建议时默认标记为“学位课”，可随时在课程卡上改为“非学位课”。
                  </p>
                  <div className="mt-3 grid gap-2">
                    {suggestions.rows.map(
                      ({ course, gapLabel, reason, bucket }) => (
                        <div
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2"
                          key={course.id}
                        >
                          <div className="min-w-0">
                            <button
                              className="text-left font-medium text-slate-900 hover:text-blue-700"
                              onClick={() => setDetailCourse(course)}
                              type="button"
                            >
                              {course.name}
                            </button>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                              <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-blue-700">
                                {gapLabel}
                              </span>
                              <span>{formatCredits(course.credits)} 学分</span>
                              <span>{course.schedules[0]?.periodText || '时间待定'}</span>
                              <span>{course.teacher}</span>
                            </div>
                            <p className="mt-0.5 text-[0.71rem] leading-4 text-slate-400">
                              {reason}
                            </p>
                          </div>
                          <Button
                            aria-label={`加入${course.name}`}
                            className="h-8 shrink-0 rounded-lg text-slate-600"
                            onClick={() => joinSuggestedCourse(course, bucket)}
                            size="sm"
                            variant="outline"
                          >
                            <Star /> 加入
                          </Button>
                        </div>
                      ),
                    )}
                  </div>
                </>
              )}
              {suggestions.unsatisfied.length > 0 && (
                <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                  <p className="font-semibold">
                    当前课程库中未找到符合条件且无冲突的课程，仍缺：
                  </p>
                  <p className="mt-1">
                    {suggestions.unsatisfied
                      .map(
                        (gap) =>
                          `${gap.label}还差 ${formatCredits(gap.remaining)} 学分`,
                      )
                      .join('；')}
                  </p>
                  <p className="mt-1">
                    可能原因：本学科/本学院本学期未开设、与当前课表冲突、或培养方案课程未在本学期开课；也可在右上角「一键更新课程数据」导入补充学期数据。
                  </p>
                </div>
              )}
              {!suggestions.rows.length &&
                !suggestions.unsatisfied.length &&
                suggestions.degreeRolePending === 0 && (
                  <div className="mt-2 text-sm leading-6 text-emerald-700">
                    当前培养方向的学分与学位课门数要求已全部达成（含历史已修与本学期已选）。
                  </div>
                )}
              {suggestions.degreeRolePending > 0 && (
                <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                  有 {suggestions.degreeRolePending} 门已选核心课/专业课尚未设置学位属性：课程覆盖可能已满足，但学位课门数/学分尚未确认。请在课程卡的「学位属性」中标记后再核对达成度。
                </div>
              )}
              </div>
            )}

            <div className="selection-rules mt-4">
              <div className="rule-card">
                <Target />
                <div>
                  <span>本学期方案核心课（须设为学位课）</span>
                  <strong>
                    {activePlan.coreMinimum === null
                      ? '博士门数要求以个人培养方案为准'
                      : `已设学位课 ${degreeBucket?.role?.coreDegree ?? 0} / 至少 ${activePlan.coreMinimum} 门`}
                  </strong>
                  <p>
                    课程库覆盖：已选 {selectedPlanCoreCount} / 可选{' '}
                    {planCoreCourses.length} 门
                  </p>
                </div>
                <b>
                  {activePlan.coreMinimum === null
                    ? '—'
                    : `${degreeBucket?.role?.coreDegree ?? 0}/${activePlan.coreMinimum}`}
                </b>
              </div>
              <div className="rule-card">
                <Target />
                <div>
                  <span>本学期方案专业课（须设为学位课）</span>
                  <strong>
                    {activePlan.professionalMinimum === null
                      ? '博士门数要求以个人培养方案为准'
                      : `已设学位课 ${degreeBucket?.role?.proDegree ?? 0} / 至少 ${activePlan.professionalMinimum} 门`}
                  </strong>
                  <p>
                    课程库覆盖：已选 {selectedPlanProfessionalCount} / 可选{' '}
                    {planProfessionalCourses.length} 门
                  </p>
                </div>
                <b>
                  {activePlan.professionalMinimum === null
                    ? '—'
                    : `${degreeBucket?.role?.proDegree ?? 0}/${activePlan.professionalMinimum}`}
                </b>
              </div>
            </div>

            <div className="coverage-note mt-4">
              <Info />
              <span>
                这里统计的是本学期已选课程对学位课范围的覆盖情况：学术型方向覆盖“本一级学科/所属二级学科或培养方案课程”，专硕只覆盖本专业培养方案课程；只有范围内并被标记为“学位课”的课程才计入上方学位课门数与学分。范围外或未标记的课程不会自动计入。
              </span>
            </div>

            {activePlan.note && (
              <div className="program-note mt-4">
                <Info /> {activePlan.note}
              </div>
            )}

            <div className="mt-7 grid gap-5 xl:grid-cols-2">
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
                        <div className="program-course-row" key={course.id}>
                          <button
                            onClick={() => setDetailCourse(course)}
                            type="button"
                          >
                            <strong>{course.name}</strong>
                            <span>
                              {course.teacher} · {formatCredits(course.credits)}{' '}
                              学分 · {course.schedules[0]?.periodText}
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
                            <Star className={selected ? 'fill-current' : ''} />
                            {selected ? '已选' : '选择'}
                          </Button>
                          {selected && isDegreeRoleSettable(course.category) && (
                            <div className="flex flex-wrap items-center justify-end gap-2 px-1 pb-1.5">
                              <span
                                className={`text-[0.66rem] leading-4 ${
                                  degreeRoleOf(course) === null
                                    ? 'font-medium text-amber-600'
                                    : 'text-slate-400'
                                }`}
                              >
                                {degreeRoleOf(course) === null
                                  ? '待确认学位属性'
                                  : degreeRoleOf(course) === 'degree'
                                    ? '已设为学位课'
                                    : '已设为非学位课'}
                              </span>
                              <DegreeRoleControl
                                compact
                                onChange={(role) =>
                                  setDegreeRoleForActive(course.id, role)
                                }
                                value={degreeRoleOf(course)}
                              />
                            </div>
                          )}
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
                    门，未出现的课程可能安排在春季。本方向课程加入课表后需在「学位属性」中确认作为学位课/非学位课，学位课门数与学分只统计已设为“学位课”的课程。
                  </p>
                </div>
              ))}
            </div>

            <div className="source-compare-note mt-5">
              <Info />
              <span>
                培养要求与课程库依据 PPT 与 2026—2027 学年选课文件整理；个别课程的时间/周次/学分以
                SEP 选课系统最新信息为准（本工具已在课程详情中标注数据来源与核验状态）。
              </span>
            </div>
          </section>
        ) : view === 'exams' ? (
          <section className="py-6">
            <div className="section-heading mb-5">
              <p>ASSESSMENT LOAD</p>
              <h2>考试压力视图</h2>
              <div className="section-description">
                按秋季课表中的考试方式整理已选课程，帮助你平衡闭卷、报告与实践任务。
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
                            <small>{course.examMode || '考试方式待定'}</small>
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
                <div className="empty-art empty-art-amber">
                  <BarChart3 />
                </div>
                <h3>还没有可分析的课程</h3>
                <p>先选择课程，再回来查看闭卷、开卷、报告和实践考核的分布。</p>
                <Button onClick={() => setView('courses')}>去选择课程</Button>
              </div>
            )}

            <div className="source-compare-note mt-5">
              <FileSpreadsheet />
              <span>
                考试方式来自 2026
                年秋季学期课表；这里仅分析考核类型，不包含考试日期、实际难度或课程作业量。
              </span>
            </div>
          </section>
        ) : (
          <section className="py-6">
            <div className="section-heading mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p>WEEKLY TIMETABLE</p>
                <h2>我的模拟课程表</h2>
                <div className="section-description">
                  共 {selectedCourses.length} 门课程 ·{' '}
                  {formatCredits(selectedCredits)} 学分
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                查看周次
                <NativeSelect
                  aria-label="查看周次"
                  className="min-w-28 [&>select]:h-10"
                  onChange={(event) => setWeek(Number(event.target.value))}
                  value={week}
                >
                  {Array.from({ length: 20 }, (_, index) => index + 1).map(
                    (value) => (
                      <NativeSelectOption key={value} value={value}>
                        第 {value} 周
                      </NativeSelectOption>
                    ),
                  )}
                </NativeSelect>
              </label>
            </div>

            {selectedCourses.length ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                {currentWeekConflicts.size > 0 && (
                  <div className="mb-3 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <Zap className="size-4" /> 本周有{' '}
                    {currentWeekConflicts.size} 门课程时间重叠，已用红色标出。
                  </div>
                )}
                <div className="hidden overflow-x-auto pb-2 md:block">
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
                    {Array.from({ length: 13 }, (_, index) => index + 1).map(
                      (period) => (
                        <div
                          className="timetable-period"
                          key={period}
                          style={{ gridColumn: 1, gridRow: period + 1 }}
                        >
                          <strong>{period}</strong>
                          <span>第 {period} 节</span>
                        </div>
                      ),
                    )}
                    {DAYS.flatMap((_, dayIndex) =>
                      Array.from({ length: 13 }, (_, index) => index + 1).map(
                        (period) => (
                          <div
                            className="timetable-cell"
                            key={`${dayIndex}-${period}`}
                            style={{
                              gridColumn: dayIndex + 2,
                              gridRow: period + 1,
                            }}
                          />
                        ),
                      ),
                    )}
                    {selectedCourses.flatMap((course) =>
                      course.schedules
                        .filter((schedule) => schedule.weeks.includes(week))
                        .map((schedule, scheduleIndex) => {
                          const color =
                            COURSE_COLORS[
                              courseColorIndex(course.id, COURSE_COLORS.length)
                            ];
                          const conflict = currentWeekConflicts.has(course.id);
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
                                borderColor: conflict ? '#e11d48' : color[1],
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

                <div className="md:hidden">
                  {weekSchedulesByDay.some((cards) => cards.length > 0) ? (
                    <div className="flex flex-col gap-4">
                      {DAYS.map((dayLabel, dayIndex) => {
                        const cards = weekSchedulesByDay[dayIndex] ?? [];
                        if (cards.length === 0) return null;
                        return (
                          <section key={dayLabel} aria-label={`${dayLabel}的课程`}>
                            <div className="mb-2 flex items-center gap-2">
                              <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-white">
                                {dayLabel}
                              </span>
                              <span className="text-xs text-slate-400">
                                {cards.length} 个时段
                              </span>
                              {cards.some((card) => card.conflict) && (
                                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[0.68rem] font-semibold text-rose-600">
                                  <Zap className="size-3" /> 有冲突
                                </span>
                              )}
                            </div>
                            <ul className="flex flex-col gap-2">
                              {cards.map(
                                ({ course, schedule, tone, conflict }, cardIndex) => (
                                  <li
                                    key={`${course.id}-${dayIndex}-${schedule.start}-${schedule.end}-${cardIndex}`}
                                  >
                                  <button
                                    aria-label={`${course.name} ${schedule.start === schedule.end ? `第${schedule.start}节` : `第${schedule.start}-${schedule.end}节`} ${schedule.room || ''} ${schedule.weeksText}`}
                                    className={`flex w-full items-stretch gap-3 rounded-2xl border p-3 text-left shadow-sm transition active:scale-[0.99] ${
                                      conflict
                                        ? 'border-rose-200'
                                        : 'border-slate-200/80'
                                    }`}
                                    onClick={() => setDetailCourse(course)}
                                    type="button"
                                  >
                                    <span
                                      className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-center text-white"
                                      style={{
                                        backgroundColor: conflict
                                          ? '#e11d48'
                                          : tone[1],
                                      }}
                                    >
                                      <span className="text-[0.8rem] font-bold leading-tight">
                                        {schedule.start === schedule.end
                                          ? schedule.start
                                          : `${schedule.start}-${schedule.end}`}
                                      </span>
                                      <span className="text-[0.6rem] opacity-80">
                                        节
                                      </span>
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                                      <strong className="text-[0.88rem] leading-5 text-slate-800">
                                        {course.name}
                                      </strong>
                                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.72rem] leading-4 text-slate-500">
                                        <span className="inline-flex items-center gap-1">
                                          <MapPin className="size-3" />
                                          {schedule.room || '教室待定'}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                          <Repeat2 className="size-3" />
                                          {schedule.weeksText}
                                        </span>
                                      </span>
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                      <CalendarDays className="size-6 text-slate-300" />
                      <p className="text-sm font-medium text-slate-500">
                        第 {week} 周没有已选课程上课
                      </p>
                      <p className="text-xs leading-5 text-slate-400">
                        试试在上方「查看周次」切换到其他周，或回课程列表添加课程。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-art empty-art-emerald">
                  <CalendarDays />
                </div>
                <h3>课表还是空的</h3>
                <p>回到课程列表，点击课程卡片右上角的星标即可加入。</p>
                <Button onClick={() => setView('courses')}>去选择课程</Button>
              </div>
            )}
          </section>
        )}

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
          <span>HIAS-CSAdeepseek · {compactTermLabel(activeDataset.label)}预选课辅助工具</span>
          <span>HIAS-CSAdeepseek · Course Selection Assistant</span>
        </footer>
      </div>

      <button
        aria-label="回到顶部"
        className={`fixed bottom-6 right-5 z-50 grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white/95 text-slate-500 shadow-[0_10px_26px_rgba(20,48,88,0.18)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 hover:shadow-[0_14px_30px_rgba(20,48,88,0.22)] ${
          showBackTop
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-3 opacity-0'
        }`}
        onClick={scrollToTop}
        type="button"
      >
        <ChevronUp className="size-5" />
      </button>

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
                  <Badge variant="outline">{detailCourse.level}</Badge>
                  <Badge className="source-badge" variant="secondary">
                    <FileSpreadsheet />{' '}
                    {detailCourse.source ||
                      (detailCourse.verificationStatus === 'system'
                        ? 'SEP 选课系统数据'
                        : '2026—2027 秋季课表数据')}
                  </Badge>
                </div>
                <SheetTitle className="text-2xl font-bold leading-tight">
                  {detailCourse.name}
                </SheetTitle>
                <SheetDescription>
                  {detailCourse.englishName || detailCourse.code}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 p-6">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['课程编码', detailCourse.code],
                    [
                      '学分 / 学时',
                      `${formatCredits(detailCourse.credits)} / ${detailCourse.hours}`,
                    ],
                    ['任课教师', detailCourse.teacher],
                    ['所属学科/专业', courseSubjectDisplay(detailCourse)],
                    ['开课院系', detailCourse.college],
                    ['考试方式', detailCourse.examMode],
                    ['授课方式', detailCourse.teachingMode],
                    [
                      '选课人数',
                      `${detailCourse.enrolled} / ${detailCourse.capacity || '—'}`,
                    ],
                  ].map(([label, value]) => (
                    <div className="detail-field" key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                {detailCourse.verificationStatus === 'pending' && (
                  <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    <Info className="mt-0.5 size-4 shrink-0" />
                    该课程数据仍需人工核验（与来源材料存在差异），请以 SEP 选课系统最新信息为准。
                  </div>
                )}
                <div>
                  <h3 className="mb-3 flex items-center gap-2 font-bold">
                    <Clock3 className="size-4 text-blue-600" /> 上课安排
                  </h3>
                  <div className="space-y-2">
                    {detailCourse.schedules.map((schedule, index) => (
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
                    ))}
                  </div>
                </div>
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
                {selectedIds.includes(detailCourse.id) &&
                  courseDegreeRoleKind(detailCourse) !== 'none' && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700">
                          学位属性
                        </p>
                        <p className="mt-0.5 text-[0.68rem] leading-4 text-slate-500">
                          {courseDegreeRoleKind(detailCourse) === 'forcedNonDegree'
                            ? '研讨课/实验课/实践课/讲座等只能作为非学位课修读。'
                            : !canUseAsDegreeCourse(detailCourse)
                              ? isAcademicDegree(activePlan.degree)
                                ? '本课程不属于本一级学科/所属二级学科，仅可作为非学位课。'
                                : '本课程不在本专业的学位课范围，仅可作为非学位课。'
                              : '设为“学位课”计入专业学位课学分与门数；设为“非学位课”计入专业非学位课。'}
                        </p>
                      </div>
                      {canUseAsDegreeCourse(detailCourse) ? (
                        <DegreeRoleControl
                          onChange={(role) =>
                            setDegreeRoleForActive(detailCourse.id, role)
                          }
                          value={degreeRoleOf(detailCourse)}
                        />
                      ) : (
                        <Badge variant="outline">仅非学位课</Badge>
                      )}
                    </div>
                  )}
                <div className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  开课校区：国科大杭州高等研究院。
                </div>
                <p className="text-[0.68rem] leading-4 text-slate-400">
                  课程安排以 SEP 选课系统最新信息为准。
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
