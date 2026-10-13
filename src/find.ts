import { sheet, walkVisible, type Topic } from './model';
import { figureMap } from './figures';
import { relayout } from './layout';
import { pushHistory } from './persistence';
import { centerOn, setZoom } from './view';
import { applyWorld } from './view';

/* =====================================================================
 * 查找替换（Ctrl+F）—— 标题 + 备注文本命中；命中高亮 + 步进导航；
 * 替换单处 / 全部（全部替换整体一步撤销）。
 * ===================================================================== */

export { findMatches, type FindMatch } from './findcore';
import { findMatches, type FindMatch } from './findcore';

let matches: FindMatch[] = [];
let cursor = -1;
let query = '';

export const findBarVisible = (): boolean => document.getElementById('find-bar')?.classList.contains('open') ?? false;

export function openFindBar(prefill = ''): void {
  const bar = document.getElementById('find-bar');
  if (!bar) return;
  bar.classList.add('open');
  const input = document.getElementById('find-input') as HTMLInputElement;
  if (prefill) input.value = prefill;
  input.focus(); input.select();
  runFind(input.value);
}

export function closeFindBar(): void {
  document.getElementById('find-bar')?.classList.remove('open');
  query = ''; matches = []; cursor = -1;
  clearHits();
}

function clearHits(): void {
  document.querySelectorAll('.topic.hit, .topic.hit-cur').forEach(el => el.classList.remove('hit', 'hit-cur'));
  const n = document.getElementById('find-count');
  if (n) n.textContent = '';
}

function runFind(q: string): void {
  clearHits();
  query = q;
  matches = findMatches([...walkVisible()], q);
  const ids = new Set(matches.map(m => m.topicId));
  for (const id of ids) figureMap.get(id)?.el.classList.add('hit');
  const n = document.getElementById('find-count');
  if (n) n.textContent = q ? `${matches.length} 个结果` : '';
  if (matches.length) go(0);
}

function go(idx: number): void {
  if (!matches.length) return;
  cursor = ((idx % matches.length) + matches.length) % matches.length;
  const m = matches[cursor]!;
  document.querySelectorAll('.topic.hit-cur').forEach(el => el.classList.remove('hit-cur'));
  const f = figureMap.get(m.topicId);
  f?.el.classList.add('hit-cur');
  if (f?.cur) centerOn(f.cur.x, f.cur.y);
  const n = document.getElementById('find-count');
  if (n) n.textContent = `${cursor + 1}/${matches.length}`;
}

function replaceCurrent(): void {
  const rep = (document.getElementById('find-replace') as HTMLInputElement).value;
  const m = matches[cursor];
  if (!m || !rep) return;
  const t = [...walkVisible()].find(x => x.id === m.topicId);
  if (!t) return;
  if (m.field === 'title') t.title = t.title.replace(new RegExp(escapeReg(query), 'i'), rep);
  else if (m.field === 'labels' && m.labelIdx !== undefined) {
    const li = m.labelIdx;
    if (t.labels[li] !== undefined) t.labels[li] = t.labels[li]!.replace(new RegExp(escapeReg(query), 'i'), rep);
  }
  else t.note = t.note.replace(new RegExp(escapeReg(query), 'i'), rep);
  pushHistory(); relayout();
  runFind(query);                                   // 重新计算命中并停在下一个
  if (!matches.length) { const n = document.getElementById('find-count'); if (n) n.textContent = '0 个结果'; }
}

function replaceAll(): void {
  const rep = (document.getElementById('find-replace') as HTMLInputElement).value;
  if (!query || !rep) return;
  let n = 0;
  for (const t of walkVisible()) {
    if (t.title.toLowerCase().includes(query.toLowerCase())) {
      t.title = t.title.replace(new RegExp(escapeReg(query), 'gi'), rep); n++;
    }
    if (t.note.toLowerCase().includes(query.toLowerCase())) {
      t.note = t.note.replace(new RegExp(escapeReg(query), 'gi'), rep); n++;
    }
    for (let li = 0; li < t.labels.length; li++) {
      if (t.labels[li]!.toLowerCase().includes(query.toLowerCase())) {
        t.labels[li] = t.labels[li]!.replace(new RegExp(escapeReg(query), 'gi'), rep); n++;
      }
    }
  }
  if (!n) return;
  pushHistory(); relayout();
  runFind(query);
  const el = document.getElementById('find-count');
  if (el) el.textContent = `已替换 ${n} 处`;
}

const escapeReg = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- 事件接线（模块加载时一次） ---------- */
export function initFind(): void {
  const bar = document.getElementById('find-bar');
  if (!bar) return;
  const input = document.getElementById('find-input') as HTMLInputElement;
  const rep = document.getElementById('find-replace') as HTMLInputElement;
  input.addEventListener('input', () => runFind(input.value));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); go(cursor + (e.shiftKey ? -1 : 1)); }
    else if (e.key === 'Escape') { e.preventDefault(); closeFindBar(); }
  });
  rep.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); replaceCurrent(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeFindBar(); }
  });
  document.getElementById('find-prev')?.addEventListener('click', () => go(cursor - 1));
  document.getElementById('find-next')?.addEventListener('click', () => go(cursor + 1));
  document.getElementById('find-replace-btn')?.addEventListener('click', replaceCurrent);
  document.getElementById('find-replace-all')?.addEventListener('click', replaceAll);
  document.getElementById('find-close')?.addEventListener('click', closeFindBar);
}

/* 供 model 变更后刷新（撤销/导入后命中可能失效） */
export function refreshFind(): void {
  if (findBarVisible() && query) runFind(query);
}

/* zen 演示退场后视图复位用 */
export { setZoom, applyWorld };
export const currentSheetTitle = (): string => sheet.root.title;
