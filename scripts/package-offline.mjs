import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outputPath = path.resolve(
  projectDir,
  '..',
  'HIAS-CSAdeepseek-2026秋季预选课助手-离线版.html',
);

const [css, bundledJavaScript, faviconSvg] = await Promise.all([
  readFile(path.join(projectDir, '.offline-build', 'app.css'), 'utf8'),
  readFile(path.join(projectDir, '.offline-build', 'app.js'), 'utf8'),
  readFile(path.join(projectDir, 'public', 'favicon.svg'), 'utf8'),
]);

const javaScript = bundledJavaScript.replaceAll('</script', '<\\/script');
const faviconHref = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  faviconSvg,
)}`;

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="theme-color" content="#123f6b">
    <meta name="description" content="国科大杭州高等研究院 2026 级研一新生秋季课程查询与预选课模拟工具：课程筛选、冲突检测、学分统计、培养方案核对与按周课表。仅供课程查询与选课规划参考。">
    <meta property="og:title" content="HIAS-CSAdeepseek · 2026 秋季预选课助手">
    <meta property="og:type" content="website">
    <meta property="og:description" content="国科大杭州高等研究院 2026 级研一新生秋季课程查询与预选课模拟工具，支持冲突检测、学分统计与培养方案核对。">
    <link rel="icon" href="${faviconHref}">
    <title>HIAS-CSAdeepseek 2026 秋季预选课助手（离线版）</title>
    <style>${css}</style>
  </head>
  <body>
    <noscript>请启用浏览器 JavaScript 后使用本课表。</noscript>
    <div id="root"></div>
    <script>${javaScript}</script>
  </body>
</html>
`;

await writeFile(outputPath, html, 'utf8');
console.log(outputPath);
