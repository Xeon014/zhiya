import { Topic, sheet, topicOf, type Side, type TopicSummary } from './model';
import { startRelationshipPick } from './relationships';
import { openLinkPanel } from './linkpanel';
import { uid } from './utils';
import { pushHistory } from './persistence';
import { relayout } from './layout';
import { addChild, addSibling, removeTopic, select, setTopicSide, startEdit, stopEdit, toggleCollapse, editingId } from './interactions';
import { openNoteFor } from './notes';
import { fitView } from './view';
import { doExport, saveFile, saveFileAs, openFileSmart, exportBranchXmind, exportBranchMarkdown } from './exports';
import { startPresent } from './present';
import { toggleLegend } from './legend';
import { boot } from './boot';
import { clamp } from './utils';
import { zoom as zoomVal, pan as panVal } from './view';
import { toast } from './ui';
import { ctxMenu, viewportEl } from './dom';

/* =====================================================================
 * 6.7 右键上下文菜单（主题菜单 / 画布菜单）
 * ===================================================================== */
export interface CtxMenuItem { label: string; kbd?: string; disabled?: boolean; action: () => void }
export type CtxMenuItems = (CtxMenuItem | '-')[];

export function showCtxMenu(x: number, y: number, items: CtxMenuItems): void {
  ctxMenu.innerHTML = '';
  for (const it of items) {
    if (it === '-') {
      const s = document.createElement('div'); s.className = 'ctx-sep';
      ctxMenu.appendChild(s); continue;
    }
    const b = document.createElement('button');
    b.className = 'ctx-item';
    const label = document.createElement('span'); label.textContent = it.label; b.appendChild(label);
    if (it.kbd) { const k = document.createElement('kbd'); k.textContent = it.kbd; b.appendChild(k); }
    b.disabled = !!it.disabled;
    b.addEventListener('click', () => { hideCtxMenu(); it.action(); });
    ctxMenu.appendChild(b);
  }
  ctxMenu.classList.add('open');
  const mw = ctxMenu.offsetWidth, mh = ctxMenu.offsetHeight;
  ctxMenu.style.left = clamp(x, 8, innerWidth - mw - 8) + 'px';
  ctxMenu.style.top = clamp(y, 8, innerHeight - mh - 8) + 'px';
}
export function hideCtxMenu(): void { ctxMenu.classList.remove('open'); }

export function topicMenu(id: string, x: number, y: number): void {
  if (editingId) stopEdit(true);
  const t = topicOf(id);
  if (!t) return;
  select(id);
  const isRoot = t.id === sheet.root.id;
  showCtxMenu(x, y, [
    { label: '添加子主题', kbd: 'Tab', action: () => addChild(id) },
    { label: '添加同级主题', kbd: 'Enter', disabled: isRoot, action: () => addSibling(id) },
    { label: '重命名', kbd: 'F2', action: () => startEdit(id) },
    { label: t.note ? '编辑备注' : '添加备注', kbd: 'Ctrl+M', action: () => openNoteFor(id) },
    { label: '添加联系到…', action: () => { startRelationshipPick(id); toast('点击目标主题完成联系（Esc 取消）'); } },
    { label: t.href ? '编辑链接' : '设置链接…', action: () => openLinkPanel(id) },
    ...(t.href ? [{ label: '移除链接', action: () => { t.href = ''; pushHistory(); relayout(); } }] : []),
    { label: '插入图片…', action: () => { document.getElementById('image-input')?.click(); } },
    ...(t.image ? [{ label: '移除图片', action: () => { t.image = null; pushHistory(); relayout(); } }] : []),
    { label: '附加文件…', action: () => { document.getElementById('attach-input')?.click(); } },
    { label: '标记 / 样式（侧栏）', action: () => {
        document.getElementById('btn-sidebar')?.click();
        document.querySelector<HTMLElement>('.sb-tab[data-tab="style"]')?.click();
      } },
    { label: t.collapsed ? '展开分支' : '折叠分支', kbd: 'Space', disabled: !t.children.length, action: () => toggleCollapse(id) },
    // 分支成长方向（Xmind growthDirection）：仅 logic 系结构有意义
    ...(sheet.structureClass.startsWith('logic') ? (['auto', 'right', 'left'] as Side[]).map(side => ({
      label: `分支方向 · ${{ auto: '自动', right: '向右', left: '向左' }[side]!}${t.side === side ? ' ✓' : ''}`,
      disabled: isRoot,
      action: () => setTopicSide(id, side)
    })) : []),
    '-',
    { label: t.boundary ? '移除外框' : '添加外框', action: () => { t.boundary = !t.boundary; pushHistory(); relayout(); } },
    { label: '添加概要（全部子主题）', disabled: !t.children.length || isRoot, action: () => {
        const sum: TopicSummary = { id: uid('sm'), topicId: uid('smt'), title: '概要', rangeStart: 0, rangeEnd: t.children.length - 1 };
        t.summaries.push(sum);
        pushHistory(); relayout();
      } },
    '-',
    { label: '导出此分支 .xmind', disabled: isRoot, action: () => exportBranchXmind(id) },
    { label: '导出此分支 Markdown', disabled: isRoot, action: () => exportBranchMarkdown(id) },
    '-',
    { label: '删除分支', kbd: 'Delete', disabled: isRoot, action: () => removeTopic(id) }
  ]);
}
export function canvasMenu(x: number, y: number): void {
  showCtxMenu(x, y, [
    { label: '新建导图', action: () => boot(null) },
    { label: '打开文件…', action: () => document.getElementById('file-input')?.click() },
    { label: '从 Markdown 导入…', action: () => {
      const md = window.prompt('粘贴 Markdown 大纲（# 标题 + - 列表）', '# 中心\n- 分支 A\n  - 子项');
      if (md) void import('./exports').then(m => m.openMarkdownText(md));
    } },
    '-',
    { label: '插入自由主题', action: () => insertDetachedAt(x, y) },
    { label: `图例 ${sheet.legend?.visibility === 'visible' ? '✓' : '○'}`, action: () => toggleLegend() },
    { label: '插入标注框', action: () => insertCalloutAt(x, y) },
    { label: '适应画布', action: fitView },
    { label: '演示模式', kbd: 'F5', action: () => startPresent() },
    { label: '导出 PNG', action: () => doExport('png') },
    { label: '导出 .xmind', action: saveFile }
  ]);
}

/** 在点击处插入标注框（Xmind: calloutTopic + position，边框气泡样式） */
function insertCalloutAt(cx: number, cy: number): void {
  const vp = document.getElementById('viewport')!.getBoundingClientRect();
  const z = zoomVal, pn = panVal;
  const wx = (cx - vp.left - pn.x) / z, wy = (cy - vp.top - pn.y) / z;
  const t = new Topic('标注');
  t.pos = { x: wx, y: wy };
  t.isCallout = true;
  sheet.root.calloutKids.push(t);
  select(t.id); pushHistory(); relayout();
  startEdit(t.id);
}

/** 在点击处插入自由主题（Xmind: detached topic + position） */
function insertDetachedAt(cx: number, cy: number): void {
  const vp = document.getElementById('viewport')!.getBoundingClientRect();
  const z = zoomVal, pn = panVal;
  const wx = (cx - vp.left - pn.x) / z, wy = (cy - vp.top - pn.y) / z;
  const t = new Topic('自由主题');
  t.pos = { x: wx, y: wy };
  sheet.root.detachedKids.push(t);
  select(t.id); pushHistory(); relayout();
  startEdit(t.id);
}

window.addEventListener('pointerdown', (e) => { if (!ctxMenu.contains(e.target as Node)) hideCtxMenu(); }, true);
window.addEventListener('contextmenu', (e) => { if (!ctxMenu.contains(e.target as Node)) hideCtxMenu(); });
window.addEventListener('blur', hideCtxMenu);
viewportEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();                     // 防止 window 级关闭器把刚打开的菜单关掉
  canvasMenu(e.clientX, e.clientY);
});
