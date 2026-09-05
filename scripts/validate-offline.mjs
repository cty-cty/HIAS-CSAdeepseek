import { readFile, stat } from 'node:fs/promises';
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

const [html, courses, fileInfo] = await Promise.all([
  readFile(outputPath, 'utf8'),
  readFile(path.join(projectDir, 'app', 'courses.json'), 'utf8').then(
    JSON.parse,
  ),
  stat(outputPath),
]);

const failures = [];
const documentShell = html.slice(0, html.indexOf('<script>'));

if (/<script\b[^>]*\bsrc=/i.test(documentShell))
  failures.push('仍包含外部脚本');
if (/<link\b[^>]*\bhref=/i.test(documentShell)) failures.push('仍包含外部样式');
if (html.includes('hias-logo-white.png')) failures.push('仍包含官方 Logo 资源');
if (html.includes('process.env.NODE_ENV'))
  failures.push('仍包含浏览器无法识别的环境变量');

for (const personalMarker of ['gmail.com', 'chatgpt.site']) {
  if (html.includes(personalMarker)) {
    failures.push(`包含不应出现的地址信息：${personalMarker}`);
  }
}

const missingCourses = courses.filter(
  (course) => !html.includes(course.code) || !html.includes(course.name),
);
if (missingCourses.length) {
  failures.push(`缺少 ${missingCourses.length} 门课程的数据`);
}

if (failures.length) {
  throw new Error(failures.join('\n'));
}

console.log(
  `离线版校验通过：${courses.length} 门课程，${(fileInfo.size / 1024 / 1024).toFixed(2)} MB，无外部脚本、样式、官方 Logo 或个人网址。`,
);
