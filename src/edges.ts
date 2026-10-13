import type { Box } from './engines';
import { metaOf, sheet, type LineClass, type ShapeKind, type Topic, type TopicStyle } from './model';

/* =====================================================================
 * 分支连线形状（对应 Xmind branchConnection.line-class）
 *   curve / straight / elbow / fold / bight / brace
 *   生成器接收父/子 Box（含实时位置），返回 SVG path d 属性
 * ===================================================================== */
export type EdgePathGen = (a: Box, b: Box) => string;

/** 从父右缘到子左缘的通用水平方向连接（side=right 时 dir=1，side=left 时 dir=-1） */
function horizDir(a: Box, b: Box): number { return b.x >= a.x ? 1 : -1; }

/** 垂直方向（org-chart 等向下引擎） */
function isVertical(a: Box, b: Box): boolean { return Math.abs(b.x - a.x) < 2; }

const gen: Record<string, EdgePathGen> = {
  /* 贝塞尔曲线（默认，对应 Xmind roundedElbow/curve） */
  curve: (a, b) => {
    if (isVertical(a, b)) {
      const y1 = a.y + a.h / 2, y2 = b.y - b.h / 2;
      const midY = (y1 + y2) / 2;
      return `M ${a.x} ${y1} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${y2}`;
    }
    const dir = horizDir(a, b);
    const x1 = a.x + dir * a.w / 2, y1 = a.y;
    const x2 = b.x - dir * b.w / 2, y2 = b.y;
    const dx = (x2 - x1) * 0.45;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  },

  /* 直线 */
  straight: (a, b) => {
    if (isVertical(a, b)) {
      return `M ${a.x} ${a.y + a.h / 2} L ${b.x} ${b.y - b.h / 2}`;
    }
    const dir = horizDir(a, b);
    return `M ${a.x + dir * a.w / 2} ${a.y} L ${b.x - dir * b.w / 2} ${b.y}`;
  },

  /* 直角折线：水平 → 垂直 → 水平（三段） */
  roundedElbow: (a, b) => {
    if (isVertical(a, b)) {
      const y1 = a.y + a.h / 2, y2 = b.y - b.h / 2;
      const midY = (y1 + y2) / 2;
      const r = Math.min(12, Math.abs(y2 - y1) / 4);
      return `M ${a.x} ${y1} L ${a.x} ${midY - r} Q ${a.x} ${midY} ${a.x + r} ${midY} L ${b.x - r} ${midY} Q ${b.x} ${midY} ${b.x} ${midY + r} L ${b.x} ${y2}`;
    }
    const dir = horizDir(a, b);
    const x1 = a.x + dir * a.w / 2, x2 = b.x - dir * b.w / 2;
    const midX = (x1 + x2) / 2;
    const r = Math.min(14, Math.abs(x2 - x1) / 5, Math.abs(b.y - a.y) / 3);
    return `M ${x1} ${a.y} L ${midX - dir * r} ${a.y} Q ${midX} ${a.y} ${midX} ${a.y + (b.y > a.y ? r : -r)} L ${midX} ${b.y + (b.y > a.y ? -r : r)} Q ${midX} ${b.y} ${midX + dir * r} ${b.y} L ${x2} ${b.y}`;
  },

  elbow: (a, b) => {
    if (isVertical(a, b)) {
      return `M ${a.x} ${a.y + a.h / 2} L ${a.x} ${b.y} L ${b.x} ${b.y} L ${b.x} ${b.y - b.h / 2}`;
    }
    const dir = horizDir(a, b);
    const x1 = a.x + dir * a.w / 2;
    const x2 = b.x - dir * b.w / 2;
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${x2} ${b.y}`;
  },

  /* 锐角折线：从父到中点再到子（两段） */
  roundedfold: (a, b) => {
    if (isVertical(a, b)) {
      const y1 = a.y + a.h / 2, y2 = b.y - b.h / 2;
      const midY = (y1 + y2) / 2;
      return `M ${a.x} ${y1} Q ${a.x} ${midY} ${(a.x + b.x) / 2} ${midY} Q ${b.x} ${midY} ${b.x} ${y2}`;
    }
    const dir = horizDir(a, b);
    const x1 = a.x + dir * a.w / 2, y1 = a.y;
    const x2 = b.x - dir * b.w / 2, y2 = b.y;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return `M ${x1} ${y1} Q ${mx} ${y1} ${mx} ${my} Q ${mx} ${my} ${x2} ${y2}`;
  },

  fold: (a, b) => {
    if (isVertical(a, b)) {
      return `M ${a.x} ${a.y + a.h / 2} L ${(a.x + b.x) / 2} ${(a.y + b.y) / 2} L ${b.x} ${b.y - b.h / 2}`;
    }
    const dir = horizDir(a, b);
    const x1 = a.x + dir * a.w / 2, y1 = a.y;
    const x2 = b.x - dir * b.w / 2, y2 = b.y;
    return `M ${x1} ${y1} L ${(x1 + x2) / 2} ${(y1 + y2) / 2} L ${x2} ${y2}`;
  },

  /* S 形曲线（bight：双弧） */
  bight: (a, b) => {
    if (isVertical(a, b)) {
      const y1 = a.y + a.h / 2, y2 = b.y - b.h / 2;
      const midY = (y1 + y2) / 2;
      const off = Math.min(30, Math.abs(y2 - y1) * 0.2);
      return `M ${a.x} ${y1} C ${a.x + off} ${midY}, ${b.x - off} ${midY}, ${b.x} ${y2}`;
    }
    const dir = horizDir(a, b);
    const x1 = a.x + dir * a.w / 2, y1 = a.y;
    const x2 = b.x - dir * b.w / 2, y2 = b.y;
    const midX = (x1 + x2) / 2;
    const off = Math.min(25, Math.abs(y2 - y1) * 0.3);
    return `M ${x1} ${y1} C ${midX - dir * off} ${y1}, ${midX + dir * off} ${y2}, ${x2} ${y2}`;
  },

  /* 花括号（brace：弧线到弧线） */
  brace: (a, b) => {
    if (isVertical(a, b)) {
      const y1 = a.y + a.h / 2, y2 = b.y - b.h / 2;
      const midY = (y1 + y2) / 2;
      return `M ${a.x} ${y1} C ${a.x} ${midY - 10}, ${b.x} ${midY + 10}, ${b.x} ${y2}`;
    }
    const dir = horizDir(a, b);
    const x1 = a.x + dir * a.w / 2, y1 = a.y;
    const x2 = b.x - dir * b.w / 2, y2 = b.y;
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${x1 + dir * 12} ${y1 + (y2 > y1 ? 8 : -8)}, ${midX} ${midY(y1, y2)}, ${x2} ${y2}`;
  }
};

function midY(y1: number, y2: number): number { return (y1 + y2) / 2; }

/** 按连线类获取边路径（入口；lineClass 为空则回退到引擎默认 curve） */
export function edgePathFor(lineClass: string | undefined, a: Box, b: Box): string {
  return (gen[lineClass ?? 'curve'] ?? gen.curve!)(a, b);
}

/* =====================================================================
 * 主题预设（对应 Xmind theme：按角色层定义默认样式）
 * ===================================================================== */
export interface ThemeRoleDefaults {
  shape?: string;
  fill?: string;
  text?: string;
  lineClass?: string;
}
export interface ThemePreset {
  id: string;
  label: string;
  branchHues?: string[];                        // 覆盖默认六支功能色（CSS 变量名）
  branchColors?: string[];                      // 移植主题的六支功能色（hex，写 --b1..--b6）
  paper?: string;                               // 画布底色
  ink?: string;
  roles: {                                      // 按深度角色提供默认
    root: ThemeRoleDefaults;
    level1: ThemeRoleDefaults;
    deeper: ThemeRoleDefaults;
  };
}

import { PORTED_PRESETS, customThemes } from './theme-presets';

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'classic', label: '经典',
    branchHues: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'],
    roles: {
      root: { shape: 'roundedRect' },
      level1: { shape: 'roundedRect', lineClass: 'curve' },
      deeper: { shape: 'roundedRect', lineClass: 'curve' }
    }
  },
  {
    id: 'business', label: '商务',
    branchHues: ['b5', 'b4', 'b5', 'b4', 'b5', 'b4'],
    paper: '#F0F3F8',
    ink: '#1A2030',
    roles: {
      root: { shape: 'rect', fill: '#1A2030' },
      level1: { shape: 'rect', lineClass: 'elbow' },
      deeper: { shape: 'rect', lineClass: 'elbow' }
    }
  },
  {
    id: 'sketch', label: '手绘',
    branchHues: ['b1', 'b3', 'b2', 'b6', 'b3', 'b1'],
    paper: '#FAF6EE',
    ink: '#2D2822',
    roles: {
      root: { shape: 'ellipse', fill: '#F4D607' },
      level1: { shape: 'underline', lineClass: 'bight' },
      deeper: { shape: 'underline', lineClass: 'bight' }
    }
  },
  {
    id: 'neon', label: '霓虹',
    branchHues: ['b4', 'b6', 'b4', 'b6', 'b4', 'b6'],
    paper: '#1E1B2E',
    ink: '#E8E4F0',
    roles: {
      root: { shape: 'ellipse', fill: '#8A5A83', text: '#FFFFFF' },
      level1: { shape: 'roundedRect', lineClass: 'bight' },
      deeper: { shape: 'roundedRect', lineClass: 'bight' }
    }
  }
];

/** 全部可用主题：内置 4 + Xmind 移植 43 + 用户自定义 */
export function allThemes(): ThemePreset[] {
  return [...THEME_PRESETS, ...PORTED_PRESETS, ...customThemes()];
}
export const getTheme = (id: string): ThemePreset => allThemes().find(t => t.id === id) ?? THEME_PRESETS[0]!;

/** 0 中心主题，1 一级分支，其余（含自由主题、标注）用深层角色 */
export function roleForDepth(theme: ThemePreset, depth: number): ThemeRoleDefaults {
  if (depth <= 0) return theme.roles.root;
  if (depth === 1) return theme.roles.level1;
  return theme.roles.deeper;
}

function hexLuminance(hex: string): number | null {
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isLightHex(hex: string | undefined, whenMissing: boolean): boolean {
  if (!hex) return whenMissing;
  const y = hexLuminance(hex);
  if (y === null) return whenMissing;
  return y > 170;
}

function samePaint(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * 旧版本会把主题颜色写进节点并保存。打开图或再换主题时，清掉和任一主题角色完全相同的填充、字色。
 * 和所有主题都不同的值视为手改，保留。
 */
export function releaseStaleThemePaint(root: Topic): void {
  const fills: [Set<string>, Set<string>, Set<string>] = [new Set(), new Set(), new Set()];
  const texts: [Set<string>, Set<string>, Set<string>] = [new Set(), new Set(), new Set()];
  for (const th of allThemes()) {
    const roles = [th.roles.root, th.roles.level1, th.roles.deeper];
    for (let i = 0; i < 3; i++) {
      const fill = roles[i]?.fill;
      const text = roles[i]?.text;
      if (fill) fills[i]!.add(fill.toLowerCase());
      if (text) texts[i]!.add(text.toLowerCase());
    }
  }
  const walk = (t: Topic, depth: number) => {
    const i = depth <= 0 ? 0 : depth === 1 ? 1 : 2;
    const st = t.style;
    if (st.fill && fills[i]!.has(st.fill.toLowerCase())) delete st.fill;
    if (st.text && texts[i]!.has(st.text.toLowerCase())) delete st.text;
    for (const c of t.children) walk(c, depth + 1);
    for (const c of t.detachedKids) walk(c, depth + 1);
    for (const c of t.calloutKids) walk(c, depth + 1);
  };
  walk(root, 0);
}

/** 换主题时删掉「刚好等于旧主题该层角色」的字段。手改过、和角色不同的值留下。 */
export function releaseThemePaint(root: Topic, theme: ThemePreset): void {
  const walk = (t: Topic, depth: number) => {
    const role = roleForDepth(theme, depth);
    const st = t.style;
    if (samePaint(st.shape, role.shape)) delete st.shape;
    if (samePaint(st.fill, role.fill)) delete st.fill;
    if (samePaint(st.text, role.text)) delete st.text;
    if (samePaint(st.lineClass, role.lineClass)) delete st.lineClass;
    for (const c of t.children) walk(c, depth + 1);
    for (const c of t.detachedKids) walk(c, depth + 1);
    for (const c of t.calloutKids) walk(c, depth + 1);
  };
  walk(root, 0);
}

/** 节点自己的样式优先，否则用当前主题里该深度的角色。角色字色和实际底色分不开时丢掉字色，让 CSS 墨色接手。 */
export function effectiveStyle(topic: Topic): TopicStyle {
  const depth = metaOf(topic.id)?.depth ?? 0;
  const theme = getTheme(sheet.themeClass);
  const role = roleForDepth(theme, depth);
  const st = topic.style ?? {};
  const fill = st.fill || role.fill;
  let text = st.text || role.text;
  if (!st.text && text) {
    // 中心主题没填色时，实际底色是 --ink，不是画布纸色
    const bg = fill || (depth <= 0 ? (theme.ink || '#23272F') : (theme.paper || '#F6F4EF'));
    if (isLightHex(text, false) === isLightHex(bg, true)) text = undefined;
  }
  return {
    shape: (st.shape || role.shape) as ShapeKind | undefined,
    fill: fill || undefined,
    text: text || undefined,
    line: st.line,
    lineClass: (st.lineClass || role.lineClass) as LineClass | undefined,
    fontSize: st.fontSize,
    bold: st.bold,
    italic: st.italic,
    align: st.align,
    lineWidth: st.lineWidth,
    border: st.border,
    borderWidth: st.borderWidth
  };
}

/** 应用主题：只改画布上的纸色、墨色和分支色。工具栏和侧边栏沿用页面自己的配色。 */
export function applyTheme(themeId: string): void {
  const theme = getTheme(themeId);
  const canvas = document.getElementById('viewport') ?? document.documentElement;
  if (theme.paper) canvas.style.setProperty('--paper', theme.paper);
  else canvas.style.removeProperty('--paper');
  if (theme.ink) {
    canvas.style.setProperty('--ink', theme.ink);
    canvas.style.setProperty('--ink-soft', `color-mix(in srgb, ${theme.ink} 72%, transparent)`);
  } else {
    canvas.style.removeProperty('--ink');
    canvas.style.removeProperty('--ink-soft');
  }
  for (let i = 1; i <= 6; i++) {
    const v = theme.branchColors?.[i - 1];
    if (v) canvas.style.setProperty(`--b${i}`, v);
    else canvas.style.removeProperty(`--b${i}`);
  }
  // 节点底色只来自该节点自己的填充；不要把一级分支的填充铺到所有节点上
  canvas.style.setProperty('--topic-bg', theme.paper ? 'transparent' : 'white');
}
