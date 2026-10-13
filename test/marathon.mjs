// marathon.mjs — 马拉松审计 A：43 个 Xmind 官方模板全量导入 + B：全特性撤销马拉松 + C：边界场景
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE_DIR = path.resolve('test/fixtures/xmind-templates');
const EV = path.join('C:', 'Users', 'x5che', 'Documents', 'deepseek-harness', 'default-workspace');
const LEGACY_TPL_DIR = path.join(EV, 'xmind-extracted', 'static', 'snowbird', 'resource', 'templates', 'files');
function resolveTplDir() {
  const local = FIXTURE_DIR;
  if (fs.existsSync(local)) {
    const xminds = fs.readdirSync(local).filter(f => f.endsWith('.xmind'));
    if (xminds.length) return local;
  }
  if (fs.existsSync(LEGACY_TPL_DIR)) return LEGACY_TPL_DIR;
  return local;
}
const TPL_DIR = resolveTplDir();
const DIST = path.resolve('dist/index.html');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
await page.goto(pathToFileURL(DIST).href);
await page.waitForTimeout(900);

let pass = 0, fail = 0;
const failures = [];

// ---------- A. 43 官方模板全量导入 ----------
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.isDirectory()) walk(path.join(d, f.name)); else if (f.name.endsWith('.xmind')) files.push(path.join(d, f.name)); } })(TPL_DIR);
console.log(`A. 官方模板导入马拉松（${files.length} 个）`);
for (const f of files) {
  const before = errs.length;
  try {
    await page.setInputFiles('#file-input', f);
    await page.waitForTimeout(450);
    const topics = await page.evaluate(() => document.querySelectorAll('.topic').length);
    if (topics < 1) throw new Error('无主题渲染');
    if (errs.length > before) throw new Error('页面错误: ' + errs.slice(before).join('; ').slice(0, 120));
    pass++;
    process.stdout.write('.');
  } catch (e) {
    fail++; failures.push(`${path.basename(f)}: ${e.message}`);
    process.stdout.write('x');
  }
}
console.log(`\n   模板导入：${pass}/${files.length} 通过`);
failures.forEach(x => console.log('   FAIL', x));

// ---------- B. 全特性撤销马拉松 ----------
console.log('B. 全特性撤销马拉松（每种变更一次 → 全部撤销 → 快照等价）');
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(1000);
const snap = () => page.evaluate(() => localStorage.getItem('zhiya.map.v1'));
const initialLS = await snap();
// 1. 加子主题 2. 改名 3. 加标记 4. 加标签 5. 设链接 6. 插标注框 7. 加概要 8. 加联系 9. 分支方向 10. 换主题 11. 换引擎
const steps = [
  ['加子主题', async () => { await page.keyboard.press('Tab'); await page.keyboard.type('撤销项'); await page.keyboard.press('Escape'); }],
  ['加标记', async () => {
    await page.click('.topic.l1'); await page.click('#btn-sidebar'); await page.waitForTimeout(250);
    await page.click('.sb-tab[data-tab="style"]'); await page.waitForTimeout(200);
    await page.click('.marker-btn[data-mk="priority-3"]'); await page.waitForTimeout(250);
    await page.click('#btn-sidebar'); await page.waitForTimeout(150);
  }],
  ['加标签', async () => {
    await page.click('.topic.l1'); await page.click('#btn-sidebar'); await page.waitForTimeout(250);
    await page.click('.sb-tab[data-tab="style"]'); await page.waitForTimeout(200);
    await page.fill('#lb-add-input', '撤销标签'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    await page.click('#btn-sidebar'); await page.waitForTimeout(150);
  }],
  ['设链接', async () => {
    await page.click('.topic.l1', { button: 'right' }); await page.waitForTimeout(200);
    await page.click('#ctx-menu .ctx-item:has-text("设置链接")'); await page.waitForTimeout(200);
    await page.fill('#href-input', 'https://undo.test'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  }],
  ['加概要', async () => {
    await page.click('.topic.l1', { button: 'right' }); await page.waitForTimeout(200);
    await page.click('#ctx-menu .ctx-item:has-text("添加概要")'); await page.waitForTimeout(300);
  }],
  ['加联系', async () => {
    const titles = await page.evaluate(() => [...document.querySelectorAll('.topic .t-title')].map(t => t.textContent));
    await page.click(`.topic:has-text("${titles[1]}")`, { button: 'right' }); await page.waitForTimeout(200);
    await page.click('#ctx-menu .ctx-item:has-text("添加联系到")'); await page.waitForTimeout(200);
    await page.click(`.topic:has-text("${titles[2]}")`); await page.waitForTimeout(300);
  }],
  ['分支方向', async () => {
    await page.click('.topic.l1', { button: 'right' }); await page.waitForTimeout(200);
    await page.click('#ctx-menu .ctx-item:has-text("分支方向 · 向左")'); await page.waitForTimeout(250);
  }],
  ['换主题', async () => {
    await page.click('.topic.l1'); await page.click('#btn-sidebar'); await page.waitForTimeout(250);
    await page.click('.sb-tab[data-tab="style"]'); await page.waitForTimeout(200);
    if (!(await page.locator('.shape-btn[data-theme="x-B02"]').count())) {
      await page.click('.style-more[data-more="themes"]'); await page.waitForTimeout(200);
    }
    await page.click('.shape-btn[data-theme="x-B02"]'); await page.waitForTimeout(250);
    await page.click('#btn-sidebar'); await page.waitForTimeout(150);
  }],
  ['换引擎', async () => { await page.selectOption('#structure-select', 'tree-right'); await page.waitForTimeout(350); }]
];
for (const [name, fn] of steps) {
  const before = errs.length;
  try { await fn(); if (errs.length > before) throw new Error(errs.slice(before)[0]); process.stdout.write('.'); }
  catch (e) { failures.push(`${name}: ${e.message}`); process.stdout.write('x'); }
}
// 快照等价：连续撤销 12 次（超过步数，含编辑等中间步），应回到 initial
for (let i = 0; i < 14; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(120); }
const afterLS = await snap();
const undone = afterLS === initialLS;
console.log(`\n   变更步骤 ${steps.length} 项执行，撤销后快照${undone ? '完全等价 ✓' : '不等价 ✗'}`);
if (!undone) {
  const a = initialLS || '', b = afterLS || '';
  let i = 0; while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  console.log('   差异@', i, ':');
  console.log('   初始:', JSON.stringify(a.slice(Math.max(0, i - 40), i + 120)));
  console.log('   撤销后:', JSON.stringify(b.slice(Math.max(0, i - 40), i + 120)));
}

// ---------- C. 边界场景 ----------
console.log('C. 边界场景');
// C1. 损坏 localStorage 启动
await page.evaluate(() => localStorage.setItem('zhiya.map.v1', '{corrupted!!!'));
await page.reload(); await page.waitForTimeout(1000);
const c1ok = await page.evaluate(() => document.querySelectorAll('.topic').length) >= 1 && !errs.length;
console.log(`   损坏存档启动：${c1ok ? '✓ 降级到种子导图' : '✗'}`);
// C2. 空存档
await page.evaluate(() => localStorage.setItem('zhiya.map.v1', JSON.stringify({ sheets: [] })));
await page.reload(); await page.waitForTimeout(900);
const c2ok = await page.evaluate(() => document.querySelectorAll('.topic').length) >= 1;
console.log(`   空表存档启动：${c2ok ? '✓' : '✗'}`);
// C3. 大导图（120 主题）
await page.evaluate(() => localStorage.clear());
await page.evaluate(() => {
  // 直接构造 120 主题的存档
  const mk = (t, n) => ({ id: 'bt' + Math.random().toString(36).slice(2, 8), title: t, children: { attached: [] }, markers: n ? [{ markerId: 'priority-' + n }] : undefined });
  const root = mk('大导图', 0);
  for (let i = 0; i < 12; i++) {
    const b = mk('分支' + i, (i % 6) + 1);
    for (let j = 0; j < 9; j++) b.children.attached.push(mk('细节' + i + '-' + j, 0));
    root.children.attached.push(b);
  }
  localStorage.setItem('zhiya.map.v1', JSON.stringify({ sheets: [{ id: 's1', class: 'sheet', structureClass: 'logic-chart', themeClass: 'classic', rootTopic: root }] }));
});
const t0 = Date.now();
await page.reload(); await page.waitForTimeout(1500);
const bigTopics = await page.evaluate(() => document.querySelectorAll('.topic').length);
const bootMs = await page.evaluate(() => performance.now());
console.log(`   120 主题启动：${bigTopics === 121 ? '✓' : '✗'} ${bigTopics} 主题，加载 ${Math.round(bootMs)}ms`);
// C4. 暗色主题下导出 PNG/SVG 不崩
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(900);
await page.click('.topic.root');
await page.click('#btn-sidebar'); await page.waitForTimeout(250);
await page.click('.sb-tab[data-tab="style"]'); await page.waitForTimeout(250);
if (!(await page.locator('.shape-btn[data-theme="x-B01"]').count())) {
  await page.click('.style-more[data-more="themes"]'); await page.waitForTimeout(200);
}
await page.click('.shape-btn[data-theme="x-B01"]'); await page.waitForTimeout(400);
await page.click('#btn-sidebar'); await page.waitForTimeout(200);
const dlPng = await Promise.all([
  page.waitForEvent('download'),
  (async () => { await page.click('#btn-export'); await page.waitForTimeout(200); await page.click('#ctx-menu .ctx-item:has-text("PNG 图片")'); })()
]);
await dlPng[0].saveAs('output/zhiya/dark-theme.png');
const dlSvg = await Promise.all([
  page.waitForEvent('download'),
  (async () => { await page.click('#btn-export'); await page.waitForTimeout(200); await page.click('#ctx-menu .ctx-item:has-text("SVG 矢量图")'); })()
]);
await dlSvg[0].saveAs('output/zhiya/dark-theme.svg');
const svgContent = fs.readFileSync('output/zhiya/dark-theme.svg', 'utf8');
const darkOk = svgContent.includes('#1e2933') || svgContent.includes('30, 41, 51');
console.log(`   暗色主题导出：${darkOk ? '✓ SVG 含暗色背景' : '✗'} | 页面错误累计 ${errs.length}`);

console.log(`\n总计页面错误：${errs.length}`);
errs.slice(0, 5).forEach(e => console.log('  ', e));
await browser.close();
process.exit(failures.length || errs.length ? 1 : 0);
