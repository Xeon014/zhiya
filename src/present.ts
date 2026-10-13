import { sheet, walkVisible, subtreeCount } from './model';
import { figureMap } from './figures';
import { centerOn, setZoom, applyWorld, zoom } from './view';

/* =====================================================================
 * ZEN 演示模式（F5）—— 逆向参照 2118.js 幻灯片布局模块的逐页聚焦思想：
 * 步进序列 = 一级分支（含其子树）；每步聚焦当前分支（居中放大到包围盒），
 * 其余分支淡化；→/空格 下一步，← 上一步，Esc/F5 退出。
 * ===================================================================== */

let active = false;
let step = 0;
let steps: string[][] = [];       // 每步 = 该分支子树的全部 topic id

export const isPresenting = (): boolean => active;

function branchBounds(ids: string[]): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const f = figureMap.get(id);
    if (!f?.cur) continue;
    minX = Math.min(minX, f.cur.x - 80); maxX = Math.max(maxX, f.cur.x + 80);
    minY = Math.min(minY, f.cur.y - 60); maxY = Math.max(maxY, f.cur.y + 60);
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function startPresent(): void {
  if (active) return;
  const branches = sheet.root.children;
  if (!branches.length) return;
  steps = branches.map(b => [...collectIds(b)]);
  active = true; step = 0;
  document.body.classList.add('zen');
  updateIndicator();
  applyStep();
}

function collectIds(t: { id: string; children: unknown[] }): Generator<string, void, unknown> {
  return (function* rec(x: { id: string; children: unknown[] }): Generator<string> {
    yield x.id;
    for (const c of x.children as { id: string; children: unknown[] }[]) yield* rec(c);
  })(t);
}

export function endPresent(): void {
  if (!active) return;
  active = false;
  document.body.classList.remove('zen');
  document.querySelectorAll('.topic.spot, .topic.dimmed').forEach(el => el.classList.remove('spot', 'dimmed'));
  document.getElementById('zen-ind')?.remove();
  setZoom(1); applyWorld();
}

function applyStep(): void {
  if (!active) return;
  const cur = new Set(steps[step] ?? []);
  for (const t of walkVisible()) {
    const f = figureMap.get(t.id);
    if (!f) continue;
    const on = cur.has(t.id) || t.id === sheet.root.id;
    f.el.classList.toggle('spot', on);
    f.el.classList.toggle('dimmed', !on);
  }
  const b = branchBounds(steps[step] ?? []);
  if (b) {
    const vp = (document.getElementById('viewport') as HTMLElement).getBoundingClientRect();
    setZoom(Math.min(1.35, Math.max(0.5, Math.min(vp.width / b.w, vp.height / b.h))));
    applyWorld();
    centerOn(b.x + b.w / 2, b.y + b.h / 2);
  }
  updateIndicator();
}

function updateIndicator(): void {
  let el = document.getElementById('zen-ind');
  if (!el) {
    el = document.createElement('div');
    el.id = 'zen-ind';
    document.body.appendChild(el);
  }
  el.textContent = `${step + 1} / ${steps.length}`;
}

export function presentKey(e: KeyboardEvent): boolean {
  if (!active) return false;
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
    e.preventDefault();
    if (step < steps.length - 1) { step++; applyStep(); }
    return true;
  }
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault();
    if (step > 0) { step--; applyStep(); }
    return true;
  }
  if (e.key === 'Escape' || e.key === 'F5') {
    e.preventDefault();
    endPresent();
    return true;
  }
  return false;
}

export const branchCount = (): number => sheet.root.children.length;
export const subtreeOf = subtreeCount;
export const currentZoom = zoom;
