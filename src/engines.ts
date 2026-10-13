import { sheet, topicOf, type Topic } from './model';

/* =====================================================================
 * 二、结构引擎注册表（对应 Xmind layoutVariantEngines / topicExtensions）
 *    引擎接口契约：measure → arrange → edgePath/decorEdges/chevronAt
 * ===================================================================== */
export interface Box { x: number; y: number; w: number; h: number; side: string }
export interface Size { w: number; h: number }
export interface MeasureCtx { gapV: number; gapH: number; sizeOf(t: Topic): Size }
export interface GrowthSplit { right: string[]; left: string[] }
export interface BlockInfo { w: number; h: number; colH: number; colW: number; subH?: number; subW?: number }
export type EngineMeasure = Map<string, number> | { widths: Map<string, number>; heights: Map<string, number> } | { blocks: Map<string, BlockInfo> };

export interface StructureEngine {
  id: string;
  label: string;
  /** true = 连线形状由引擎自定（树图/括号图/发散图），主题 lineClass 不覆盖 */
  fixedEdges?: boolean;
  growthSplit?(root: Topic, heights: Map<string, number>): GrowthSplit | null;
  measure(ctx: MeasureCtx): EngineMeasure;
  arrange(ctx: MeasureCtx, m: any, split?: GrowthSplit | null): Map<string, Box>;
  edgePath(a: Box, b: Box, side: string): string;
  decorEdges?(pos: Map<string, Box>): string;
  chevronAt(topic: Topic, p: Box): { x: number; y: number };
}

export const StructureEngines: Record<string, StructureEngine> = {};
export const registerEngine = (e: StructureEngine): void => { StructureEngines[e.id] = e; };

/* ---------- 引擎 1 家族：logic（思维导图：平衡 / 向右 / 向左） ----------
 * 对应 Xmind org.xmind.ui.logic-chart / logic-chart.right / logic-chart.left
 * （成长方向 Growth Direction；24654.js growthDirection ×344、
 *   primaryGrowthDirection/secondaryGrowthDirection 布局因子）
 * 分支级方向覆盖：Topic.side（'auto'|'right'|'left'，对应 Xmind 分支成长方向） */

function growthSplitDirected(root: Topic, heights: Map<string, number>, mode: 'balanced' | 'right' | 'left'): GrowthSplit {
  const kids = root.children;
  if (!kids.length) return { right: [], left: [] };
  // auto 子女的连续段平衡（保持顺序，前缀→右；仅平衡模式需要）
  let autoRight: Set<string> | null = null;
  const autos = kids.filter(k => k.side === 'auto');
  if (mode === 'balanced' && autos.length > 1) {
    const H = autos.map(k => heights.get(k.id) ?? 0);
    const total = H.reduce((a, b) => a + b, 0);
    let best = 1, bestDiff = Infinity, acc = 0;
    for (let i = 0; i < autos.length - 1; i++) {
      acc += H[i] ?? 0;
      const diff = Math.abs(acc - (total - acc));
      if (diff < bestDiff) { bestDiff = diff; best = i + 1; }
    }
    autoRight = new Set(autos.slice(0, best).map(k => k.id));
  }
  const right: string[] = [], left: string[] = [];
  for (const k of kids) {
    let side = k.side;
    if (side === 'auto') {
      if (mode === 'right') side = 'right';
      else if (mode === 'left') side = 'left';
      else side = autoRight?.has(k.id) ?? true ? 'right' : 'left';
    }
    (side === 'left' ? left : right).push(k.id);
  }
  return { right, left };
}

function logicArrange(ctx: MeasureCtx, heights: Map<string, number>, split?: GrowthSplit | null): Map<string, Box> {
  const pos = new Map<string, Box>();
  const V_GAP = ctx.gapV, H_GAP = ctx.gapH;
  const place = (topic: Topic, cx: number, cy: number, side: string, dir: number) => {
    const w = ctx.sizeOf(topic).w, h = ctx.sizeOf(topic).h;
    pos.set(topic.id, { x: cx, y: cy, w, h, side });
    if (topic.collapsed) return;
    const kidsAll = topic.children;
    const totalH = kidsAll.reduce((a, k) => a + (heights.get(k.id) ?? 0), 0) + V_GAP * (kidsAll.length - 1);
    let cur = cy - totalH / 2;
    for (const k of kidsAll) {
      const kh = heights.get(k.id) ?? 0;
      const ky = cur + kh / 2;
      cur += kh + V_GAP;
      const kw = ctx.sizeOf(k).w;
      const kx = cx + dir * (w / 2 + H_GAP + kw / 2);
      place(k, kx, ky, side, dir);
    }
  };
  const rw = ctx.sizeOf(sheet.root).w, rh = ctx.sizeOf(sheet.root).h;
  pos.set(sheet.root.id, { x: 0, y: 0, w: rw, h: rh, side: 'root' });
  const sp = split ?? { right: sheet.root.children.map(k => k.id), left: [] as string[] };
    for (const [sideName, ids] of [['right', sp.right], ['left', sp.left]] as const) {
      const dir = sideName === 'right' ? 1 : -1;
      const totalH = ids.reduce((a, id) => a + (heights.get(id) ?? 0), 0) + V_GAP * Math.max(0, ids.length - 1);
      let cur = -totalH / 2;
      for (const id of ids) {
        const k = topicOf(id);
        if (!k) continue;
        const kh = heights.get(id) ?? 0, kw = ctx.sizeOf(k).w;
        const ky = cur + kh / 2; cur += kh + V_GAP;
        const kx = dir * (rw / 2 + H_GAP + kw / 2);
        place(k, kx, ky, sideName, dir);
    }
  }
  return pos;
}

const logicEdgePath = (a: Box, b: Box, side: string): string => {
    const dir = side === 'left' ? -1 : 1;
    const x1 = a.x + dir * a.w / 2, y1 = a.y;
    const x2 = b.x - dir * b.w / 2, y2 = b.y;
    const dx = (x2 - x1) * 0.45;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

const logicChevronAt = (_topic: Topic, p: Box): { x: number; y: number } => {
  const dir = p.side === 'left' ? -1 : 1;
  return { x: p.x + dir * (p.w / 2 + 14), y: p.y };
};

function registerLogicEngine(id: string, label: string, mode: 'balanced' | 'right' | 'left'): void {
  registerEngine({
    id, label,
    growthSplit(root, heights) { return growthSplitDirected(root, heights, mode); },
    measure(ctx) { return measureSubtreeHeights(ctx); },
    arrange: logicArrange,
    edgePath: logicEdgePath,
    chevronAt: logicChevronAt
  });
}
  registerLogicEngine('logic-chart', '思维导图', 'balanced');
  registerLogicEngine('logic-right', '逻辑图 · 向右', 'right');
  registerLogicEngine('logic-left', '逻辑图 · 向左', 'left');

/* ---------- 引擎 2：org-chart 家族（向下/向上，共享测量） ---------- */
function orgMeasure(ctx: MeasureCtx): { widths: Map<string, number>; heights: Map<string, number> } {
  const widths = new Map<string, number>(), heights = new Map<string, number>();
  const size = (t: Topic) => ctx.sizeOf(t);
  const rec = (t: Topic): void => {
    const s = size(t);
    if (t.collapsed || !t.children.length) { widths.set(t.id, s.w); heights.set(t.id, s.h); return; }
    let ws = 0, hmax = 0;
    for (const c of t.children) { rec(c); ws += widths.get(c.id) ?? 0; hmax = Math.max(hmax, heights.get(c.id) ?? 0); }
    const rowW = ws + ctx.gapH * (t.children.length - 1);
    widths.set(t.id, Math.max(s.w, rowW));
    heights.set(t.id, s.h + ctx.gapV + hmax);
  };
  rec(sheet.root);
  return { widths, heights };
}

registerEngine({
  id: 'org-chart', label: '组织架构',

  growthSplit() { return null; },

  measure(ctx) { return orgMeasure(ctx); },

  arrange(ctx, m: { widths: Map<string, number>; heights: Map<string, number> }) {
    const pos = new Map<string, Box>();
    const size = (t: Topic) => ctx.sizeOf(t);
    const rec = (t: Topic, cx: number, topY: number): void => {
      const s = size(t);
      pos.set(t.id, { x: cx, y: topY + s.h / 2, w: s.w, h: s.h, side: 'down' });
      if (t.collapsed || !t.children.length) return;
      const rowW = m.widths.get(t.id) ?? 0;
      let cur = cx - rowW / 2;
      const childTop = topY + s.h + ctx.gapV;
      for (const c of t.children) {
        const cw = m.widths.get(c.id) ?? 0;
        const ccx = cur + cw / 2; cur += cw + ctx.gapH;
        rec(c, ccx, childTop);
      }
    };
    rec(sheet.root, 0, -((m.heights.get(sheet.root.id) ?? 0) / 2));
    return pos;
  },

  edgePath(a, b) {
    const y1 = a.y + a.h / 2, y2 = b.y - b.h / 2;
    const midY = (y1 + y2) / 2;
    return `M ${a.x} ${y1} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${y2}`;
  },

  chevronAt(_topic, p) { return { x: p.x, y: p.y + p.h / 2 + 15 }; }
});

/* ---------- 块模型测量（鱼骨/时间轴共用） ---------- */
function measureBlocks(ctx: MeasureCtx): Map<string, BlockInfo> {
  const blocks = new Map<string, BlockInfo>();
  const rec = (t: Topic): BlockInfo => {
    const s = ctx.sizeOf(t);
    const b: BlockInfo = { w: s.w, h: s.h, colH: s.h, colW: s.w };
    if (!t.collapsed && t.children.length) {
      let colH = 0, colW = 0;
      for (const c of t.children) {
        const cb = rec(c);
        colH += cb.colH;
        colW = Math.max(colW, cb.colW);
      }
      colH += ctx.gapV * (t.children.length - 1);
      b.colH = Math.max(s.h, colH);
      b.colW = s.w + ctx.gapH + colW;
    }
    blocks.set(t.id, b);
    return b;
  };
  const heightOf = (t: Topic): number => {
    if (t.collapsed || !t.children.length) return blocks.get(t.id)?.colH ?? t.children.length;
    let sum = 0;
    for (const c of t.children) sum += blocks.get(c.id)?.colH ?? 0;
    return sum + ctx.gapV * (t.children.length - 1);
  };
  for (const k of sheet.root.children) {
    const b = rec(k);
    b.subH = Math.max(b.h, heightOf(k));
    b.subW = b.w + ctx.gapH + Math.max(0, ...k.children.map(c => blocks.get(c.id)?.colW ?? 0));
  }
  return blocks;
}

/* ---------- 引擎 3：fishbone 家族（左头/右头，脊骨 + 上下交替斜刺） ---------- */
let _fishboneLastSpineX = 0;
function fishboneArrange(ctx: MeasureCtx, m: { blocks: Map<string, BlockInfo> }, dir: 1 | -1): Map<string, Box> {
  const pos = new Map<string, Box>();
  const size = (t: Topic) => ctx.sizeOf(t);
  const rw = size(sheet.root).w;
  pos.set(sheet.root.id, { x: 0, y: 0, w: rw, h: size(sheet.root).h, side: 'root' });

  const placeOut = (t: Topic, cx: number, cy: number): void => {   // 三级及以下：远离脊骨递归
    const s = size(t);
    pos.set(t.id, { x: dir * cx, y: cy, w: s.w, h: s.h, side: 'right' });
    if (t.collapsed || !t.children.length) return;
    const totalH = t.children.reduce((a, c) => a + (m.blocks.get(c.id)?.colH ?? 0), 0) + ctx.gapV * (t.children.length - 1);
    let cur = cy - totalH / 2;
    for (const c of t.children) {
      const cb = m.blocks.get(c.id), cs = size(c);
      if (!cb) continue;
      const cy2 = cur + cb.colH / 2; cur += cb.colH + ctx.gapV;
      placeOut(c, cx + s.w / 2 + ctx.gapH + cs.w / 2, cy2);
    }
  };

  const ups: Topic[] = [], downs: Topic[] = [];
  sheet.root.children.forEach((k, i) => (i % 2 === 0 ? ups : downs).push(k));
  let lastX = rw / 2 + 40;
  for (const [arr, sign, sideName] of [[ups, -1, 'up'], [downs, 1, 'down']] as const) {
    let cursorX = rw / 2 + 70;
    for (const k of arr) {
      const b = m.blocks.get(k.id), s = size(k);
      if (!b) continue;
      const d = Math.max(56, (b.subH ?? 0) / 2 + 24);           // 斜刺长度（45°）
      const kx = cursorX + d, ky = sign * d;
      pos.set(k.id, { x: dir * kx, y: ky, w: s.w, h: s.h, side: sideName });
      if (!k.collapsed && k.children.length) {
        let cur = ky - (b.subH ?? 0) / 2;
        for (const g of k.children) {
          const gb = m.blocks.get(g.id), gs = size(g);
          if (!gb) continue;
          const gy = cur + gb.colH / 2; cur += gb.colH + ctx.gapV;
          placeOut(g, kx + s.w / 2 + ctx.gapH + gs.w / 2, gy);
        }
      }
      cursorX += Math.max(b.subW ?? 0, d + s.w) + ctx.gapH;
      lastX = Math.max(lastX, kx + s.w / 2);
    }
  }
  _fishboneLastSpineX = lastX + 30;
  return pos;
}
function fishboneEdge(a: Box, b: Box, side: string, dir: 1 | -1): string {
  if (side === 'up' || side === 'down') {            // 一级斜刺：45° 直线（dir 翻转斜刺朝向）
    const dx = Math.abs(b.y - a.y);
    return `M ${b.x - dir * (b.w / 2 + dx)} ${a.y} L ${b.x - dir * b.w / 2} ${b.y}`;
  }
  const x1 = a.x + dir * a.w / 2, y1 = a.y, x2 = b.x - dir * b.w / 2, y2 = b.y;
  const dx = (x2 - x1) * 0.45;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
function fishboneDecor(_pos: Map<string, Box>, dir: 1 | -1): string {
  const r = _pos.get(sheet.root.id);
  return r ? `<path d="M ${dir * (r.x + r.w / 2)} 0 L ${dir * _fishboneLastSpineX} 0" fill="none" stroke="var(--ink-soft)" stroke-width="2.4" stroke-opacity=".5" vector-effect="non-scaling-stroke" stroke-linecap="round"/>` : '';
}
function registerFishbone(id: string, label: string, dir: 1 | -1): void {
  registerEngine({
    id, label,
    growthSplit() { return null; },
    measure(ctx) { return { blocks: measureBlocks(ctx) }; },
    arrange(ctx, m: { blocks: Map<string, BlockInfo> }) { return fishboneArrange(ctx, m, dir); },
    edgePath(a, b, side) { return fishboneEdge(a, b, side, dir); },
    decorEdges(pos) { return fishboneDecor(pos, dir); },
    chevronAt(_topic, p) { return { x: p.x, y: p.y + p.h / 2 + 15 }; }
  });
}
registerFishbone('fishbone', '鱼骨图', 1);                 // org.xmind.ui.fishbone.leftHeaded（头在左）
registerFishbone('fishbone-right', '鱼骨图 · 右头', -1);

/* ---------- 引擎 4 家族：timeline（时间轴变体：交替/单侧/反向/竖向/btt/贯通）
 * 逆向枚举：timeline.horizontal[.rtl] / sided.horizontal[.rtl] /
 *          vertical[.btt] / through.vertical[.btt] ---------- */
interface TLOpts { sided?: boolean; rtl?: 1 | -1 }

function registerTimelineHorizontal(id: string, label: string, opts: TLOpts): void {
  const dir = opts.rtl ?? 1;
  registerEngine({
    id, label,
    growthSplit() { return null; },
    measure(ctx) { return { blocks: measureBlocks(ctx) }; },
    arrange(ctx, m: { blocks: Map<string, BlockInfo> }) {
      const pos = new Map<string, Box>();
      const size = (t: Topic) => ctx.sizeOf(t);
      const rw = size(sheet.root).w;
      pos.set(sheet.root.id, { x: 0, y: 0, w: rw, h: size(sheet.root).h, side: 'root' });

      const placeOut = (t: Topic, cx: number, cy: number): void => {   // 细节列：远离轴展开
        const s = size(t);
        pos.set(t.id, { x: dir * cx, y: cy, w: s.w, h: s.h, side: 'right' });
        if (t.collapsed || !t.children.length) return;
        const totalH = t.children.reduce((a, c) => a + (m.blocks.get(c.id)?.colH ?? 0), 0) + ctx.gapV * (t.children.length - 1);
        let cur = cy - totalH / 2;
        for (const c of t.children) {
          const cb = m.blocks.get(c.id), cs = size(c);
          if (!cb) continue;
          const cy2 = cur + cb.colH / 2; cur += cb.colH + ctx.gapV;
          placeOut(c, cx + s.w / 2 + ctx.gapH + cs.w / 2, cy2);
        }
      };

      let cursorX = rw / 2 + 80;
      sheet.root.children.forEach((k, i) => {
        const b = m.blocks.get(k.id), s = size(k);
        if (!b) return;
        const sign = opts.sided ? -1 : (i % 2 === 0 ? -1 : 1);          // 单侧：固定上侧
        const d = Math.max(s.h / 2 + 34, (b.subH ?? 0) / 2 + 18);
        const kx = cursorX + s.w / 2, ky = sign * d;
        pos.set(k.id, { x: dir * kx, y: ky, w: s.w, h: s.h, side: sign < 0 ? 'tl-up' : 'tl-down' });
        if (!k.collapsed && k.children.length) {
          let cur = ky - (b.subH ?? 0) / 2;
          for (const g of k.children) {
            const gb = m.blocks.get(g.id), gs = size(g);
            if (!gb) continue;
            const gy = cur + gb.colH / 2; cur += gb.colH + ctx.gapV;
            placeOut(g, kx + s.w / 2 + ctx.gapH + gs.w / 2, gy);
          }
        }
        cursorX += Math.max(s.w, b.subW ?? 0) + ctx.gapH + 24;
      });
      return pos;
    },
    edgePath(a, b, side) {
      if (side === 'tl-up' || side === 'tl-down') {
        const yEdge = side === 'tl-up' ? b.y + b.h / 2 : b.y - b.h / 2;
        return `M ${b.x} ${a.y} L ${b.x} ${yEdge}`;
      }
      const x1 = a.x + dir * a.w / 2, y1 = a.y, x2 = b.x - dir * b.w / 2, y2 = b.y;
      const dx = (x2 - x1) * 0.45;
      return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    },
    decorEdges(pos) {
      const r = pos.get(sheet.root.id);
      let lastX = 0;
      for (const t of sheet.root.children) {
        const f = pos.get(t.id);
        if (f) lastX = Math.max(lastX, Math.abs(f.x) + f.w / 2);
      }
      return r ? `<path d="M ${dir * (r.x + r.w / 2)} 0 L ${dir * (lastX + 40)} 0" fill="none" stroke="var(--ink-soft)" stroke-width="2.4" stroke-opacity=".5" vector-effect="non-scaling-stroke" stroke-linecap="round"/>` : '';
    },
    chevronAt(_topic, p) {
      return p.side === 'tl-up' ? { x: p.x, y: p.y - p.h / 2 - 15 } : { x: p.x, y: p.y + p.h / 2 + 15 };
    }
  });
}
registerTimelineHorizontal('timeline', '时间轴', {});
registerTimelineHorizontal('timeline-rtl', '时间轴 · 反向', { rtl: -1 });
registerTimelineHorizontal('timeline-sided', '时间轴 · 单侧', { sided: true });
registerTimelineHorizontal('timeline-sided-rtl', '时间轴 · 单侧反向', { sided: true, rtl: -1 });

interface TLVOpts { btt?: 1 | -1; through?: boolean }
function registerTimelineVertical(id: string, label: string, opts: TLVOpts): void {
  const dir = opts.btt ?? 1;
  registerEngine({
    id, label,
    growthSplit() { return null; },
    measure(ctx) { return { blocks: measureBlocks(ctx) }; },
    arrange(ctx, m: { blocks: Map<string, BlockInfo> }) {
      const pos = new Map<string, Box>();
      const size = (t: Topic) => ctx.sizeOf(t);
      const rh = size(sheet.root).h;
      pos.set(sheet.root.id, { x: 0, y: 0, w: size(sheet.root).w, h: rh, side: 'root' });

      const placeDown = (t: Topic, cx: number, cy: number): void => {
        const s = size(t);
        pos.set(t.id, { x: cx, y: dir * cy, w: s.w, h: s.h, side: 'down' });
        if (t.collapsed || !t.children.length) return;
        const totalW = t.children.reduce((a, c) => a + (m.blocks.get(c.id)?.colW ?? 0), 0) + ctx.gapH * (t.children.length - 1);
        let cur = cx - totalW / 2;
        for (const c of t.children) {
          const cb = m.blocks.get(c.id), cs = size(c);
          if (!cb) continue;
          const cx2 = cur + cb.colW / 2; cur += cb.colW + ctx.gapH;
          placeDown(c, cx2, cy + s.h / 2 + ctx.gapV + cs.h / 2);
        }
      };

      let cursorY = rh / 2 + 80;
      sheet.root.children.forEach((k, i) => {
        const b = m.blocks.get(k.id), s = size(k);
        if (!b) return;
        const ky = cursorY + s.h / 2;
        if (opts.through) {
          // 贯通式：主题串在轴上（x=0），细节列在右侧
          pos.set(k.id, { x: 0, y: dir * ky, w: s.w, h: s.h, side: 'through' });
          if (!k.collapsed && k.children.length) {
            let cur = ky - (b.subH ?? 0) / 2;
            for (const g of k.children) {
              const gb = m.blocks.get(g.id), gs = size(g);
              if (!gb) continue;
              const gy = cur + gb.colH / 2; cur += gb.colH + ctx.gapV;
              placeDown(g, s.w / 2 + ctx.gapH + gs.w / 2, gy);
            }
          }
        } else {
          const sign = (i % 2 === 0) ? -1 : 1;
          const d = Math.max(s.w / 2 + 34, (b.subW ?? 0) / 2 + 18);
          const kx = sign * d;
          pos.set(k.id, { x: kx, y: dir * ky, w: s.w, h: s.h, side: sign < 0 ? 'tl-left' : 'tl-right' });
          if (!k.collapsed && k.children.length) {
            let cur = kx - (b.subW ?? 0) / 2;
            for (const g of k.children) {
              const gb = m.blocks.get(g.id), gs = size(g);
              if (!gb) continue;
              const gx = cur + gb.colW / 2; cur += gb.colW + ctx.gapH;
              placeDown(g, gx, ky + s.h / 2 + ctx.gapV + gs.h / 2);
            }
          }
        }
        cursorY += Math.max(s.h, b.subH ?? 0) + ctx.gapV + 24;
      });
      return pos;
    },
    edgePath(a, b, side) {
      if (side === 'tl-left' || side === 'tl-right') {
        const xEdge = side === 'tl-left' ? b.x + b.w / 2 : b.x - b.w / 2;
        return `M ${a.x} ${b.y} L ${xEdge} ${b.y}`;
      }
      const y1 = a.y + dir * a.h / 2, y2 = b.y - dir * b.h / 2;
      const midX = (a.x + b.x) / 2;
      return `M ${a.x} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${b.x} ${y2}`;
    },
    decorEdges(pos) {
      const r = pos.get(sheet.root.id);
      let lastY = 0;
      for (const t of sheet.root.children) {
        const f = pos.get(t.id);
        if (f) lastY = Math.max(lastY, Math.abs(f.y) + f.h / 2);
      }
      return r ? `<path d="M 0 ${dir * (r.y + r.h / 2)} L 0 ${dir * (lastY + 40)}" fill="none" stroke="var(--ink-soft)" stroke-width="2.4" stroke-opacity=".5" vector-effect="non-scaling-stroke" stroke-linecap="round"/>` : '';
    },
    chevronAt(_topic, p) {
      if (p.side === 'tl-left') return { x: p.x - p.w / 2 - 15, y: p.y };
      if (p.side === 'tl-right') return { x: p.x + p.w / 2 + 15, y: p.y };
      return { x: p.x + p.w / 2 + 15, y: p.y };
    }
  });
}
registerTimelineVertical('timeline-vertical', '时间轴 · 竖向', {});
registerTimelineVertical('timeline-vertical-btt', '时间轴 · 竖向自下而上', { btt: -1 });
registerTimelineVertical('timeline-through', '时间轴 · 贯通', { through: true });
registerTimelineVertical('timeline-through-btt', '时间轴 · 贯通自下而上', { through: true, btt: -1 });

/* ---------- 引擎 2b：org-chart-up（组织架构 · 向上，org.xmind.ui.org-chart.up 镜像） ---------- */
registerEngine({
  id: 'org-chart-up', label: '组织架构 · 向上',
  growthSplit() { return null; },
  measure(ctx) { return orgMeasure(ctx); },
  arrange(ctx, m: { widths: Map<string, number>; heights: Map<string, number> }) {
    const pos = new Map<string, Box>();
    const size = (t: Topic) => ctx.sizeOf(t);
    const rec = (t: Topic, cx: number, bottomY: number): void => {
      const s = size(t);
      pos.set(t.id, { x: cx, y: bottomY - s.h / 2, w: s.w, h: s.h, side: 'up' });
      if (t.collapsed || !t.children.length) return;
      const rowW = m.widths.get(t.id) ?? 0;
      let cur = cx - rowW / 2;
      const childBottom = bottomY - s.h - ctx.gapV;
      for (const c of t.children) {
        const cw = m.widths.get(c.id) ?? 0;
        const ccx = cur + cw / 2; cur += cw + ctx.gapH;
        rec(c, ccx, childBottom);
      }
    };
    rec(sheet.root, 0, (m.heights.get(sheet.root.id) ?? 0) / 2);
    return pos;
  },
  edgePath(a, b) {
    const y1 = a.y - a.h / 2, y2 = b.y + b.h / 2;
    const midY = (y1 + y2) / 2;
    return `M ${a.x} ${y1} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${y2}`;
  },
  chevronAt(_topic, p) { return { x: p.x, y: p.y - p.h / 2 - 15 }; }
});

/* ---------- 引擎 5：map 家族（发散图：非平衡 / 顺时针 / 逆时针）
 * 逆向：org.xmind.ui.map.unbalanced / map.clockwise / map.anticlockwise
 * 非平衡 = 默认单侧 + 分支级 side 自由覆盖（logic 机制即为该语义）
 * 顺/逆时针 = 一级分支按子树高度分配扇区角度，极坐标辐射；子树沿辐射方向垂直堆叠 ---------- */
registerLogicEngine('map-unbalanced', '发散图 · 非平衡', 'right');

function registerRadial(id: string, label: string, cw: 1 | -1): void {
  registerEngine({
    id, label, fixedEdges: true,
    growthSplit() { return null; },
    measure(ctx) { return measureSubtreeHeights(ctx); },
    arrange(ctx, heights: Map<string, number>) {
      const pos = new Map<string, Box>();
      const size = (t: Topic) => ctx.sizeOf(t);
      const rs = size(sheet.root);
      pos.set(sheet.root.id, { x: 0, y: 0, w: rs.w, h: rs.h, side: 'root' });
      const kids = sheet.root.children;
      if (!kids.length) return pos;

      // 扇区角度按子树高度分配（含小间隙），自正上方起始
      const Hs = kids.map(k => heights.get(k.id) ?? 0);
      const total = Hs.reduce((a, b) => a + b, 0) || 1;
      const GAP_A = kids.length > 1 ? 0.06 : 0;
      const span2pi = Math.PI * 2 - GAP_A * kids.length;
      let acc = -Math.PI / 2 + (cw === 1 ? GAP_A / 2 : -GAP_A / 2);

      const place = (t: Topic, u: number, v: number, ex: { x: number; y: number }, ey: { x: number; y: number }) => {
        const s = size(t);
        const cx = u * ex.x + v * ey.x, cy = u * ex.y + v * ey.y;
        pos.set(t.id, { x: cx, y: cy, w: s.w, h: s.h, side: 'map' });
        if (t.collapsed || !t.children.length) return;
        const kidsAll = t.children;
        const totalH = kidsAll.reduce((a, k) => a + (heights.get(k.id) ?? 0), 0) + ctx.gapV * (kidsAll.length - 1);
        let cur = v - totalH / 2;
        for (const k of kidsAll) {
          const kh = heights.get(k.id) ?? 0;
          const kv = cur + kh / 2;
          cur += kh + ctx.gapV;
          const kw = ctx.sizeOf(k).w;
          place(k, u + s.w / 2 + ctx.gapH * 0.72 + kw / 2, kv, ex, ey);
        }
      };

      kids.forEach((k, i) => {
        const span = (Hs[i]! / total) * span2pi;
        const theta = acc + cw * span / 2;
        acc += cw * (span + GAP_A);
        const ex = { x: Math.cos(theta), y: Math.sin(theta) };
        const ey = { x: -Math.sin(theta), y: Math.cos(theta) };
        const kw = ctx.sizeOf(k).w;
        place(k, rs.w / 2 + ctx.gapH * 0.85 + kw / 2, 0, ex, ey);
      });
      return pos;
    },
    edgePath(a, b) {                                   // 辐射直线（端点收至边框）
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const sa = Math.min(Math.abs(ux) > 1e-6 ? (a.w / 2) / Math.abs(ux) : Infinity,
                          Math.abs(uy) > 1e-6 ? (a.h / 2) / Math.abs(uy) : Infinity);
      const sb = Math.min(Math.abs(ux) > 1e-6 ? (b.w / 2) / Math.abs(ux) : Infinity,
                          Math.abs(uy) > 1e-6 ? (b.h / 2) / Math.abs(uy) : Infinity);
      const x1 = a.x + ux * sa, y1 = a.y + uy * sa;
      const x2 = b.x - ux * sb, y2 = b.y - uy * sb;
      return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    },
    chevronAt(_topic, p) {                             // 沿离心方向
      const len = Math.hypot(p.x, p.y) || 1;
      return { x: p.x + (p.x / len) * (p.w / 2 + 14), y: p.y + (p.y / len) * (p.h / 2 + 14) };
    }
  });
}
registerRadial('map-clockwise', '发散图 · 顺时针', 1);
registerRadial('map-anticlockwise', '发散图 · 逆时针', -1);

/* ---------- 引擎 6：tree 家族（树图：大纲式单侧堆叠 + 直角连线） ---------- */
function registerTree(id: string, label: string, dir: 1 | -1): void {
  registerEngine({
    id, label, fixedEdges: true,
    growthSplit() { return null; },
    measure(ctx) { return { blocks: measureBlocks(ctx) }; },
    arrange(ctx, m: { blocks: Map<string, BlockInfo> }) {
      const pos = new Map<string, Box>();
      const size = (t: Topic) => ctx.sizeOf(t);
      const rec = (t: Topic, cx: number, cy: number): void => {   // (cx,cy)=中心；子块自父主题顶起排
        const s = size(t);
        pos.set(t.id, { x: dir * cx, y: cy, w: s.w, h: s.h, side: dir === 1 ? 'right' : 'left' });
        if (t.collapsed || !t.children.length) return;
        let cur = cy - s.h / 2;                     // 大纲式：子块顶 = 父主题顶
        for (const c of t.children) {
          const cb = m.blocks.get(c.id);
          if (!cb) continue;
          const cch = cb.colH;
          const ccy = cur + cch / 2;
          cur += cch + ctx.gapV * 0.7;
          const cs = size(c);
          rec(c, cx + s.w / 2 + ctx.gapH * 0.7 + cs.w / 2, ccy);
        }
      };
      const H = m.blocks.get(sheet.root.id)?.colH ?? 0;
      rec(sheet.root, 0, 0);
      void H;
      return pos;
    },
    edgePath(a, b) {                                  // 直角折线（水平 → 垂直 → 水平）
      const x1 = dir * (Math.abs(a.x) + a.w / 2), x2 = dir * (Math.abs(b.x) - b.w / 2);
      const midX = (x1 + x2) / 2;
      return `M ${x1} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${x2} ${b.y}`;
    },
    chevronAt(_topic, p) { return { x: p.x + dir * (p.w / 2 + 14), y: p.y }; }
  });
}
registerTree('tree-right', '树图 · 向右', 1);
registerTree('tree-left', '树图 · 向左', -1);

/* ---------- 引擎 7：brace 家族（括号图：花括号聚合连线，复用概要括号路径） ---------- */
function registerBrace(id: string, label: string, dir: 1 | -1): void {
  registerEngine({
    id, label, fixedEdges: true,
    growthSplit(root, heights) { return growthSplitDirected(root, heights, dir === 1 ? 'right' : 'left'); },
    measure(ctx) { return measureSubtreeHeights(ctx); },
    arrange: logicArrange,
    edgePath: () => '',
    decorEdges(pos) {
      let svg = '';
      for (const t of walkVisibleT()) {
        if (t.collapsed || !t.children.length) continue;
        const a = pos.get(t.id);
        if (!a) continue;
        let minY = Infinity, maxY = -Infinity, innerX = dir === 1 ? Infinity : -Infinity;
        for (const c of t.children) {
          const b = pos.get(c.id);
          if (!b) continue;
          minY = Math.min(minY, b.y - b.h / 2);
          maxY = Math.max(maxY, b.y + b.h / 2);
          innerX = dir === 1 ? Math.min(innerX, b.x - b.w / 2) : Math.max(innerX, b.x + b.w / 2);
        }
        if (!isFinite(minY)) continue;
        const midY = (minY + maxY) / 2;
        const r = Math.min(18, (maxY - minY) / 4);
        const bx = innerX - dir * 10;
        const brace = dir === 1
          ? `M ${bx} ${minY} Q ${bx - r} ${minY} ${bx - r} ${minY + r} L ${bx - r} ${midY - r} Q ${bx - r} ${midY} ${bx - r * 2} ${midY} Q ${bx - r} ${midY} ${bx - r} ${midY + r} L ${bx - r} ${maxY - r} Q ${bx - r} ${maxY} ${bx} ${maxY}`
          : `M ${bx} ${minY} Q ${bx + r} ${minY} ${bx + r} ${minY + r} L ${bx + r} ${midY - r} Q ${bx + r} ${midY} ${bx + r * 2} ${midY} Q ${bx + r} ${midY} ${bx + r} ${midY + r} L ${bx + r} ${maxY - r} Q ${bx + r} ${maxY} ${bx} ${maxY}`;
        svg += `<path d="${brace}" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-opacity=".6" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;
        // 括号尖端连父主题 + 各子主题水平引线
        const tipX = bx - dir * r * 2;
        svg += `<path d="M ${dir === 1 ? a.x + a.w / 2 : a.x - a.w / 2} ${midY} L ${tipX} ${midY}" fill="none" stroke="var(--ink-soft)" stroke-width="1.6" stroke-opacity=".5" vector-effect="non-scaling-stroke"/>`;
        for (const c of t.children) {
          const b = pos.get(c.id);
          if (!b) continue;
          const cx = dir === 1 ? b.x - b.w / 2 : b.x + b.w / 2;
          svg += `<path d="M ${bx} ${b.y} L ${cx} ${b.y}" fill="none" stroke="var(--ink-soft)" stroke-width="1.6" stroke-opacity=".5" vector-effect="non-scaling-stroke"/>`;
        }
      }
      return svg;
    },
    chevronAt(_topic, p) { return { x: p.x + dir * (p.w / 2 + 14), y: p.y }; }
  });
}
registerBrace('brace-right', '括号图 · 向右', 1);
registerBrace('brace-left', '括号图 · 向左', -1);

/* ---------- 引擎 8：表格系家族（树表格 / 矩阵 / 电子表格）
 * 数据模型即主题树（Xmind 同构：spreadsheet/treetable/grid 在 content.json
 * 里都是 children 嵌套，模板实测）。布局输出行列对齐的 Box 网格，
 * 表格线走 decorEdges（与鱼骨脊骨/时间轴轴线同一机制）。 ---------- */
const TBL_PAD_X = 12, TBL_PAD_Y = 7, TBL_GAP = 0;
const TBL_LINE = (x1: number, y1: number, x2: number, y2: number, strong = false): string =>
  `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="var(--hairline)" stroke-width="${strong ? 1.6 : 1}" stroke-opacity="${strong ? 0.9 : 0.55}" vector-effect="non-scaling-stroke"/>`;

// —— 树表格（行组 = 一级分支，子孙按深度缩进；treetable / treetable.toptitle） ——
let _ttGeom: { w: number; rowTops: number[]; rowBots: number[]; depth1Rows: Set<number>; titleY: number | null } | null = null;
function registerTreeTable(id: string, label: string, topTitle: boolean): void {
  registerEngine({
    id, label, fixedEdges: true,
    growthSplit: () => null,
    measure(ctx) { return measureSubtreeHeights(ctx); },
    arrange(ctx) {
      const pos = new Map<string, Box>();
      const size = (t: Topic) => ctx.sizeOf(t);
      const rows: { t: Topic; depth: number }[] = [];
      const rec = (t: Topic, d: number) => { rows.push({ t, depth: d }); if (t.collapsed) return; t.children.forEach(c => rec(c, d + 1)); };
      sheet.root.children.forEach(c => rec(c, 1));

      // 列宽（按深度）
      const colW = new Map<number, number>();
      for (const r of rows) colW.set(r.depth, Math.max(colW.get(r.depth) ?? 0, size(r.t).w));
      const depths = [...colW.keys()].sort((a, b) => a - b);
      const colXOf = new Map<number, number>();
      let x = 0;
      for (const d of depths) { colXOf.set(d, x); x += (colW.get(d) ?? 0) + TBL_PAD_X * 2; }
      const tableW = Math.max(x, size(sheet.root).w + TBL_PAD_X * 4);

      // 根：顶标题行（toptitle 居中 + 分隔线；普通版左对齐）
      const rs = size(sheet.root);
      const rootY = -(rs.h / 2 + TBL_PAD_Y + 16);
      pos.set(sheet.root.id, {
        x: topTitle ? tableW / 2 : TBL_PAD_X + rs.w / 2,
        y: rootY, w: rs.w, h: rs.h, side: 'root'
      });

      // 行
      const rowTops: number[] = [], rowBots: number[] = [];
      const depth1Rows = new Set<number>();
      let y = 0;
      rows.forEach((r, i) => {
        const h = size(r.t).h + TBL_PAD_Y * 2;
        rowTops.push(y); rowBots.push(y + h);
        if (r.depth === 1) depth1Rows.add(i);
        pos.set(r.t.id, {
          x: (colXOf.get(r.depth) ?? 0) + TBL_PAD_X + size(r.t).w / 2,
          y: y + TBL_PAD_Y + size(r.t).h / 2,
          w: size(r.t).w, h: size(r.t).h, side: 'table'
        });
        y += h;
      });
      _ttGeom = { w: tableW, rowTops, rowBots, depth1Rows, titleY: topTitle ? rootY + rs.h / 2 + 8 : null };
      return pos;
    },
    edgePath: () => '',
    decorEdges() {
      const g = _ttGeom;
      if (!g) return '';
      let svg = '';
      if (g.titleY !== null) svg += TBL_LINE(0, g.titleY, g.w, g.titleY, true) + '\n';
      g.rowTops.forEach((_, i) => {
        svg += TBL_LINE(0, g.rowBots[i]!, g.w, g.rowBots[i]!, g.depth1Rows.has(i)) + '\n';
      });
      svg += TBL_LINE(0, 0, 0, g.rowBots[g.rowBots.length - 1] ?? 0, true) + '\n';          // 左缘
      svg += TBL_LINE(g.w, 0, g.w, g.rowBots[g.rowBots.length - 1] ?? 0, true) + '\n';      // 右缘
      return svg;
    },
    chevronAt(_topic, p) { return { x: p.x + p.w / 2 + 14, y: p.y }; }
  });
}
registerTreeTable('treetable', '树表格', false);
registerTreeTable('treetable-toptitle', '树表格 · 顶标题', true);

// —— 矩阵 / 电子表格（列头 = 一级分支；行按序号跨列对齐；单元格内子孙堆叠；
//    grid 带斑马行，spreadsheet 素网格，spreadsheet-column 转置（行头在左） —— */
interface GridGeom { cols: number[]; rows: number[]; headerSpan: number; tableW: number; tableH: number; zebra: boolean; transpose: boolean }
let _gtGeom: GridGeom | null = null;

function registerGridTable(id: string, label: string, opts: { zebra?: boolean; transpose?: boolean }): void {
  registerEngine({
    id, label, fixedEdges: true,
    growthSplit: () => null,
    measure(ctx) { return measureSubtreeHeights(ctx); },
    arrange(ctx) {
      const pos = new Map<string, Box>();
      const size = (t: Topic) => ctx.sizeOf(t);
      const headers = sheet.root.children;
      const rs = size(sheet.root);

      const placeStack = (t: Topic, cx: number, yTop: number, hs: Map<string, number>): void => {
        const s = size(t);
        pos.set(t.id, { x: cx, y: yTop + s.h / 2, w: s.w, h: s.h, side: 'table' });
        if (t.collapsed || !t.children.length) return;
        let cur = yTop + s.h + ctx.gapV * 0.6;
        for (const c of t.children) {
          const ch = hs.get(c.id) ?? size(c).h;
          placeStack(c, cx + 24, cur, hs);
          void ch; cur += ch + ctx.gapV * 0.6;
        }
      };
      const stackH = (t: Topic): number => measureSubtreeHeights(ctx, t).get(t.id) ?? size(t).h;
      const stackW = (t: Topic): number => {
        const s = size(t);
        if (t.collapsed || !t.children.length) return s.w;
        return s.w + 24 + Math.max(...t.children.map(stackW));
      };

      const tableHOf = (hs: number[]) => hs.reduce((a, b) => a + b, 0);

      if (!opts.transpose) {
        // 列头在顶：列 = headers，单元格 = 其 children 按序号跨列对齐
        const headerH = Math.max(rs.h, ...headers.map(h => size(h).h), 20) + TBL_PAD_Y * 2;
        const colWs = headers.map(h => Math.max(size(h).w, ...(h.collapsed ? [] : h.children.map(stackW))) + TBL_PAD_X * 2);
        const cellCount = Math.max(0, ...headers.map(h => (h.collapsed ? 0 : h.children.length)));
        const rowHs: number[] = [];
        for (let k = 0; k < cellCount; k++) {
          rowHs.push(Math.max(...headers.map(h => {
            const c = !h.collapsed ? h.children[k] : undefined;
            return c ? stackH(c) + TBL_PAD_Y * 2 : 0;
          }), 24));
        }
        const tableW = tableHOf(colWs);
        pos.set(sheet.root.id, { x: tableW / 2, y: -(rs.h / 2 + TBL_PAD_Y + 16), w: rs.w, h: rs.h, side: 'root' });
        const colXs: number[] = []; let x = 0;
        headers.forEach((h, ci) => {
          colXs.push(x);
          const hs2 = size(h);
          pos.set(h.id, { x: x + colWs[ci]! / 2, y: TBL_PAD_Y + hs2.h / 2, w: hs2.w, h: hs2.h, side: 'table' });
          if (!h.collapsed) h.children.forEach((c, k) => {
            const hsMap = measureSubtreeHeights(ctx, c);
            placeStack(c, x + colWs[ci]! / 2, headerH + rowHs.slice(0, k).reduce((a, b) => a + b, 0) + TBL_PAD_Y, hsMap);
          });
          x += colWs[ci]!;
        });
        const tableH = headerH + tableHOf(rowHs);
        _gtGeom = { cols: colXs, rows: [headerH, ...scan(rowHs, headerH)], headerSpan: headerH, tableW, tableH, zebra: !!opts.zebra, transpose: false };
      } else {
        // 转置：行头在左（headers 纵排），单元格横向展开
        const headerW = Math.max(rs.h, ...headers.map(h => size(h).w)) + TBL_PAD_X * 2;
        const rowHs = headers.map(h => Math.max(size(h).h, ...(h.collapsed ? [] : h.children.map(stackH))) + TBL_PAD_Y * 2);
        const cellCount = Math.max(0, ...headers.map(h => (h.collapsed ? 0 : h.children.length)));
        const colWs: number[] = [];
        for (let k = 0; k < cellCount; k++) {
          colWs.push(Math.max(...headers.map(h => {
            const c = !h.collapsed ? h.children[k] : undefined;
            return c ? stackW(c) + TBL_PAD_X * 2 : 0;
          }), 60));
        }
        const tableH = tableHOf(rowHs);
        const tableW = headerW + tableHOf(colWs);
        pos.set(sheet.root.id, { x: tableW / 2, y: -(rs.h / 2 + TBL_PAD_Y + 16), w: rs.w, h: rs.h, side: 'root' });
        const rowYs: number[] = []; let y2 = 0;
        headers.forEach((h, ri) => {
          rowYs.push(y2);
          const hs2 = size(h);
          pos.set(h.id, { x: headerW / 2, y: y2 + rowHs[ri]! / 2, w: hs2.w, h: hs2.h, side: 'table' });
          if (!h.collapsed) h.children.forEach((c, k) => {
            const hsMap = measureSubtreeHeights(ctx, c);
            placeStack(c, headerW + colWs.slice(0, k).reduce((a, b) => a + b, 0) + colWs[k]! / 2, y2 + TBL_PAD_Y, hsMap);
          });
          y2 += rowHs[ri]!;
        });
        _gtGeom = { cols: [0, ...scan(colWs, headerW)], rows: rowYs, headerSpan: headerW, tableW, tableH, zebra: !!opts.zebra, transpose: true };
      }
      return pos;
    },
    edgePath: () => '',
    decorEdges() {
      const g = _gtGeom;
      if (!g) return '';
      let svg = '';
      const cross = (a: number[]) => { const out: number[] = []; let acc = 0; for (const v of a) { out.push(acc + v); acc += v; } return out; };
      if (!g.transpose) {
        // 竖线：列边界；横线：表头底 + 行边界；表头底纹；斑马行
        const rowHs = g.rows; // [headerSpan, cum...]
        void rowHs; void cross;
        svg += `<rect x="0" y="0" width="${g.tableW.toFixed(1)}" height="${g.headerSpan.toFixed(1)}" fill="var(--paper-deep)" fill-opacity=".55"/>\n`;
        if (g.zebra) {
          let y = g.headerSpan;
          let odd = true;
          for (let i = 1; i < g.rows.length; i++) {
            const h = g.rows[i]! - g.rows[i - 1]!;
            if (odd) svg += `<rect x="0" y="${y.toFixed(1)}" width="${g.tableW.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--paper-deep)" fill-opacity=".35"/>\n`;
            y = g.rows[i]!; odd = !odd;
          }
        }
        for (const cx of g.cols) svg += TBL_LINE(cx, 0, cx, g.tableH, true) + '\n';
        svg += TBL_LINE(g.tableW, 0, g.tableW, g.tableH, true) + '\n';
        svg += TBL_LINE(0, 0, g.tableW, 0, true) + '\n';
        for (const ry of g.rows) svg += TBL_LINE(0, ry, g.tableW, ry) + '\n';
        svg += TBL_LINE(0, g.tableH, g.tableW, g.tableH, true) + '\n';
      } else {
        svg += `<rect x="0" y="0" width="${g.headerSpan.toFixed(1)}" height="${g.tableH.toFixed(1)}" fill="var(--paper-deep)" fill-opacity=".55"/>\n`;
        for (const cy of g.rows) svg += TBL_LINE(0, cy, g.tableW, cy, true) + '\n';
        svg += TBL_LINE(0, g.tableH, g.tableW, g.tableH, true) + '\n';
        for (const cx of g.cols) svg += TBL_LINE(cx, 0, cx, g.tableH, true) + '\n';
        svg += TBL_LINE(g.tableW, 0, g.tableW, g.tableH, true) + '\n';
      }
      return svg;
    },
    chevronAt(_topic, p) { return { x: p.x + p.w / 2 + 14, y: p.y }; }
  });
}
// rows 边界辅助：行高数组 → 累计边界（含表头偏移可选）
function scan(hs: number[], offset = 0): number[] {
  const out: number[] = []; let acc = offset;
  for (const h of hs) out.push((acc += h) - h);
  return out;
}
registerGridTable('spreadsheet', '电子表格', {});
registerGridTable('spreadsheet-column', '电子表格 · 行头', { transpose: true });
registerGridTable('grid', '矩阵', { zebra: true });

/* walkVisible 的引擎侧引用（brace 遍历用） */
import { walkVisible as walkVisibleT } from './model';

export const engine = (): StructureEngine => StructureEngines[sheet.structureClass] ?? StructureEngines['logic-chart']!;

/* ---------- 共享：子树高度测量（注入式测量，对应 Xmind 的 measureText 注入） ---------- */
export function measureSubtreeHeights(ctx: MeasureCtx, root: Topic = sheet.root): Map<string, number> {
  const heights = new Map<string, number>();
  const rec = (t: Topic): void => {
    const h = ctx.sizeOf(t).h;
    if (t.collapsed || !t.children.length) { heights.set(t.id, h); return; }
    let sum = 0;
    for (const c of t.children) { rec(c); sum += heights.get(c.id) ?? 0; }
    heights.set(t.id, Math.max(h, sum + ctx.gapV * (t.children.length - 1)));
  };
  rec(root);
  return heights;
}

/** 自由主题子树布局：以 root 为子根、origin 为其中心，单侧（向右）生长。
 *  Xmind 自由主题默认以 logic 结构在自身位置展开子树（模板实测 detached 主题带独立 structureClass）。 */
export function placeDetachedSubtree(ctx: MeasureCtx, root: Topic, origin: { x: number; y: number }): Map<string, Box> {
  const heights = measureSubtreeHeights(ctx, root);
  const pos = new Map<string, Box>();
  const place = (topic: Topic, cx: number, cy: number): void => {
    const w = ctx.sizeOf(topic).w, h = ctx.sizeOf(topic).h;
    pos.set(topic.id, { x: cx, y: cy, w, h, side: 'right' });
    if (topic.collapsed) return;
    const kids = topic.children;
    const totalH = kids.reduce((a, k) => a + (heights.get(k.id) ?? 0), 0) + ctx.gapV * Math.max(0, kids.length - 1);
    let cur = cy - totalH / 2;
    for (const k of kids) {
      const kh = heights.get(k.id) ?? 0;
      const ky = cur + kh / 2;
      cur += kh + ctx.gapV;
      const kw = ctx.sizeOf(k).w;
      place(k, cx + w / 2 + ctx.gapH + kw / 2, ky);
    }
  };
  place(root, origin.x, origin.y);
  return pos;
}
