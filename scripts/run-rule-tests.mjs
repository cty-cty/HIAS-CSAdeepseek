// 轻量规则测试运行器：用仓库自带的 esbuild 把 tests/program-rules.test.ts 打包为临时 ESM，
// 然后执行（不引入额外测试框架依赖；Node >= 22.13）。
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'hias-rules-'));
const outfile = join(dir, 'rules.mjs');
try {
  await build({
    entryPoints: ['tests/program-rules.test.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile,
    logLevel: 'silent',
  });
  await import(`file://${outfile}?t=${Date.now()}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
