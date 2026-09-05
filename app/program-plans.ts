export type ProgramPlan = {
  id: string;
  label: string;
  degree: string;
  program: string;
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
  coreMinimum: number;
  professionalMinimum: number;
  coreCourses: string[];
  professionalCourses: string[];
  source?: string;
  updatedAt?: string;
  note?: string;
};

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
    note: '核心课程至少选2门，其中至少1门须从《高级人工智能》《自然语言处理》中选择；专业课不包括研讨课和实验课。',
  },
  {
    id: 'materials-master',
    label: '材料工程 · 专硕',
    degree: '专业型硕士',
    program: '材料工程',
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
  },
];
