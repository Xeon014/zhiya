/* =====================================================================
 * 标记系统（Xmind markers）—— 逆向自官方模板 content.json：
 *   "markers":[{"markerId":"priority-1"}]
 * 真实 id 族：priority-N / flag-色 / star-色 / people-色 / task-* /
 *            symbol-* / smiley-* / c_symbol_*
 * 渲染统一为「彩色字符徽章」：DOM span / canvas fillText / SVG text 三渲染器一致
 * ===================================================================== */
export interface MarkerDef { id: string; label: string; glyph?: string; color?: string; badge?: string }

const flagColors: [string, string][] = [
  ['red', '#D93025'], ['orange', '#E8710A'], ['yellow', '#D9A800'], ['green', '#5E7E4E'], ['blue', '#3E7C82'], ['purple', '#8A5A83']
];
const priorityColors = ['#D93025', '#E8710A', '#D9A800', '#5E7E4E', '#3E7C82', '#4E6398', '#8A5A83', '#6B7078', '#A6AAB0'];

export const MARKER_GROUPS: { name: string; markers: MarkerDef[] }[] = [
  {
    name: '优先级', markers: priorityColors.map((c, i) => ({
      id: `priority-${i + 1}`, label: `P${i + 1}`, badge: String(i + 1), color: c
    }))
  },
  {
    name: '任务', markers: [
      { id: 'task-start', label: '开始', glyph: '▶', color: '#5E7E4E' },
      { id: 'task-quarter', label: '1/4', glyph: '◔', color: '#4E6398' },
      { id: 'task-half', label: '半', glyph: '◑', color: '#4E6398' },
      { id: 'task-3quart', label: '3/4', glyph: '◕', color: '#4E6398' },
      { id: 'task-done', label: '完成', glyph: '✔', color: '#5E7E4E' }
    ]
  },
  {
    name: '旗帜', markers: flagColors.map(([n, c]) => ({ id: `flag-${n}`, label: n, glyph: '⚑', color: c }))
  },
  {
    name: '星形', markers: flagColors.map(([n, c]) => ({ id: `star-${n}`, label: n, glyph: '★', color: c }))
  },
  {
    name: '人物', markers: flagColors.map(([n, c]) => ({ id: `people-${n}`, label: n, glyph: '☺', color: c }))
  },
  {
    name: '符号', markers: [
      { id: 'symbol-question', label: '疑问', glyph: '?', color: '#D93025' },
      { id: 'symbol-exclam', label: '重要', glyph: '!', color: '#E8710A' },
      { id: 'c_symbol_money', label: '金钱', glyph: '¥', color: '#5E7E4E' }
    ]
  },
  {
    name: '表情', markers: [
      { id: 'smiley-smile', label: '微笑', glyph: '☺', color: '#D9A800' },
      { id: 'smiley-cry', label: '难过', glyph: '☹', color: '#4E6398' }
    ]
  }
];

export const MARKERS: Record<string, MarkerDef> = Object.fromEntries(
  MARKER_GROUPS.flatMap(g => g.markers.map(m => [m.id, m]))
);

/** 单个标记尺寸（三渲染器共用的行布局常数） */
export const MK_SIZE = 13;

/** DOM：标记行 HTML（.t-markers 容器内） */
export function markersHTML(ids: string[]): string {
  return ids.map(id => {
    const m = MARKERS[id];
    if (!m) return '';
    return m.badge
      ? `<i class="mk mk-badge" style="--mk-c:${m.color}" title="${m.label}">${m.badge}</i>`
      : `<i class="mk" style="color:${m.color}" title="${m.label}">${m.glyph}</i>`;
  }).join('');
}

/** canvas：在 (cx, topY) 居中画标记行 */
export function drawMarkersCanvas(ctx: CanvasRenderingContext2D, ids: string[], cx: number, topY: number): void {
  const defs = ids.map(id => MARKERS[id]).filter(Boolean) as MarkerDef[];
  if (!defs.length) return;
  const totalW = defs.length * (MK_SIZE + 3);
  let x = cx - totalW / 2 + MK_SIZE / 2;
  const prevAlign = ctx.textAlign, prevBase = ctx.textBaseline;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const m of defs) {
    if (m.badge) {
      const r = 3;
      ctx.fillStyle = m.color!;
      ctx.beginPath();
      ctx.moveTo(x - MK_SIZE / 2 + r, topY);
      ctx.arcTo(x + MK_SIZE / 2, topY, x + MK_SIZE / 2, topY + MK_SIZE, r);
      ctx.arcTo(x + MK_SIZE / 2, topY + MK_SIZE, x - MK_SIZE / 2, topY + MK_SIZE, r);
      ctx.arcTo(x - MK_SIZE / 2, topY + MK_SIZE, x - MK_SIZE / 2, topY, r);
      ctx.arcTo(x - MK_SIZE / 2, topY, x + MK_SIZE / 2, topY, r);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `700 9px ${ctx.font.split('px').slice(1).join('px') || 'sans-serif'}`;
      ctx.fillText(m.badge, x, topY + MK_SIZE / 2 + 0.5);
    } else {
      ctx.fillStyle = m.color!;
      ctx.font = `700 ${MK_SIZE}px ${ctx.font.split('px').slice(1).join('px') || 'sans-serif'}`;
      ctx.fillText(m.glyph!, x, topY + MK_SIZE / 2);
    }
    x += MK_SIZE + 3;
  }
  ctx.textAlign = prevAlign; ctx.textBaseline = prevBase;
}

/** SVG：标记行片段 */
export function markersSVG(ids: string[], cx: number, topY: number): string {
  const defs = ids.map(id => MARKERS[id]).filter(Boolean) as MarkerDef[];
  if (!defs.length) return '';
  const totalW = defs.length * (MK_SIZE + 3);
  let x = cx - totalW / 2 + MK_SIZE / 2;
  let s = '';
  for (const m of defs) {
    if (m.badge) {
      s += `<rect x="${(x - MK_SIZE / 2).toFixed(1)}" y="${topY.toFixed(1)}" width="${MK_SIZE}" height="${MK_SIZE}" rx="3" fill="${m.color}"/>`;
      s += `<text x="${x.toFixed(1)}" y="${(topY + MK_SIZE / 2 + 3).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#FFFFFF">${m.badge}</text>`;
    } else {
      s += `<text x="${x.toFixed(1)}" y="${(topY + MK_SIZE - 1).toFixed(1)}" text-anchor="middle" font-size="${MK_SIZE}" font-weight="700" fill="${m.color}">${m.glyph}</text>`;
    }
    x += MK_SIZE + 3;
  }
  return s + '\n';
}
