import { sheet, walkVisible } from './model';
import { figureMap } from './figures';
import { figuresEl } from './dom';
import { relayout } from './layout';
import { pushHistory } from './persistence';
import { zoom, pan } from './view';
import { MARKER_GROUPS, MARKERS, markersHTML } from './markers';

/* =====================================================================
 * 图例（Xmind: sheet.legend）—— 真实键 {visibility, position} + 标记含义映射。
 * 可拖动浮层：列出导图中用到的标记 + 双击编辑含义；导出 PNG/SVG 时绘制。
 * ===================================================================== */

let boxEl: HTMLDivElement | null = null;
let editingKey: string | null = null;

/** 导图中实际使用的标记（按注册表分组顺序） */
export function usedMarkers(): string[] {
  const used = new Set<string>();
  for (const t of walkVisible()) for (const m of t.markers) used.add(m);
  const order: string[] = [];
  for (const g of MARKER_GROUPS) for (const m of g.markers) if (used.has(m.id)) order.push(m.id);
  for (const id of used) if (!order.includes(id)) order.push(id);
  return order;
}

export interface LegendRow { id: string; label: string; text: string }

/** 图例行（含义优先用户定义，回退标记名） */
export function legendRows(): LegendRow[] {
  const lg = sheet.legend;
  if (!lg) return [];
  return usedMarkers().map(id => ({
    id,
    label: MARKERS[id]?.label ?? id,
    text: lg.meanings[id] ?? MARKERS[id]?.label ?? id
  }));
}

function clientToWorld(cx: number, cy: number): { x: number; y: number } {
  const vp = document.getElementById('viewport')!.getBoundingClientRect();
  return { x: (cx - vp.left - pan.x) / zoom, y: (cy - vp.top - pan.y) / zoom };
}

/** 切换图例（首次创建在内容左下角） */
export function toggleLegend(): void {
  if (!sheet.legend) {
    let minX = Infinity, maxY = -Infinity;
    for (const t of walkVisible()) {
      const f = figureMap.get(t.id);
      if (!f?.cur) continue;
      minX = Math.min(minX, f.cur.x - 140);
      maxY = Math.max(maxY, f.cur.y + 120);
    }
    if (!isFinite(minX)) { minX = -300; maxY = 200; }
    sheet.legend = { visibility: 'visible', position: { x: minX, y: maxY + 30 }, meanings: {} };
  } else {
    sheet.legend.visibility = sheet.legend.visibility === 'visible' ? 'hidden' : 'visible';
  }
  pushHistory();
  renderLegend();
}

function ensureBox(): HTMLDivElement {
  if (boxEl) return boxEl;
  const el = document.createElement('div');
  el.id = 'legend';
  const head = document.createElement('div');
  head.className = 'lg-head';
  head.textContent = '图例';
  el.appendChild(head);
  const body = document.createElement('div');
  body.className = 'lg-body';
  el.appendChild(body);
  figuresEl.appendChild(el);
  boxEl = el;
  bindDrag(el, head);
  return el;
}

let legendSig = '';

/** 布局后同步（位置/内容刷新） */
export function renderLegend(): void {
  const lg = sheet.legend;
  if (!lg || lg.visibility !== 'visible') {
    boxEl?.remove(); boxEl = null;
    legendSig = '';
    return;
  }
  const el = ensureBox();
  el.style.left = lg.position.x + 'px';
  el.style.top = lg.position.y + 'px';
  const rows = legendRows();
  const body = el.querySelector('.lg-body') as HTMLDivElement;
  if (editingKey) return;                              // 编辑中不重建
  const sig = rows.map(r => r.id + '\0' + r.text).join('\n');
  if (sig === legendSig && body.childElementCount > 0) return;
  legendSig = sig;
  body.innerHTML = rows.length ? '' : '<div class="lg-empty">（未使用标记）</div>';
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'lg-row';
    row.innerHTML = `<span class="lg-mk">${markersHTML([r.id])}</span><span class="lg-txt" data-mk="${r.id}">${r.text.replace(/</g, '&lt;')}</span>`;
    const txt = row.querySelector('.lg-txt') as HTMLElement;
    txt.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startEdit(r.id, txt);
    });
    body.appendChild(row);
  }
}

function startEdit(markerId: string, txt: HTMLElement): void {
  editingKey = markerId;
  txt.contentEditable = 'true';
  txt.classList.add('editing');
  txt.focus();
  const range = document.createRange(); range.selectNodeContents(txt);
  const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
  const commit = (ok: boolean) => {
    txt.removeEventListener('blur', onBlur);
    txt.removeEventListener('keydown', onKey);
    txt.contentEditable = 'false';
    txt.classList.remove('editing');
    editingKey = null;
    const v = txt.textContent?.trim() ?? '';
    if (ok && v && sheet.legend) {
      sheet.legend.meanings[markerId] = v;
      pushHistory();
    }
    renderLegend();
  };
  const onBlur = () => commit(true);
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  };
  txt.addEventListener('blur', onBlur);
  txt.addEventListener('keydown', onKey);
}

function bindDrag(el: HTMLDivElement, handle: HTMLElement): void {
  handle.style.cursor = 'move';
  handle.addEventListener('pointerdown', (e) => {
    if (!sheet.legend) return;
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    const start = { mx: e.clientX, my: e.clientY, lx: sheet.legend.position.x, ly: sheet.legend.position.y };
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      moved = true;
      const w = clientToWorld(ev.clientX, ev.clientY);
      const w0 = clientToWorld(start.mx, start.my);
      sheet.legend!.position = { x: start.lx + (w.x - w0.x), y: start.ly + (w.y - w0.y) };
      el.style.left = sheet.legend!.position.x + 'px';
      el.style.top = sheet.legend!.position.y + 'px';
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      if (moved) pushHistory();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
}

void relayout;
