import { walkVisible } from './model';
import { figureMap } from './figures';
import { updateStatus } from './ui';
import { updateNoteAnchor } from './notes';
import { stopEdit, editingId } from './interactions';
import { cancelDrag } from './dragdrop';
import { clamp } from './utils';
import { pinchTransform, type Pt2 } from './gestures';
import { worldEl, viewportEl } from './dom';

/* =====================================================================
 * 七、视图变换：平移 / 缩放 / 适应（Pointer Events 指针会话）
 *    单指/鼠标拖空白 = 平移；双指 = 捏合缩放 + 平移（拖主题途中来第二指 → 转捏合）
 * ===================================================================== */
export let zoom = 1;
export const pan = { x: 0, y: 0 };

export function applyWorld(): void {
  worldEl.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  updateNoteAnchor();
  updateStatus();
}

export function setZoom(z: number): void { zoom = clamp(z, 0.15, 3); }

export function centerOn(wx: number, wy: number): void {
  const r = viewportEl.getBoundingClientRect();
  pan.x = r.width / 2 - wx * zoom; pan.y = r.height / 2 - wy * zoom;
  applyWorld();
}

export function fitView(): void {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of walkVisible()) {
    const f = figureMap.get(t.id); if (!f?.cur) continue;
    minX = Math.min(minX, f.cur.x - 120); maxX = Math.max(maxX, f.cur.x + 120);
    minY = Math.min(minY, f.cur.y - 60);  maxY = Math.max(maxY, f.cur.y + 60);
  }
  if (!isFinite(minX)) return;
  const r = viewportEl.getBoundingClientRect();
  zoom = clamp(Math.min(r.width / (maxX - minX), r.height / (maxY - minY)), 0.2, 1.6);
  pan.x = r.width / 2 - (minX + maxX) / 2 * zoom;
  pan.y = r.height / 2 - (minY + maxY) / 2 * zoom;
  applyWorld();
}

viewportEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = viewportEl.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  const nz = clamp(zoom * factor, 0.15, 3);
  pan.x = mx - (mx - pan.x) * (nz / zoom);
  pan.y = my - (my - pan.y) * (nz / zoom);
  zoom = nz; applyWorld();
}, { passive: false });

/* ---------- 指针会话（capture 阶段跟踪画布内所有指针，含落在主题上的） ---------- */
interface PtrState { x: number; y: number; blank: boolean }
const pointers = new Map<number, PtrState>();
let panBase: { id: number; x: number; y: number; px: number; py: number } | null = null;
let pinchPrev: [Pt2, Pt2] | null = null;

const isBlankTarget = (t: HTMLElement): boolean =>
  t === viewportEl || t.id === 'edges' || !!t.closest('#edges');

window.addEventListener('pointerdown', (e: PointerEvent) => {
  const t = e.target as HTMLElement;
  if (!viewportEl.contains(t)) return;                 // 工具栏/侧栏触摸不进画布会话
  const blank = isBlankTarget(t);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, blank });
  if (pointers.size === 1) {
    if (blank) {
      if (editingId) stopEdit(true);                   // 点画布空白 = 提交编辑
      panBase = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      viewportEl.classList.add('panning');
    }
  } else if (pointers.size === 2) {
    cancelDrag();                                      // 主题拖拽途中来第二指 → 转捏合
    const two = [...pointers.values()].slice(0, 2).map(p => ({ x: p.x, y: p.y })) as [Pt2, Pt2];
    pinchPrev = two;
    panBase = null;
  } else {                                             // 三指以上：停用手势
    pinchPrev = null; panBase = null;
  }
}, { capture: true });

window.addEventListener('pointermove', (e: PointerEvent) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (pinchPrev && pointers.size >= 2) {
    const cur = [...pointers.values()].slice(0, 2).map(q => ({ x: q.x, y: q.y })) as [Pt2, Pt2];
    const r = pinchTransform(zoom, pan, pinchPrev, cur);
    setZoom(r.zoom);
    pan.x = r.pan.x; pan.y = r.pan.y;
    pinchPrev = cur;
    applyWorld();
  } else if (panBase && panBase.id === e.pointerId) {
    pan.x = panBase.px + (e.clientX - panBase.x);
    pan.y = panBase.py + (e.clientY - panBase.y);
    applyWorld();
  }
}, { capture: true });

/* ---------- 窗格/窗口尺寸变化（收起展开、分屏、旋转）：防抖后温和适配 ----------
 * 适应缩放与当前缩放差逾三成（收起时被压缩/展开后空间富余）→ 重新适应画布；
 * 轻微尺寸变化 → 保持用户缩放，仅温和居中。
 * 监听双通道：window resize + ResizeObserver（内嵌 webview 容器尺寸变化
 * 不一定派发 window resize，必须直接观察 #viewport 元素本身）。 */
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleViewAdapt(): void {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const r = viewportEl.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;        // 收起过程中的瞬时尺寸
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of walkVisible()) {
      const f = figureMap.get(t.id); if (!f?.cur) continue;
      minX = Math.min(minX, f.cur.x - 100); maxX = Math.max(maxX, f.cur.x + 100);
      minY = Math.min(minY, f.cur.y - 60);  maxY = Math.max(maxY, f.cur.y + 60);
    }
    if (!isFinite(minX)) return;
    const zFit = Math.min(r.width / (maxX - minX), r.height / (maxY - minY));
    if (Math.abs(zoom / zFit - 1) > 0.3) fitView();
    else centerOn((minX + maxX) / 2, (minY + maxY) / 2);
  }, 250);
}
window.addEventListener('resize', scheduleViewAdapt);
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(scheduleViewAdapt).observe(viewportEl);
}

function rebasePointers(): void {
  if (pointers.size === 2) {
    pinchPrev = [...pointers.values()].slice(0, 2).map(p => ({ x: p.x, y: p.y })) as [Pt2, Pt2];
    panBase = null;
  } else if (pointers.size === 1) {
    const [id, p] = [...pointers.entries()][0]!;
    pinchPrev = null;
    panBase = p.blank ? { id, x: p.x, y: p.y, px: pan.x, py: pan.y } : null;
  } else {
    pinchPrev = null; panBase = null;
    viewportEl.classList.remove('panning');
  }
}
window.addEventListener('pointerup', (e: PointerEvent) => {
  if (pointers.delete(e.pointerId)) rebasePointers();
}, { capture: true });
window.addEventListener('pointercancel', (e: PointerEvent) => {
  if (pointers.delete(e.pointerId)) rebasePointers();
}, { capture: true });
