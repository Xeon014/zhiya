import { clamp } from './utils';

/* =====================================================================
 * 触屏手势（Pointer Events + 会话状态机）
 * 逆向来源：Xmind v25.04 编辑器核心 24654.js
 *   L4261 pointer 事件数组 ["pointerdown","pointermove","pointerup","pointerleave"]
 *   L5782 gestureSession 状态机 · L5152 GestureEvent/touchstart 桥接
 * 复刻其分层：纯函数手势数学（可单测）+ 全局会话监听（长按/双击）。
 * 双指捏合与单指平移在 view.ts 的指针会话中实现。
 * ===================================================================== */

export interface Pt2 { x: number; y: number }

/** 双指捏合变换：保持 prev 中点的世界坐标在 next 中点处不动（锚点缩放）
 *  zoom 新值 = zoom × dist(next)/dist(prev)，pan 使世界锚点跟随中点移动 */
export function pinchTransform(
  zoom: number, pan: { x: number; y: number },
  prev: [Pt2, Pt2], next: [Pt2, Pt2]
): { zoom: number; pan: { x: number; y: number } } {
  const d0 = Math.hypot(prev[0].x - prev[1].x, prev[0].y - prev[1].y) || 1;
  const d1 = Math.hypot(next[0].x - next[1].x, next[0].y - next[1].y) || 1;
  const nz = clamp(zoom * (d1 / d0), 0.15, 3);
  const mid0 = { x: (prev[0].x + prev[1].x) / 2, y: (prev[0].y + prev[1].y) / 2 };
  const wx = (mid0.x - pan.x) / zoom, wy = (mid0.y - pan.y) / zoom;   // 世界锚点
  const mid1 = { x: (next[0].x + next[1].x) / 2, y: (next[0].y + next[1].y) / 2 };
  return { zoom: nz, pan: { x: mid1.x - wx * nz, y: mid1.y - wy * nz } };
}

/** 长按判定：≥500ms 且位移 <8px */
export function isLongPress(down: Pt2, cur: Pt2, dt: number): boolean {
  return dt >= 500 && Math.hypot(cur.x - down.x, cur.y - down.y) < 8;
}

/** 双击（touch tap）判定：间隔 ≤320ms 且两次落点 <24px */
export function isDoubleTap(a: Pt2, b: Pt2, dt: number): boolean {
  return dt <= 320 && Math.hypot(a.x - b.x, a.y - b.y) < 24;
}

const LONG_PRESS_MS = 500;

/** 长按打开菜单后，抑制 Chromium 触摸合成的 contextmenu（否则会顶掉手势菜单） */
let suppressCtxUntil = 0;

/**
 * 触摸会话：长按 → 上下文菜单（主题菜单/画布菜单/折叠指示器）；
 * 双击 tap → 进入编辑（与桌面 dblclick 等价，移动浏览器不合成 dblclick 时兜底）。
 * 仅处理 pointerType === 'touch'，桌面鼠标路径不受影响。
 */
export function initTouchGestures(hooks: {
  topicMenu: (id: string, x: number, y: number) => void;
  canvasMenu: (x: number, y: number) => void;
  toggleCollapse: (id: string) => void;
  startEdit: (id: string) => void;
}): void {
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let press: { x: number; y: number; id: number; target: HTMLElement } | null = null;
  let lastTap: { x: number; y: number; t: number; topicId: string | null } | null = null;

  window.addEventListener('contextmenu', (e) => {
    if (performance.now() < suppressCtxUntil) { e.preventDefault(); e.stopPropagation(); }
  }, { capture: true });

  const targetTopicId = (el: HTMLElement | null): string | null => {
    const t = el?.closest?.('.topic') as HTMLElement | null;
    return t?.dataset.id ?? null;
  };

  window.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    const target = e.target as HTMLElement;
    // 概要标签/handle 有自己的交互，不进长按/双击
    if (target.closest('.summary-topic, .summary-handle')) return;
    if (press) { clearTimeout(pressTimer); press = null; return; }   // 第二指落下：取消长按
    press = { x: e.clientX, y: e.clientY, id: e.pointerId, target };
    pressTimer = setTimeout(() => {
      if (!press) return;
      const { x, y, target } = press;
      press = null;
      const chev = target.closest('.chevron') as HTMLElement | null;
      if (chev?.dataset.id) { hooks.toggleCollapse(chev.dataset.id); return; }
      const topicId = targetTopicId(target);
      if (topicId) hooks.topicMenu(topicId, x, y);
      else hooks.canvasMenu(x, y);
      suppressCtxUntil = performance.now() + 800;
    }, LONG_PRESS_MS);
  }, { capture: true });

  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= 8) {
      clearTimeout(pressTimer); press = null;                        // 移动超过阈值：不是长按
    }
  }, { capture: true });

  window.addEventListener('pointerup', (e: PointerEvent) => {
    if (press && e.pointerId === press.id) {
      clearTimeout(pressTimer);
      const x = press.x, y = press.y;
      const topicId = targetTopicId(press.target);
      press = null;
      const now = performance.now();
      if (lastTap && isDoubleTap({ x: lastTap.x, y: lastTap.y }, { x, y }, now - lastTap.t) && lastTap.topicId && topicId === lastTap.topicId) {
        hooks.startEdit(topicId!);
        lastTap = null;
        return;
      }
      lastTap = { x, y, t: now, topicId };
    }
  }, { capture: true });

  window.addEventListener('pointercancel', () => {
    if (press) { clearTimeout(pressTimer); press = null; }
  }, { capture: true });
}
