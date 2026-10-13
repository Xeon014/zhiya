import { sheet, sheets, walkVisible, metaOf, switchSheet, addSheet, removeSheet, type Topic, type TopicSummary } from './model';
import { figureMap } from './figures';
import { figuresEl, viewportEl } from './dom';
import { relayout } from './layout';
import { pushHistory } from './persistence';
import { zoom, pan } from './view';
import { showCtxMenu } from './menus';
import { clamp } from './utils';

/* =====================================================================
 * 视觉覆盖层：外框（boundary）+ 概要（summary）
 * 概要复刻 Xmind 的一等节点设计（逆向证据：24654.js L27142 summaries +
 * summaryFigureBySummaryTopicId——概要拥有独立 figure，可编辑、可拖拽调范围）：
 *   - 花括号/连线：SVG 覆盖层
 *   - 概要标签：DOM 元素 .summary-topic（双击原地改名）
 *   - 范围调整：括号上下端拖拽 handle，吸附最近兄弟槽位
 * ===================================================================== */

export interface OverlaySVG { boundary: string; summary: string }

/** 概要布局信息（世界坐标，renderOverlays / DOM 同步 / 导出三方共用） */
export interface SummaryLayoutItem {
  owner: Topic;
  sum: TopicSummary;
  minX: number; minY: number; maxX: number; maxY: number;   // 范围包围盒
  bracketX: number; dir: 1 | -1;
  labelX: number; labelY: number;                            // 概要标签中心
  hue: string;
}

/** 计算某主题可见子树的包围盒 */
export function subtreeBounds(topic: Topic): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of walkVisible(topic)) {
    const f = figureMap.get(t.id);
    if (!f?.cur) continue;
    const w = f.el.offsetWidth, h = f.el.offsetHeight;
    minX = Math.min(minX, f.cur.x - w / 2 - 16);
    maxX = Math.max(maxX, f.cur.x + w / 2 + 16);
    minY = Math.min(minY, f.cur.y - h / 2 - 12);
    maxY = Math.max(maxY, f.cur.y + h / 2 + 12);
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** 收集全部可见概要的布局（供 SVG 渲染 / DOM 标签定位 / 导出共用） */
export function collectSummaryLayout(): SummaryLayoutItem[] {
  const items: SummaryLayoutItem[] = [];
  for (const t of walkVisible()) {
    if (!t.summaries.length || t.collapsed) continue;
    for (const sum of t.summaries) {
      const kids = t.children.slice(sum.rangeStart, sum.rangeEnd + 1);
      if (!kids.length) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const k of kids) {
        const f = figureMap.get(k.id);
        if (!f?.cur) continue;
        minX = Math.min(minX, f.cur.x - f.el.offsetWidth / 2);
        maxX = Math.max(maxX, f.cur.x + f.el.offsetWidth / 2);
        minY = Math.min(minY, f.cur.y - f.el.offsetHeight / 2);
        maxY = Math.max(maxY, f.cur.y + f.el.offsetHeight / 2);
      }
      if (!isFinite(minY)) continue;
      const hue = metaOf(t.id)?.hue ?? 'b5';
      const midY = (minY + maxY) / 2;
      const side = sheet.structureClass === 'logic-chart' && minX < 0 ? 'left' : 'right';
      const dir = side === 'left' ? -1 : 1;
      const bracketX = dir > 0 ? maxX + 14 : minX - 14;
      items.push({
        owner: t, sum, minX, minY, maxX, maxY,
        bracketX, dir: dir as 1 | -1,
        labelX: bracketX + dir * 70, labelY: midY,
        hue
      });
    }
  }
  return items;
}

/** 生成所有覆盖层 SVG（花括号 + 连线；标签由 DOM 层渲染） */
export function renderOverlays(): OverlaySVG {
  let boundarySVG = '';
  let summarySVG = '';

  const boundsForRange = (parent: Topic, start: number, end: number) => {
    const kids = parent.children.slice(start, end + 1);
    if (!kids.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const k of kids) {
      for (const node of walkVisible(k)) {
        const f = figureMap.get(node.id);
        if (!f?.cur) continue;
        const w = f.el.offsetWidth, h = f.el.offsetHeight;
        minX = Math.min(minX, f.cur.x - w / 2 - 12);
        maxX = Math.max(maxX, f.cur.x + w / 2 + 12);
        minY = Math.min(minY, f.cur.y - h / 2 - 10);
        maxY = Math.max(maxY, f.cur.y + h / 2 + 10);
      }
    }
    if (!isFinite(minX)) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };

  for (const t of walkVisible()) {
    const defs = t.boundaries.length
      ? t.boundaries
      : (t.boundary ? [{ id: 'legacy', rangeStart: 0, rangeEnd: Math.max(0, t.children.length - 1) }] : []);
    for (const bd of defs) {
      const b = boundsForRange(t, bd.rangeStart, bd.rangeEnd) ?? (t.boundary ? subtreeBounds(t) : null);
      if (!b) continue;
      const hue = metaOf(t.id)?.hue ?? 'b5';
      const stroke = bd.style?.line ?? bd.style?.border ?? `var(--${hue})`;
      boundarySVG += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-opacity=".45" stroke-dasharray="6,3" vector-effect="non-scaling-stroke"/>\n`;
    }
  }

  for (const it of collectSummaryLayout()) {
    const { minY, maxY, bracketX, dir, hue } = it;
    const midY = (minY + maxY) / 2;
    const r = Math.min(18, (maxY - minY) / 4);
    const path = dir > 0
      ? `M ${bracketX} ${minY} Q ${bracketX + r} ${minY} ${bracketX + r} ${minY + r} L ${bracketX + r} ${midY - r} Q ${bracketX + r} ${midY} ${bracketX + r * 2} ${midY} Q ${bracketX + r} ${midY} ${bracketX + r} ${midY + r} L ${bracketX + r} ${maxY - r} Q ${bracketX + r} ${maxY} ${bracketX} ${maxY}`
      : `M ${bracketX} ${minY} Q ${bracketX - r} ${minY} ${bracketX - r} ${minY + r} L ${bracketX - r} ${midY - r} Q ${bracketX - r} ${midY} ${bracketX - r * 2} ${midY} Q ${bracketX - r} ${midY} ${bracketX - r} ${midY + r} L ${bracketX - r} ${maxY - r} Q ${bracketX - r} ${maxY} ${bracketX} ${maxY}`;
    summarySVG += `<path d="${path}" fill="none" stroke="var(--${hue})" stroke-width="2" stroke-opacity=".6" vector-effect="non-scaling-stroke" stroke-linecap="round"/>\n`;
    const sumX = bracketX + dir * 70;
    summarySVG += `<path d="M ${bracketX + dir * r * 2} ${midY} L ${sumX - dir * 40} ${midY}" fill="none" stroke="var(--${hue})" stroke-width="2" stroke-opacity=".6" vector-effect="non-scaling-stroke"/>\n`;
  }
  return { boundary: boundarySVG, summary: summarySVG };
}

/* ---------- 概要标签 DOM（一等可编辑节点）+ 范围拖拽 handle ---------- */
interface SummaryFigure { el: HTMLDivElement; ttl: HTMLSpanElement }
const summaryFigures = new Map<string, SummaryFigure>();
const summaryHandles = new Map<string, { start: HTMLDivElement; end: HTMLDivElement }>();
let summaryEditingId: string | null = null;

export function findSummary(sumId: string): { owner: Topic; sum: TopicSummary } | null {
  for (const t of walkVisible()) {
    const s = t.summaries.find(x => x.id === sumId);
    if (s) return { owner: t, sum: s };
  }
  return null;
}

function createSummaryFigure(sumId: string): SummaryFigure {
  const el = document.createElement('div');
  el.className = 'summary-topic';
  el.dataset.sum = sumId;
  const ttl = document.createElement('span');
  ttl.className = 't-title';
  el.appendChild(ttl);
  // 阻断画布平移/主题拖拽（概要标签是独立交互对象）
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('dblclick', (e) => { e.stopPropagation(); startSummaryEdit(sumId); });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    summaryMenu(sumId, e.clientX, e.clientY);
  });
  figuresEl.appendChild(el);

  const mkHandle = (end: 'start' | 'end') => {
    const h = document.createElement('div');
    h.className = 'summary-handle';
    h.dataset.sum = sumId; h.dataset.end = end;
    h.title = end === 'start' ? '拖动调整概要起点' : '拖动调整概要终点';
    bindHandleDrag(h, sumId, end);
    figuresEl.appendChild(h);
    return h;
  };
  summaryHandles.set(sumId, { start: mkHandle('start'), end: mkHandle('end') });
  const fig = { el, ttl };
  summaryFigures.set(sumId, fig);
  return fig;
}

/** 布局后同步概要标签与 handle 位置（relayout 调用） */
export function updateSummaryFigures(): void {
  if (summaryEditingId) return;                       // 编辑中不重建文案，位置仍由 CSS 定位跟随
  const items = collectSummaryLayout();
  const seen = new Set<string>();
  for (const it of items) {
    seen.add(it.sum.id);
    let fig = summaryFigures.get(it.sum.id);
    if (!fig) fig = createSummaryFigure(it.sum.id);
    fig.el.style.left = it.labelX + 'px';
    fig.el.style.top = it.labelY + 'px';
    fig.ttl.textContent = it.sum.title;
    const hs = summaryHandles.get(it.sum.id);
    if (hs) {
      hs.start.style.left = it.bracketX + 'px';
      hs.start.style.top = it.minY + 'px';
      hs.end.style.left = it.bracketX + 'px';
      hs.end.style.top = it.maxY + 'px';
    }
  }
  for (const [id, fig] of summaryFigures) {
    if (!seen.has(id)) {
      fig.el.remove();
      const hs = summaryHandles.get(id);
      if (hs) { hs.start.remove(); hs.end.remove(); }
      summaryFigures.delete(id);
      summaryHandles.delete(id);
    }
  }
}

/** 双击改名：原地 contenteditable（Xmind 概要即 topic，编辑方式与主题一致） */
export function startSummaryEdit(sumId: string): void {
  const found = findSummary(sumId);
  const fig = summaryFigures.get(sumId);
  if (!found || !fig) return;
  summaryEditingId = sumId;
  fig.el.classList.add('editing');
  fig.el.contentEditable = 'true';
  fig.ttl.textContent = found.sum.title;
  fig.el.focus();
  const range = document.createRange(); range.selectNodeContents(fig.ttl);
  const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);

  const commit = (ok: boolean) => {
    fig.el.removeEventListener('blur', onBlur);
    fig.el.removeEventListener('keydown', onKey);
    fig.el.contentEditable = 'false';
    fig.el.classList.remove('editing');
    summaryEditingId = null;
    const txt = fig.ttl.textContent?.trim() ?? '';
    if (ok && txt && txt !== found.sum.title) {
      found.sum.title = txt;
      pushHistory();
    }
    relayout();
  };
  const onBlur = () => commit(true);
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  };
  fig.el.addEventListener('blur', onBlur);
  fig.el.addEventListener('keydown', onKey);
}

/** 删除概要 */
export function removeSummary(sumId: string): void {
  const found = findSummary(sumId);
  if (!found) return;
  found.owner.summaries.splice(found.owner.summaries.indexOf(found.sum), 1);
  pushHistory(); relayout();
}

/** 概要右键菜单（menus.ts 的 showCtxMenu 复用） */
export function summaryMenu(sumId: string, x: number, y: number): void {
  showCtxMenu(x, y, [
    { label: '编辑概要标题', kbd: '双击', action: () => startSummaryEdit(sumId) },
    { label: '删除概要', action: () => removeSummary(sumId) }
  ]);
}

/* ---------- 括号端点拖拽：吸附最近同侧兄弟槽位（复刻 asMovable().move()） ---------- */
function bindHandleDrag(el: HTMLDivElement, sumId: string, end: 'start' | 'end'): void {
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();
    const found = findSummary(sumId);
    if (!found) return;
    el.setPointerCapture(e.pointerId);
    let moved = false;

    const sideOf = (t: Topic): number => {
      const fx = figureMap.get(t.id)?.cur?.x ?? 0;
      return fx < 0 ? -1 : 1;
    };
    const ref = found.owner.children[found.sum.rangeStart] ?? found.owner.children[0];
    if (!ref) return;
    const side = sideOf(ref);

    const onMove = (ev: PointerEvent) => {
      moved = true;
      // client → world：需扣除 viewport 自身偏移（工具栏高度）
      const vp = viewportEl.getBoundingClientRect();
      const wy = (ev.clientY - vp.top - pan.y) / zoom;
      let bestIdx = 0, bestDy = Infinity;
      found.owner.children.forEach((c, i) => {
        if (sideOf(c) !== side) return;
        const cy = figureMap.get(c.id)?.cur?.y;
        if (cy === undefined) return;
        const d = Math.abs(cy - wy);
        if (d < bestDy) { bestDy = d; bestIdx = i; }
      });
      if (end === 'start') found.sum.rangeStart = clamp(bestIdx, 0, found.sum.rangeEnd);
      else found.sum.rangeEnd = clamp(bestIdx, found.sum.rangeStart, found.owner.children.length - 1);
      relayout(false);                       // 实时预览（花括号 + 标签跟随）
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      if (moved) pushHistory();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  });
}

/* =====================================================================
 * 多画布标签栏
 * ===================================================================== */
export function renderSheetTabs(container: HTMLElement, onSwitch: () => void, onAdd: () => void, onRemove: (id: string) => void): void {
  container.innerHTML = '';
  for (const s of sheets) {
    const tab = document.createElement('div');
    tab.className = `sheet-tab${s.id === sheet.id ? ' active' : ''}`;
    tab.dataset.id = s.id;
    const label = document.createElement('span');
    label.textContent = s.root.title.slice(0, 14) || '画布';
    tab.appendChild(label);
    tab.title = s.root.title;
    if (sheets.length > 1) {
      const close = document.createElement('button');
      close.className = 'sheet-close';
      close.textContent = '×';
      close.title = '删除此画布';
      close.onclick = (e) => { e.stopPropagation(); onRemove(s.id); };
      tab.appendChild(close);
    }
    tab.onclick = () => { switchSheet(s.id); onSwitch(); };
    container.appendChild(tab);
  }
  const addBtn = document.createElement('button');
  addBtn.className = 'sheet-add';
  addBtn.textContent = '+';
  addBtn.title = '新建画布';
  addBtn.onclick = () => { addSheet(); onAdd(); };
  container.appendChild(addBtn);
}
