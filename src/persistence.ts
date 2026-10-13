import { applySheet, fromJSON, selectedId, toJSON, walkAllTopics } from './model';
import { cacheImageSrc, cachedImageSrc } from './assets';
import { relayout } from './layout';
import { renderSelection } from './interactions';
import { toast } from './ui';

/* =====================================================================
 * 五、命令栈（快照式撤销，对应 Xmind 独立 undo 模块）
 * ===================================================================== */
const history: string[] = [];
let histPtr = -1;

const fullSnapshot = (): string => JSON.stringify(toJSON());

/** 历史快照：剥离图片 dataURL（体积），源进缓存供撤销恢复 */
const snapshot = (): string => {
  const j = toJSON();
  for (const t of walkAllTopics()) {
    if (t.image?.src) cacheImageSrc(t.id, t.image.src);
  }
  type SnapNode = { image?: { src?: string }; children?: { attached?: SnapNode[]; detached?: SnapNode[]; calloutTopics?: SnapNode[] } };
  const walk = (n: SnapNode): void => {
    if (n.image) n.image.src = '';
    const ch = n.children ?? {};
    for (const key of ['attached', 'detached', 'calloutTopics'] as const) {
      for (const c of ch[key] ?? []) walk(c);
    }
  };
  for (const sh of j.sheets ?? []) if (sh.rootTopic) walk(sh.rootTopic as never);
  return JSON.stringify(j);
};

function pushHistoryBase(): void {
  history.splice(histPtr + 1);
  history.push(snapshot());
  if (history.length > 120) history.shift();
  histPtr = history.length - 1;
}
export const canUndo = (): boolean => histPtr > 0;
export const canRedo = (): boolean => histPtr < history.length - 1;

export function pushHistory(): void { pushHistoryBase(); autosave(); }

/** 清空历史栈（新建/打开文件时用） */
export function resetHistory(): void { history.length = 0; histPtr = -1; }

export function undo(): void {
  if (!canUndo()) return;
  histPtr--;
  const snap = history[histPtr];
  if (snap) restoreSnapshot(snap);
  toast('撤销');
}
export function redo(): void {
  if (!canRedo()) return;
  histPtr++;
  const snap = history[histPtr];
  if (snap) restoreSnapshot(snap);
  toast('重做');
}
export function restoreSnapshot(json: string): void {
  const sel = selectedId;
  const s = fromJSON(JSON.parse(json) as never);
  // 撤销恢复：从缓存回填图片源（历史快照不含 dataURL）
  for (const t of walkAllTopicsOf(s.root)) {
    if (t.image && !t.image.src) t.image.src = cachedImageSrc(t.id) ?? '';
    if (t.image && !t.image.src) t.image = null;
  }
  applySheet(s, sel);
  relayout(); renderSelection();
  autosave();                                        // 撤销/重做后立即持久化（防刷新回滚失效）
}

function walkAllTopicsOf(root: import('./model').Topic): import('./model').Topic[] {
  const out: import('./model').Topic[] = [];
  (function rec(t: import('./model').Topic) {
    out.push(t);
    t.children.forEach(rec); t.detachedKids.forEach(rec); t.calloutKids.forEach(rec);
  })(root);
  return out;
}

/* ---------- localStorage 自动保存 ---------- */
export const LS_KEY = 'zhiya.map.v1';
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
export function autosave(): void {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => localStorage.setItem(LS_KEY, fullSnapshot()), 400);
}
