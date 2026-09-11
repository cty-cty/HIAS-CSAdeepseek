// 生成 GitHub Pages 发布目录。
//
// 之前的工作流只把单个 HTML 复制成 index.html，仓库 public/ 里的
// favicon.svg / og.png / manifest.webmanifest / sw.js 全都没有上线，
// 导致 /favicon.ico 404、分享时没有预览卡片、也无法安装为应用。
//
// 另外站点部署在子路径（/HIAS-CSAdeepseek/）下，所有资源引用必须使用
// 相对路径，写死 '/' 会指向 GitHub Pages 的域名根目录而 404。
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoParentDir = path.resolve(projectDir, '..');
const offlineHtmlPath = path.join(
  repoParentDir,
  'HIAS-CSA-2026秋季预选课助手-离线版.html',
);
const publicDir = path.join(projectDir, 'public');
const siteDir = path.join(projectDir, '_site');

const SITE_URL = (
  process.env.SITE_URL || 'https://cty-cty.github.io/HIAS-CSAdeepseek/'
).replace(/\/?$/, '/');

const TITLE = 'HIAS-CSA · 2026 秋季预选课助手';
const DESCRIPTION =
  '仅面向国科大杭州高等研究院 2026 级研一新生，提供秋季课程筛选、培养方案核对、选课须知、按周排课与冲突检测。';

const headTags = `    <meta name="description" content="${DESCRIPTION}">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="apple-touch-icon" href="favicon.svg">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="HIAS-CSA">
    <meta property="og:title" content="${TITLE}">
    <meta property="og:description" content="${DESCRIPTION}">
    <meta property="og:url" content="${SITE_URL}">
    <meta property="og:image" content="${SITE_URL}og.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${TITLE}">
    <meta name="twitter:description" content="${DESCRIPTION}">
    <meta name="twitter:image" content="${SITE_URL}og.png">
`;

const serviceWorkerScript = `    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('sw.js').catch(function () {});
        });
      }
    </script>
`;

const notFoundPage = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>页面不存在 · HIAS-CSA</title>
    <link rel="icon" href="favicon.svg" type="image/svg+xml">
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f5f7f6;
        color: #172b46;
        font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui,
          sans-serif;
      }
      main {
        max-width: 26rem;
        padding: 2rem;
        text-align: center;
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.5rem;
      }
      p {
        margin: 0 0 1.5rem;
        line-height: 1.7;
        color: #4a5a72;
      }
      a {
        display: inline-block;
        padding: 0.7rem 1.3rem;
        border-radius: 0.75rem;
        background: #234c89;
        color: #fff;
        text-decoration: none;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>页面不存在</h1>
      <p>你访问的地址不在预选课助手的范围内，请回到首页继续使用。</p>
      <a href="./">返回预选课助手</a>
    </main>
  </body>
</html>
`;

const html = await readFile(offlineHtmlPath, 'utf8');

if (!html.includes('</head>')) {
  throw new Error(`离线构建产物缺少 </head>：${offlineHtmlPath}`);
}

const published = html
  // 线上版本标题去掉“（离线版）”，并补上分享/安装所需的元数据
  .replace(
    /<title>[^<]*<\/title>/,
    `<title>${TITLE}</title>\n${headTags}`,
  )
  .replace('</body>', `${serviceWorkerScript}  </body>`);

if (!published.includes('og:title')) {
  throw new Error('注入分享元数据失败，请检查离线构建产物的 <head> 结构。');
}

await mkdir(siteDir, { recursive: true });
await writeFile(path.join(siteDir, 'index.html'), published, 'utf8');
await writeFile(path.join(siteDir, '404.html'), notFoundPage, 'utf8');
await writeFile(path.join(siteDir, '.nojekyll'), '', 'utf8');

for (const asset of [
  'favicon.svg',
  'og.png',
  'manifest.webmanifest',
  'sw.js',
]) {
  await copyFile(path.join(publicDir, asset), path.join(siteDir, asset));
}

console.log(`已生成 Pages 站点目录：${siteDir}`);
console.log(`  站点地址前缀：${SITE_URL}`);
