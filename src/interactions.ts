import {
  Topic, metaOf, parentOf, selectedId, setSelected, sheet, topicOf, walkVisible,
  removeChildFromParent, siblingChannel, subtreeIds, type Side, type TopicMeta
} from './model';
import { figureMap, figureOf } from './figures';
import { relayout } from './layout';
import { pushHistory } from './persistence';
import { toast, updateStatus } from './ui';
import { zoom, pan, centerOn } from './view';
import { pruneRelationshipsFor } from './relationships';
import { viewportEl } from './dom';

/* =====================================================================
 * 六、交互：选中 / 编辑 / 增删 / 折叠 / 导航
 * ===================================================================== */
export function select(id: string): void {
  clearMultiSelect();
  setSelected(id);
  renderSelection();
}
export function renderSelection(): void {
  document.querySelectorAll('.topic.selected').forEach(el => el.classList.remove('selected'));
  if (selectedId && figureMap.has(selectedId)) figureMap.get(selectedId)!.el.classList.add('selected');
  for (const id of multiSelected) figureMap.get(id)?.el.classList.add('selected');
  updateStatus();
}

/* ---------- 多选批量（Ctrl+点击 加选/减选） ---------- */
export let multiSelected: Set<string> = new Set();
export function toggleMultiSelect(id: string): void {
  if (multiSelected.has(id)) multiSelected.delete(id);
  else if (id !== sheet.root.id) multiSelected.add(id);
  renderSelection();
}
export function clearMultiSelect(): void {
  if (!multiSelected.size) return;
  multiSelected = new Set();
  renderSelection();
}
export const multiTargets = (): string[] => [...new Set([selectedId ?? '', ...multiSelected])].filter(id => id && topicOf(id) && id !== sheet.root.id);
/** 批量删除（一次历史入栈） */
export function removeTopics(ids: string[]): void {
  const valid = ids.filter(id => topicOf(id) && id !== sheet.root.id);
  if (!valid.length) return;
  stopEdit(false);
  const allIds = new Set<string>();
  for (const id of valid) {
    const t = topicOf(id); const p = parentOf(id);
    if (!t || !p) continue;
    for (const x of subtreeIds(t)) allIds.add(x);
    removeChildFromParent(p, t);
  }
  pruneRelationshipsFor(allIds);
  multiSelected = new Set();
  select(sheet.root.id);
  pushHistory(); relayout();
}

export let editingId: string | null = null;
export function setEditingId(id: string | null): void { editingId = id; }

export function startEdit(id: string): void {
  stopEdit();
  const t = topicOf(id); if (!t) return;
  setEditingId(id);
  const f = figureOf(t);
  f.el.classList.add('editing'); f.el.contentEditable = 'true'; f.ttl.textContent = t.title;
  f.el.focus();
  const range = document.createRange(); range.selectNodeContents(f.ttl);
  const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
}
export function stopEdit(commit = true): void {
  if (!editingId) return;
  const t = topicOf(editingId); const f = figureMap.get(editingId);
  setEditingId(null);
  if (!t || !f) return;
  const txt = f.ttl.textContent.trim();
  f.el.contentEditable = 'false'; f.el.classList.remove('editing'); delete f.el.dataset.title;
  if (commit && txt && txt !== t.title) { t.title = txt; pushHistory(); }
  else f.ttl.textContent = t.title;
  relayout(); renderSelection();
}

export function addChild(afterId: string | null): void {
  const t = topicOf(afterId); if (!t) return;
  stopEdit();
  const c = new Topic('主题');
  t.collapsed = false;
  t.children.push(c);
  select(c.id); pushHistory(); relayout();
  startEdit(c.id);
}
export function addSibling(afterId: string | null): void {
  const t = topicOf(afterId); const p = parentOf(afterId ?? '');
  if (!t || !p) { addChild(afterId); return; }
  const channel = siblingChannel(p, t);
  if (!channel) { addChild(afterId); return; }
  stopEdit();
  const s = new Topic('主题');
  // 自由主题 / 标注框的同级仍留在原通道，并错开落点，避免插进 attached 列表开头
  if (channel !== p.children) {
    s.pos = { x: (t.pos?.x ?? 0) + 28, y: (t.pos?.y ?? 0) + 28 };
    s.isCallout = t.isCallout;
  }
  channel.splice(channel.indexOf(t) + 1, 0, s);
  select(s.id); pushHistory(); relayout();
  startEdit(s.id);
}
export function removeTopic(id: string): void {
  const t = topicOf(id); const p = parentOf(id);
  if (!t || !p) { toast('根主题不可删除'); return; }
  stopEdit(false);
  removeChildFromParent(p, t);
  pruneRelationshipsFor(subtreeIds(t));               // 清理引用了被删子主题的联系
  select(p.id); pushHistory(); relayout();
}
export function toggleCollapse(id: string): void {
  const t = topicOf(id); if (!t || !t.children.length) return;
  t.collapsed = !t.collapsed;
  pushHistory(); relayout();
}

/** 分支成长方向（Xmind growthDirection 覆盖）：'auto' 跟随引擎，'right'/'left' 钉住一侧 */
export function setTopicSide(id: string, side: Side): void {
  const t = topicOf(id); if (!t || t.id === sheet.root.id) return;
  if (t.side === side) return;
  t.side = side;
  pushHistory(); relayout();
}

/** 方向感知导航（复刻 Xmind navigationRules：左侧子树方向反转） */
export function navigate(dir: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'): void {
  if (!selectedId) return select(sheet.root.id);
  const meta = metaOf(selectedId);
  if (!meta) return;
  const t = meta.topic;
  const side = figurePosSide(selectedId);
  const deep = (side === 'left') ? 'ArrowLeft' : (side === 'down' ? 'ArrowDown' : 'ArrowRight');
  const shallow = (side === 'left') ? 'ArrowRight' : (side === 'down' ? 'ArrowUp' : 'ArrowLeft');

  if (dir === deep) {
    if (!t.collapsed && t.children.length && t.children[0]) select(t.children[0].id);
    else if (meta.parent) navigateSibling(1, meta);
  } else if (dir === shallow) {
    if (meta.parent) select(meta.parent.id);
  } else if (dir === 'ArrowUp') navigateSibling(-1, meta);
  else if (dir === 'ArrowDown') navigateSibling(1, meta);
  scrollSelectedIntoView();
}
function figurePosSide(id: string): 'left' | 'right' | 'down' {
  const f = figureMap.get(id);
  if (!f?.cur) return 'right';
  const rootF = figureMap.get(sheet.root.id);
  if (Math.abs(f.cur.y - (rootF?.cur?.y ?? 0)) < 2 && Math.abs(f.cur.x - (rootF?.cur?.x ?? 0)) < 2) return 'right';
  if (sheet.structureClass === 'org-chart') return 'down';
  return f.cur.x < 0 ? 'left' : 'right';
}
function navigateSibling(delta: number, meta: TopicMeta): void {
  const p = meta.parent; if (!p) return;
  const vis = new Set([...walkVisible()]);
  const list = p.children.filter(c => vis.has(c));
  const i = list.indexOf(meta.topic);
  const next = list[i + delta];
  if (next) select(next.id);
  else {
    const pm = metaOf(p.id);
    if (p.id !== sheet.root.id && pm) navigateSibling(delta, pm);
  }
}
function scrollSelectedIntoView(): void {
  const f = selectedId ? figureMap.get(selectedId) : undefined;
  if (!f?.cur) return;
  const sx = f.cur.x * zoom + pan.x, sy = f.cur.y * zoom + pan.y;
  const r = viewportEl.getBoundingClientRect();
  if (sx < 80 || sx > r.width - 80 || sy < 80 || sy > r.height - 80) centerOn(f.cur.x, f.cur.y);
}
