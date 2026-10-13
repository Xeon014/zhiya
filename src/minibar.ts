import { selectedId, sheet, topicOf } from './model';
import { figureMap } from './figures';
import { addChild, addSibling, removeTopic, editingId } from './interactions';
import { openNoteFor, getNoteTargetId } from './notes';
import { addChildButtonAt, type Box } from './engines';
import { figuresEl } from './dom';
import { isMobileLayout } from './mobile';

/* ---------- 选中主题：节点旁 + 钮 / 状态栏 / 移动端底栏 ---------- */
let layoutBoxes = new Map<string, Box>();
export function syncLayoutBoxes(pos: Map<string, Box>): void {
  layoutBoxes = pos;
}

let addBtn: HTMLButtonElement | null = null;
function ensureAddBtn(): HTMLButtonElement {
  if (!addBtn) {
    addBtn = document.createElement('button');
    addBtn.id = 'topic-add-btn';
    addBtn.type = 'button';
    addBtn.className = 'topic-add-btn';
    addBtn.title = '添加子主题 (Tab)';
    addBtn.setAttribute('aria-label', '添加子主题');
    addBtn.textContent = '+';
    addBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selectedId) addChild(selectedId);
    });
    figuresEl.appendChild(addBtn);
  }
  return addBtn;
}

const statActions = () => document.getElementById('stat-actions');
const mobileBar = () => document.getElementById('mobile-selection-bar');

function noteEditingBlocksChrome(): boolean {
  const notePanel = document.getElementById('note-panel');
  const noteInput = document.getElementById('note-input') as HTMLTextAreaElement | null;
  return !!(notePanel?.classList.contains('open') && getNoteTargetId() === selectedId && document.activeElement === noteInput);
}

function setChromeVisible(on: boolean, isRoot: boolean): void {
  document.body.classList.toggle('has-selection', on);
  const acts = statActions();
  if (acts) {
    const showStat = on && !isMobileLayout();
    acts.hidden = !showStat;
    acts.setAttribute('aria-hidden', showStat ? 'false' : 'true');
  }
  const mob = mobileBar();
  if (mob) mob.classList.toggle('visible', on && isMobileLayout());
  const sib = document.getElementById('sa-sibling') as HTMLButtonElement | null;
  const del = document.getElementById('sa-del') as HTMLButtonElement | null;
  const msib = document.getElementById('ms-sibling') as HTMLButtonElement | null;
  const mdel = document.getElementById('ms-del') as HTMLButtonElement | null;
  if (sib) sib.disabled = isRoot;
  if (del) del.disabled = isRoot;
  if (msib) msib.disabled = isRoot;
  if (mdel) mdel.disabled = isRoot;
}

export function updateMiniBar(): void {
  const btn = ensureAddBtn();
  const t = topicOf(selectedId);
  if (!t || editingId === selectedId || noteEditingBlocksChrome()) {
    btn.style.display = 'none';
    setChromeVisible(false, false);
    return;
  }
  const f = figureMap.get(t.id);
  if (!f || f.el.style.display === 'none') {
    btn.style.display = 'none';
    setChromeVisible(false, false);
    return;
  }
  const box = layoutBoxes.get(t.id);
  if (!box) {
    btn.style.display = 'none';
    setChromeVisible(false, t.id === sheet.root.id);
    return;
  }
  const isRoot = t.id === sheet.root.id;
  setChromeVisible(true, isRoot);
  if (isMobileLayout()) {
    btn.style.display = 'none';
    return;
  }
  const anch = addChildButtonAt(box);
  btn.style.display = 'block';
  btn.style.left = anch.x + 'px';
  btn.style.top = anch.y + 'px';
}

function bindAction(id: string, fn: () => void): void {
  document.getElementById(id)?.addEventListener('click', fn);
}

bindAction('sa-sibling', () => { if (selectedId) addSibling(selectedId); });
bindAction('sa-note', () => { if (selectedId) openNoteFor(selectedId); });
bindAction('sa-del', () => { if (selectedId) removeTopic(selectedId); });
bindAction('ms-child', () => { if (selectedId) addChild(selectedId); });
bindAction('ms-sibling', () => { if (selectedId) addSibling(selectedId); });
bindAction('ms-note', () => { if (selectedId) openNoteFor(selectedId); });
bindAction('ms-del', () => { if (selectedId) removeTopic(selectedId); });
