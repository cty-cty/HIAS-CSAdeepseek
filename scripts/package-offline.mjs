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
  'HIAS-CSA-2026秋季预选课助手-离线版.html',
);

const [css, bundledJavaScript, faviconSvg] = await Promise.all([
  readFile(path.join(projectDir, '.offline-build', 'app.css'), 'utf8'),
  readFile(path.join(projectDir, '.offline-build', 'app.js'), 'utf8'),
  readFile(path.join(projectDir, 'public', 'favicon.svg'), 'utf8'),
]);

const javaScript = bundledJavaScript.replaceAll('</script', '<\\/script');
// 单文件必须自包含，图标用 data URI 内联（外部文件在离线分发时会丢失）。
const faviconDataUri = `data:image/svg+xml,${encodeURIComponent(
  faviconSvg.trim(),
)}`;

const description =
  '仅面向国科大杭州高等研究院 2026 级研一新生的秋季预选课辅助工具：课程查询、冲突检测、学位课属性、培养方案核对与模拟课表。';

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="theme-color" content="#123f6b">
    <meta name="description" content="${description}">
    <title>HIAS-CSA 2026 秋季预选课助手（离线版）</title>
    <link rel="icon" href="${faviconDataUri}">
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
