import { parentOf, removeChildFromParent, sheet, topicOf, walkVisible, type Topic } from './model';
import { cachedTopicSize, figureMap } from './figures';
import { stopEdit, select } from './interactions';
import { pushHistory } from './persistence';
import { relayout } from './layout';
import { zoom, pan } from './view';
import { dropLine, viewportEl } from './dom';
import { editingId } from './interactions';

/** client → world（含 viewport 顶部偏移） */
const clientToWorld = (cx: number, cy: number): { x: number; y: number } => {
  const vp = viewportEl.getBoundingClientRect();
  return { x: (cx - vp.left - pan.x) / zoom, y: (cy - vp.top - pan.y) / zoom };
};

/* =====================================================================
 * 6.5 拖拽调序 / 换父（三态放置：上缘=前插，下缘=后插，中带=成为子题）
 * ===================================================================== */
interface DropTarget { id: string; mode: 'before' | 'after' | 'child' }
interface TopicDragState { id: string; started: boolean; sx: number; sy: number; target: DropTarget | null }

let topicDrag: TopicDragState | null = null;

export function startTopicDragWatch(e: PointerEvent | MouseEvent, id: string): void {
  if (editingId) return;
  topicDrag = { id, started: false, sx: e.clientX, sy: e.clientY, target: null };
}

/** 外部取消拖拽（双指捏合接管手势时调用） */
export function cancelDrag(): void {
  if (!topicDrag) return;
  const f = figureMap.get(topicDrag.id);
  if (topicDrag.started && f) { f.el.classList.remove('dragging'); f.el.style.pointerEvents = ''; }
  topicDrag = null;
  hideDropHint();
}

function isDescendantOf(ancId: string, maybeChildId: string): boolean {
  let t = topicOf(maybeChildId);
  while (t) { if (t.id === ancId) return true; t = parentOf(t.id); }
  return false;
}

function dropTargetAt(x: number, y: number): DropTarget | null {
  const els = [...document.querySelectorAll<HTMLElement>('.topic')].filter(
    t => t.style.display !== 'none' && !t.classList.contains('ghost') && !t.classList.contains('dragging')
  );
  for (let i = els.length - 1; i >= 0; i--) {
    const r = els[i]!.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      const id = els[i]!.dataset.id!;
      if (!topicDrag || id === topicDrag.id || isDescendantOf(topicDrag.id, id)) return null;
      if (topicOf(id)?.pos) return { id, mode: 'child' };   // 自由主题只接受"成为子题"
      const rel = (y - r.top) / r.height;
      if (rel < 0.3) return { id, mode: 'before' };
      if (rel > 0.7) return { id, mode: 'after' };
      return { id, mode: 'child' };
    }
  }
  return null;
}

function showDropHint(hit: DropTarget | null): void {
  hideDropHint();
  if (!hit) return;
  const el = figureMap.get(hit.id)?.el;
  if (!el) return;
  if (hit.mode === 'child') { el.classList.add('drop-into'); return; }
  const r = el.getBoundingClientRect();
  dropLine.style.display = 'block';
  dropLine.style.left = r.left + 'px';
  dropLine.style.width = r.width + 'px';
  dropLine.style.top = (hit.mode === 'before' ? r.top - 4 : r.bottom + 1) + 'px';
}

function hideDropHint(): void {
  dropLine.style.display = 'none';
  document.querySelectorAll('.topic.drop-into').forEach(t => t.classList.remove('drop-into'));
}

/** 与画布拖拽相同的换父 / 调序。大纲拖拽也走这里，保证一次撤销。 */
export function repositionTopic(dragId: string, hit: DropTarget): void {
  const dragged = topicOf(dragId), target = topicOf(hit.id), oldParent = parentOf(dragId);
  if (!dragged || !target || !oldParent || dragged === target || dragged === sheet.root) return;
  if (isDescendantOf(dragId, hit.id)) return;
  if (dropIsNoop(dragged, oldParent, target, hit.mode)) return;
  stopEdit(false);
  const wasDetached = !!dragged.pos;
  removeChildFromParent(oldParent, dragged);
  dragged.pos = null;                                 // 落到主题上 = 回到自动布局
  if (wasDetached) { pushHistory(); relayout(); return; }   // 自由主题仅"落地"，不改层级
  if (hit.mode === 'child') {
    target.collapsed = false;
    target.children.push(dragged);
  } else {
    const tp = parentOf(hit.id);
    if (!tp) { oldParent.children.push(dragged); }        // 根无同级，回原位
    else tp.children.splice(tp.children.indexOf(target) + (hit.mode === 'after' ? 1 : 0), 0, dragged);
  }
  select(dragId); pushHistory(); relayout();
}

function dropIsNoop(dragged: Topic, oldParent: Topic, target: Topic, mode: DropTarget['mode']): boolean {
  if (dragged.pos) return false;
  if (mode === 'child') {
    return parentOf(dragged.id) === target && target.children[target.children.length - 1] === dragged;
  }
  const tp = parentOf(target.id);
  if (!tp || tp !== oldParent) return false;
  const i = tp.children.indexOf(dragged);
  const j = tp.children.indexOf(target);
  if (i < 0 || j < 0) return false;
  return mode === 'before' ? i === j - 1 : i === j + 1;
}

function applyDrop(dragId: string, hit: DropTarget): void {
  repositionTopic(dragId, hit);
}

window.addEventListener('pointermove', (e) => {
  if (!topicDrag) return;
  if (!topicDrag.started) {
    if (Math.hypot(e.clientX - topicDrag.sx, e.clientY - topicDrag.sy) < 6) return;
    if (topicOf(topicDrag.id) === sheet.root) { topicDrag = null; return; }
    topicDrag.started = true;
    const f = figureMap.get(topicDrag.id);
    if (!f) { topicDrag = null; return; }
    f.el.classList.add('dragging');
    f.el.style.pointerEvents = 'none';
  }
  const dragged = topicOf(topicDrag.id);
  if (dragged?.pos) {                                  // 自由主题：跟随指针 + 对齐吸附参考线
    const w = clientToWorld(e.clientX, e.clientY);
    const snapped = snapToGuides(dragged, w);
    dragged.pos = snapped.pos;
    topicDrag.target = null;
    relayout(false);
    appendGuides(snapped.guides);
    return;
  }
  topicDrag.target = dropTargetAt(e.clientX, e.clientY);
  showDropHint(topicDrag.target);
});

window.addEventListener('pointerup', (e) => {
  if (!topicDrag) return;
  const d = topicDrag; topicDrag = null;
  hideDropHint();
  const f = figureMap.get(d.id);
  if (d.started && f) { f.el.classList.remove('dragging'); f.el.style.pointerEvents = ''; }
  if (d.started && d.target) { applyDrop(d.id, d.target); return; }
  if (d.started && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 40) {
    const dragged = topicOf(d.id);
    const oldParent = parentOf(d.id);
    if (dragged && oldParent && !dragged.pos && dragged !== sheet.root) {
      // 拖到空白：脱离自动布局，成为自由主题（挂根的 detached 通道，Xmind floating topic）
      removeChildFromParent(oldParent, dragged);
      dragged.pos = clientToWorld(e.clientX, e.clientY);
      sheet.root.detachedKids.push(dragged);
      select(dragged.id); pushHistory(); relayout();
    }
  }
});
window.addEventListener('pointercancel', cancelDrag);

/* ---------- 对齐参考线：自由主题拖拽时与其他主题的边/中对齐（阈值 6px 世界坐标） ---------- */
const GUIDE_THRESHOLD = 6;
interface SnapResult { pos: { x: number; y: number }; guides: string[] }

function topicBox(id: string, el: HTMLElement | undefined): { w: number; h: number } {
  return cachedTopicSize(id) ?? { w: el?.offsetWidth ?? 0, h: el?.offsetHeight ?? 0 };
}

function snapToGuides(dragged: { id: string }, raw: { x: number; y: number }): SnapResult {
  const f = figureMap.get(dragged.id);
  const { w, h } = topicBox(dragged.id, f?.el);
  let x = raw.x, y = raw.y;
  const guides: string[] = [];
  const addV = (gx: number) => guides.push(`<path d="M ${gx} -3000 L ${gx} 3000" fill="none" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4,4" stroke-opacity=".65" vector-effect="non-scaling-stroke"/>`);
  const addH = (gy: number) => guides.push(`<path d="M -3000 ${gy} L 3000 ${gy}" fill="none" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4,4" stroke-opacity=".65" vector-effect="non-scaling-stroke"/>`);
  for (const t of walkVisible()) {
    if (t.id === dragged.id) continue;
    const tf = figureMap.get(t.id);
    if (!tf?.cur || tf.el.style.display === 'none') continue;
    const { w: tw, h: th } = topicBox(t.id, tf.el);
    const ocx = tf.cur.x, ocy = tf.cur.y;
    // 中心对中心
    if (Math.abs(x - ocx) < GUIDE_THRESHOLD) { x = ocx; addV(ocx); }
    if (Math.abs(y - ocy) < GUIDE_THRESHOLD) { y = ocy; addH(ocy); }
    // 边对边（左右缘 / 上下缘）
    if (Math.abs(x - w / 2 - (ocx - tw / 2)) < GUIDE_THRESHOLD) { x = ocx - tw / 2 + w / 2; addV(ocx - tw / 2); }
    if (Math.abs(x + w / 2 - (ocx + tw / 2)) < GUIDE_THRESHOLD) { x = ocx + tw / 2 - w / 2; addV(ocx + tw / 2); }
    if (Math.abs(y - h / 2 - (ocy - th / 2)) < GUIDE_THRESHOLD) { y = ocy - th / 2 + h / 2; addH(ocy - th / 2); }
    if (Math.abs(y + h / 2 - (ocy + th / 2)) < GUIDE_THRESHOLD) { y = ocy + th / 2 - h / 2; addH(ocy + th / 2); }
  }
  return { pos: { x, y }, guides };
}

function appendGuides(guides: string[]): void {
  if (!guides.length) return;
  const svg = document.getElementById('edges');
  if (svg) svg.insertAdjacentHTML('beforeend', guides.join(''));
}
