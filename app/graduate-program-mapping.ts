import type { ProgramPlan } from './program-plans';

export type GraduateProgramKind = 'academic' | 'professional' | 'unknown';

export type GraduateProgramMapping = {
  kind: Exclude<GraduateProgramKind, 'unknown'>;
  degreeType: string;
  secondLevel: string;
  firstLevel: string;
};

/**
 * Derived from 研究生专业映射表.xlsx.  The workbook is an input source,
 * not a runtime dependency, so the browser can keep working offline.
 */
export const GRADUATE_PROGRAM_MAPPINGS: GraduateProgramMapping[] = [
  { kind: 'academic', degreeType: '', secondLevel: '理论物理', firstLevel: '物理学' },
  { kind: 'academic', degreeType: '', secondLevel: '精密测量物理', firstLevel: '物理学' },
  { kind: 'academic', degreeType: '', secondLevel: '物理电子学', firstLevel: '电子科学与技术' },
  { kind: 'academic', degreeType: '', secondLevel: '有机化学', firstLevel: '化学' },
  { kind: 'academic', degreeType: '', secondLevel: '化学生物学', firstLevel: '化学' },
  { kind: 'academic', degreeType: '', secondLevel: '材料科学与工程', firstLevel: '材料科学与工程' },
  { kind: 'academic', degreeType: '', secondLevel: '细胞生物学', firstLevel: '生物学' },
  { kind: 'academic', degreeType: '', secondLevel: '生物化学与分子生物学', firstLevel: '生物学' },
  { kind: 'academic', degreeType: '', secondLevel: '生物信息学', firstLevel: '生物学' },
  { kind: 'academic', degreeType: '', secondLevel: '药学', firstLevel: '药学' },
  { kind: 'academic', degreeType: '', secondLevel: '药物化学', firstLevel: '药学' },
  { kind: 'academic', degreeType: '', secondLevel: '药理学', firstLevel: '药学' },
  { kind: 'academic', degreeType: '', secondLevel: '环境科学', firstLevel: '环境科学与工程' },
  { kind: 'academic', degreeType: '', secondLevel: '计算机科学与技术', firstLevel: '计算机科学与技术' },
  { kind: 'academic', degreeType: '', secondLevel: '计算机应用技术', firstLevel: '计算机科学与技术' },
  { kind: 'professional', degreeType: '工程硕士', secondLevel: '光电信息工程', firstLevel: '电子信息' },
  { kind: 'professional', degreeType: '工程硕士', secondLevel: '计算机技术', firstLevel: '电子信息' },
  { kind: 'professional', degreeType: '工程硕士', secondLevel: '人工智能', firstLevel: '电子信息' },
  { kind: 'professional', degreeType: '工程硕士', secondLevel: '材料工程', firstLevel: '材料与化工' },
  { kind: 'professional', degreeType: '工程硕士', secondLevel: '化学工程', firstLevel: '材料与化工' },
  { kind: 'professional', degreeType: '工程硕士', secondLevel: '生物技术与工程', firstLevel: '生物与医药' },
  { kind: 'professional', degreeType: '工程硕士', secondLevel: '环境工程', firstLevel: '资源与环境' },
  { kind: 'professional', degreeType: '药学硕士', secondLevel: '药学', firstLevel: '药学' },
];

export const GRADUATE_PROGRAM_MAPPING_SOURCE = '研究生专业映射表.xlsx';

function normalize(value: string) {
  return value.trim().replace(/\s+/g, '');
}

export function getGraduateProgramKind(plan: Pick<ProgramPlan, 'degree'>): GraduateProgramKind {
  const degree = normalize(plan.degree);
  if (/专业型|专业硕士|专硕|工程硕士|药学硕士/.test(degree)) {
    return 'professional';
  }
  if (/学术型|学术硕士|学硕|博士|直博/.test(degree)) {
    return 'academic';
  }
  return 'unknown';
}

export function getGraduateProgramMapping(
  plan: Pick<ProgramPlan, 'degree' | 'program'>,
) {
  const kind = getGraduateProgramKind(plan);
  if (kind === 'unknown') return undefined;
  const program = normalize(plan.program);
  const candidates = GRADUATE_PROGRAM_MAPPINGS.filter(
    (mapping) => mapping.kind === kind && normalize(mapping.secondLevel) === program,
  );
  if (!candidates.length) return undefined;

  if (kind === 'professional') {
    const degree = normalize(plan.degree);
    return (
      candidates.find((mapping) => normalize(mapping.degreeType) === degree) ??
      candidates[0]
    );
  }
  return candidates[0];
}

export function getAcademicAllowedSubjects(
  plan: Pick<ProgramPlan, 'degree' | 'program'>,
) {
  const mapping = getGraduateProgramMapping(plan);
  if (!mapping || mapping.kind !== 'academic') return undefined;
  return new Set(
    GRADUATE_PROGRAM_MAPPINGS.filter(
      (candidate) =>
        candidate.kind === 'academic' &&
        candidate.firstLevel === mapping.firstLevel,
    ).flatMap((candidate) => [candidate.firstLevel, candidate.secondLevel]),
  );
}

export function getGraduateProgramScopeLabel(
  plan: Pick<ProgramPlan, 'degree' | 'program'>,
) {
  const kind = getGraduateProgramKind(plan);
  const mapping = getGraduateProgramMapping(plan);
  if (!mapping) return '培养方向未在专业映射表中匹配，学位课范围待核验。';
  if (kind === 'academic') {
    const subjects = getAcademicAllowedSubjects(plan);
    return `学硕：可按一级学科“${mapping.firstLevel}”及其已映射二级学科（${[...
      (subjects ?? [])
    ].join('、')}）核验。`;
  }
  return `专硕：仅按“${mapping.secondLevel}”本专业培养方案列出的核心课、专业课核验。`;
}
