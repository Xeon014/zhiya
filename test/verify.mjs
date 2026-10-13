// verify.mjs — 几何级断言验证（不依赖人眼）
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist', 'index.html');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

const vis = () => page.evaluate(() =>
  [...document.querySelectorAll('.topic')]
    .filter(t => t.style.display !== 'none' && !t.classList.contains('ghost'))
    .map(t => ({ id: t.dataset.id, text: t.textContent.slice(0, 12), x: parseFloat(t.style.left), y: parseFloat(t.style.top), w: t.offsetWidth, parent: t.dataset.parent || null, depth: +t.dataset.depth }))
);
const pathCheck = () => page.evaluate(() => {
  const ps = [...document.querySelectorAll('#edges path')];
  const bad = ps.filter(p => /NaN/.test(p.getAttribute('d'))).length;
  return { total: ps.length, bad };
});
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + msg); if (!cond) errs.push('ASSERT: ' + msg); };

await page.goto('file:///' + DIST.replace(/\\/g, '/'));
await page.waitForTimeout(900);

// 1. 初始：18 个可见节点
let topics = await vis();
ok(topics.length === 18, `初始可见节点 = ${topics.length}（期望 18）`);

// 2. 根节点存在且在原点附近
const root = topics.find(t => t.text.includes('枝桠'));
ok(!!root && Math.abs(root.x) < 5 && Math.abs(root.y) < 5, `根节点位于原点 (${root?.x},${root?.y})`);

// 3. 双侧平衡：左右两侧都有节点，且两侧总高大致平衡
const left = topics.filter(t => t.x < -100), right = topics.filter(t => t.x > 100);
ok(left.length >= 3 && right.length >= 3, `双侧分布：左 ${left.length} / 右 ${right.length}`);
const lh = Math.max(...left.map(t => t.y)) - Math.min(...left.map(t => t.y));
const rh = Math.max(...right.map(t => t.y)) - Math.min(...right.map(t => t.y));
ok(Math.abs(lh - rh) < 120, `左右总高平衡：左 ${lh.toFixed(0)} vs 右 ${rh.toFixed(0)}（差<120）`);

// 4. 同父且同侧的子主题垂直不重叠
const byParent = {};
for (const t of topics) {
  const side = t.x < -100 ? 'L' : t.x > 100 ? 'R' : 'C';
  (byParent[(t.parent ?? 'root') + '|' + side] ??= []).push(t);
}
let overlap = false, groups = 0;
for (const kids of Object.values(byParent)) {
  if (kids.length < 2) continue;
  groups++;
  kids.sort((a, b) => a.y - b.y);
  for (let i = 1; i < kids.length; i++) if (kids[i].y - kids[i-1].y < 20) overlap = true;
}
ok(!overlap && groups >= 4, `同父同侧子主题无重叠（检查 ${groups} 组）`);

// 5. 连接线无 NaN 且数量正确
let pc = await pathCheck();
ok(pc.bad === 0 && pc.total === 17, `连接线 ${pc.total} 条（期望 17），NaN ${pc.bad} 条`);

// 6. 折叠真实生效：可见节点减少
await page.locator('.topic', { hasText: '结构引擎' }).first().click();
await page.keyboard.press('Space');
await page.waitForTimeout(500);
topics = await vis();
ok(topics.length === 15, `折叠后可见节点 = ${topics.length}（期望 15）`);
pc = await pathCheck();
ok(pc.total === 14, `折叠后连接线 = ${pc.total} 条（期望 14）`);
await page.screenshot({ path: 'output/zhiya/verify-collapse.png' });
await page.keyboard.press('Space');
await page.waitForTimeout(450);

// 6b. 展开后子主题不得重叠（v1.19.3 回归：display:none 污染 heights）
{
  const squish = await page.evaluate(() => {
    const kids = [...document.querySelectorAll('.topic')]
      .filter(t => ['插件注册表', '思维导图引擎', '组织架构引擎'].includes(t.querySelector('.t-title')?.textContent))
      .map(t => Math.round(parseFloat(t.style.top))).sort((a, b) => a - b);
    return kids.every((y, i) => i === 0 || y - kids[i - 1] >= 40) ? 0 : kids.join(',');
  });
  ok(squish === 0, `展开后子主题间距正常（无叠压${squish === 0 ? '' : '：' + squish}）`);
}

// 7. 组织架构引擎：所有非根节点严格位于根节点下方
await page.selectOption('#structure-select', 'org-chart');
await page.waitForTimeout(600);
topics = await vis();
const rootNode = topics.find(t => t.depth === 0);
const below = topics.filter(t => t !== rootNode && t.y > rootNode.y + 5).length;
ok(below === topics.length - 1, `组织架构：${below}/${topics.length - 1} 个非根节点在根下方`);
await page.screenshot({ path: 'output/zhiya/verify-orgchart.png' });

// 8. 切回后布局恢复正常
await page.selectOption('#structure-select', 'logic-chart');
await page.waitForTimeout(500);
topics = await vis();
const l2 = topics.filter(t => t.x < -100).length;
ok(l2 >= 3, `切回思维导图后左侧恢复 ${l2} 个节点`);

// 9. 鱼骨引擎：一级子题上下交替 + 脊骨装饰边存在
await page.selectOption('#structure-select', 'fishbone');
await page.waitForTimeout(600);
topics = await vis();
const l1s = topics.filter(t => t.depth === 1);
const upN = l1s.filter(t => t.y < -10).length, downN = l1s.filter(t => t.y > 10).length;
ok(upN >= 2 && downN >= 2, `鱼骨上下交替：上 ${upN} / 下 ${downN}`);
const spine = await page.evaluate(() => [...document.querySelectorAll('#edges path')].some(p => (p.getAttribute('d') || '').includes(' 0 L ')));
ok(spine, '鱼骨脊骨装饰边存在');
await page.selectOption('#structure-select', 'logic-chart');
await page.waitForTimeout(400);

// 9b. 时间轴引擎：事件上下交替 + 轴线存在
await page.selectOption('#structure-select', 'timeline');
await page.waitForTimeout(600);
topics = await vis();
const evts = topics.filter(t => t.depth === 1);
const tlUp = evts.filter(t => t.y < -10).length, tlDown = evts.filter(t => t.y > 10).length;
ok(tlUp >= 2 && tlDown >= 2, `时间轴上下交替：上 ${tlUp} / 下 ${tlDown}`);
const axis = await page.evaluate(() => [...document.querySelectorAll('#edges path')].some(p => (p.getAttribute('d') || '').includes(' 0 L ')));
ok(axis, '时间轴轴线存在');
await page.selectOption('#structure-select', 'logic-chart');
await page.waitForTimeout(400);

// 9c. 成长方向（Growth Direction）：逻辑图向右/向左 + 分支级方向覆盖
{
  await page.selectOption('#structure-select', 'logic-right'); await page.waitForTimeout(600);
  topics = await vis();
  const l1r = topics.filter(t => t.depth === 1);
  ok(l1r.length >= 3 && l1r.every(t => t.x > 100), `逻辑图·向右：${l1r.length} 个一级分支全在右侧`);
  await page.screenshot({ path: 'output/zhiya/verify-logic-right.png' });
  await page.selectOption('#structure-select', 'logic-left'); await page.waitForTimeout(600);
  topics = await vis();
  const l1l = topics.filter(t => t.depth === 1);
  ok(l1l.every(t => t.x < -100), `逻辑图·向左：${l1l.length} 个一级分支全在左侧`);
  await page.selectOption('#structure-select', 'logic-chart'); await page.waitForTimeout(500);

  // 分支级覆盖：把“持久化”钉在向左 → 平衡图中它出现在左侧
  await page.locator('.topic', { hasText: '持久化' }).first().click({ button: 'right' });
  await page.waitForTimeout(250);
  await page.locator('#ctx-menu .ctx-item', { hasText: '分支方向 · 向左' }).click();
  await page.waitForTimeout(500);
  topics = await vis();
  const persist = topics.find(t => t.text.includes('持久化'));
  ok(!!persist && persist.x < -100, `分支方向覆盖：持久化 钉在左侧（x=${persist?.x?.toFixed(0)}）`);
  await page.screenshot({ path: 'output/zhiya/verify-branch-side.png' });
  await page.keyboard.press('Control+z'); await page.waitForTimeout(400);   // 撤销方向覆盖
}

// 10. 拖拽换父（中带 = 成为子题）：把“插件注册表”拖到“编辑交互”正中
{
  const src = await page.evaluate(() => { const e = [...document.querySelectorAll('.topic')].find(t => t.textContent === '插件注册表'); const r = e.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; });
  const dst = await page.evaluate(() => { const e = [...document.querySelectorAll('.topic')].find(t => t.textContent === '编辑交互'); const r = e.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; });
  await page.mouse.move(src.x, src.y);
  await page.mouse.down();
  await page.mouse.move(dst.x, dst.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  topics = await vis();
  const moved = topics.find(t => t.text === '插件注册表');
  const newPar = topics.find(t => t.text === '编辑交互');
  ok(moved?.parent === newPar?.id, `拖拽换父：插件注册表 → 编辑交互 的子题（parent=${moved?.parent === newPar?.id ? '✓' : moved?.parent}）`);
  const childN = await page.evaluate(() => [...document.querySelectorAll('.topic')].filter(t => t.dataset.parent && [...document.querySelectorAll('.topic')].find(p => p.dataset.id === t.dataset.parent)?.textContent === '编辑交互').length);
  ok(childN === 5, `编辑交互子题数 = ${childN}（期望 5）`);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(400);   // 撤销拖拽
}

// 10b. 概要：右键添加 → DOM 标签 → 双击改名 → 拖拽 handle 缩小范围
{
  await page.locator('.topic', { hasText: '结构引擎' }).first().click({ button: 'right' });
  await page.waitForTimeout(200);
  await page.locator('#ctx-menu .ctx-item', { hasText: '添加概要' }).click();
  await page.waitForTimeout(400);
  const sumBefore = await page.evaluate(() => document.querySelector('.summary-topic')?.textContent ?? null);
  const handles = await page.evaluate(() => document.querySelectorAll('.summary-handle').length);
  ok(sumBefore === '概要' && handles === 2, `概要标签 DOM + 双 handle（label="${sumBefore}", handles=${handles}）`);

  await page.locator('.summary-topic').dblclick();
  await page.waitForTimeout(200);
  await page.keyboard.type('核心引擎');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const sumRenamed = await page.evaluate(() => document.querySelector('.summary-topic')?.textContent);
  ok(sumRenamed === '核心引擎', `概要双击原地改名（"${sumRenamed}"）`);

  // 拖拽终点 handle 到第一个子主题：范围 0..2 → 0..0
  const hEnd = await page.evaluate(() => {
    const h = document.querySelector('.summary-handle[data-end="end"]');
    const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const firstChild = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '插件注册表');
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(hEnd.x, hEnd.y);
  await page.mouse.down();
  await page.mouse.move(firstChild.x, firstChild.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const sumInfo = await page.evaluate(() => {
    const s = document.querySelector('.summary-topic');
    const c = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '插件注册表');
    return { sumY: parseFloat(s.style.top), childY: parseFloat(c.style.top) };
  });
  ok(Math.abs(sumInfo.sumY - sumInfo.childY) < 5, `概要 handle 拖拽缩小范围：标签 y=${sumInfo.sumY.toFixed(0)} 对齐第一子题 y=${sumInfo.childY.toFixed(0)}`);
  await page.screenshot({ path: 'output/zhiya/verify-summary.png' });

  // 清理：撤销（拖范围/改名/添加）+ 清存档重载
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForTimeout(900);
}

// 10c. 标记 / 联系 / 自由主题（v1.11 三功能）
{
  // 标记：侧栏样式页 priority-1 徽章
  await page.locator('.topic', { hasText: '结构引擎' }).first().click();
  await page.click('#btn-sidebar'); await page.waitForTimeout(250);
  await page.click('.sb-tab[data-tab="style"]'); await page.waitForTimeout(200);
  await page.locator('.marker-btn[data-mk="priority-1"]').click(); await page.waitForTimeout(400);
  const hasMk = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '结构引擎');
    return el ? el.classList.contains('has-markers') && !!el.querySelector('.t-markers .mk-badge') : false;
  });
  ok(hasMk, '标记：priority-1 徽章渲染在主题顶部');
  await page.click('#btn-sidebar'); await page.waitForTimeout(200);

  // 联系：右键 → 添加联系到… → 点击目标 → 命中线出现
  await page.locator('.topic', { hasText: '持久化' }).first().click({ button: 'right' });
  await page.waitForTimeout(250);
  await page.locator('#ctx-menu .ctx-item', { hasText: '添加联系到' }).click();
  await page.waitForTimeout(200);
  const picking = await page.evaluate(() => document.getElementById('viewport').classList.contains('pick-mode'));
  await page.locator('.topic', { hasText: '编辑交互' }).first().click();
  await page.waitForTimeout(450);
  const relN = await page.evaluate(() => document.querySelectorAll('#edges .rel-hit').length);
  ok(picking && relN === 1, `联系：拾取模式建立（pick=${picking}, 命中线=${relN}）`);

  // 自由主题：画布右键插入（动态找空白点，避开主题/标签）
  const empty = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('.topic, .summary-topic, .rel-topic')]
      .filter(t => t.style.display !== 'none')
      .map(t => t.getBoundingClientRect());
    for (let y = 690; y < 850; y += 25) for (let x = 120; x < 1320; x += 50) {
      if (!rects.some(r => x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12)) return { x, y };
    }
    return { x: 120, y: 820 };
  });
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await page.waitForTimeout(250);
  await page.locator('#ctx-menu .ctx-item', { hasText: '插入自由主题' }).click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const freeN = await page.evaluate(() => [...document.querySelectorAll('.topic')].filter(t => t.dataset.title === '自由主题').length);
  ok(freeN === 1, `自由主题：画布右键插入（${freeN} 个）`);

  // 拖 attached 主题到空白 → 转自由主题（position + topicPositioning:fixed 落盘）
  const src = await page.evaluate(() => {
    const e = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '编辑交互');
    const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(src.x, src.y);
  await page.mouse.down();
  await page.mouse.move(760, 810, { steps: 12 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(500);
  const ls = await page.evaluate(() => localStorage.getItem('zhiya.map.v1') || '');
  ok(ls.includes('"position"') && ls.includes('"topicPositioning":"fixed"'), '拖到空白转自由主题（position + fixed 落盘）');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(350);   // 撤销
  await page.screenshot({ path: 'output/zhiya/verify-markers-rel-free.png' });
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForTimeout(800);
}

// 10d. 查找替换 / 多选批量 / ZEN 演示 / 对齐参考线（v1.12）
{
  // 查找：Ctrl+F → 输入 → 命中高亮 + 计数
  await page.keyboard.press('Control+f'); await page.waitForTimeout(300);
  const barOpen = await page.evaluate(() => document.getElementById('find-bar').classList.contains('open'));
  await page.keyboard.type('引擎');
  await page.waitForTimeout(350);
  const cnt = await page.evaluate(() => document.getElementById('find-count').textContent);
  const hits = await page.evaluate(() => document.querySelectorAll('.topic.hit').length);
  ok(barOpen && hits >= 3 && /\d/.test(cnt), `查找："引擎" 高亮 ${hits} 个主题（${cnt}）`);
  // 全部替换 引擎→马达，再撤销
  await page.evaluate(() => { document.getElementById('find-replace').value = '马达'; });
  await page.click('#find-replace-all'); await page.waitForTimeout(400);
  const noHit = await page.evaluate(() => document.querySelectorAll('.topic.hit').length);
  const hasNew = await page.evaluate(() => [...document.querySelectorAll('.topic')].some(t => (t.dataset.title || '').includes('马达')));
  ok(noHit === 0 && hasNew, `全部替换：引擎→马达（剩余命中 ${noHit}）`);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(350);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  // 多选批量：Ctrl+点击 自动布局 + 持久化 → Delete 批删 8 个（含子树）
  const cA = await page.evaluate(() => { const e = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '自动布局'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const cB = await page.evaluate(() => { const e = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '持久化'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(cA.x, cA.y);
  await page.keyboard.down('Control'); await page.mouse.click(cB.x, cB.y); await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  const selN = await page.evaluate(() => document.querySelectorAll('.topic.selected').length);
  const beforeDel = (await vis()).length;
  await page.keyboard.press('Delete'); await page.waitForTimeout(450);
  const afterDel = (await vis()).length;
  ok(selN === 2 && beforeDel - afterDel === 8, `多选批删：选中 ${selN}，删除 ${beforeDel - afterDel} 个主题（期望 8）`);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(650);   // 撤销批删（高负载时序余量）

  // ZEN 演示：F5 进入 → 步进 → 退出
  await page.keyboard.press('F5'); await page.waitForTimeout(700);
  const zenOn = await page.evaluate(() => document.body.classList.contains('zen') && document.querySelectorAll('.topic.dimmed').length > 0);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(500);
  const ind1 = await page.evaluate(() => document.getElementById('zen-ind')?.textContent ?? '');
  await page.keyboard.press(' '); await page.waitForTimeout(500);
  const ind2 = await page.evaluate(() => document.getElementById('zen-ind')?.textContent ?? '');
  await page.keyboard.press('Escape'); await page.waitForTimeout(350);
  const zenOff = await page.evaluate(() => !document.body.classList.contains('zen') && !document.getElementById('zen-ind'));
  ok(zenOn && ind1 === '2 / 4' && ind2 === '3 / 4' && zenOff, `ZEN 演示：步进 ${ind1}→${ind2}，退出恢复`);

  // 对齐参考线：插入自由主题 → 拖向根中心 x → 拖拽中出现 accent 参考线
  const empty2 = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('.topic, .summary-topic, .rel-topic')].filter(t => t.style.display !== 'none').map(t => t.getBoundingClientRect());
    for (let y = 660; y < 850; y += 25) for (let x = 120; x < 1320; x += 50) {
      if (!rects.some(r => x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12)) return { x, y };
    }
    return { x: 120, y: 820 };
  });
  await page.mouse.click(empty2.x, empty2.y, { button: 'right' }); await page.waitForTimeout(250);
  await page.locator('#ctx-menu .ctx-item', { hasText: '插入自由主题' }).click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const freeBox = await page.evaluate(() => {
    const e = [...document.querySelectorAll('.topic')].find(t => t.dataset.title === '自由主题');
    const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const rootBox = await page.evaluate(() => { const r = document.querySelector('.topic.root').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y }; });
  await page.mouse.move(freeBox.x, freeBox.y);
  await page.mouse.down();
  await page.mouse.move(rootBox.x, freeBox.y + 120, { steps: 10 });
  const guideN = await page.evaluate(() => [...document.querySelectorAll('#edges path')].filter(p => p.getAttribute('stroke') === 'var(--accent)').length);
  await page.mouse.up(); await page.waitForTimeout(350);
  ok(guideN >= 1, `对齐参考线：拖拽对齐根中心线时出现 ${guideN} 条参考线`);
  await page.screenshot({ path: 'output/zhiya/verify-v12.png' });
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForTimeout(800);
}

// 10e. v1.13：标签 / 链接 / 标注框（UI 全链）
{
  // 标签：侧栏样式页添加两个标签 → 芯片渲染
  await page.locator('.topic', { hasText: '结构引擎' }).first().click();
  await page.click('#btn-sidebar'); await page.waitForTimeout(250);
  await page.click('.sb-tab[data-tab="style"]'); await page.waitForTimeout(200);
  await page.fill('#lb-add-input', '重点');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.fill('#lb-add-input', 'v1.13');
  await page.keyboard.press('Enter'); await page.waitForTimeout(350);
  const chipN = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '结构引擎');
    return el ? el.querySelectorAll('.t-labels .lb-chip').length : -1;
  });
  ok(chipN === 2, `标签：两个芯片渲染（${chipN}）`);
  await page.click('#btn-sidebar'); await page.waitForTimeout(200);

  // 链接：右键 → 设置链接… → 输入 URL 回车 → 角标出现
  await page.locator('.topic', { hasText: '持久化' }).first().click({ button: 'right' });
  await page.waitForTimeout(250);
  await page.locator('#ctx-menu .ctx-item', { hasText: '设置链接' }).click();
  await page.waitForTimeout(250);
  await page.fill('#href-input', 'example.com/test');
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  const linkState = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '持久化');
    const a = el?.querySelector('.t-link');
    return a ? { shown: getComputedStyle(a).display !== 'none', href: a.dataset.href ?? '' } : null;
  });
  ok(linkState?.shown && linkState.href === 'https://example.com/test', `链接：角标 + 自动补协议（${linkState?.href}）`);

  // 标注框：画布右键 → 插入标注框 → callout 样式类
  const empty3 = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('.topic, .summary-topic, .rel-topic')].filter(t => t.style.display !== 'none').map(t => t.getBoundingClientRect());
    for (let y = 640; y < 850; y += 25) for (let x = 120; x < 1320; x += 50) {
      if (!rects.some(r => x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12)) return { x, y };
    }
    return { x: 120, y: 820 };
  });
  await page.mouse.click(empty3.x, empty3.y, { button: 'right' }); await page.waitForTimeout(250);
  await page.locator('#ctx-menu .ctx-item', { hasText: '插入标注框' }).click();
  await page.waitForTimeout(400);
  await page.keyboard.type('这是标注');
  await page.keyboard.press('Escape'); await page.waitForTimeout(350);
  const calloutN = await page.evaluate(() => document.querySelectorAll('.topic.callout').length);
  const ls = await page.evaluate(() => localStorage.getItem('zhiya.map.v1') || '');
  ok(calloutN === 1 && ls.includes('"calloutTopics"') && ls.includes('"labels":["重点","v1.13"]') && ls.includes('"href":"https://example.com/test"'),
    `标注框+落盘：callout=${calloutN}，labels/href/calloutTopics 键齐全`);
  await page.screenshot({ path: 'output/zhiya/verify-v13.png' });
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForTimeout(800);
}

// 10f. v1.14 新结构引擎几何（真实浏览器切引擎断言）
{
  const switchTo = async (id) => { await page.selectOption('#structure-select', id); await page.waitForTimeout(600); };
  const l1 = () => page.evaluate(() => [...document.querySelectorAll('.topic')]
    .filter(t => t.style.display !== 'none' && +t.dataset.depth === 1)
    .map(t => ({ x: parseFloat(t.style.left), y: parseFloat(t.style.top) })));
  const rootPos = () => page.evaluate(() => {
    const r = document.querySelector('.topic.root');
    return { x: parseFloat(r.style.left), y: parseFloat(r.style.top) };
  });

  await switchTo('org-chart-up');
  let rp = await rootPos(), ps = await l1();
  ok(ps.every(p => p.y < rp.y - 5), `组织架构·向上：${ps.length} 个一级分支全在根上方`);

  await switchTo('fishbone-right');
  rp = await rootPos(); ps = await l1();
  ok(ps.every(p => p.x < rp.x - 5), `鱼骨图·右头：一级分支全在根左侧（头右）`);

  await switchTo('timeline-vertical');
  ps = await l1();
  const xs = ps.map(p => Math.sign(p.x));
  ok(xs.includes(-1) && xs.includes(1), `时间轴·竖向：事件左右交替（左 ${xs.filter(x => x < 0).length} / 右 ${xs.filter(x => x > 0).length}）`);

  await switchTo('map-clockwise');
  rp = await rootPos(); ps = await l1();
  const quads = new Set(ps.map(p => `${Math.sign(p.x - rp.x)},${Math.sign(p.y - rp.y)}`));
  ok(quads.size >= 3, `发散图·顺时针：一级分支分布于 ${quads.size} 个象限`);
  const cwEdges = await page.evaluate(() => [...document.querySelectorAll('#edges path')]
    .filter(p => /^M [\d.-]+ [\d.-]+ L /.test(p.getAttribute('d') || '')).length);
  ok(cwEdges >= 10, `发散图辐射直线边：${cwEdges} 条`);
  await page.screenshot({ path: 'output/zhiya/verify-map-clockwise.png' });

  await switchTo('map-anticlockwise');
  ps = await l1();
  ok(ps.length >= 3, `发散图·逆时针：${ps.length} 个分支渲染`);

  await switchTo('tree-right');
  rp = await rootPos(); ps = await l1();
  const tys = ps.map(p => p.y);
  const stacked = tys.every((y, i) => i === 0 || y > tys[i - 1]);
  ok(ps.every(p => p.x > rp.x + 30) && tys[0] < rp.y + 60 && stacked, `树图·向右：一级分支在右侧、首子题贴父顶、依次下移`);

  await switchTo('brace-right');
  const braceQ = await page.evaluate(() => [...document.querySelectorAll('#edges path')]
    .filter(p => (p.getAttribute('d') || '').includes('Q')).length);
  ok(braceQ >= 3, `括号图·向右：花括号曲线 ${braceQ} 条`);
  await page.screenshot({ path: 'output/zhiya/verify-brace.png' });

  await switchTo('map-unbalanced');
  rp = await rootPos(); ps = await l1();
  ok(ps.every(p => p.x > rp.x + 30), `发散图·非平衡：默认全在右侧`);

  await switchTo('logic-chart');
  await page.waitForTimeout(400);
}

// 10g. v1.15：附件 IndexedDB 持久化（重载后存活）+ 保存 GC
{
  // 清空 IDB 旧数据，附加一个带标记字节的附件
  await page.evaluate(async () => {
    await new Promise((res) => {
      const req = indexedDB.deleteDatabase('zhiya-assets');
      req.onsuccess = req.onerror = req.onblocked = () => res(null);
    });
    localStorage.clear();
  });
  await page.reload(); await page.waitForTimeout(1000);
  await page.locator('.topic', { hasText: '持久化' }).first().click({ button: 'right' });
  await page.waitForTimeout(250);
  await page.locator('#ctx-menu .ctx-item', { hasText: '附加文件…' }).click();
  await page.setInputFiles('#attach-input', { name: 'persist.txt', mimeType: 'text/plain', buffer: Buffer.from('zhiya-idb-persistence-marker-42') });
  await page.waitForTimeout(800);

  // 重载（会话内存清空）→ 注水自 IndexedDB → 导出 .xmind 应含附件字节
  await page.reload(); await page.waitForTimeout(1200);
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.click('#btn-file'); await page.waitForTimeout(250);
      await page.locator('#ctx-menu .ctx-item', { hasText: '保存 .xmind' }).click();
    })()
  ]);
  const p15 = 'output/zhiya/idb-persist.xmind';
  await dl.saveAs(p15);
  const buf15 = fs.readFileSync(p15);
  const t15 = buf15.toString('latin1');
  const survived = t15.includes('attachments/persist.txt') && t15.includes('zhiya-idb-persistence-marker-42');
  ok(survived, '附件跨重载存活：.xmind 含附件名与字节标记（IndexedDB 注水）');

  // 保存 GC：删除挂附件的主题 → 再保存 → 附件不再嵌入
  await page.locator('.topic', { hasText: '持久化' }).first().click();
  await page.keyboard.press('Delete'); await page.waitForTimeout(500);
  const [dl2] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.click('#btn-file'); await page.waitForTimeout(250);
      await page.locator('#ctx-menu .ctx-item', { hasText: '保存 .xmind' }).click();
    })()
  ]);
  const p16 = 'output/zhiya/idb-gc.xmind';
  await dl2.saveAs(p16);
  const gcOk = !fs.readFileSync(p16).toString('latin1').includes('attachments/persist.txt');
  ok(gcOk, '保存 GC：删除引用后附件从 .xmind 与 IDB 中回收（Xmind 同款语义）');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForTimeout(800);
}

// 10h. v1.16：timeline 变体 / 图例 / 主题包
{
  const switchTo = async (id) => { await page.selectOption('#structure-select', id); await page.waitForTimeout(600); };
  const l1 = () => page.evaluate(() => [...document.querySelectorAll('.topic')]
    .filter(t => t.style.display !== 'none' && +t.dataset.depth === 1)
    .map(t => ({ x: parseFloat(t.style.left), y: parseFloat(t.style.top) })));

  await switchTo('timeline-sided');
  let ps = await l1();
  ok(ps.length >= 3 && ps.every(p => p.y < 0), `时间轴·单侧：${ps.length} 个事件全在轴上方`);
  await switchTo('timeline-through');
  ps = await l1();
  ok(ps.every(p => Math.abs(p.x) < 5), '时间轴·贯通：主题串在轴上（|x|<5）');
  await switchTo('timeline-rtl');
  ps = await l1();
  ok(ps.every(p => p.x < 0), '时间轴·反向：事件全在轴向左');
  await switchTo('logic-chart'); await page.waitForTimeout(400);

  // 图例：加标记 → 文件菜单开启 → 行渲染 + 双击编辑含义
  await page.locator('.topic', { hasText: '结构引擎' }).first().click();
  await page.click('#btn-sidebar'); await page.waitForTimeout(250);
  await page.click('.sb-tab[data-tab="style"]'); await page.waitForTimeout(200);
  await page.locator('.marker-btn[data-mk="priority-1"]').click(); await page.waitForTimeout(300);
  await page.click('#btn-sidebar'); await page.waitForTimeout(200);
  await page.click('#btn-file'); await page.waitForTimeout(250);
  await page.locator('#ctx-menu .ctx-item', { hasText: '图例' }).click();
  await page.waitForTimeout(400);
  const lgRows = await page.evaluate(() => document.querySelectorAll('#legend .lg-row').length);
  const lgShown = await page.evaluate(() => !!document.getElementById('legend'));
  ok(lgShown && lgRows >= 1, `图例：开启后渲染 ${lgRows} 行`);
  await page.locator('#legend .lg-txt').first().dblclick();
  await page.waitForTimeout(200);
  await page.keyboard.type('最高优先级');
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  const lgText = await page.evaluate(() => document.querySelector('#legend .lg-txt')?.textContent);
  const lgLs = await page.evaluate(() => (localStorage.getItem('zhiya.map.v1') || '').includes('"markers":{"priority-1":"最高优先级"'));
  ok(lgText === '最高优先级' && lgLs, `图例含义编辑落盘（"${lgText}"）`);
  await page.screenshot({ path: 'output/zhiya/verify-legend.png' });
  await page.click('#btn-file'); await page.waitForTimeout(250);
  await page.locator('#ctx-menu .ctx-item', { hasText: '图例' }).click();   // 关闭图例
  await page.waitForTimeout(300);

  // 主题包：切 Blackboard（x-B01）→ 暗色纸底 + 功能色变量生效
  await page.locator('.topic', { hasText: '结构引擎' }).first().click();
  await page.click('#btn-sidebar'); await page.waitForTimeout(250);
  await page.click('.sb-tab[data-tab="style"]'); await page.waitForTimeout(250);
  if (!(await page.locator('.shape-btn[data-theme="x-B01"]').count())) {
    await page.locator('.style-more[data-more="themes"]').click();
    await page.waitForTimeout(200);
  }
  const themeN = await page.evaluate(() => document.querySelectorAll('.theme-grid .shape-btn').length);
  await page.locator('.shape-btn[data-theme="x-B01"]').click();
  await page.waitForTimeout(500);
  const darkPaper = await page.evaluate(() => getComputedStyle(document.getElementById('viewport')).getPropertyValue('--paper').trim());
  const topicBg = await page.evaluate(() => getComputedStyle(document.getElementById('viewport')).getPropertyValue('--topic-bg').trim());
  const b1 = await page.evaluate(() => getComputedStyle(document.getElementById('viewport')).getPropertyValue('--b1').trim());
  ok(themeN >= 47, `主题包：选择器 ${themeN} 款（4 内置 + 43 移植）`);
  ok(darkPaper === 'rgb(30, 41, 51)' || darkPaper === '#1e2933', `Blackboard 暗色纸底（${darkPaper}）`);
  ok(topicBg === 'transparent', `暗色主题下主题背景透明（${topicBg}）`);
  ok(b1 !== '' && b1 !== 'rgb(179, 86, 59)', `功能色已切换（--b1=${b1}）`);
  await page.screenshot({ path: 'output/zhiya/verify-theme-dark.png' });
  await page.locator('.shape-btn[data-theme="classic"]').click();
  await page.waitForTimeout(400);
  await page.click('#btn-sidebar'); await page.waitForTimeout(200);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForTimeout(800);
}

// 10i. v1.17：表格系结构（真实浏览器切引擎断言）
{
  const switchTo = async (id) => { await page.selectOption('#structure-select', id); await page.waitForTimeout(650); };
  const boxes = () => page.evaluate(() => [...document.querySelectorAll('.topic')]
    .filter(t => t.style.display !== 'none')
    .map(t => ({ d: +t.dataset.depth, x: parseFloat(t.style.left), y: parseFloat(t.style.top) })));
  const lineN = () => page.evaluate(() => [...document.querySelectorAll('#edges path')]
    .filter(p => /M [\d.-]+ [\d.-]+ L /.test(p.getAttribute('d') || '')).length);

  await switchTo('treetable');
  let bs = await boxes();
  const d1 = bs.filter(b => b.d === 1), d2 = bs.filter(b => b.d === 2);
  ok(d2.length >= 2 && d2.every(b2 => d1.some(b1 => b2.x > b1.x + 10 && b2.y > b1.y)), `树表格：子行缩进且在父行下方（${bs.length} 行）`);
  const ttLines = await lineN();
  ok(ttLines >= 6, `树表格：表格线 ${ttLines} 条`);

  await switchTo('spreadsheet');
  bs = await boxes();
  const heads = bs.filter(b => b.d === 1);
  const headYs = new Set(heads.map(h => Math.round(h.y / 10)));
  const row0 = bs.filter(b => b.d === 2 && b.y < 300);
  ok(heads.length >= 3 && headYs.size === 1, `电子表格：${heads.length} 个列头同一行对齐`);
  const decor = await page.evaluate(() => document.getElementById('edges').innerHTML);
  ok(decor.includes('fill-opacity') || decor.includes('<rect'), '电子表格：表头底纹渲染');

  await switchTo('spreadsheet-column');
  bs = await boxes();
  const heads2 = bs.filter(b => b.d === 1);
  const headXs = new Set(heads2.map(h => Math.round(h.x / 10)));
  ok(heads2.length >= 3 && headXs.size === 1, `电子表格·行头：${heads2.length} 个行头同列对齐`);

  await switchTo('grid');
  const zebra = await page.evaluate(() => [...document.querySelectorAll('#edges rect')].length);
  bs = await boxes();
  ok(zebra >= 2 && bs.length >= 10, `矩阵：斑马行 ${zebra} 个矩形，${bs.length} 个主题`);
  await page.screenshot({ path: 'output/zhiya/verify-tables.png' });

  await switchTo('logic-chart');
  await page.waitForTimeout(400);
}

// 11. 触屏会话（hasTouch 上下文）：tap 选中 / 双击编辑 / 长按菜单 / 双指捏合缩放
{
  const tctx = await browser.newContext({ viewport: { width: 900, height: 700 }, hasTouch: true });
  const tp = await tctx.newPage();
  const terrs = [];
  tp.on('pageerror', (e) => terrs.push('TPAGEERROR: ' + e.message));
  await tp.goto('file:///' + DIST.replace(/\\/g, '/'));
  await tp.waitForTimeout(900);
  const centerOf = (q) => tp.evaluate((t) => {
    const el = [...document.querySelectorAll('.topic')].find(x => x.querySelector('.t-title')?.textContent === t);
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, q);

  const p1 = await centerOf('自动布局');
  await tp.touchscreen.tap(p1.x, p1.y);
  await tp.waitForTimeout(300);
  const selected = await tp.evaluate(() =>
    [...document.querySelectorAll('.topic')].find(x => x.classList.contains('selected'))?.querySelector('.t-title')?.textContent ?? null);
  ok(selected === '自动布局', `触屏 tap 选中主题（${selected}）`);

  const p2 = await centerOf('编辑交互');
  await tp.touchscreen.tap(p2.x, p2.y); await tp.waitForTimeout(140);
  await tp.touchscreen.tap(p2.x, p2.y); await tp.waitForTimeout(450);
  const editing = await tp.evaluate(() =>
    [...document.querySelectorAll('.topic')].find(x => x.classList.contains('editing'))?.querySelector('.t-title')?.textContent ?? null);
  ok(!!editing, `触屏双击进入编辑（${editing}）`);
  await tp.keyboard.press('Escape'); await tp.waitForTimeout(250);

  const p3 = await centerOf('持久化');
  const cdp = await tctx.newCDPSession(tp);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p3.x, y: p3.y }] });
  await tp.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await tp.waitForTimeout(350);
  const menuOpen = await tp.evaluate(() => document.getElementById('ctx-menu').classList.contains('open'));
  const menuTxt = await tp.evaluate(() => document.getElementById('ctx-menu').textContent);
  ok(menuOpen && menuTxt.includes('添加子主题'), `触屏长按打开主题菜单（open=${menuOpen}）`);
  await tp.keyboard.press('Escape'); await tp.waitForTimeout(250);

  const pct0 = await tp.evaluate(() => document.getElementById('zoom-pct').textContent);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 350 }, { x: 500, y: 350 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150, y: 350 }, { x: 650, y: 350 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await tp.waitForTimeout(350);
  const pct1 = await tp.evaluate(() => document.getElementById('zoom-pct').textContent);
  ok(parseInt(pct1) > parseInt(pct0), `双指捏合放大画布：${pct0} → ${pct1}`);
  ok(terrs.length === 0, `触屏会话无页面错误${terrs.length ? '：' + terrs[0] : ''}`);
  await tctx.close();
}

console.log(errs.length ? ('\nFAILED: ' + errs.join('\n')) : '\nALL ASSERTIONS PASSED');
await browser.close();
process.exit(errs.length ? 1 : 0);

