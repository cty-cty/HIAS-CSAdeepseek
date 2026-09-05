// 研究生专业映射（依据《研究生专业映射表.xlsx》：专业映射 / 学术型 / 专业型 三张表）
// 用途：界定“哪些学科/专业的课程可作为专业学位课”的范围。
// - 学术型：学位课可取本一级学科及该一级学科下所属二级学科的课程；
// - 专业型（专硕）：学位课只取本专业学位领域（本专业）开设的专业课/核心课。
// 正式口径以教务文件为准，本文件仅用于课程工具的学位课范围判断。

export type AcademicScope = {
  /** 一级学科 */
  firstLevel: string;
  /** 该一级学科下的二级学科（学院实际开设/可修口径） */
  secondLevels: string[];
};

export type ProfessionalScope = {
  /** 专业学位类别（如 电子信息） */
  category: string;
  /** 专业学位领域（专业），如 光电信息工程 / 人工智能 / 材料工程 */
  fields: string[];
};

// 《研究生专业映射表》"学术型" sheet：二级学科 → 所属一级学科。
export const ACADEMIC_SCOPES: AcademicScope[] = [
  { firstLevel: '物理学', secondLevels: ['理论物理', '精密测量物理'] },
  { firstLevel: '电子科学与技术', secondLevels: ['物理电子学'] },
  { firstLevel: '化学', secondLevels: ['有机化学', '化学生物学'] },
  { firstLevel: '材料科学与工程', secondLevels: ['材料科学与工程'] },
  {
    firstLevel: '生物学',
    secondLevels: ['细胞生物学', '生物化学与分子生物学', '生物信息学'],
  },
  { firstLevel: '药学', secondLevels: ['药学', '药物化学', '药理学'] },
  {
    firstLevel: '环境科学与工程',
    secondLevels: ['环境科学'],
  },
  {
    firstLevel: '计算机科学与技术',
    secondLevels: ['计算机科学与技术', '计算机应用技术'],
  },
];

// 《研究生专业映射表》"专业型" sheet：专业学位类别 → 专业学位领域（专业）。
export const PROFESSIONAL_SCOPES: ProfessionalScope[] = [
  {
    category: '电子信息',
    fields: ['光电信息工程', '计算机技术', '人工智能'],
  },
  { category: '材料与化工', fields: ['材料工程', '化学工程'] },
  { category: '生物与医药', fields: ['生物技术与工程'] },
  { category: '资源与环境', fields: ['环境工程'] },
  { category: '药学', fields: ['药学'] },
];

/**
 * 学术型：取某二级学科所属一级学科，以及该一级学科下的全部二级学科名，
 * 作为“可作为专业学位课的学科范围”。找不到映射时退回仅本专业名。
 */
export function academicScopeMajors(
  secondLevel: string,
): string[] {
  const scope = ACADEMIC_SCOPES.find((item) =>
    item.secondLevels.includes(secondLevel),
  );
  if (!scope) return [secondLevel];
  return [scope.firstLevel, ...scope.secondLevels];
}

/**
 * 专业型：给定本专业（专业学位领域/专业）名称，返回其所属专业学位类别下的
 * 全部专业名（仅用于展示“同类专业”信息）；学位课范围判定在程序里按培养方案名单执行。
 */
export function professionalCategoryOf(field: string): string | null {
  const scope = PROFESSIONAL_SCOPES.find((item) => item.fields.includes(field));
  return scope?.category ?? null;
}
