import {
  buildIssueUrl,
  isIssueUrlTooLong,
  markFeedbackSubmitted,
  serializeFeedbackEntries,
  upsertFeedbackEntry,
  type FeedbackEntry,
} from './feedback';

type FeedbackWriter = (value: string) => boolean;

/** 写入失败时不改变调用方的表单或列表，也不宣告保存成功。 */
export function persistFeedbackEntries(
  entries: FeedbackEntry[],
  write: FeedbackWriter,
): boolean {
  try {
    return write(serializeFeedbackEntries(entries));
  } catch {
    return false;
  }
}

type FeedbackActionResult =
  | { ok: false; reason: 'url-too-long' | 'storage' }
  | {
      ok: true;
      entries: FeedbackEntry[];
      issueUrl: string | null;
      openFailed: boolean;
    };

/** 同步留档后才打开外部页面，仍处于用户点击事件中，避免丢失弹窗权限。 */
export function runFeedbackAction(
  entries: FeedbackEntry[],
  entry: FeedbackEntry,
  options: { write: FeedbackWriter; openIssue?: (url: string) => void },
  now = new Date(),
): FeedbackActionResult {
  const issueUrl = options.openIssue ? buildIssueUrl(entry) : null;
  if (issueUrl && isIssueUrlTooLong(issueUrl)) {
    return { ok: false, reason: 'url-too-long' };
  }
  // 此计数表示打开尝试，不代表窗口确实打开或 Issue 创建成功。
  const nextEntry = issueUrl ? markFeedbackSubmitted(entry, now) : entry;
  const nextEntries = upsertFeedbackEntry(entries, nextEntry);
  if (!persistFeedbackEntries(nextEntries, options.write)) {
    return { ok: false, reason: 'storage' };
  }
  let openFailed = false;
  if (issueUrl && options.openIssue) {
    try {
      options.openIssue(issueUrl);
    } catch {
      openFailed = true;
    }
  }
  return { ok: true, entries: nextEntries, issueUrl, openFailed };
}
