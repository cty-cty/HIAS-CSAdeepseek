/**
 * 培养方向静态数据。
 *
 * 这里的每一项代表“培养方案明确课程库 + 学分要求”，属于规则数据的
 * B 层（学院培养方案），不包含任何“当前学期课表”信息。
 * 课程是否本学期开课、班次、时间、容量一律不在本文件声明。
 */

/** 培养类型：用于博士口径区分（普博与直博/硕博连读的学校要求不同）。 */
export type StudentTrack =
  | 'master'
  | 'general_phd'
  | 'direct_phd'
  | 'combined_phd';

/** 可扩展的专业特殊规则（由 evaluator 确定性执行，不允许 AI 自行判断）。 */
export type ProgramSpecialRule =
  | {
      id: string;
      type: 'atLeastOneOf';
      minimum: number;
      courseNames: string[];
      /** 是否要求该课程以学位课（degree）身份计入。 */
      degreeOnly?: boolean;
      label: string;
    }
  | {
      id: string;
      type: 'minimumCourseCount';
      minimum: number;
      courseNames: string[];
      degreeOnly?: boolean;
      label: string;
    }
  | {
      id: string;
      type: 'requiredCourse';
      courseNames: string[];
      degreeOnly?: boolean;
      label: string;
    };

export type ProgramPlan = {
  id: string;
  label: string;
  degree: string;
  program: string;
  /** 可选：所属学院，用于培养方向菜单与课程学科筛选的一级分组。 */
  college?: string;
  code: string;
  totalCredits: number;
  publicRequiredCredits: number | null;
  publicRequiredDegreeCredits?: number | null;
  publicRequiredNonDegreeCredits?: number | null;
  requiredPublicRequiredNonDegreeCourses?: string[];
  degreeCourseCredits: number;
  professionalNonDegreeCredits: number | null;
  publicElectiveCredits: number;
  innovationCredits: number | null;
  coreMinimum: number | null;
  professionalMinimum: number | null;
  coreCourses: string[];
  professionalCourses: string[];
  /** 可扩展专业特殊规则（如人工智能核心课须含《高级人工智能》/《自然语言处理》1门）。 */
  specialRules?: ProgramSpecialRule[];
  /**
   * 培养类型口径。博士方案必须区分：
   * general_phd（普博）/ direct_phd（直博）/ combined_phd（硕博连读）。
   * 旧数据缺少该字段时视为 undefined —— 页面按“未声明口径 + 待确认提示”处理，绝不猜测。
   */
  studentTrack?: StudentTrack;
  /** 资料不足以自动确认时的说明文案（显示为待确认，不当作确定规则）。 */
  verificationNote?: string;
  source?: string;
  updatedAt?: string;
  note?: string;
};

/** 学院一级目录；没有课程或培养方案的学院也可以先占位展示。 */
export type CollegeDirectoryEntry = {
  id: string;
  label: string;
  aliases?: string[];
};

export const COLLEGE_DIRECTORY: CollegeDirectoryEntry[] = [
  { id: 'physics-mathematics', label: '基础物理与数学科学学院' },
  {
    id: 'physics-optoelectronics',
    label: '物理与光电工程学院',
    aliases: ['物光学院'],
  },
  { id: 'chemistry-materials', label: '化学与材料科学学院' },
  { id: 'life-health', label: '生命与健康科学学院' },
  { id: 'pharmaceutical-science', label: '药物科学与技术学院' },
  { id: 'environment', label: '环境学院' },
  { id: 'molecular-medicine', label: '分子医学院' },
  { id: 'intelligent-science-technology', label: '智能科学与技术学院' },
];

/** 自定义方案未填 college 时的兜底分组名。 */
export const FALLBACK_PROGRAM_PLAN_COLLEGE = '其他培养方案';

export function getProgramPlanCollege(
  plan: Pick<ProgramPlan, 'college'>,
): string {
  const college = plan.college?.trim();
  if (!college) return FALLBACK_PROGRAM_PLAN_COLLEGE;
  const directoryEntry = COLLEGE_DIRECTORY.find(
    (entry) => entry.label === college || entry.aliases?.includes(college),
  );
  return directoryEntry?.label ?? college;
}

/** 按学院分组培养方案；顺序沿用 COLLEGE_DIRECTORY，自定义学院追加在后。 */
export function groupProgramPlansByCollege(
  plans: ProgramPlan[],
): Array<[string, ProgramPlan[]]> {
  const groupMap = new Map<string, ProgramPlan[]>();
  plans.forEach((plan) => {
    const college = getProgramPlanCollege(plan);
    const group = groupMap.get(college) ?? [];
    group.push(plan);
    groupMap.set(college, group);
  });
  return [...groupMap.entries()];
}

const PHYSICAL_ELECTRONICS_CORE = [
  '半导体光谱学导论',
  '半导体工艺与制造技术',
  '数学物理方法（电子与通信类）',
  '半导体微纳加工技术',
  '高级红外光电工程导论',
  '信息光子学物理',
  '半导体器件物理学',
];

const PHYSICAL_ELECTRONICS_PROFESSIONAL = [
  '光电探测器件物理与技术',
  '现代传感器技术与应用',
  '主被动光谱探测技术',
  '光电成像原理与技术',
  '数字系统中的模拟电路技术',
];

export const PROGRAM_PLANS: ProgramPlan[] = [
  {
    id: 'physical-master',
    label: '物理电子学 · 学硕',
    degree: '学术型硕士',
    program: '物理电子学',
    college: '物理与光电工程学院',
    code: '0809 电子科学与技术',
    totalCredits: 30,
    publicRequiredCredits: 7,
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 0,
    requiredPublicRequiredNonDegreeCourses: [],
    degreeCourseCredits: 12,
    professionalNonDegreeCredits: null,
    publicElectiveCredits: 2,
    innovationCredits: null,
    coreMinimum: 2,
    professionalMinimum: 2,
    coreCourses: PHYSICAL_ELECTRONICS_CORE,
    professionalCourses: PHYSICAL_ELECTRONICS_PROFESSIONAL,
  },
  {
    id: 'optical-master',
    label: '光电信息工程 · 专硕',
    degree: '专业型硕士',
    program: '光电信息工程',
    college: '物理与光电工程学院',
    code: '085408 光电信息工程',
    totalCredits: 25,
    publicRequiredCredits: 8,
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    requiredPublicRequiredNonDegreeCourses: ['工程伦理'],
    degreeCourseCredits: 12,
    professionalNonDegreeCredits: 2,
    publicElectiveCredits: 2,
    innovationCredits: 1,
    coreMinimum: 2,
    professionalMinimum: 2,
    coreCourses: [
      '集成与微纳光子学',
      '高等光学原理',
      '光电工程',
      '光纤技术原理',
      '光电子材料与器件',
    ],
    professionalCourses: [
      '激光原理',
      '红外半导体器件仿真与测试',
      'FPGA电路软硬件设计',
      '固体光谱学导论',
      '光学薄膜技术及应用',
      '红外智能感知光电探测系统概论',
      '半导体器件物理与工艺',
      '专业英语',
      '超快现象与超快光谱',
      '量子光学',
      '数字图像处理',
      '非线性光学导论',
    ],
  },
  {
    id: 'ai-master',
    label: '人工智能 · 专硕',
    degree: '专业型硕士',
    program: '人工智能',
    college: '智能科学与技术学院',
    code: '085410 人工智能',
    totalCredits: 25,
    publicRequiredCredits: 8,
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    requiredPublicRequiredNonDegreeCourses: ['工程伦理'],
    degreeCourseCredits: 12,
    professionalNonDegreeCredits: 2,
    publicElectiveCredits: 2,
    innovationCredits: 1,
    coreMinimum: 2,
    professionalMinimum: 2,
    coreCourses: ['自然语言处理', '高级人工智能', '人工智能的数学基础与应用'],
    professionalCourses: [
      '并行计算与实现技术',
      '计算机网络技术',
      '高级数据库系统',
      '智能物联网技术及应用',
    ],
    specialRules: [
      {
        id: 'ai-core-one',
        type: 'atLeastOneOf',
        minimum: 1,
        courseNames: ['高级人工智能', '自然语言处理'],
        degreeOnly: true,
        label: '《高级人工智能》《自然语言处理》至少 1 门作为核心学位课',
      },
    ],
    note: '核心课程至少选 2 门作为学位课，其中至少 1 门须来自《高级人工智能》《自然语言处理》（085410 专业核心课库仅列 3 门：自然语言处理、高级人工智能、人工智能的数学基础与应用）；专业课（并行计算与实现技术、计算机网络技术、高级数据库系统、智能物联网技术及应用）中至少选 2 门作为学位课，研讨课和实验课不计入。',
  },
  {
    id: 'materials-master',
    label: '材料工程 · 专硕',
    degree: '专业型硕士',
    program: '材料工程',
    college: '化学与材料科学学院',
    code: '085601 材料工程',
    totalCredits: 25,
    publicRequiredCredits: 8,
    publicRequiredDegreeCredits: 7,
    publicRequiredNonDegreeCredits: 1,
    requiredPublicRequiredNonDegreeCourses: ['工程伦理'],
    degreeCourseCredits: 12,
    professionalNonDegreeCredits: 2,
    publicElectiveCredits: 2,
    innovationCredits: 1,
    coreMinimum: 2,
    professionalMinimum: 2,
    coreCourses: [
      '有机合成精细化工基础',
      '现代有机波谱分析与运用',
      '材料表面与界面（材料与化工）',
      '材料合成与制备（材料与化工）',
      '固体物理（材料与化工）',
      '固体材料化学（材料与化工）',
    ],
    professionalCourses: [
      '计算材料学专题',
      '绿色工艺与技术',
      '基因工程',
      '光子集成芯片基础（材料与化工）',
      '半导体光子学（材料与化工）',
      '磁性材料',
    ],
  },
  {
    id: 'physical-doctor',
    label: '物理电子学 · 博士',
    degree: '博士',
    program: '物理电子学',
    college: '物理与光电工程学院',
    code: '0809 电子科学与技术',
    totalCredits: 38,
    publicRequiredCredits: 11,
    publicRequiredDegreeCredits: 11,
    publicRequiredNonDegreeCredits: 0,
    requiredPublicRequiredNonDegreeCourses: [],
    degreeCourseCredits: 16,
    professionalNonDegreeCredits: null,
    publicElectiveCredits: 2,
    innovationCredits: null,
    coreMinimum: 2,
    professionalMinimum: 2,
    coreCourses: PHYSICAL_ELECTRONICS_CORE,
    professionalCourses: PHYSICAL_ELECTRONICS_PROFESSIONAL,
    /**
     * 物光学院《专业学分要求》中“博士 ≥38 学分、公共必修 11 分
     * （学硕基础上 + 中马2 + 博士英语2）、专业学位课 ≥16、核心/专业课各 ≥2 门”
     * 的口径 = 直博 / 硕博连读（公共必修含学硕 7 分基础课程）。
     * 普博（普通招考）的学院级完整课程规则当前材料未单列，
     * 页面会按 studentTrack=general_phd 显示“待学院确认”，绝不自动套用 2+2。
     */
    studentTrack: 'direct_phd',
    verificationNote:
      '本方案按“直博/硕博连读”口径整理（公共必修 11 学分含学硕基础课程）。普通招考博士（普博）的学院级核心/专业课门数规则在现有正式材料中未单独明确：学校口径为专业学位课不低于 4 学分、具体参考培养方案，请以学院培养方案和教务系统为准，本工具不自动套用“2 门核心 + 2 门专业”。',
    note: '核心课与专业课门数、公共必修学分均按直博/硕博连读口径整理；若为普通招考博士，请在“培养设置”中选择相应培养类型，页面会切换为待确认展示。',
  },
];
