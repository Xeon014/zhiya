import { sheet, topicOf, walkVisible, type Topic } from './model';
import { figureMap } from './figures';
import { figuresEl } from './dom';
import { relayout } from './layout';
import { pushHistory } from './persistence';
import { showCtxMenu } from './menus';
import { uid } from './utils';

/* =====================================================================
 * 联系（Xmind: sheet.relationships）—— 逆向自官方模板：
 *   {id, end1Id, end2Id, title?, style:{properties:{"arrow-end-class":
 *    "org.xmind.arrowShape.spearhead", "shape-class":"org.xmind.relationshipShape.*"}}}
 * 渲染：曲线 + 终点矛形箭头；标签为 DOM 元素（双击改名，同概要模式）。
 * 创建：主题右键"添加联系到…" → 拾取模式 → 点击目标主题。
 * ===================================================================== */

export interface RelationshipLayoutItem {
  rel: import('./model').Relationship;
  path: string;            // 曲线 path d
  midX: number; midY: number;   // 标签锚点（世界坐标）
}

/** 端点：主题中心朝对方方向的边框交点 */
function edgePoint(t: Topic, toward: { x: number; y: number }): { x: number; y: number } {
  const f = figureMap.get(t.id);
  const c = f?.cur ?? { x: 0, y: 0 };
  const w = (f?.el.offsetWidth ?? 0) / 2 + 4, h = (f?.el.offsetHeight ?? 0) / 2 + 4;
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx !== 0 ? w / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? h / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

export function collectRelationships(): RelationshipLayoutItem[] {
  const items: RelationshipLayoutItem[] = [];
  const byId = new Map<string, Topic>();
  for (const t of walkVisible()) byId.set(t.id, t);
  for (const rel of sheet.relationships) {
    const a = byId.get(rel.fromId), b = byId.get(rel.toId);
    if (!a || !b || a === b) continue;
    const ca = figureMap.get(a.id)?.cur, cb = figureMap.get(b.id)?.cur;
    if (!ca || !cb) continue;
    const p1 = edgePoint(a, cb), p2 = edgePoint(b, ca);
    // 双向弯曲控制点（垂直方向轻弧，Xmind relationshipShape.curve 的默认形态）
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = Math.min(36, len * 0.12);
    const c1 = { x: p1.x + dx * 0.3 - dy / len * off, y: p1.y + dy * 0.3 + dx / len * off };
    const c2 = { x: p1.x + dx * 0.7 - dy / len * off, y: p1.y + dy * 0.7 + dx / len * off };
    // 终点箭头（spearhead：沿曲线末端切线的三角形）
    const ang = Math.atan2(p2.y - c2.y, p2.x - c2.x);
    const ah = 9;
    const arrow = `M ${p2.x} ${p2.y} L ${p2.x - ah * Math.cos(ang - 0.42)} ${p2.y - ah * Math.sin(ang - 0.42)} L ${p2.x - ah * Math.cos(ang + 0.42)} ${p2.y - ah * Math.sin(ang + 0.42)} Z`;
    items.push({
      rel,
      path: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
      midX: mx - dy / len * off * 0.8, midY: my + dx / len * off * 0.8
    });
    (items[items.length - 1] as RelationshipLayoutItem & { _arrow?: string })._arrow = arrow;
  }
  return items;
}

/** 覆盖层 SVG（花括号级别：随 edges 重绘） */
export function relationshipsSVG(): string {
  let s = '';
  const items = collectRelationships() as (RelationshipLayoutItem & { _arrow?: string })[];
  for (const it of items) {
    const rel: any = it.rel;
    s += `<path class="rel-hit" data-rel="${it.rel.id}" d="${it.path}" fill="none" stroke="transparent" stroke-width="14" vector-effect="non-scaling-stroke"/>\n`;
    s += `<path d="${it.path}" fill="none" stroke="var(--ink-soft)" stroke-width="1.6" stroke-opacity=".55" stroke-dasharray="7,4" vector-effect="non-scaling-stroke" stroke-linecap="round"/>\n`;
    if (it._arrow) s += `<path d="${it._arrow}" fill="var(--ink-soft)" fill-opacity=".6"/>\n`;
  }
  return s;
}

/* ---------- 标签 DOM（同概要：可双击改名） ---------- */
const relFigures = new Map<string, HTMLDivElement>();
let relEditingId: string | null = null;

export function updateRelationshipFigures(): void {
  if (relEditingId) return;
  const items = collectRelationships();
  const seen = new Set<string>();
  for (const it of items) {
    seen.add(it.rel.id);
    let el = relFigures.get(it.rel.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'rel-topic';
      el.dataset.rel = it.rel.id;
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('dblclick', (e) => { e.stopPropagation(); startRelEdit(it.rel.id); });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: '编辑联系标题', kbd: '双击', action: () => startRelEdit(it.rel.id) },
          { label: '删除联系', action: () => removeRelationship(it.rel.id) }
        ]);
      });
      figuresEl.appendChild(el);
      relFigures.set(it.rel.id, el);
    }
    el.style.left = it.midX + 'px';
    el.style.top = it.midY + 'px';
    el.textContent = it.rel.title;
    el.style.display = it.rel.title ? '' : 'none';
  }
  for (const [id, el] of relFigures) {
    if (!seen.has(id)) { el.remove(); relFigures.delete(id); }
  }
}

function startRelEdit(relId: string): void {
  const rel = sheet.relationships.find(r => r.id === relId);
  const el = relFigures.get(relId);
  if (!rel || !el) return;
  relEditingId = relId;
  el.classList.add('editing');
  el.style.display = '';
  el.contentEditable = 'true';
  el.textContent = rel.title;
  el.focus();
  const range = document.createRange(); range.selectNodeContents(el);
  const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
  const commit = (ok: boolean) => {
    el.removeEventListener('blur', onBlur);
    el.removeEventListener('keydown', onKey);
    el.contentEditable = 'false';
    el.classList.remove('editing');
    relEditingId = null;
    const txt = el.textContent?.trim() ?? '';
    if (ok && txt !== rel.title) { rel.title = txt; pushHistory(); }
    relayout();
  };
  const onBlur = () => commit(true);
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  };
  el.addEventListener('blur', onBlur);
  el.addEventListener('keydown', onKey);
}

export function removeRelationship(relId: string): void {
  const i = sheet.relationships.findIndex(r => r.id === relId);
  if (i < 0) return;
  sheet.relationships.splice(i, 1);
  pushHistory(); relayout();
}

/** 删除主题时清理悬空联系 */
export function pruneRelationshipsFor(deletedIds: Set<string>): void {
  const n = sheet.relationships.length;
  sheet.relationships = sheet.relationships.filter(r => !deletedIds.has(r.fromId) && !deletedIds.has(r.toId));
  if (sheet.relationships.length !== n) pushHistory();
}

/* ---------- 拾取模式：从某主题出发，点目标主题建立联系 ---------- */
let pickFrom: string | null = null;
export const isPickingRelationship = (): boolean => pickFrom !== null;

export function startRelationshipPick(fromId: string): void {
  pickFrom = fromId;
  document.getElementById('viewport')?.classList.add('pick-mode');
}
export function cancelRelationshipPick(): void {
  pickFrom = null;
  document.getElementById('viewport')?.classList.remove('pick-mode');
}
export function tryCompleteRelationshipPick(toId: string): boolean {
  if (!pickFrom || pickFrom === toId) return false;
  const from = pickFrom;
  cancelRelationshipPick();
  // 去重：同向或反向已存在则不重复
  const dup = sheet.relationships.some(r =>
    (r.fromId === from && r.toId === toId) || (r.fromId === toId && r.toId === from));
  if (!dup) {
    sheet.relationships.push({ id: uid('rel'), fromId: from, toId, title: '' });
    pushHistory(); relayout();
  }
  return true;
}

/* 联系命中线的右键菜单（委托在 edges 层，SVG path 的 pointer-events 需开启） */
edgesEventSetup();
function edgesEventSetup(): void {
  const edges = document.getElementById('edges');
  edges?.addEventListener('contextmenu', (e) => {
    const hit = (e.target as SVGElement).closest?.('.rel-hit') as SVGElement | null;
    if (!hit) return;
    e.preventDefault(); e.stopPropagation();
    const relId = hit.dataset.rel!;
    showCtxMenu(e.clientX, e.clientY, [
      { label: '编辑联系标题', kbd: '双击', action: () => startRelEdit(relId) },
      { label: '删除联系', action: () => removeRelationship(relId) }
    ]);
  });
}
