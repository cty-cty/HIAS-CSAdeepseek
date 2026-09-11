'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * 顶层错误边界。
 *
 * 之前项目里没有任何 error boundary：localStorage 写入超配额（QuotaExceededError）
 * 或任意渲染异常都会让 React 卸载整棵树，用户看到纯白页面且无从恢复。
 * 这里兜底并提供“导出本地数据 / 重置本地状态”两条自救路径。
 */

const LOCAL_KEY_PREFIX = 'hias-';

function collectLocalData(): Record<string, string> {
  const dump: Record<string, string> = {};
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(LOCAL_KEY_PREFIX)) {
        dump[key] = window.localStorage.getItem(key) ?? '';
      }
    }
  } catch {
    // 存储被禁用时忽略
  }
  return dump;
}

function downloadLocalBackup() {
  try {
    const dump = collectLocalData();
    const blob = new Blob([JSON.stringify(dump, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hias-csa-本地数据备份.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    // 忽略：下载失败不应再次抛出
  }
}

function clearLocalData() {
  try {
    Object.keys(collectLocalData()).forEach((key) =>
      window.localStorage.removeItem(key),
    );
  } catch {
    // 忽略
  }
}

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[HIAS-CSA] 页面渲染异常：', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  private handleDownload = () => {
    downloadLocalBackup();
  };

  private handleReset = () => {
    const confirmed = window.confirm(
      '将清除保存在本浏览器中的选课记录、培养设置与已导入数据，然后重新载入页面。\n\n建议先点“下载本地数据备份”留一份再继续。确定要清除吗？',
    );
    if (!confirmed) return;
    clearLocalData();
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const primaryButton =
      'rounded-xl bg-[#234c89] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d3f73]';
    const secondaryButton =
      'rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50';

    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-3 p-6">
        <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">页面出现异常</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            已选课程、培养设置与导入的数据仍然保存在本浏览器中，不会因为这次异常丢失。
            建议先下载一份本地数据备份，再尝试恢复页面。
          </p>
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm leading-6 break-words text-rose-700">
            {error.message || '未知错误'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className={primaryButton}
              onClick={this.handleRetry}
              type="button"
            >
              尝试恢复页面
            </button>
            <button
              className={secondaryButton}
              onClick={this.handleDownload}
              type="button"
            >
              下载本地数据备份
            </button>
            <button
              className={secondaryButton}
              onClick={() => window.location.reload()}
              type="button"
            >
              重新载入
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            如果反复出现，可
            <button
              className="mx-1 font-semibold text-rose-600 underline underline-offset-2"
              onClick={this.handleReset}
              type="button"
            >
              清除本地数据并重新载入
            </button>
            （清除前请确认已下载备份）。
          </p>
          <details className="mt-4 text-xs text-slate-500">
            <summary className="cursor-pointer select-none">技术细节</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-50 p-3 whitespace-pre-wrap break-all">
              {error.stack || String(error)}
            </pre>
          </details>
        </div>
        <p className="text-center text-xs text-slate-400">
          HIAS-CSA · 本工具为非官方选课规划辅助工具，数据仅保存在本浏览器。
        </p>
      </div>
    );
  }
}
