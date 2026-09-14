/**
 * 意见反馈 / 留言：纯函数模块（不依赖 React，也不直接读写 localStorage）。
 *
 * 站点部署在 GitHub Pages 上，是纯静态托管：没有服务器、没有数据库，而且项目
 * 还要求离线单文件版完全可用（禁止外部脚本）。所以留言采用「本机留档 + 一键
 * 带到 GitHub Issue 提交」的方案：
 * - 内容只写入本机 localStorage（hias-feedback-v1），不会自动上传；
 * - “提交”= 打开预填好标题与正文的 GitHub 新建 Issue 页面，由用户自己确认提交。
 * 这样线上版与离线版共用同一套逻辑，且不需要任何后端或第三方服务。
 */

export const FEEDBACK_STORAGE_KEY = 'hias-feedback-v1';
export const FEEDBACK_REPO = 'cty-cty/HIAS-CSAdeepseek';
export const FEEDBACK_ISSUES_URL = `https://github.com/${FEEDBACK_REPO}/issues`;
export const FEEDBACK_NEW_ISSUE_URL = `https://github.com/${FEEDBACK_REPO}/issues/new`;
/** 新建 Issue 时顺带带上的标签；仓库没有该标签时 GitHub 会忽略，不影响提交。 */
export const FEEDBACK_ISSUE_LABEL = 'feedback';

/** 本机最多保留多少条留言：超出后丢弃最旧的，避免把 localStorage 写满。 */
export const FEEDBACK_MAX_ENTRIES = 20;
export const FEEDBACK_MAX_TITLE = 80;
export const FEEDBACK_MAX_DETAIL = 2000;
export const FEEDBACK_MAX_CONTACT = 120;
export const FEEDBACK_MIN_DETAIL = 8;
/** GitHub 与浏览器对 URL 长度有限制，超过这个长度就只提供复制方案。 */
export const FEEDBACK_MAX_ISSUE_URL = 7000;

export type FeedbackCategoryId = 'suggestion' | 'data' | 'bug' | 'other';

export type FeedbackCategory = {
  id: FeedbackCategoryId;
  label: string;
  /** Issue 标题前缀，方便在 GitHub 列表里一眼分类。 */
  prefix: string;
  hint: string;
};

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  {
    id: 'suggestion',
    label: '功能建议',
    prefix: '功能建议',
    hint: '希望增加、调整或去掉的功能，以及页面文案与交互建议。',
  },
  {
    id: 'data',
    label: '课程数据纠错',
    prefix: '数据纠错',
    hint: '课程名称、编码、学分、教师、时间地点或课程类别与正式材料不一致。',
  },
  {
    id: 'bug',
    label: '使用问题',
    prefix: '使用问题',
    hint: '页面报错、显示异常、按钮无响应、数据丢失等。',
  },
  {
    id: 'other',
    label: '其他留言',
    prefix: '其他留言',
    hint: '其他想说的内容，包括使用感受与鼓励。',
  },
];

export const DEFAULT_FEEDBACK_CATEGORY: FeedbackCategoryId = 'suggestion';

/** 表单状态：字段一律用字符串，便于直接绑定受控组件。 */
export type FeedbackDraft = {
  category: string;
  title: string;
  detail: string;
  contact: string;
  attachContext: boolean;
};

/** 自动附带的环境信息；全部由当前页面状态生成，不含任何个人身份信息。 */
export type FeedbackContext = {
  termLabel: string;
  programLabel: string;
  selectedCount: number;
  selectedCredits: number;
  viewLabel: string;
  pageUrl: string;
  userAgent: string;
  capturedAt: string;
};

export type FeedbackEntry = {
  id: string;
  createdAt: string;
  category: FeedbackCategoryId;
  title: string;
  detail: string;
  contact: string;
  context: FeedbackContext | null;
  /** 打开过几次 GitHub 提交页；只是本机计数，不代表 Issue 真的提交成功。 */
  submittedCount: number;
  lastSubmittedAt: string | null;
};

export const EMPTY_FEEDBACK_DRAFT: FeedbackDraft = {
  category: DEFAULT_FEEDBACK_CATEGORY,
  title: '',
  detail: '',
  contact: '',
  attachContext: true,
};

export function getFeedbackCategory(id: string): FeedbackCategory {
  return (
    FEEDBACK_CATEGORIES.find((category) => category.id === id) ??
    FEEDBACK_CATEGORIES[FEEDBACK_CATEGORIES.length - 1]
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 统一成 `YYYY-MM-DD HH:mm`（本地时间），避免各浏览器 toLocaleString 不一致。 */
export function formatFeedbackTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function normalizeText(value: string, maxLength: number): string {
  return value
    .replaceAll('\r\n', '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

/** 校验表单，返回第一条错误信息；通过校验时返回 null。 */
export function validateFeedbackDraft(draft: FeedbackDraft): string | null {
  if (!draft.detail.trim()) return '请先填写留言内容，再保存或提交。';
  if (
    normalizeText(draft.detail, FEEDBACK_MAX_DETAIL).length <
    FEEDBACK_MIN_DETAIL
  )
    return `留言内容太短（至少 ${FEEDBACK_MIN_DETAIL} 个字），请补充说明。`;
  if (draft.detail.length > FEEDBACK_MAX_DETAIL)
    return `留言内容最多 ${FEEDBACK_MAX_DETAIL} 个字，请精简后再提交。`;
  if (draft.title.length > FEEDBACK_MAX_TITLE)
    return `标题最多 ${FEEDBACK_MAX_TITLE} 个字。`;
  if (draft.contact.length > FEEDBACK_MAX_CONTACT)
    return `联系方式最多 ${FEEDBACK_MAX_CONTACT} 个字。`;
  return null;
}

/** 没写标题时，用正文第一行自动生成一个，保证 Issue 列表可读。 */
export function deriveFeedbackTitle(
  detail: string,
  prefix: string,
  maxLength = FEEDBACK_MAX_TITLE,
): string {
  const firstLine = detail
    .split('\n')
    .map((line) => line.replace(/^[#>\-*\s]+/, '').trim())
    .find((line) => line.length > 0);
  const base = (firstLine ?? '').replace(/[。；;，,、]+$/, '');
  const suffix = base ? '' : '（未填写标题）';
  const body = (base || prefix) + suffix;
  return body.length > maxLength ? `${body.slice(0, maxLength - 1)}…` : body;
}

export function createFeedbackId(now: Date, suffix: string): string {
  return `fb-${now.getTime().toString(36)}-${suffix}`;
}

export function createFeedbackEntry(
  draft: FeedbackDraft,
  options: {
    now?: Date;
    id?: string;
    context?: FeedbackContext | null;
  } = {},
): FeedbackEntry {
  const now = options.now ?? new Date();
  const category = getFeedbackCategory(draft.category);
  const detail = normalizeText(draft.detail, FEEDBACK_MAX_DETAIL);
  const title =
    normalizeText(draft.title, FEEDBACK_MAX_TITLE) ||
    deriveFeedbackTitle(detail, category.prefix);
  return {
    id:
      options.id ??
      createFeedbackId(now, Math.random().toString(36).slice(2, 8)),
    createdAt: now.toISOString(),
    category: category.id,
    title,
    detail,
    contact: normalizeText(draft.contact, FEEDBACK_MAX_CONTACT),
    context: options.context ?? null,
    submittedCount: 0,
    lastSubmittedAt: null,
  };
}

/** 生成要贴进 Issue 的环境信息清单；没有环境信息时返回空数组。 */
export function buildFeedbackContextLines(context: FeedbackContext): string[] {
  const lines = [
    `学期：${context.termLabel}`,
    `培养方向：${context.programLabel}`,
    `已选课程：${context.selectedCount} 门 / ${context.selectedCredits} 学分`,
    `所在页面：${context.viewLabel}`,
    `记录时间：${formatFeedbackTime(context.capturedAt)}`,
    `页面地址：${context.pageUrl}`,
  ];
  if (context.userAgent) lines.push(`浏览器：${context.userAgent}`);
  return lines;
}

export function buildIssueTitle(entry: FeedbackEntry): string {
  return `【${getFeedbackCategory(entry.category).prefix}】${entry.title}`;
}

export function buildIssueBody(entry: FeedbackEntry): string {
  const sections = [
    `### 留言类型\n${getFeedbackCategory(entry.category).label}`,
    `### 详细说明\n${entry.detail}`,
    `### 联系方式\n${entry.contact || '（未填写，默认在 Issue 里回复即可）'}`,
  ];
  const contextLines = entry.context
    ? buildFeedbackContextLines(entry.context)
    : [];
  sections.push(
    contextLines.length
      ? `### 环境信息（由页面自动附带）\n${contextLines
          .map((line) => `- ${line}`)
          .join('\n')}`
      : '### 环境信息（由页面自动附带）\n（本条留言未附带环境信息）',
  );
  sections.push(
    '---\n由 HIAS-CSA 预选课助手「意见反馈 / 留言」页面生成；同一份内容在本机浏览器也有留档。',
  );
  return sections.join('\n\n');
}

export function buildIssueUrl(entry: FeedbackEntry): string {
  const params = new URLSearchParams({
    title: buildIssueTitle(entry),
    body: buildIssueBody(entry),
    labels: FEEDBACK_ISSUE_LABEL,
  });
  return `${FEEDBACK_NEW_ISSUE_URL}?${params.toString()}`;
}

/** URL 过长时浏览器/代理可能截断，此时只提供复制方案。 */
export function isIssueUrlTooLong(url: string): boolean {
  return url.length > FEEDBACK_MAX_ISSUE_URL;
}

/** 复制到剪贴板的纯文本（GitHub 打不开或没有账号时的兜底方案）。 */
export function formatFeedbackEntryText(entry: FeedbackEntry): string {
  const lines = [
    buildIssueTitle(entry),
    `类型：${getFeedbackCategory(entry.category).label}`,
    `记录时间：${formatFeedbackTime(entry.createdAt)}`,
    `联系方式：${entry.contact || '（未填写）'}`,
    '',
    entry.detail,
  ];
  if (entry.context) {
    lines.push('', '环境信息：');
    lines.push(
      ...buildFeedbackContextLines(entry.context).map((l) => `- ${l}`),
    );
  }
  return lines.join('\n');
}

export function formatFeedbackEntryStatus(entry: FeedbackEntry): string {
  if (!entry.lastSubmittedAt) return '尚未提交';
  return `已打开提交页 ${entry.submittedCount} 次 · 最近 ${formatFeedbackTime(
    entry.lastSubmittedAt,
  )}`;
}

export function feedbackExportFileName(now: Date): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}`;
  return `HIAS-CSA-意见反馈-${date}.md`;
}

/** 导出为本机 Markdown 文件；这是离线用户把留言交给维护者的主要途径。 */
export function formatFeedbackExport(
  entries: FeedbackEntry[],
  exportedAt: Date,
): string {
  const header = [
    '# HIAS-CSA 意见反馈 / 留言导出',
    '',
    `导出时间：${formatFeedbackTime(exportedAt.toISOString())}`,
    `共 ${entries.length} 条留言。这些内容只保存在当前浏览器，未自动上传；`,
    '可以把本文件粘贴到 GitHub Issue，或直接发给维护者。',
  ].join('\n');
  const blocks = sortFeedbackEntries(entries).map((entry, index) => {
    const lines = [
      `## ${index + 1}. ${buildIssueTitle(entry)}`,
      '',
      `- 记录时间：${formatFeedbackTime(entry.createdAt)}`,
      `- 提交状态：${formatFeedbackEntryStatus(entry)}`,
      `- 联系方式：${entry.contact || '（未填写）'}`,
      '',
      '详细说明：',
      '',
      ...entry.detail.split('\n').map((line) => `> ${line}`),
    ];
    if (entry.context) {
      lines.push('', '环境信息：');
      lines.push(
        ...buildFeedbackContextLines(entry.context).map((line) => `- ${line}`),
      );
    }
    return lines.join('\n');
  });
  return [header, ...blocks].join('\n\n---\n\n') + '\n';
}

export function isFeedbackEntry(value: unknown): value is FeedbackEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<FeedbackEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.createdAt === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.detail === 'string' &&
    typeof entry.category === 'string' &&
    typeof entry.contact === 'string' &&
    typeof entry.submittedCount === 'number' &&
    (entry.lastSubmittedAt === null ||
      typeof entry.lastSubmittedAt === 'string') &&
    (entry.context === null ||
      entry.context === undefined ||
      typeof entry.context === 'object')
  );
}

/** 新的在前；时间相同的按 id 稳定排序，保证渲染顺序可预期。 */
export function sortFeedbackEntries(entries: FeedbackEntry[]): FeedbackEntry[] {
  return [...entries].sort((left, right) => {
    if (left.createdAt === right.createdAt)
      return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
    return left.createdAt < right.createdAt ? 1 : -1;
  });
}

/** 从 localStorage 读到的原始字符串解析留言；任何异常都退化成空列表。 */
export function parseFeedbackEntries(raw: string | null | undefined) {
  if (!raw) return [] as FeedbackEntry[];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as FeedbackEntry[];
    return sortFeedbackEntries(parsed.filter(isFeedbackEntry)).slice(
      0,
      FEEDBACK_MAX_ENTRIES,
    );
  } catch {
    return [] as FeedbackEntry[];
  }
}

export function serializeFeedbackEntries(entries: FeedbackEntry[]): string {
  return JSON.stringify(
    sortFeedbackEntries(entries).slice(0, FEEDBACK_MAX_ENTRIES),
  );
}

export function upsertFeedbackEntry(
  entries: FeedbackEntry[],
  entry: FeedbackEntry,
): FeedbackEntry[] {
  const others = entries.filter((item) => item.id !== entry.id);
  return sortFeedbackEntries([entry, ...others]).slice(0, FEEDBACK_MAX_ENTRIES);
}

export function removeFeedbackEntry(
  entries: FeedbackEntry[],
  id: string,
): FeedbackEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

/** 记一次“打开提交页”尝试；只代表本机动作，不代表 Issue 已提交成功。 */
export function markFeedbackSubmitted(
  entry: FeedbackEntry,
  now: Date,
): FeedbackEntry {
  return {
    ...entry,
    submittedCount: entry.submittedCount + 1,
    lastSubmittedAt: now.toISOString(),
  };
}
