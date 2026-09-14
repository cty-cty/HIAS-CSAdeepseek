// 生成 PWA 图标（192/512/maskable），纯 Node 实现，无需第三方依赖。
// 复刻 public/favicon.svg 的四个圆角方块配色，输出 PNG。
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const publicDir = path.join(projectDir, 'public');

// --- PNG 编码 ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // 无过滤
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- favicon.svg 中的四个圆角方块（24x24 坐标系） ---
const RECTS = [
  { x0: 2, y0: 2, x1: 12, y1: 12, r: 2.72727, color: [46, 158, 255] },
  { x0: 12, y0: 12, x1: 22, y1: 22, r: 2.72727, color: [104, 196, 255] },
  { x0: 15, y0: 2, x1: 22, y1: 9, r: 1, color: [12, 121, 216] },
  { x0: 2, y0: 15, x1: 9, y1: 22, r: 1, color: [12, 121, 216] },
];

function roundedRectDist(px, py, rect) {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const hw = (rect.x1 - rect.x0) / 2;
  const hh = (rect.y1 - rect.y0) / 2;
  const qx = Math.abs(px - cx) - (hw - rect.r);
  const qy = Math.abs(py - cy) - (hh - rect.r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - rect.r;
}

function renderIcon(size, { maskable = false, background = null } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const safe = maskable ? 0.8 : 1.0;
  const inset = (1 - safe) / 2;
  const scale = (size * safe) / 24;
  const offset = size * inset;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (background) {
        rgba[i] = background[0];
        rgba[i + 1] = background[1];
        rgba[i + 2] = background[2];
        rgba[i + 3] = 255;
      } else {
        rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0;
      }

      const px = (x - offset) / scale;
      const py = (y - offset) / scale;
      for (const rect of RECTS) {
        const dPx = roundedRectDist(px, py, rect) * scale;
        if (dPx < 0.5) {
          const cov = dPx < -0.5 ? 1 : 0.5 - dPx;
          if (background) {
            rgba[i] = Math.round(rect.color[0] * cov + background[0] * (1 - cov));
            rgba[i + 1] = Math.round(
              rect.color[1] * cov + background[1] * (1 - cov),
            );
            rgba[i + 2] = Math.round(
              rect.color[2] * cov + background[2] * (1 - cov),
            );
            rgba[i + 3] = 255;
          } else {
            rgba[i] = rect.color[0];
            rgba[i + 1] = rect.color[1];
            rgba[i + 2] = rect.color[2];
            rgba[i + 3] = Math.round(255 * cov);
          }
          break;
        }
      }
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(publicDir, { recursive: true });
writeFileSync(path.join(publicDir, 'icon-192.png'), renderIcon(192));
writeFileSync(path.join(publicDir, 'icon-512.png'), renderIcon(512));
writeFileSync(
  path.join(publicDir, 'icon-maskable-512.png'),
  renderIcon(512, { maskable: true, background: [18, 63, 107] }),
);
console.log('已生成 icon-192.png / icon-512.png / icon-maskable-512.png');
