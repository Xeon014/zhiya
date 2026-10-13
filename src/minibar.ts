import { selectedId, sheet, topicOf } from './model';
import { figureMap } from './figures';
import { addChild, addSibling, removeTopic, editingId } from './interactions';
import { openNoteFor, getNoteTargetId } from './notes';
import { clamp } from './utils';
import { miniBar, notePanel, noteInput } from './dom';

/* ---------- 主题迷你工具条：操作跟着对象走 ---------- */
export function updateMiniBar(): void {
  const t = topicOf(selectedId);
  if (!t || editingId === selectedId ||
      (notePanel.classList.contains('open') && getNoteTargetId() === selectedId && document.activeElement === noteInput)) {
    miniBar.style.display = 'none';
    return;
  }
  const f = figureMap.get(t.id);
  if (!f || f.el.style.display === 'none') { miniBar.style.display = 'none'; return; }
  const isRoot = t.id === sheet.root.id;
  const sib = document.getElementById('mb-sibling') as HTMLButtonElement | null;
  const del = document.getElementById('mb-del') as HTMLButtonElement | null;
  if (sib) sib.disabled = isRoot;
  if (del) del.disabled = isRoot;
  miniBar.style.display = 'flex';
  const r = f.el.getBoundingClientRect();
  const bw = miniBar.offsetWidth, bh = miniBar.offsetHeight;
  miniBar.style.left = clamp(r.left + r.width / 2 - bw / 2, 8, innerWidth - bw - 8) + 'px';
  miniBar.style.top = clamp(r.bottom + 10, 8, innerHeight - bh - 36) + 'px';
}

document.getElementById('mb-child')?.addEventListener('click', () => { if (selectedId) addChild(selectedId); });
document.getElementById('mb-sibling')?.addEventListener('click', () => { if (selectedId) addSibling(selectedId); });
document.getElementById('mb-note')?.addEventListener('click', () => { if (selectedId) openNoteFor(selectedId); });
document.getElementById('mb-del')?.addEventListener('click', () => { if (selectedId) removeTopic(selectedId); });
