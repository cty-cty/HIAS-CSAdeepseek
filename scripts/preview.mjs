// 本地预览：把生成的离线单文件网页通过 http 提供（便于浏览器直接检查新版本）。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const PORT = Number(process.env.PREVIEW_PORT || 8817);
const HOST = '127.0.0.1';
const file = process.argv[2];
if (!file) {
  console.error('用法：node scripts/preview.mjs <离线HTML路径>');
  process.exit(1);
}

createServer(async (req, res) => {
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
}).listen(PORT, HOST, () => {
  console.log(`预览地址: http://${HOST}:${PORT}`);
});
