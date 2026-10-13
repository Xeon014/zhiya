import { topicOf } from './model';
import { figureMap } from './figures';
import { relayout } from './layout';
import { pushHistory, autosave } from './persistence';
import { editingId, stopEdit } from './interactions';
import { clamp } from './utils';
import { notePanel, noteInput, noteTopic } from './dom';
import { isMobileLayout } from './mobile';

/* =====================================================================
 * 6.6 备注弹层（锚定在目标主题旁，随画布平移/缩放/布局动画跟随；
 *     面板绑定打开时的主题，不被其他主题的选中抢走）
 * ===================================================================== */
let noteTargetId: string | null = null;
let boundId: string | null = null;
let noteDirty = false;
let noteBaseline = '';
let noteRelayoutTimer: ReturnType<typeof setTimeout> | undefined;
export const getNoteTargetId = (): string | null => noteTargetId;

function paintTopicNote(t: { id: string; note: string }): void {
  const f = figureMap.get(t.id);
  if (!f) return;
  f.el.classList.toggle('has-note', !!t.note);
  const shown = t.note.trim();
  f.noteEl.textContent = shown;
  f.noteEl.dataset.txt = shown;
}

/** 浮动框和侧栏改的是同一份 topic.note，只把另一边的输入框对齐。 */
function mirrorNote(id: string, value: string, source: 'panel' | 'sidebar'): void {
  if (source !== 'panel' && noteTargetId === id && document.activeElement !== noteInput) noteInput.value = value;
  if (source !== 'sidebar') {
    const sb = document.getElementById('sb-note') as HTMLTextAreaElement | null;
    if (sb && sb.dataset.id === id && document.activeElement !== sb) sb.value = value;
  }
}

/** 侧栏或浮动框输入。首次改动先把改前状态入栈，松手时再入改后状态。 */
export function inputNote(id: string, value: string, source: 'panel' | 'sidebar'): void {
  const t = topicOf(id);
  if (!t) return;
  if (boundId !== id) {
    flushNote();
    boundId = id;
    noteBaseline = t.note;
    noteDirty = false;
  }
  if (!noteDirty) {
    const cur = t.note;
    t.note = noteBaseline;
    pushHistory();
    t.note = cur;
    noteDirty = true;
  }
  t.note = value;
  paintTopicNote(t);
  mirrorNote(id, value, source);
  clearTimeout(noteRelayoutTimer);
  noteRelayoutTimer = setTimeout(() => relayout(), 450);
  autosave();
}

/** 结束这一轮备注编辑，把改后状态入栈。 */
export function flushNote(): void {
  if (!noteDirty || !boundId) { noteDirty = false; return; }
  const t = topicOf(boundId);
  noteDirty = false;
  if (t && t.note !== noteBaseline) {
    noteBaseline = t.note;
    paintTopicNote(t);
    pushHistory();
    relayout();
  } else if (t) noteBaseline = t.note;
}

export function updateNoteAnchor(): void {
  if (!notePanel.classList.contains('open') || !noteTargetId) return;
  const f = figureMap.get(noteTargetId);
  const t = topicOf(noteTargetId);
  if (!f || !t || f.el.style.display === 'none') { closeNote(false); return; }

  const vv = window.visualViewport;
  const vh = vv?.height ?? innerHeight;
  const vTop = vv?.offsetTop ?? 0;
  const pw = notePanel.offsetWidth, ph = notePanel.offsetHeight;

  if (isMobileLayout()) {
    notePanel.classList.add('mobile-dock');
    notePanel.style.left = '8px';
    notePanel.style.right = '8px';
    notePanel.style.width = 'auto';
    notePanel.style.top = 'auto';
    const bottom = Math.max(8, innerHeight - vTop - vh + 8);
    notePanel.style.bottom = `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`;
    return;
  }
  notePanel.classList.remove('mobile-dock');
  notePanel.style.right = '';
  notePanel.style.bottom = '';
  notePanel.style.width = '';
  const r = f.el.getBoundingClientRect();
  let x = r.right + 14;
  if (x + pw > innerWidth - 8) x = r.left - pw - 14;
  if (x < 8) x = clamp(r.left, 8, innerWidth - pw - 8);
  const y = clamp(r.top - 6, vTop + 8, vTop + vh - ph - 8);
  notePanel.style.left = x + 'px';
  notePanel.style.top = y + 'px';
}

document.addEventListener('zhiya:viewport-resize', () => updateNoteAnchor());

export function openNoteFor(id: string): void {
  const t = topicOf(id);
  if (!t) return;
  if (editingId && editingId !== id) stopEdit(true);
  if (boundId && boundId !== id) flushNote();
  if (boundId !== id) {
    boundId = id;
    noteBaseline = t.note;
    noteDirty = false;
  }
  if (noteTargetId && figureMap.has(noteTargetId)) figureMap.get(noteTargetId)!.el.classList.remove('note-target');
  noteTargetId = id;
  noteTopic.textContent = t.title || '（无标题）';
  noteInput.value = t.note;
  notePanel.classList.add('open');
  figureMap.get(id)?.el.classList.add('note-target');
  updateNoteAnchor();
  noteInput.focus();
}

export function closeNote(commit = true): void {
  if (commit) flushNote();
  notePanel.classList.remove('open');
  if (noteTargetId && figureMap.has(noteTargetId)) figureMap.get(noteTargetId)!.el.classList.remove('note-target');
  noteTargetId = null;
}

noteInput.addEventListener('input', () => {
  if (!noteTargetId) return;
  inputNote(noteTargetId, noteInput.value, 'panel');
});
noteInput.addEventListener('blur', () => flushNote());
document.getElementById('note-close')?.addEventListener('click', () => closeNote(true));
