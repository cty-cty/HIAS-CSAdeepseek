import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Creates the git-ignored `.openai/hosting.json` placeholder when missing so
// that fresh clones can run `npm run dev` / `npm run build`. Replace the file
// with real Cloudflare bindings if you ever deploy the vinext build.
const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const hostingPath = path.join(projectDir, '.openai', 'hosting.json');

if (!existsSync(hostingPath)) {
  await mkdir(path.dirname(hostingPath), { recursive: true });
  await writeFile(
    hostingPath,
    JSON.stringify({ d1: null, r2: null }, null, 2) + '\n',
    'utf8',
  );
  console.log('Created placeholder .openai/hosting.json (no bindings).');
}
