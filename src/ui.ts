import { subtreeCount, sheet } from './model';
import { engine } from './engines';
import { canUndo, canRedo } from './persistence';
import { updateMiniBar } from './minibar';
import { renderSidebar } from './sidebar';
import { zoom } from './view';

/* UI 汇聚点：状态栏 / 缩放百分比 / 工具条可用性 / 侧栏与迷你条刷新 */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

let sidebarTimer: ReturnType<typeof setTimeout> | undefined;
export function updateStatus(): void {
  const n = subtreeCount(sheet.root);
  const stat = document.getElementById('stat-left');
  if (stat) stat.textContent = `${engine().label} · ${n} 个主题`;
  const pct = document.getElementById('zoom-pct');
  if (pct) pct.textContent = (zoom * 100).toFixed(0) + '%';
  const undoBtn = document.getElementById('btn-undo') as HTMLButtonElement | null;
  if (undoBtn) undoBtn.disabled = !canUndo();
  const redoBtn = document.getElementById('btn-redo') as HTMLButtonElement | null;
  if (redoBtn) redoBtn.disabled = !canRedo();
  updateMiniBar();
  clearTimeout(sidebarTimer);
  sidebarTimer = setTimeout(renderSidebar, 120);
}
