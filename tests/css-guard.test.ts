/**
 * 样式防线测试：全局样式表里不允许出现与 Tailwind 工具类同名的「裸类选择器」。
 *
 * 背景（真实事故）：`app/globals.css` 曾把 DeepSeek 桌面页的装饰圆环命名为
 * `.ring-1` / `.ring-2`，而 shadcn 组件的 `ring-1` / `ring-2` 是 Tailwind 的
 * ring 宽度工具类。`@import 'tailwindcss'` 生成的工具类在 `@layer utilities`
 * 里，**未分层的普通类会盖住分层样式**，于是所有带 `ring-1` 的组件
 * （DialogContent、AlertDialogContent 等）都被强行套上
 * `width:225px;height:225px;transform:rotate(27deg) skew(-8deg)`，
 * 表现为「培养设置」弹窗整体歪斜。
 *
 * 因此这里做两道检查：
 * 1. `app/globals.css` 中不得存在工具类风格的裸类选择器（如 `.ring-1`）；
 * 2. 每个用到的类名都必须真的在样式表里有定义（防止改名后漏改一处）。
 *
 * 说明：`.plan-summary .mt-6`、`.hero-panel > div.relative` 这类**带祖先限定**
 * 的写法是 Tailwind 的常见做法，只在那棵子树里生效，不算撞名，因此本测试只检查
 * 整条选择器就是单个 `.类名` 的「裸」情况。
 *
 * 运行方式：npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(
      `${label}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`,
    );
  }
}

const root = process.cwd();
const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8');

/**
 * Tailwind 工具类的命名空间。裸类选择器一旦落在这些命名空间里，
 * 就会盖住同名工具类；自定义类请统一加项目前缀（如 `dsh-`、`feedback-`）。
 */
const UTILITY_PREFIXES = [
  'ring',
  'shadow',
  'rounded',
  'border',
  'bg',
  'text',
  'font',
  'opacity',
  'blur',
  'scale',
  'rotate',
  'translate',
  'duration',
  'delay',
  'ease',
  'animate',
  'leading',
  'tracking',
  'space',
  'divide',
  'outline',
  'fill',
  'stroke',
  'cursor',
  'select',
  'resize',
  'transition',
  'container',
  'aspect',
  'basis',
  'grow',
  'shrink',
  'inset',
  'order',
  'columns',
  'object',
  'overflow',
  'underline',
  'italic',
  'uppercase',
  'pointer',
  'hidden',
  'isolate',
  'truncate',
  'flex',
  'grid',
  'gap',
  'size',
  'p',
  'px',
  'py',
  'pt',
  'pb',
  'pl',
  'pr',
  'm',
  'mx',
  'my',
  'mt',
  'mb',
  'ml',
  'mr',
  'w',
  'h',
  'z',
].join('|');

const UTILITY_LIKE = new RegExp(
  `^(?:${UTILITY_PREFIXES})(?:-[a-z0-9/[\\].%]+)*$`,
  'i',
);

/** 取出所有「整条选择器就是单个 .类名」的裸类选择器。 */
function extractBareClassSelectors(source: string): string[] {
  const found = new Set<string>();
  // 去掉注释，避免把注释里的示例当成真规则
  const withoutComments = source.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of withoutComments.matchAll(/([^{}]*)\{/g)) {
    const selectorText = rule[1].trim();
    if (!selectorText || selectorText.startsWith('@')) continue;
    for (const part of selectorText.split(',')) {
      const selector = part.trim();
      const match = /^\.([A-Za-z_][\w-]*)$/.exec(selector);
      if (match) found.add(match[1]);
    }
  }
  return [...found].sort();
}

const bareSelectors = extractBareClassSelectors(css);

// 1) 不得有工具类风格的裸类选择器
const collisions = bareSelectors.filter((name) => UTILITY_LIKE.test(name));
ok(
  collisions.length === 0,
  'G1 globals.css 不得定义与 Tailwind 工具类同名的裸类选择器',
  collisions,
);

// 2) 关键组件用到的工具类必须由 Tailwind 提供（这里只验证没有被全局类劫持）
const shadcnSources = [
  'components/ui/dialog.tsx',
  'components/ui/alert-dialog.tsx',
  'components/ui/popover.tsx',
  'components/ui/select.tsx',
  'components/ui/dropdown-menu.tsx',
];
const hijacked: string[] = [];
const ringUtilities = new Set<string>();
for (const relative of shadcnSources) {
  const source = readFileSync(join(root, relative), 'utf8');
  for (const match of source.matchAll(/(?<![\w-])ring-\d+\b/g)) {
    ringUtilities.add(match[0]);
  }
}
for (const utility of ringUtilities) {
  if (bareSelectors.includes(utility)) hijacked.push(utility);
}
ok(
  hijacked.length === 0,
  'G2 shadcn 组件使用的 ring-* 工具类没有被全局类劫持',
  hijacked,
);
ok(
  ringUtilities.size > 0,
  'G2b 确实扫到了 shadcn 组件的 ring-* 用法（防止扫描本身失效）',
);

// 3) 改名后的装饰类必须成对存在：CSS 有定义、DeepSeek 桌面页也用上了
for (const name of ['dsh-ring-1', 'dsh-ring-2']) {
  ok(
    bareSelectors.includes(name),
    `G3 globals.css 定义了 .${name}`,
  );
}
const desktopPage = readFileSync(
  join(root, 'app', 'deepseek', 'page.tsx'),
  'utf8',
);
for (const name of ['dsh-ring-1', 'dsh-ring-2']) {
  ok(
    desktopPage.includes(name),
    `G3b DeepSeek 桌面页使用了 .${name}`,
  );
}
ok(
  !/(?<![\w-])ring-[12]\b/.test(desktopPage),
  'G3c DeepSeek 桌面页不再使用会被劫持的 ring-1 / ring-2',
);

// 4) 防回退：样式表里不得再出现裸 .ring-1 / .ring-2
ok(
  !bareSelectors.includes('ring-1') && !bareSelectors.includes('ring-2'),
  'G4 globals.css 没有裸 .ring-1 / .ring-2（含 @media 内）',
);

// ---------- 汇总 ----------
console.log(
  `\n样式撞名防线：通过 ${passed} 项，失败 ${failed} 项（扫描裸类选择器 ${bareSelectors.length} 个）`,
);
if (failures.length) {
  console.log('失败明细：');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('样式撞名防线全部通过 ✓');
