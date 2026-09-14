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

const [css, bundledJavaScript, favicon] = await Promise.all([
  readFile(path.join(projectDir, '.offline-build', 'app.css'), 'utf8'),
  readFile(path.join(projectDir, '.offline-build', 'app.js'), 'utf8'),
  readFile(path.join(projectDir, 'public', 'favicon.svg')),
]);

const javaScript = bundledJavaScript.replaceAll('</script', '<\\/script');
const faviconDataUri = `data:image/svg+xml;base64,${favicon.toString('base64')}`;

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="theme-color" content="#123f6b">
    <meta name="description" content="仅面向国科大杭州高等研究院 2026 级研一新生的秋季预选课辅助工具，支持课程筛选、选课方案体检、学位课属性、培养方案核对、课表模拟与冲突检测。">
    <meta property="og:title" content="HIAS-CSA · 2026 秋季预选课助手">
    <meta property="og:description" content="仅面向国科大杭州高等研究院 2026 级研一新生，提供秋季课程筛选、培养方案核对、选课须知、按周排课与冲突检测。">
    <meta property="og:type" content="website">
    <meta property="og:image" content="./og.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="HIAS-CSA · 2026 秋季预选课助手">
    <meta name="twitter:description" content="仅面向国科大杭州高等研究院 2026 级研一新生，提供秋季课程筛选、培养方案核对、选课须知、按周排课与冲突检测。">
    <meta name="twitter:image" content="./og.png">
    <link rel="icon" type="image/svg+xml" href="${faviconDataUri}">
    <link rel="manifest" href="./manifest.webmanifest">
    <link rel="apple-touch-icon" href="./icon-192.png">
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
