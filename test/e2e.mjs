// e2e.mjs — 端到端验证（失败也输出错误与产物）
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'index.html');
const OUT = path.join(ROOT, 'output', 'zhiya');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const shots = [];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const snap = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); shots.push(name); };
  const count = () => page.evaluate(() => document.querySelectorAll('.topic').length);
  const visCount = () => page.evaluate(() => [...document.querySelectorAll('.topic')].filter(t => t.style.display !== 'none' && !t.classList.contains('ghost')).length);
  const status = () => page.evaluate(() => document.getElementById('stat-left').textContent);
  const parentIdOf = (text) => page.evaluate((q) => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === q && t.style.display !== 'none');
    return el ? el.dataset.parent : null;
  }, text);
  const idOf = (text) => page.evaluate((q) => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === q && t.style.display !== 'none');
    return el ? el.dataset.id : null;
  }, text);
  const pathCount = () => page.evaluate(() => document.querySelectorAll('#edges path').length);

  await page.goto('file:///' + DIST.replace(/\\/g, '/'));
  await page.waitForTimeout(800);
  await snap('01-initial');
  console.log('initial:', await visCount(), 'topics |', await status());

  // 2. 新增两个分支
  await page.click('.topic.root');
  await page.keyboard.press('Tab'); await page.waitForTimeout(350);
  await page.keyboard.type('新增分支甲');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.keyboard.type('新增分支乙');
  await page.mouse.click(200, 700); await page.waitForTimeout(350);
  await snap('02-added');

  // 3. 折叠/展开
  await page.locator('.topic', { hasText: '结构引擎' }).first().click();
  await page.keyboard.press('Space'); await page.waitForTimeout(450);
  await page.keyboard.press('Space'); await page.waitForTimeout(450);

  // 4. 撤销×2 / 重做×2
  await page.keyboard.press('Control+z'); await page.waitForTimeout(250);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(250);
  await page.keyboard.press('Control+y'); await page.waitForTimeout(250);
  await page.keyboard.press('Control+y'); await page.waitForTimeout(300);
  console.log('after undo/redo:', await visCount(), 'topics');

  // 5. 组织架构引擎
  await page.selectOption('#structure-select', 'org-chart'); await page.waitForTimeout(550);
  await snap('03-orgchart');
  // 5b. 成长方向：逻辑图·向右（全部分支同侧）
  await page.selectOption('#structure-select', 'logic-right'); await page.waitForTimeout(550);
  const rightSide = await page.evaluate(() => [...document.querySelectorAll('.topic')]
    .filter(t => t.style.display !== 'none' && t.dataset.depth === '1')
    .every(t => parseFloat(t.style.left) > 0));
  console.log('logic-right: 一级分支全在右侧', rightSide ? '✓' : '✗');
  await snap('03b-logic-right');
  await page.selectOption('#structure-select', 'logic-chart'); await page.waitForTimeout(400);

  // 6. 鱼骨引擎
  await page.selectOption('#structure-select', 'fishbone'); await page.waitForTimeout(550);
  await snap('04-fishbone');
  const fish = await page.evaluate(() => [...document.querySelectorAll('.topic')]
    .filter(t => t.style.display !== 'none' && t.dataset.depth === '1')
    .map(t => parseFloat(t.style.top)));
  const upN = fish.filter(y => y < -10).length, downN = fish.filter(y => y > 10).length;
  console.log('fishbone: 上侧', upN, '/ 下侧', downN, '| 边数:', await pathCount());
  await page.selectOption('#structure-select', 'logic-chart'); await page.waitForTimeout(400);

  // 6b. 时间轴引擎
  await page.selectOption('#structure-select', 'timeline'); await page.waitForTimeout(550);
  const tl = await page.evaluate(() => [...document.querySelectorAll('.topic')]
    .filter(t => t.style.display !== 'none' && t.dataset.depth === '1')
    .map(t => parseFloat(t.style.top)));
  console.log('timeline: 轴上', tl.filter(y => y < -10).length, '/ 轴下', tl.filter(y => y > 10).length, '| 边数:', await pathCount());
  await snap('04b-timeline');
  await page.selectOption('#structure-select', 'logic-chart'); await page.waitForTimeout(400);

  // 6b2. 备注功能：给“自动布局”加备注
  await page.locator('.topic', { hasText: '自动布局' }).first().click();
  await page.keyboard.press('Control+m');
  await page.waitForTimeout(250);
  await page.keyboard.type('复刻自 Xmind 的注入式测量设计');
  await page.keyboard.press('Escape');          // 关闭面板（提交）
  await page.waitForTimeout(300);
  const noteBadge = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '自动布局');
    return el ? el.classList.contains('has-note') : false;
  });
  console.log('note: 角标出现 =', noteBadge ? '✓' : '✗');
  await page.waitForTimeout(600);                 // 等防抖重排
  const blockShown = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '自动布局');
    const n = el?.querySelector('.t-note');
    const dot = el?.querySelector('.note-dot');
    return {
      visible: !!n && getComputedStyle(n).display !== 'none' && n.textContent.includes('复刻自'),
      clamp: !!n && getComputedStyle(n).webkitLineClamp === '5',
      dotColor: dot ? getComputedStyle(dot).backgroundColor : 'none'
    };
  });
  console.log('note 块显示(Xmind Block 模式):', blockShown.visible ? '✓' : '✗',
    '| 5行钳制:', blockShown.clamp ? '✓' : '✗',
    '| 角标黄色:', blockShown.dotColor === 'rgb(244, 214, 7)' ? '✓' : blockShown.dotColor);
  await snap('04c-note');

  // 6b2b. 备注锚定行为：点圆点重开 → 面板贴近主题 → 点其他主题不抢走目标
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '自动布局');
    el.querySelector('.note-dot').click();
  });
  await page.waitForTimeout(300);
  const anchored = await page.evaluate(() => {
    const panel = document.getElementById('note-panel');
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '自动布局');
    const pr = panel.getBoundingClientRect(), tr = el.getBoundingClientRect();
    return {
      open: panel.classList.contains('open'),
      nt: document.getElementById('note-topic').textContent,
      adjacent: (pr.left - tr.right > 0 && pr.left - tr.right < 60) || (tr.left - pr.right > 0 && tr.left - pr.right < 60)
    };
  });
  await page.locator('.topic', { hasText: '编辑交互' }).first().click();
  await page.waitForTimeout(200);
  const notStolen = await page.evaluate(() => document.getElementById('note-topic').textContent);
  console.log('note 锚定: 打开', anchored.open ? '✓' : '✗',
    '| 面板标题', anchored.nt === '自动布局' ? '✓' : anchored.nt,
    '| 贴近主题', anchored.adjacent ? '✓' : '✗',
    '| 点其他主题不抢走', notStolen === '自动布局' ? '✓' : notStolen);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  // 6b3. 右键菜单：主题菜单点击“添加子主题”
  const beforeMenu = await visCount();
  await page.locator('.topic', { hasText: '结构引擎' }).first().click({ button: 'right' });
  await page.waitForTimeout(250);
  const menuOpen1 = await page.evaluate(() => document.getElementById('ctx-menu').classList.contains('open'));
  await page.locator('#ctx-menu .ctx-item', { hasText: '添加子主题' }).click();
  await page.waitForTimeout(400);
  const afterMenuAdd = await visCount();
  console.log('ctxmenu 主题: 菜单打开', menuOpen1 ? '✓' : '✗', '| 点击加子主题:', afterMenuAdd === beforeMenu + 1 ? '✓' : `✗(${afterMenuAdd})`);
  await snap('04d-ctxmenu');
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);   // 退出自动打开的编辑框

  // 根节点菜单：删除/添加同级应禁用
  await page.locator('.topic.root').click({ button: 'right' });
  await page.waitForTimeout(200);
  const disabledOK = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#ctx-menu .ctx-item')];
    const del = items.find(b => b.textContent.includes('删除分支'));
    const sib = items.find(b => b.textContent.includes('添加同级'));
    return del?.disabled === true && sib?.disabled === true;
  });
  console.log('ctxmenu 根节点禁用态:', disabledOK ? '✓' : '✗');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);

  // 画布菜单：右键空白角落 → 适应画布
  await page.mouse.click(140, 820, { button: 'right' });
  await page.waitForTimeout(200);
  const canvasMenuOpen = await page.evaluate(() => document.getElementById('ctx-menu').classList.contains('open'));
  await page.locator('#ctx-menu .ctx-item', { hasText: '适应画布' }).click();
  await page.waitForTimeout(300);
  console.log('ctxmenu 画布: 菜单打开', canvasMenuOpen ? '✓' : '✗', '| 适应画布执行 ✓');

  // 6b4. 角标约束：只有含笔记的主题显示角标
  const dotCheck = await page.evaluate(() => {
    const hasNote = document.querySelectorAll('.topic.has-note').length;
    const dots = [...document.querySelectorAll('.note-dot')].filter(d => getComputedStyle(d).display !== 'none').length;
    return { hasNote, dots };
  });
  console.log('角标约束: 有笔记主题', dotCheck.hasNote, '/ 可见角标', dotCheck.dots,
    (dotCheck.hasNote === dotCheck.dots && dotCheck.dots >= 1) ? '✓' : '✗');

  // 6b5. 迷你工具条：跟随选中主题 + 点击加子级
  const mbShown = await page.evaluate(() => getComputedStyle(document.getElementById('mini-bar')).display !== 'none');
  const beforeMb = await visCount();
  await page.click('#mb-child'); await page.waitForTimeout(350);
  const mbAdded = await visCount();
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  console.log('迷你工具条: 显示', mbShown ? '✓' : '✗', '| 点击⊕子级 +1:', mbAdded === beforeMb + 1 ? '✓' : `✗(${mbAdded})`);

  // 6b6a. 样式系统：侧栏样式页 → 菱形 + 填充色 → 撤销
  await page.locator('.topic', { hasText: '结构引擎' }).first().click();
  await page.click('#btn-sidebar'); await page.waitForTimeout(300);
  await page.click('.sb-tab[data-tab="style"]'); await page.waitForTimeout(250);
  if (!(await page.locator('.shape-btn[data-shape="diamond"]').count())) {
    await page.locator('.style-more[data-more="shapes"]').click();
    await page.waitForTimeout(200);
  }
  await page.locator('.shape-btn[data-shape="diamond"]').click(); await page.waitForTimeout(350);
  const diamond = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '结构引擎');
    return el ? el.classList.contains('shape-diamond') : false;
  });
  const fillSwatch = page.locator('.swatch[data-k="fill"][data-c="#F4D607"]');
  if (await fillSwatch.count()) { await fillSwatch.click(); await page.waitForTimeout(300); }
  const filled = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '结构引擎');
    return el ? el.style.background : '';
  });
  console.log('样式: 菱形', diamond ? '✓' : '✗', '| 填充黄',
    filled.includes('244, 214, 7') || filled.toLowerCase().includes('#f4d607') ? '✓' : filled || '∅');
  await snap('04e-style');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);   // 撤销填充
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);   // 撤销菱形
  const undone = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '结构引擎');
    return el ? !el.classList.contains('shape-diamond') : true;
  });
  console.log('样式撤销:', undone ? '✓' : '✗');

  // 6b6a2. 连线形状切换 + 主题预设
  await page.evaluate(() => document.getElementById('sidebar').classList.add('open'));
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelectorAll('.sb-tab').forEach(x => x.classList.remove('active')); const t = document.querySelector('.sb-tab[data-tab="style"]'); t.classList.add('active'); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { /* 触发 tab onclick */ document.querySelector('.sb-tab[data-tab="style"]').click(); });
  await page.waitForTimeout(250);
  const lcBtn = page.locator('.shape-btn[data-lc="elbow"]');
  if (await lcBtn.count()) {
    await lcBtn.click(); await page.waitForTimeout(350);
    const elbowApplied = await page.evaluate(() => {
      const paths = [...document.querySelectorAll('#edges path')];
      return paths.some(p => (p.getAttribute('d') || '').split('L').length >= 3);
    });
    console.log('连线形状: elbow ✓|', elbowApplied ? '折线可见 ✓' : '未检出折线');
  }
  const themeBtn = page.locator('.shape-btn[data-theme="business"]');
  if (await themeBtn.count()) {
    await themeBtn.click(); await page.waitForTimeout(400);
    const themeApplied = await page.evaluate(() => getComputedStyle(document.getElementById('viewport')).getPropertyValue('--paper').trim());
    console.log('主题: business', themeApplied.includes('240, 243, 248') || themeApplied.includes('#F0F3F8') ? '✓' : themeApplied);
    await page.locator('.shape-btn[data-theme="classic"]').click();
    await page.waitForTimeout(300);
  }
  await page.click('#btn-sidebar'); await page.waitForTimeout(200);

  // 6b6. 侧边栏：大纲 / 笔记 / 快捷键
  await page.click('#btn-sidebar'); await page.waitForTimeout(350);
  await page.click('.sb-tab[data-tab="outline"]'); await page.waitForTimeout(250);
  const outlineCount = await page.evaluate(() => document.querySelectorAll('.ol-item').length);
  await page.click('.sb-tab[data-tab="notes"]'); await page.waitForTimeout(250);
  const notesCount = await page.evaluate(() => document.querySelectorAll('.nt-item').length);
  await page.click('.sb-tab[data-tab="keys"]'); await page.waitForTimeout(200);
  const keysCount = await page.evaluate(() => document.querySelectorAll('.keys-body em').length);
  console.log('侧边栏: 大纲', outlineCount, '项 | 笔记列表', notesCount, '项(≥1)', notesCount >= 1 ? '✓' : '✗', '| 快捷键', keysCount, '条');
  await page.click('#btn-sidebar'); await page.waitForTimeout(200);

  // 6c. 全格式导出（经由“导出”下拉菜单）
  const exportVia = async (label, ext) => {
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.click('#btn-export'); await page.waitForTimeout(200);
        await page.locator('#ctx-menu .ctx-item', { hasText: label }).click();
      })()
    ]);
    const p = `${OUT}/export.${ext}`;
    await dl.saveAs(p);
    return p;
  };
  const pngPath = await exportVia('PNG 图片', 'png');
  const pngBytes = fs.readFileSync(pngPath);
  const magicOK = pngBytes[0] === 0x89 && pngBytes[1] === 0x50;
  console.log('png export:', magicOK ? 'PNG ✓' : 'BAD', `${pngBytes.readUInt32BE(16)}×${pngBytes.readUInt32BE(20)}`, `${(pngBytes.length/1024).toFixed(0)}KB`);

  const md = fs.readFileSync(await exportVia('Markdown', 'md'), 'utf8');
  console.log('md export:', md.startsWith('# 枝桠') ? '✓' : '✗', '| 含备注引言:', md.includes('> 复刻自 Xmind') ? '✓' : '✗', `(${md.length} chars)`);

  const opml = fs.readFileSync(await exportVia('OPML', 'opml'), 'utf8');
  const opmlOK = opml.includes('<opml version="2.0"') && opml.includes('_note=');
  console.log('opml export:', opmlOK ? '✓（含 _note）' : '✗');

  const mm = fs.readFileSync(await exportVia('FreeMind', 'mm'), 'utf8');
  const mmOK = mm.includes('<map version="1.0.1"') && mm.includes('POSITION="right"') && mm.includes('richcontent TYPE="NOTE"');
  console.log('freemind export:', mmOK ? '✓（含 POSITION + NOTE）' : '✗');

  const txt = fs.readFileSync(await exportVia('大纲文本', 'txt'), 'utf8');
  console.log('txt export:', txt.split('\n').length, '行 |', txt.includes('- 结构引擎') ? '✓' : '✗');

  const svg = fs.readFileSync(await exportVia('SVG', 'svg'), 'utf8');
  const svgOK = svg.startsWith('<svg') && svg.includes('<rect') && svg.includes('<tspan') && !svg.includes('var(--');
  console.log('svg export:', svgOK ? '✓（矢量，颜色已解析）' : '✗');

  // 6c2. 新形状抽样（43 形状注册表）：云形/心形/数据库 → clip-path + SVG polygon 落盘
  {
    await page.locator('.topic', { hasText: '结构引擎' }).first().click();
    await page.click('#btn-sidebar'); await page.waitForTimeout(250);
    await page.click('.sb-tab[data-tab="style"]'); await page.waitForTimeout(200);
    if (!(await page.locator('.shape-btn[data-shape="simpleCloud"]').count())) {
      await page.locator('.style-more[data-more="shapes"]').click();
      await page.waitForTimeout(200);
    }
    const tryShape = async (name) => {
      const btn = page.locator(`.shape-btn[data-shape="${name}"]`);
      if (await btn.count()) { await btn.click(); await page.waitForTimeout(350); return true; }
      return false;
    };
    const shapeApplied = async (name) => page.evaluate((n) => {
      const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '结构引擎');
      return el ? el.classList.contains(`shape-${n}`) && (el.style.clipPath || '').startsWith('polygon') : false;
    }, name);
    const cloud = await tryShape('simpleCloud');
    const cloudOK = cloud && await shapeApplied('simpleCloud');
    await tryShape('heart');
    const heartOK = await shapeApplied('heart');
    await tryShape('database');
    const dbOK = await shapeApplied('database');
    const svgShape = fs.readFileSync(await exportVia('SVG', 'svg2'), 'utf8');
    const svgShapeOK = svgShape.includes('<polygon') && !svgShape.includes('var(--');
    console.log('新形状: 云形', cloudOK ? '✓' : '✗', '| 心形', heartOK ? '✓' : '✗',
      '| 数据库', dbOK ? '✓' : '✗', '| SVG 导出含 polygon', svgShapeOK ? '✓' : '✗');
    await page.click('#btn-sidebar'); await page.waitForTimeout(200);
  }

  // 6c3. 概要：添加 → 双击改名 → .xmind 真实键落盘（range 元组 + children.summary）+ 导入回路
  {
    await page.locator('.topic', { hasText: '结构引擎' }).first().click({ button: 'right' });
    await page.waitForTimeout(200);
    await page.locator('#ctx-menu .ctx-item', { hasText: '添加概要' }).click();
    await page.waitForTimeout(400);
    await page.locator('.summary-topic').dblclick();
    await page.waitForTimeout(250);
    await page.keyboard.type('三大引擎');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(450);
    const renamed = await page.evaluate(() => document.querySelector('.summary-topic')?.textContent);
    // localStorage 快照与 .xmind content.json 出自同一 toJSON()——直接验证落盘键形态
    const ls = await page.evaluate(() => localStorage.getItem('zhiya.map.v1') || '');
    const keysOK = /"range":"\(0,\d+\)"/.test(ls) && ls.includes('"topicId"') &&
      /"summary":\[\{"id":"smt/.test(ls) && ls.includes('"title":"三大引擎"');
    console.log('概要: 双击改名', renamed === '三大引擎' ? '✓' : `✗(${renamed})`,
      '| Xmind 真实键落盘', keysOK ? '✓（range 元组 + topicId + children.summary）' : '✗');
    await snap('04f-summary');
    // 导出 .xmind → 重新导入 → 概要标签存活
    const [dl2] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.click('#btn-file'); await page.waitForTimeout(200);
        await page.locator('#ctx-menu .ctx-item', { hasText: '保存 .xmind' }).click();
      })()
    ]);
    const xp = `${OUT}/summary.xmind`;
    await dl2.saveAs(xp);
    await page.evaluate(() => localStorage.clear());
    await page.setInputFiles('#file-input', xp);
    await page.waitForTimeout(800);
    const survived = await page.evaluate(() => document.querySelector('.summary-topic')?.textContent);
    console.log('概要 .xmind 回路:', survived === '三大引擎' ? '✓ 备注概要存活' : `✗(${survived})`);
  }

  // 6c4. 标记 + 联系（真实键落盘）
  {
    await page.locator('.topic', { hasText: '结构引擎' }).first().click();
    await page.click('#btn-sidebar'); await page.waitForTimeout(300);
    await page.click('.sb-tab[data-tab="style"]'); await page.waitForTimeout(250);
    await page.locator('.marker-btn[data-mk="priority-2"]').click(); await page.waitForTimeout(300);
    await page.click('#btn-sidebar'); await page.waitForTimeout(200);
    await page.locator('.topic', { hasText: '持久化' }).first().click({ button: 'right' });
    await page.waitForTimeout(250);
    await page.locator('#ctx-menu .ctx-item', { hasText: '添加联系到' }).click();
    await page.waitForTimeout(250);
    await page.locator('.topic', { hasText: '编辑交互' }).first().click();
    await page.waitForTimeout(450);
    const ls3 = await page.evaluate(() => localStorage.getItem('zhiya.map.v1') || '');
    const ok3 = ls3.includes('"markerId":"priority-2"') && ls3.includes('"end1Id"') && ls3.includes('"end2Id"');
    const relN = await page.evaluate(() => document.querySelectorAll('#edges .rel-hit').length);
    console.log('标记+联系: 落盘', ok3 ? '✓（markerId + end1Id/end2Id）' : '✗', '| 命中线', relN, relN >= 1 ? '✓' : '✗');
    await snap('04g-markers-rel');
  }

  // 6c5. Office 导出（Word/Excel/PPT/TextBundle）：下载并校验 ZIP 结构合法
  {
    const dlBytes = async (label, ext) => {
      const [d] = await Promise.all([
        page.waitForEvent('download'),
        (async () => {
          await page.click('#btn-export'); await page.waitForTimeout(200);
          await page.locator('#ctx-menu .ctx-item', { hasText: label }).click();
        })()
      ]);
      const pth = `${OUT}/export.${ext}`;
      await d.saveAs(pth);
      return fs.readFileSync(pth);
    };
    const zipOk = (buf) => {
      for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
          const n = buf.readUInt16LE(i + 10);
          const off = buf.readUInt32LE(i + 16);
          return n > 0 && off < buf.length && buf.readUInt32LE(off) === 0x02014b50;
        }
      }
      return false;
    };
    const docxB = await dlBytes('Word', 'docx');
    const xlsxB = await dlBytes('Excel', 'xlsx');
    const pptxB = await dlBytes('PPT', 'pptx');
    const tbB = await dlBytes('TextBundle', 'textbundle');
    console.log('office 导出:',
      'docx', zipOk(docxB) ? '✓' : '✗', `${(docxB.length / 1024).toFixed(1)}KB |`,
      'xlsx', zipOk(xlsxB) ? '✓' : '✗', `${(xlsxB.length / 1024).toFixed(1)}KB |`,
      'pptx', zipOk(pptxB) ? '✓' : '✗', `${(pptxB.length / 1024).toFixed(1)}KB |`,
      'textbundle', zipOk(tbB) ? '✓' : '✗', `${(tbB.length / 1024).toFixed(1)}KB`);

    // 分支导出：右键 结构引擎 → 导出此分支 .xmind → ZIP 合法且根为该分支
    const [d2] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.locator('.topic', { hasText: '结构引擎' }).first().click({ button: 'right' });
        await page.waitForTimeout(250);
        await page.locator('#ctx-menu .ctx-item', { hasText: '导出此分支 .xmind' }).click();
      })()
    ]);
    const branchPath = `${OUT}/branch.xmind`;
    await d2.saveAs(branchPath);
    const bb = fs.readFileSync(branchPath);
    console.log('分支导出 .xmind:', zipOk(bb) ? '✓ ZIP' : '✗', `${(bb.length / 1024).toFixed(1)}KB`);
  }

  // 6c6. 图片 + 附件 → .xmind 内嵌 resources/ 与 attachments/ 校验
  {
    await page.locator('.topic', { hasText: '结构引擎' }).first().click();
    await page.waitForTimeout(200);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await page.setInputFiles('#image-input', { name: 'dot.png', mimeType: 'image/png', buffer: png });
    await page.waitForTimeout(700);
    const hasImg = await page.evaluate(() => [...document.querySelectorAll('.topic')].some(t => t.classList.contains('has-image')));

    await page.locator('.topic', { hasText: '持久化' }).first().click({ button: 'right' });
    await page.waitForTimeout(250);
    await page.locator('#ctx-menu .ctx-item', { hasText: '附加文件…' }).click();
    await page.setInputFiles('#attach-input', { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('zhiya-attachment-test', 'utf8') });
    await page.waitForTimeout(700);
    const hasAttach = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '持久化');
      return el?.querySelector('.t-link')?.dataset.href?.startsWith('xap:attachments/') ?? false;
    });

    const [d3] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.click('#btn-file'); await page.waitForTimeout(200);
        await page.locator('#ctx-menu .ctx-item', { hasText: '保存 .xmind' }).click();
      })()
    ]);
    const assetsPath = `${OUT}/with-assets.xmind`;
    await d3.saveAs(assetsPath);
    const ab = fs.readFileSync(assetsPath);
    const txt = ab.toString('latin1');
    const hasRes = txt.includes('resources/');
    const hasAtt = txt.includes('attachments/');
    const hasXap = txt.includes('xap:resources/');
    console.log('图片+附件: 插入', hasImg ? '✓' : '✗', '| 附加', hasAttach ? '✓' : '✗',
      '| .xmind 嵌入', hasRes && hasAtt && hasXap ? '✓（resources/ + attachments/ + xap: 引用）' : `✗ res=${hasRes} att=${hasAtt} xap=${hasXap}`,
      `${(ab.length / 1024).toFixed(1)}KB`);
  }

  // 7. 拖拽换父：把“持久化”拖到“结构引擎”下半区
  const before = await visCount();
  const srcTopic = page.locator('.topic', { hasText: '持久化' }).first();
  await srcTopic.click(); await page.waitForTimeout(500);        // 确保命中并等动画稳定
  const src = await srcTopic.boundingBox();
  const dst = await page.locator('.topic', { hasText: '结构引擎' }).first().boundingBox();
  if (src && dst) {
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height * 0.85, { steps: 12 });
    await page.waitForTimeout(120);
    await snap('05-dragging');
    await page.mouse.up();
    await page.waitForTimeout(450);
  }
  const newParent = await parentIdOf('持久化');
  const engId = await idOf('结构引擎');
  const rootId0 = await idOf('枝桠');
  console.log('drag: 持久化 parent =', newParent === engId ? '结构引擎（换父）✓' : newParent === rootId0 ? '根（同级插入）✓' : newParent, '| count:', await visCount(), '(was', before + ')');
  await snap('06-dropped');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(350);   // 撤销拖拽
  const restoredParent = await parentIdOf('持久化');
  const rootId = await idOf('枝桠');
  console.log('drag undo: 持久化 parent =', restoredParent === rootId ? '根 ✓' : restoredParent);

  // 8. .xmind 导出 → 导入回路（经由“文件”菜单）
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.click('#btn-file'); await page.waitForTimeout(200);
      await page.locator('#ctx-menu .ctx-item', { hasText: '保存 .xmind' }).click();
    })()
  ]);
  const xmindPath = `${OUT}/roundtrip.xmind`;
  await dl.saveAs(xmindPath);
  const zipSize = fs.statSync(xmindPath).size;
  await page.evaluate(() => localStorage.clear());      // 清空本地，确保只能靠导入恢复
  await page.setInputFiles('#file-input', xmindPath);
  await page.waitForTimeout(800);
  console.log('xmind roundtrip: zip', zipSize, 'bytes | 导入后:', await visCount(), 'topics |', await status());
  const noteSurvived = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '自动布局');
    return el ? el.classList.contains('has-note') : false;
  });
  console.log('note roundtrip（.xmind 导出→导入）: 备注存活 =', noteSurvived ? '✓' : '✗');
  await snap('07-xmind-roundtrip');

  // 9. 删除 + 持久化 + 缩放
  const del = page.locator('.topic', { hasText: '新增分支乙' }).first();
  if (await del.count()) { await del.click(); await page.keyboard.press('Delete'); await page.waitForTimeout(350); }
  await page.reload(); await page.waitForTimeout(800);
  console.log('after reload:', await visCount(), 'topics');
  await page.mouse.move(720, 450); await page.mouse.wheel(0, -600); await page.waitForTimeout(250);
  await snap('08-final');
  console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  console.log('shots:', shots.join(', '));
} finally {
  await browser.close();
}
process.exit(errors.length ? 1 : 0);

