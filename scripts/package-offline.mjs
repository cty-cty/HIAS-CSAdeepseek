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

const [css, bundledJavaScript] = await Promise.all([
  readFile(path.join(projectDir, '.offline-build', 'app.css'), 'utf8'),
  readFile(path.join(projectDir, '.offline-build', 'app.js'), 'utf8'),
]);

const javaScript = bundledJavaScript.replaceAll('</script', '<\\/script');

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="theme-color" content="#123f6b">
    <title>HIAS-CSA 2026 秋季预选课助手（离线版）</title>
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
