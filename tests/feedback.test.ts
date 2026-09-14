/**
 * 意见反馈 / 留言功能的纯逻辑测试（无新增依赖）。
 *
 * 重点覆盖：
 * - 表单校验与自动标题；
 * - 留言条目的归一化、存储往返与容量上限；
 * - GitHub Issue 标题 / 正文 / 链接的确定性生成（提交前必须先本地留档）；
 * - 导出文本与文件名。
 *
 * 运行方式：npm run test:rules
 */
import {
  buildIssueBody,
  buildIssueUrl,
  buildFeedbackContextLines,
  createFeedbackEntry,
  deriveFeedbackTitle,
  feedbackExportFileName,
  formatFeedbackEntryStatus,
  formatFeedbackEntryText,
  formatFeedbackExport,
  formatFeedbackTime,
  getFeedbackCategory,
  isFeedbackEntry,
  isIssueUrlTooLong,
  markFeedbackSubmitted,
  parseFeedbackEntries,
  removeFeedbackEntry,
  serializeFeedbackEntries,
  sortFeedbackEntries,
  upsertFeedbackEntry,
  validateFeedbackDraft,
  EMPTY_FEEDBACK_DRAFT,
  FEEDBACK_CATEGORIES,
  FEEDBACK_ISSUE_LABEL,
  FEEDBACK_MAX_ENTRIES,
  FEEDBACK_MAX_DETAIL,
  FEEDBACK_MAX_TITLE,
  FEEDBACK_REPO,
  FEEDBACK_STORAGE_KEY,
  type FeedbackContext,
  type FeedbackDraft,
  type FeedbackEntry,
} from '../app/feedback';

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

const FIXED_NOW = new Date(2026, 8, 11, 10, 30, 0);

function draft(patch: Partial<FeedbackDraft> = {}): FeedbackDraft {
  return { ...EMPTY_FEEDBACK_DRAFT, ...patch };
}

function context(): FeedbackContext {
  return {
    termLabel: '2026—2027学年(秋)第一学期（2026-fall）',
    programLabel: '光学工程（硕士）',
    selectedCount: 6,
    selectedCredits: 13.5,
    viewLabel: '选课程',
    pageUrl: 'https://cty-cty.github.io/HIAS-CSAdeepseek/',
    userAgent: 'Mozilla/5.0 (Test)',
    capturedAt: FIXED_NOW.toISOString(),
  };
}

// ---------- 1) 存储键与分类常量 ----------
eq(FEEDBACK_STORAGE_KEY, 'hias-feedback-v1', 'F1 反馈存储键保持稳定');
eq(FEEDBACK_ISSUE_LABEL, 'feedback', 'F1b Issue 标签为 ASCII 的 feedback');
eq(FEEDBACK_REPO, 'cty-cty/HIAS-CSAdeepseek', 'F1c 仓库地址未漂移');
eq(FEEDBACK_CATEGORIES.length, 4, 'F1d 四种留言类型：建议/数据/问题/其他');
ok(
  new Set(FEEDBACK_CATEGORIES.map((item) => item.id)).size ===
    FEEDBACK_CATEGORIES.length,
  'F1e 分类 id 不重复',
);
ok(
  FEEDBACK_CATEGORIES.every(
    (item) => item.label && item.prefix && item.hint.length > 0,
  ),
  'F1f 每个分类都有标签、Issue 前缀与说明',
);

// ---------- 2) 表单校验 ----------
ok(
  validateFeedbackDraft(draft({ detail: '' })) !== null,
  'F2 空内容不通过校验',
);
ok(
  validateFeedbackDraft(draft({ detail: '太短' })) !== null,
  'F2b 过短内容不通过校验',
);
eq(
  validateFeedbackDraft(
    draft({ detail: '周三课程的上课教室与教务系统不一致。' }),
  ),
  null,
  'F2c 正常内容通过校验',
);
ok(
  validateFeedbackDraft(
    draft({ detail: 'x'.repeat(FEEDBACK_MAX_DETAIL + 1) }),
  ) !== null,
  'F2d 超出字数上限不通过校验',
);
ok(
  validateFeedbackDraft(
    draft({
      detail: '教室信息不一致。',
      title: 'x'.repeat(FEEDBACK_MAX_TITLE + 1),
    }),
  ) !== null,
  'F2e 标题超长不通过校验',
);

// ---------- 3) 自动标题 ----------
eq(
  deriveFeedbackTitle('周三课程教室不一致。\n补充说明', '数据纠错'),
  '周三课程教室不一致',
  'F3 自动标题取正文首行并去掉句号',
);
eq(
  deriveFeedbackTitle('## 建议增加导出功能', '功能建议'),
  '建议增加导出功能',
  'F3b 自动标题去掉 markdown 标记',
);
eq(
  deriveFeedbackTitle('', '功能建议'),
  '功能建议（未填写标题）',
  'F3c 正文为空时给出兜底标题',
);
ok(
  deriveFeedbackTitle('长'.repeat(200), '功能建议').length <=
    FEEDBACK_MAX_TITLE,
  'F3d 自动标题不超过长度上限',
);

// ---------- 4) 条目组装 ----------
const entry = createFeedbackEntry(
  draft({
    category: 'data',
    title: ' 课程教室不一致 ',
    detail: '光电子材料与器件 周三 1-3 节教室不一致。\r\n\r\n\r\n请核对。',
    contact: ' 1405659491@qq.com ',
  }),
  { now: FIXED_NOW, id: 'fb-test-1', context: context() },
);
eq(entry.id, 'fb-test-1', 'F4 支持注入 id（便于测试与去重）');
eq(entry.createdAt, FIXED_NOW.toISOString(), 'F4b createdAt 使用注入时间');
eq(entry.category, 'data', 'F4c 分类被解析为 id');
eq(entry.title, '课程教室不一致', 'F4d 标题去除首尾空格');
eq(
  entry.detail,
  '光电子材料与器件 周三 1-3 节教室不一致。\n\n请核对。',
  'F4e 正文统一换行并合并多余空行',
);
eq(entry.contact, '1405659491@qq.com', 'F4f 联系方式去除首尾空格');
eq(entry.submittedCount, 0, 'F4g 新建条目未提交');
eq(entry.lastSubmittedAt, null, 'F4h 新建条目没有提交时间');
ok(entry.context !== null, 'F4i 勾选时携带环境信息');

const noContextEntry = createFeedbackEntry(
  draft({ detail: '没有附带环境信息的一条留言。' }),
  { now: FIXED_NOW, id: 'fb-test-2', context: null },
);
eq(noContextEntry.context, null, 'F4j 取消勾选时不携带环境信息');
eq(
  noContextEntry.title,
  '没有附带环境信息的一条留言',
  'F4k 留空标题时自动取正文首行',
);

// 未知分类兜底到最后一种，不抛异常
eq(
  getFeedbackCategory('not-exist').id,
  FEEDBACK_CATEGORIES[FEEDBACK_CATEGORIES.length - 1].id,
  'F4l 未知分类兜底为“其他留言”',
);

// ---------- 5) Issue 标题 / 正文 / 链接 ----------
eq(
  buildIssueBody(entry).includes('### 详细说明'),
  true,
  'F5 正文包含详细说明小节',
);
ok(
  buildIssueBody(entry).includes('教室不一致') &&
    buildIssueBody(entry).includes('2026-fall') &&
    buildIssueBody(entry).includes('光学工程（硕士）'),
  'F5b 正文包含留言内容与环境信息',
);
ok(
  buildIssueBody(noContextEntry).includes('未附带环境信息'),
  'F5c 未附带环境信息时正文有明确说明',
);
ok(
  buildIssueBody(
    createFeedbackEntry(draft({ detail: '没有联系方式的一条留言。' })),
  ).includes('（未填写'),
  'F5d 未填联系方式时正文有占位说明',
);

const issueUrl = buildIssueUrl(entry);
ok(
  issueUrl.startsWith(`https://github.com/${FEEDBACK_REPO}/issues/new?`),
  'F5e Issue 链接指向本仓库新建页',
);
const parsedUrl = new URL(issueUrl);
eq(
  parsedUrl.searchParams.get('title'),
  '【数据纠错】课程教室不一致',
  'F5f Issue 标题带分类前缀',
);
eq(
  parsedUrl.searchParams.get('labels'),
  FEEDBACK_ISSUE_LABEL,
  'F5g Issue 链接带 feedback 标签',
);
eq(
  parsedUrl.searchParams.get('body'),
  buildIssueBody(entry),
  'F5h Issue 正文可完整往返',
);
ok(
  !issueUrl.includes('\n') && !issueUrl.includes(' '),
  'F5i Issue 链接已正确编码（无换行与裸空格）',
);
eq(isIssueUrlTooLong(issueUrl), false, 'F5j 普通留言链接长度可用');
eq(
  isIssueUrlTooLong(`https://example.com/?q=${'a'.repeat(9000)}`),
  true,
  'F5k 超长链接会被识别（提示改用复制方案）',
);
ok(
  !issueUrl.includes('gmail.com') && !issueUrl.includes('chatgpt.site'),
  'F5l 链接不包含离线版校验禁止的个人地址',
);

// ---------- 6) 文本与导出 ----------
const entryText = formatFeedbackEntryText(entry);
ok(
  entryText.includes('【数据纠错】课程教室不一致') &&
    entryText.includes('类型：课程数据纠错') &&
    entryText.includes('环境信息：') &&
    entryText.includes('- 学期：'),
  'F6 复制文本包含标题、类型与环境信息',
);
eq(
  formatFeedbackEntryText(noContextEntry).includes('环境信息：'),
  false,
  'F6b 未附带环境信息时不输出该段',
);
eq(formatFeedbackEntryStatus(entry), '尚未提交', 'F6c 未提交条目的状态文案');
eq(
  formatFeedbackEntryStatus(markFeedbackSubmitted(entry, FIXED_NOW)).includes(
    '已打开提交页 1 次',
  ),
  true,
  'F6d 提交后状态文案带次数',
);

const exported = formatFeedbackExport([entry, noContextEntry], FIXED_NOW);
ok(
  exported.includes('# HIAS-CSA 意见反馈 / 留言导出') &&
    exported.includes('共 2 条留言') &&
    exported.includes('## 1. 【功能建议】没有附带环境信息的一条留言') &&
    exported.includes('## 2. 【数据纠错】课程教室不一致'),
  'F6e 导出内容包含标题、条数与编号（新的在前）',
);
ok(
  exported.includes('> 光电子材料与器件') && exported.includes('## 2.'),
  'F6f 导出内容保留正文原文',
);
ok(
  !exported.includes('undefined') && !exported.includes('[object Object]'),
  'F6g 导出内容没有 undefined / [object Object]',
);
eq(
  feedbackExportFileName(FIXED_NOW),
  'HIAS-CSA-意见反馈-20260911.md',
  'F6h 导出文件名带日期且不含非法字符',
);
eq(
  formatFeedbackTime(FIXED_NOW.toISOString()),
  '2026-09-11 10:30',
  'F6i 时间格式化为本地 YYYY-MM-DD HH:mm',
);
eq(formatFeedbackTime('不是时间'), '不是时间', 'F6j 非法时间原样返回');

// ---------- 7) 存储往返与容量 ----------
const roundTrip = parseFeedbackEntries(serializeFeedbackEntries([entry]));
eq(roundTrip.length, 1, 'F7 序列化后可完整解析');
eq(roundTrip[0].id, entry.id, 'F7b 往返后 id 不变');
eq(
  roundTrip[0].context?.termLabel,
  context().termLabel,
  'F7c 往返后环境信息保留',
);

eq(parseFeedbackEntries(null), [], 'F7d 空存储解析为空列表');
eq(parseFeedbackEntries(''), [], 'F7e 空字符串解析为空列表');
eq(parseFeedbackEntries('{ 坏 JSON'), [], 'F7f 坏 JSON 退化为空列表');
eq(parseFeedbackEntries('{"a":1}'), [], 'F7g 非数组退化为空列表');
eq(
  parseFeedbackEntries(JSON.stringify([entry, { id: 1 }, null])).length,
  1,
  'F7h 混合数组只保留合法条目',
);
eq(isFeedbackEntry(entry), true, 'F7i 合法条目通过类型守卫');
eq(isFeedbackEntry({ id: 'x' }), false, 'F7j 残缺对象不通过类型守卫');

const many: FeedbackEntry[] = Array.from(
  { length: FEEDBACK_MAX_ENTRIES + 5 },
  (_, index) =>
    createFeedbackEntry(
      draft({ detail: `第 ${index} 条留言内容，用于容量测试。` }),
      {
        now: new Date(FIXED_NOW.getTime() + index * 1000),
        id: `fb-many-${index}`,
      },
    ),
);
const capped = parseFeedbackEntries(serializeFeedbackEntries(many));
eq(capped.length, FEEDBACK_MAX_ENTRIES, 'F7k 超出上限时只保留上限条数');
eq(
  capped[0].id,
  `fb-many-${FEEDBACK_MAX_ENTRIES + 4}`,
  'F7l 保留的是最新的留言（新的在前）',
);

// ---------- 8) 增删改 ----------
const inserted = upsertFeedbackEntry([entry], noContextEntry);
eq(inserted.length, 2, 'F8 新增条目写入列表');
eq(inserted[0].id, noContextEntry.id, 'F8b 新条目排在最前（时间更新）');
eq(
  upsertFeedbackEntry(inserted, {
    ...noContextEntry,
    title: '改过的标题',
  }).filter((item) => item.id === noContextEntry.id).length,
  1,
  'F8c 同 id 为覆盖而不是追加',
);
eq(
  upsertFeedbackEntry(inserted, {
    ...noContextEntry,
    title: '改过的标题',
  })[0].title,
  '改过的标题',
  'F8d 同 id 覆盖后标题生效',
);
eq(
  removeFeedbackEntry(inserted, entry.id).map((item) => item.id),
  [noContextEntry.id],
  'F8e 删除指定留言只删这一条',
);
eq(
  removeFeedbackEntry(inserted, 'fb-not-exist').length,
  2,
  'F8f 删除不存在的 id 无副作用',
);

const submitted = markFeedbackSubmitted(entry, FIXED_NOW);
eq(submitted.submittedCount, 1, 'F8g 提交计数 +1');
eq(submitted.lastSubmittedAt, FIXED_NOW.toISOString(), 'F8h 记录最近提交时间');
eq(entry.submittedCount, 0, 'F8i 不修改原对象（保持不可变）');
eq(
  markFeedbackSubmitted(submitted, FIXED_NOW).submittedCount,
  2,
  'F8j 多次打开提交页会累计次数',
);

eq(
  sortFeedbackEntries([entry, noContextEntry]).map((item) => item.id),
  [noContextEntry.id, entry.id],
  'F8k 列表按时间倒序（新的在前）',
);
eq(
  buildFeedbackContextLines(context()).length,
  7,
  'F8l 环境信息共 7 行（含浏览器标识）',
);

// ---------- 汇总 ----------
console.log(`\n意见反馈逻辑测试：通过 ${passed} 项，失败 ${failed} 项`);
if (failures.length) {
  console.log('失败明细：');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('意见反馈逻辑测试全部通过 ✓');
