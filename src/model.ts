import { uid } from './utils';
import { StructureEngines } from './engines';
import { SHAPES } from './shapes';

/* =====================================================================
 * 一、模型层（对应 Xmind 的 Sheet / Topic / attached 通道）
 * ===================================================================== */
export type Side = 'auto' | 'right' | 'left';

/* ---------- 样式系统（对应 Xmind style.properties，存储结构与其一致） ---------- */
export type ShapeKind = import('./shapes').ShapeKind;
export const SHAPE_CLASS_PREFIX = 'org.xmind.topicShape.';
/** 形状中文名（源自 shapes.ts 注册表，44 种） */
export const SHAPE_LABELS: Record<string, string> =
  Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, v.label]));
/** style → Xmind 真实键（svg:fill 为 Xmind 填充色键） */
export type TextAlign = 'left' | 'center' | 'right';
export interface TopicStyle {
  shape?: ShapeKind;
  fill?: string;
  text?: string;
  line?: string;
  lineClass?: LineClass;
  /** fo:font-size，CSS 像素；读取时接受 pt/px 后缀 */
  fontSize?: number;
  /** fo:font-weight */
  bold?: boolean;
  /** fo:font-style */
  italic?: boolean;
  /** fo:text-align */
  align?: TextAlign;
  /** line-width，作用在与 lineClass 同一条父→子连线上 */
  lineWidth?: number;
  /** border-line-color；不设则保持节点原有描边 */
  border?: string;
  /** border-line-width */
  borderWidth?: number;
}
export type LineClass = 'curve' | 'straight' | 'elbow' | 'fold' | 'bight' | 'brace' | 'roundedElbow' | 'roundedfold';
export const LINE_CLASS_PREFIX = 'org.xmind.branchConnection.';
export const LINE_CLASS_LABELS: Record<LineClass, string> = {
  curve: '曲线', straight: '直线', elbow: '直角折线', fold: '锐角折线', bight: 'S 形', brace: '花括号',
  roundedElbow: '圆角折线', roundedfold: '圆角锐折'
};

/* ---------- 概要（对应 Xmind summaries：挂在父主题，引用子主题索引范围） ----------
 * Xmind 真实 content.json 结构（逆向自 v25.04 官方模板 how_to_take_note_efficiently.xmind）：
 *   父主题 { children: { attached: [...], summary: [{id, title}] },    ← 概要自己的可编辑 topic
 *           summaries: [{id, range: "(0,1)", topicId}] }               ← 包装：字符串元组 + topic 引用 */
export interface TopicSummary {
  id: string;                       // 概要包装 id（summaries[] 条目）
  topicId: string;                  // 概要 topic id（children.summary 条目）
  title: string;                    // 概要标题（存于概要 topic）
  rangeStart: number;               // 父主题 children 的起始索引（含）
  rangeEnd: number;                 // 结束索引（含）
}

/* ---------- 外框（Xmind boundaries[]：range 引用子主题索引范围） ---------- */
export interface BoundaryDef {
  id: string;
  rangeStart: number;
  rangeEnd: number;
  title?: string;
  style?: TopicStyle;
}

export class Topic {
  id: string;
  title: string;
  children: Topic[];      // attached 通道（Xmind: children.attached）
  detachedKids: Topic[] = [];  // 自由主题通道（Xmind: children.detached，position 定位）
  calloutKids: Topic[] = [];   // 边框主题。枝桠 JSON 用 children.calloutTopics；导出 .xmind 时写成 children.callout 数组
  isCallout = false;           // 运行时标记（通道归属，序列化走 calloutTopics 通道）
  collapsed = false;
  side: Side = 'auto';    // auto | right | left（logic 引擎的被动生长方向）
  note = '';              // 节点备注（Xmind: notes.plain.content）
  style: TopicStyle = {}; // 节点样式覆盖（Xmind: style.properties）
  boundary = false;       // 快捷标记：等价于包裹全部子节点的一条外框
  boundaries: BoundaryDef[] = [];
  attributedTitle: { text: string }[] = [];  // Xmind attributedTitle（保留往返）
  noteHtml = '';          // notes.realHTML.content
  customWidth?: number;
  numbering?: { pattern?: string; tiered?: boolean; fixedIndex?: number };
  summaries: TopicSummary[] = [];  // 概要列表（Xmind: summaries，挂在父主题）
  markers: string[] = []; // 标记 id 列表（Xmind: markers[{markerId}]）
  labels: string[] = [];  // 文本标签（Xmind: labels，字符串数组）
  href = '';              // 超链接（Xmind: href；附件为 xap:attachments/ 引用）
  image: { src: string; w: number; h: number; align?: string } | null = null;  // 主题图片。导出 .xmind 时尺寸键为 width/height
  pos: { x: number; y: number } | null = null;  // 自由定位（Xmind: position，自由/标注主题专用）

  constructor(title: string) {
    this.id = uid('t');
    this.title = title;
    this.children = [];
  }
}

/* ---------- 联系（Xmind: sheet.relationships，任意两主题间连线） ----------
 * 真实格式（模板实测）：{id, end1Id, end2Id, title?, controlPoints?, style?} */
export interface Relationship {
  id: string;
  fromId: string;         // end1Id
  toId: string;           // end2Id
  title: string;          // 联系标签（空串 = 无标签）
}

export class Sheet {
  id: string;
  structureClass = 'logic-chart';
  themeClass = 'classic';
  relationships: Relationship[] = [];   // 联系（Xmind: relationships，sheet 级）
  legend: LegendDef | null = null;      // 图例（Xmind: legend{visibility, position}）
  topicOverlapping: 'overlap' | null = null;  // sheet.topicOverlapping
  skeletonStyle: { centralTopic?: string; mainTopic?: string; subTopic?: string; floatingTopic?: string } | null = null;
  root: Topic;

  constructor(rootTitle: string) {
    this.id = uid('s');
    this.root = new Topic(rootTitle);
  }
}

export interface TopicMeta { topic: Topic; parent: Topic | null; depth: number; hue: string | null }

export let sheet: Sheet = new Sheet('中心主题');   // 当前工作表（仅本模块可重绑定）
export let sheets: Sheet[] = [sheet];             // 多画布
export let selectedId: string | null = null;      // 选中主题
let idIndex = new Map<string, TopicMeta>();       // id → meta（每次重算）

export function indexModel(): void {
  idIndex = new Map();
  const hues = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
  (function walk(topic: Topic, parent: Topic | null, depth: number, hue: string | null) {
    idIndex.set(topic.id, { topic, parent, depth, hue });
    if (depth === 0) {
      topic.children.forEach((c, i) => walk(c, topic, 1, hues[i % hues.length]!));
    } else {
      topic.children.forEach(c => walk(c, topic, depth + 1, hue));
    }
    topic.detachedKids.forEach((c, i) => walk(c, topic, depth + 1, hue ?? hues[i % hues.length]!));
    topic.calloutKids.forEach((c, i) => walk(c, topic, depth + 1, hue ?? hues[i % hues.length]!));
  })(sheet.root, null, 0, null);
}

/** 跨模块的安全换表入口（恢复快照/打开文件/新建共用；重置为单画布，多画布由 fromJSON 管理） */
export function applySheet(s: Sheet, keepSelected?: string | null): void {
  sheet = s;
  sheets.length = 0;
  sheets.push(s);
  indexModel();
  selectedId = keepSelected && topicOf(keepSelected) ? keepSelected : sheet.root.id;
}

/** 多画布：切换到指定 sheet */
export function switchSheet(id: string): void {
  const s = sheets.find(x => x.id === id);
  if (s) { sheet = s; indexModel(); selectedId = sheet.root.id; }
}
/** 多画布：新增 */
export function addSheet(title: string = '新画布'): Sheet {
  const s = new Sheet(title);
  sheets.push(s);
  return s;
}
/** 多画布：删除（至少保留一张） */
export function removeSheet(id: string): boolean {
  if (sheets.length <= 1) return false;
  const i = sheets.findIndex(x => x.id === id);
  if (i < 0) return false;
  sheets.splice(i, 1);
  if (sheet.id === id) { sheet = sheets[0]!; indexModel(); selectedId = sheet.root.id; }
  return true;
}

/** 全量主题遍历（含折叠与全部通道） */
export function walkAllTopics(root: Topic = sheet.root): Topic[] {
  const out: Topic[] = [];
  (function rec(t: Topic) {
    out.push(t);
    t.children.forEach(rec); t.detachedKids.forEach(rec); t.calloutKids.forEach(rec);
  })(root);
  return out;
}

/** 可见树遍历（跳过折叠子树） */
export function* walkVisible(topic: Topic = sheet.root): Generator<Topic> {
  yield topic;
  if (topic.collapsed) return;
  for (const c of topic.children) yield* walkVisible(c);
  for (const c of topic.detachedKids) yield* walkVisible(c);
  for (const c of topic.calloutKids) yield* walkVisible(c);
}

export const parentOf = (id: string): Topic | null => idIndex.get(id)?.parent ?? null;
export const topicOf = (id: string | null | undefined): Topic | null =>
  id ? (idIndex.get(id)?.topic ?? null) : null;
export const metaOf = (id: string): TopicMeta | undefined => idIndex.get(id);
export function setSelected(id: string): void { selectedId = id; }
export function subtreeCount(topic: Topic): number {
  let n = 1;
  for (const c of topic.children) n += subtreeCount(c);
  for (const c of topic.detachedKids) n += subtreeCount(c);
  for (const c of topic.calloutKids) n += subtreeCount(c);
  return n;
}

/** 早期种子标题，打开旧图时改回「枝桠」，避免界面上再出现「自制思维导图」。 */
const LEGACY_TITLES = new Set(['枝桠 · 自制思维导图', '枝桠 Zhiya · 自制思维导图']);
export function renameLegacyTitles(root: Topic): void {
  const walk = (t: Topic) => {
    if (LEGACY_TITLES.has(t.title)) t.title = '枝桠';
    t.children.forEach(walk);
    t.detachedKids.forEach(walk);
    t.calloutKids.forEach(walk);
  };
  walk(root);
}

/** 子主题所在通道（attached / detached / callout）；不在任一通道则 null */
export function siblingChannel(parent: Topic, child: Topic): Topic[] | null {
  if (parent.detachedKids.includes(child)) return parent.detachedKids;
  if (parent.calloutKids.includes(child)) return parent.calloutKids;
  if (parent.children.includes(child)) return parent.children;
  return null;
}

/** 从父主题的 attached/detached/callout 通道中移除子主题。找不到则不动（避免 splice(-1) 误删最后一个）。 */
export function removeChildFromParent(parent: Topic, child: Topic): void {
  const channel = siblingChannel(parent, child);
  if (!channel) return;
  const i = channel.indexOf(child);
  if (i >= 0) channel.splice(i, 1);
}

/** 收集某主题整棵子树的全部 id（删除时清理联系引用用） */
export function subtreeIds(topic: Topic): Set<string> {
  const ids = new Set<string>();
  (function rec(t: Topic) {
    ids.add(t.id);
    t.children.forEach(rec);
    t.detachedKids.forEach(rec);
    t.calloutKids.forEach(rec);
  })(topic);
  return ids;
}

/* ---------- 序列化：直接采用 .xmind content.json 的形态 ---------- */
export interface SummaryJSON {
  id?: string;
  /** Xmind 真实格式：字符串元组 "(start,end)" */
  range?: string;
  topicId?: string;
  /** 旧版枝桠格式（向后兼容读取） */
  title?: string; 'range-start'?: number; 'range-end'?: number;
  rangeStart?: number; rangeEnd?: number;
}
export interface TopicJSON {
  id?: string;
  title?: string;
  children?: {
    attached?: TopicJSON[]; detached?: TopicJSON[];
    calloutTopics?: TopicJSON[]; callout?: TopicJSON | TopicJSON[];
    summary?: TopicJSON[];
  };
  note?: string;
  style?: { properties?: Record<string, string> };
  boundary?: boolean;
  boundaries?: (SummaryJSON & { style?: { properties?: Record<string, string> } })[];
  attributedTitle?: { text?: string }[];
  customWidth?: number;
  notes?: { plain?: { content?: string }; realHTML?: { content?: string } };
  summaries?: SummaryJSON[];
  markers?: { markerId?: string }[];
  labels?: string[];
  href?: string;
  image?: { src?: string; w?: number; h?: number; width?: number; height?: number; align?: string };
  position?: { x?: number; y?: number };
  class?: string;
  branch?: string;
  structureClass?: string;
  /** 枝桠内部是对象；Xmind 真机要求数组（provider + content），空对象会让打开失败 */
  extensions?: { collapsed?: boolean; side?: string } | TopicExtensionJSON[];
}
export interface TopicExtensionJSON {
  provider?: string;
  content?: Record<string, unknown>;
}
export interface RelationshipJSON { id?: string; end1Id?: string; end2Id?: string; title?: string }
/** 图例（真实键 visibility/position 已从模板确认；markers 为含义映射） */
export interface LegendJSON { visibility?: string; position?: { x?: number; y?: number }; markers?: Record<string, string> }
export interface SheetJSON {
  id?: string; class?: string; title?: string;
  structureClass?: string; themeClass?: string; topicPositioning?: string;
  topicOverlapping?: string;
  extensions?: TopicExtensionJSON[];
  rootTopic?: TopicJSON; relationships?: RelationshipJSON[]; legend?: LegendJSON;
}

export interface LegendDef { visibility: 'visible' | 'hidden'; position: { x: number; y: number }; meanings: Record<string, string> }
export interface ZhiyaJSON { sheets?: SheetJSON[] }

/* ---------- 结构类映射：枝桠内部 id ↔ Xmind structureClass 全名 ----------
 * 导出写全类名（Xmind 真机直接识别结构与成长方向）；
 * 导入规范化：全类名（含近亲变体，如逻辑图 logic.right → 单侧思维导图）→ 内部 id。
 * 证据：官方模板 content.json 实测（logic.right / fishbone.leftHeaded / org-chart.down /
 *       timeline.horizontal / map.clockwise），4654.js 枚举（logic-chart[.right/.left]）。 */
export const XMIND_STRUCTURE_OF: Record<string, string> = {
  'logic-chart': 'org.xmind.ui.logic-chart',
  'logic-right': 'org.xmind.ui.logic.right',
  'logic-left': 'org.xmind.ui.logic.left',
  'org-chart': 'org.xmind.ui.org-chart.down',
  'org-chart-up': 'org.xmind.ui.org-chart.up',
  'fishbone': 'org.xmind.ui.fishbone.leftHeaded',
  'fishbone-right': 'org.xmind.ui.fishbone.rightHeaded',
  'timeline': 'org.xmind.ui.timeline.horizontal',
  'timeline-vertical': 'org.xmind.ui.timeline.vertical',
  'timeline-rtl': 'org.xmind.ui.timeline.horizontal.rtl',
  'timeline-sided': 'org.xmind.ui.timeline.sided.horizontal',
  'timeline-sided-rtl': 'org.xmind.ui.timeline.sided.horizontal.rtl',
  'timeline-vertical-btt': 'org.xmind.ui.timeline.vertical.btt',
  'timeline-through': 'org.xmind.ui.timeline.through.vertical',
  'timeline-through-btt': 'org.xmind.ui.timeline.through.vertical.btt',
  'map-unbalanced': 'org.xmind.ui.map.unbalanced',
  'map-clockwise': 'org.xmind.ui.map.clockwise',
  'map-anticlockwise': 'org.xmind.ui.map.anticlockwise',
  'map': 'org.xmind.ui.map',
  'tree-right': 'org.xmind.ui.tree.right',
  'tree-left': 'org.xmind.ui.tree.left',
  'brace-right': 'org.xmind.ui.brace.right',
  'brace-left': 'org.xmind.ui.brace.left',
  'treetable': 'org.xmind.ui.treetable',
  'treetable-toptitle': 'org.xmind.ui.treetable.toptitle',
  'spreadsheet': 'org.xmind.ui.spreadsheet',
  'spreadsheet-column': 'org.xmind.ui.spreadsheet.column',
  'grid': 'org.xmind.ui.grid'
};
export function normalizeStructureClass(sc: string | undefined): string | undefined {
  if (!sc) return undefined;
  if (StructureEngines[sc]) return sc;
  const XMIND_TO_INTERNAL: Record<string, string> = {
    'org.xmind.ui.logic-chart': 'logic-chart',
    'org.xmind.ui.logic-chart.right': 'logic-right',
    'org.xmind.ui.logic-chart.left': 'logic-left',
    'org.xmind.ui.logic.right': 'logic-right',
    'org.xmind.ui.logic.left': 'logic-left',
    'org.xmind.ui.org-chart.down': 'org-chart',
    'org.xmind.ui.fishbone.leftHeaded': 'fishbone',
    'org.xmind.ui.timeline.horizontal': 'timeline',
    'org.xmind.ui.timeline.horizontal.rtl': 'timeline-rtl',
    'org.xmind.ui.timeline.sided.horizontal': 'timeline-sided',
    'org.xmind.ui.timeline.sided.horizontal.rtl': 'timeline-sided-rtl',
    'org.xmind.ui.org-chart.up': 'org-chart-up',
    'org.xmind.ui.fishbone.rightHeaded': 'fishbone-right',
    'org.xmind.ui.timeline.vertical': 'timeline-vertical',
    'org.xmind.ui.timeline.vertical.btt': 'timeline-vertical-btt',
    'org.xmind.ui.timeline.through.vertical': 'timeline-through',
    'org.xmind.ui.timeline.through.vertical.btt': 'timeline-through-btt',
    'org.xmind.ui.map': 'map-unbalanced',
    'org.xmind.ui.map.unbalanced': 'map-unbalanced',
    'org.xmind.ui.map.unbalanced.symmetric': 'map-unbalanced',
    'org.xmind.ui.map.clockwise': 'map-clockwise',
    'org.xmind.ui.map.anticlockwise': 'map-anticlockwise',
    'org.xmind.ui.tree.right': 'tree-right',
    'org.xmind.ui.tree.right.btt': 'tree-right',
    'org.xmind.ui.tree.left': 'tree-left',
    'org.xmind.ui.tree.left.btt': 'tree-left',
    'org.xmind.ui.tree.branch-aligned.right': 'tree-right',
    'org.xmind.ui.tree.branch-aligned.right.btt': 'tree-right',
    'org.xmind.ui.tree.branch-aligned.left': 'tree-left',
    'org.xmind.ui.tree.branch-aligned.left.btt': 'tree-left',
    'org.xmind.ui.timeline.through.symmetric.vertical': 'timeline-through',
    'org.xmind.ui.timeline.through.symmetric.vertical.btt': 'timeline-through-btt',
    'org.xmind.ui.brace.right': 'brace-right',
    'org.xmind.ui.brace.left': 'brace-left',
    'org.xmind.ui.treetable': 'treetable',
    'org.xmind.ui.treetable.toptitle': 'treetable-toptitle',
    'org.xmind.ui.spreadsheet': 'spreadsheet',
    'org.xmind.ui.spreadsheet.column': 'spreadsheet-column',
    'org.xmind.ui.grid': 'grid',
    'org.xmind.ui.grid.brainstorming.root': 'grid'
  };
  return XMIND_TO_INTERNAL[sc];
}

/** 正数样式量。Xmind 常带 pt/px 后缀，缺字段或非法值则忽略。 */
function styleNum(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function hasStyle(st: TopicStyle | undefined): boolean {
  if (!st) return false;
  return !!(st.shape || st.fill || st.text || st.line || st.lineClass
    || st.fontSize || st.bold || st.italic || st.align
    || st.lineWidth || st.border || st.borderWidth);
}

export function styleToProperties(st: TopicStyle): Record<string, string> {
  const p: Record<string, string> = {};
  if (st.shape) p['shape-class'] = SHAPE_CLASS_PREFIX + st.shape;
  if (st.fill) p['svg:fill'] = st.fill;
  if (st.text) p['fo:color'] = st.text;
  if (st.line) p['line-color'] = st.line;
  if (st.lineClass) p['line-class'] = LINE_CLASS_PREFIX + st.lineClass;
  if (st.fontSize) p['fo:font-size'] = String(st.fontSize);
  if (st.bold) p['fo:font-weight'] = '700';
  if (st.italic) p['fo:font-style'] = 'italic';
  if (st.align) p['fo:text-align'] = st.align;
  if (st.lineWidth) p['line-width'] = String(st.lineWidth);
  if (st.border) p['border-line-color'] = st.border;
  if (st.borderWidth) p['border-line-width'] = String(st.borderWidth);
  return p;
}
export function styleFromProperties(p: Record<string, string> | undefined): TopicStyle {
  if (!p) return {};
  const st: TopicStyle = {};
  const shape = p['shape-class']?.startsWith(SHAPE_CLASS_PREFIX)
    ? p['shape-class']!.slice(SHAPE_CLASS_PREFIX.length) : undefined;
  if (shape && shape in SHAPE_LABELS) st.shape = shape as ShapeKind;
  if (p['svg:fill']) st.fill = p['svg:fill'];
  if (p['fo:color'] || p['font-color']) st.text = p['fo:color'] || p['font-color'];
  if (p['line-color']) st.line = p['line-color'];
  const lc = p['line-class']?.startsWith(LINE_CLASS_PREFIX) ? p['line-class']!.slice(LINE_CLASS_PREFIX.length) : undefined;
  if (lc === 'roundedElbow' || lc === 'roundedfold') st.lineClass = lc;
  else if (lc && lc in LINE_CLASS_LABELS) st.lineClass = lc as LineClass;
  const fontSize = styleNum(p['fo:font-size']);
  if (fontSize) st.fontSize = fontSize;
  const weight = (p['fo:font-weight'] ?? '').toLowerCase();
  if (weight === 'bold' || weight === 'bolder' || (Number(weight) >= 600)) st.bold = true;
  const fontStyle = (p['fo:font-style'] ?? '').toLowerCase();
  if (fontStyle === 'italic' || fontStyle === 'oblique') st.italic = true;
  const align = p['fo:text-align'];
  if (align === 'left' || align === 'center' || align === 'right') st.align = align;
  const lineWidth = styleNum(p['line-width']);
  if (lineWidth) st.lineWidth = lineWidth;
  if (p['border-line-color'] && p['border-line-color'] !== 'none') st.border = p['border-line-color'];
  const borderWidth = styleNum(p['border-line-width']);
  if (borderWidth) st.borderWidth = borderWidth;
  return st;
}

function parseRangeField(s: SummaryJSON): { rangeStart: number; rangeEnd: number } {
  let rangeStart = 0, rangeEnd = 0;
  if (typeof s.range === 'string') {
    const m = s.range.match(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (m) { rangeStart = +m[1]!; rangeEnd = +m[2]!; }
  } else {
    rangeStart = s.rangeStart ?? s['range-start'] ?? 0;
    rangeEnd = s.rangeEnd ?? s['range-end'] ?? 0;
  }
  return { rangeStart, rangeEnd };
}

const SKELETON_PROVIDER = 'org.xmind.ui.skeleton.structure.style';
const NUMBERING_PROVIDER = 'org.xmind.ui.numbering';

export function toJSON(): ZhiyaJSON {
  const conv = (t: Topic): TopicJSON => ({
    id: t.id,
    title: t.title,
    children: {
      attached: t.children.map(conv),
      // 自由主题通道（Xmind: children.detached + position + topicPositioning: fixed）
      detached: t.detachedKids.length ? t.detachedKids.map(conv) : undefined,
      // 枝桠自己的 JSON。导出 .xmind 时 shapeXmindTopic 改写成 children.callout
      calloutTopics: t.calloutKids.length ? t.calloutKids.map(conv) : undefined,
      // 概要是 Xmind 的一等 topic：标题存于 children.summary（可编辑节点）
      summary: t.summaries.length ? t.summaries.map(s => ({ id: s.topicId, title: s.title })) : undefined
    },
    markers: t.markers.length ? t.markers.map(m => ({ markerId: m })) : undefined,
    labels: t.labels.length ? t.labels : undefined,
    href: t.href || undefined,
    image: t.image ? { src: t.image.src, w: t.image.w, h: t.image.h, ...(t.image.align ? { align: t.image.align } : {}) } : undefined,
    position: t.pos ?? undefined,
    notes: (t.note || t.noteHtml) ? {
      ...(t.note ? { plain: { content: t.note } } : {}),
      ...(t.noteHtml ? { realHTML: { content: t.noteHtml } } : {})
    } : undefined,
    attributedTitle: t.attributedTitle.length ? t.attributedTitle : undefined,
    customWidth: t.customWidth,
    style: hasStyle(t.style) ? { properties: styleToProperties(t.style) } : undefined,   // Xmind 真实样式结构
    boundary: t.boundary || undefined,
    boundaries: (() => {
      const list = t.boundaries.length ? t.boundaries
        : (t.boundary && t.children.length
          ? [{ id: uid('bd'), rangeStart: 0, rangeEnd: t.children.length - 1, title: undefined, style: undefined }]
          : []);
      return list.length ? list.map(b => ({
        id: b.id,
        range: `(${b.rangeStart},${b.rangeEnd})`,
        ...(b.title ? { title: b.title } : {}),
        ...(hasStyle(b.style) ? { style: { properties: styleToProperties(b.style!) } } : {})
      })) : undefined;
    })(),
    // Xmind 真实概要包装：字符串元组 range + topicId 引用概要 topic
    summaries: t.summaries.length ? t.summaries.map(s => ({
      id: s.id, range: `(${s.rangeStart},${s.rangeEnd})`, topicId: s.topicId
    })) : undefined,
    extensions: (() => {
      const ext: TopicExtensionJSON[] = [];
      if (t.collapsed || t.side !== 'auto') {
        ext.push({ provider: 'zhiya', content: { collapsed: t.collapsed || undefined, side: t.side !== 'auto' ? t.side : undefined } });
      }
      if (t.numbering?.pattern) {
        ext.push({
          provider: NUMBERING_PROVIDER,
          content: {
            pattern: t.numbering.pattern,
            ...(t.numbering.tiered != null ? { tiered: t.numbering.tiered } : {}),
            ...(t.numbering.fixedIndex != null ? { fixedIndex: t.numbering.fixedIndex } : {})
          }
        });
      }
      if (!ext.length) return { collapsed: t.collapsed ? true : undefined, side: t.side !== 'auto' ? t.side : undefined };
      return ext;
    })()
  });
  const hasDetached = sheets.some(sh => sh.root.detachedKids.length > 0 || sh.root.calloutKids.length > 0 || (function anyDet(t: Topic): boolean {
    return t.detachedKids.length > 0 || t.calloutKids.length > 0 || t.children.some(anyDet) || t.detachedKids.some(anyDet) || t.calloutKids.some(anyDet);
  })(sh.root));
  return {
    sheets: sheets.map(sh => ({
      id: sh.id, class: 'sheet',
      structureClass: XMIND_STRUCTURE_OF[sh.structureClass] ?? sh.structureClass,
      themeClass: sh.themeClass,
      ...(hasDetached ? { topicPositioning: 'fixed' as const } : {}),
      ...(sh.topicOverlapping ? { topicOverlapping: sh.topicOverlapping } : {}),
      ...(sh.skeletonStyle ? {
        extensions: [{
          provider: SKELETON_PROVIDER,
          content: { ...sh.skeletonStyle }
        }]
      } : {}),
      relationships: sh.relationships.length ? sh.relationships.map(r => ({
        id: r.id, end1Id: r.fromId, end2Id: r.toId, ...(r.title ? { title: r.title } : {})
      })) : undefined,
      legend: sh.legend ? {
        visibility: sh.legend.visibility, position: { ...sh.legend.position },
        markers: { ...sh.legend.meanings }
      } : undefined,
      rootTopic: conv(sh.root)
    }))
  };
}

/** 把枝桠的 { sheets } 收成 Xmind 真机要的工作表数组。content.json 顶层必须是数组，主题必须有 class:"topic"。 */
export function toXmindSheets(data: ZhiyaJSON): SheetJSON[] {
  const sheets = JSON.parse(JSON.stringify(data.sheets ?? [])) as SheetJSON[];
  for (const sh of sheets) {
    delete sh.themeClass;
    // 这版只认 topicPositioning:"free"（主主题自由摆放）。枝桠写过的 "fixed" 不在枚举里，普通图也不默认 free。
    if (sh.topicPositioning === 'fixed' || sh.topicPositioning === 'free') delete sh.topicPositioning;
    if (!sh.title) sh.title = sh.rootTopic?.title || '画布';
    if (sh.rootTopic) {
      if (sh.structureClass && !sh.rootTopic.structureClass) sh.rootTopic.structureClass = sh.structureClass;
      shapeXmindTopic(sh.rootTopic);
    }
  }
  return sheets;
}

function shapeXmindTopic(n: TopicJSON): void {
  n.class = 'topic';
  const ext = n.extensions;
  if (ext && !Array.isArray(ext)) {
    if (ext.collapsed) n.branch = 'folded';
    const out: TopicExtensionJSON[] = [];
    if (ext.side && ext.side !== 'auto') out.push({ provider: 'zhiya', content: { side: ext.side } });
    n.extensions = out.length ? out : undefined;
  } else if (Array.isArray(ext)) {
    for (const e of ext) {
      if (e.provider === 'zhiya' && e.content?.collapsed) n.branch = 'folded';
    }
    n.extensions = ext.filter(e => e.provider && (e.provider !== 'zhiya' || Object.keys(e.content ?? {}).length));
    if (!n.extensions!.length) delete n.extensions;
  }
  delete n.boundary;
  const im = n.image;
  if (im) {
    if (im.width == null && typeof im.w === 'number') im.width = im.w;
    if (im.height == null && typeof im.h === 'number') im.height = im.h;
    delete im.w;
    delete im.h;
  }
  const ch = n.children;
  if (!ch) return;
  if (ch.calloutTopics?.length) {
    const prev = ch.callout;
    const extra = Array.isArray(prev) ? prev : prev ? [prev] : [];
    ch.callout = [...ch.calloutTopics, ...extra];
    delete ch.calloutTopics;
  }
  for (const list of [ch.attached, ch.detached, ch.summary]) {
    if (list) for (const c of list) shapeXmindTopic(c);
  }
  const callouts = Array.isArray(ch.callout) ? ch.callout : ch.callout ? [ch.callout] : [];
  for (const c of callouts) shapeXmindTopic(c);
}

/**
 * .xmind 包内文件。metadata 对齐已安装的 Xmind 26.05.01107：
 * dataStructureVersion "3"（大于 3 会拒绝打开），layoutEngineVersion "5"（低于 5 会清掉图片宽高）。
 * manifest 的 file-entries 覆盖除自身以外的全部条目。
 */
export function xmindPackageFiles(
  sheets: SheetJSON[],
  extras: { name: string; data: Uint8Array }[] = []
): { name: string; data: Uint8Array }[] {
  const enc = new TextEncoder();
  const files: { name: string; data: Uint8Array }[] = [
    { name: 'content.json', data: enc.encode(JSON.stringify(sheets)) },
    { name: 'metadata.json', data: enc.encode(JSON.stringify({
      dataStructureVersion: '3',
      layoutEngineVersion: '5',
      creator: { name: 'Vana', version: '26.05.01107' },
      activeSheetId: sheets[0]?.id ?? ''
    })) }
  ];
  const seen = new Set(files.map(f => f.name));
  for (const extra of extras) {
    if (seen.has(extra.name)) continue;
    seen.add(extra.name);
    files.push(extra);
  }
  const entries: Record<string, Record<string, never>> = {};
  for (const f of files) entries[f.name] = {};
  files.push({ name: 'manifest.json', data: enc.encode(JSON.stringify({ 'file-entries': entries })) });
  return files;
}

export function fromJSON(data: ZhiyaJSON): Sheet {
  const conv = (n: TopicJSON): Topic => {
    const t = new Topic(n.title ?? '主题');
    if (n.id) t.id = n.id;
    const ext = n.extensions;
    if (Array.isArray(ext)) {
      for (const e of ext) {
        const c = e.content ?? {};
        const side = c.side;
        if (side === 'left' || side === 'right' || side === 'auto') t.side = side as Side;
        if (c.collapsed) t.collapsed = true;
        if (e.provider === NUMBERING_PROVIDER) {
          t.numbering = {
            pattern: typeof c.pattern === 'string' ? c.pattern : undefined,
            tiered: typeof c.tiered === 'boolean' ? c.tiered : undefined,
            fixedIndex: typeof c.fixedIndex === 'number' ? c.fixedIndex : undefined
          };
        }
      }
    } else if (ext) {
      t.collapsed = !!ext.collapsed;
      if (ext.side === 'left' || ext.side === 'right' || ext.side === 'auto') t.side = ext.side;
    }
    if (n.branch === 'folded') t.collapsed = true;
    t.note = n.note ?? n.notes?.plain?.content ?? '';
    t.noteHtml = n.notes?.realHTML?.content ?? '';
    t.attributedTitle = (n.attributedTitle ?? []).map(x => ({ text: x.text ?? '' })).filter(x => x.text);
    if (typeof n.customWidth === 'number' && n.customWidth > 0) t.customWidth = n.customWidth;
    t.style = styleFromProperties(n.style?.properties);
    t.boundary = !!n.boundary;
    t.boundaries = (n.boundaries ?? []).map((b, i) => {
      const { rangeStart, rangeEnd } = parseRangeField(b);
      return {
        id: b.id ?? uid(`bd${i}`),
        rangeStart, rangeEnd,
        title: b.title,
        style: styleFromProperties(b.style?.properties)
      };
    });
    if (t.boundaries.length) t.boundary = true;
    // 兼容三态：Xmind 真实格式（range 元组 + topicId → children.summary 取标题）
    //          与旧版枝桠格式（'range-start'/'range-end' + 内联 title）
    t.markers = (n.markers ?? []).map(m => m.markerId ?? '').filter(Boolean);
    t.labels = (n.labels ?? []).filter((x): x is string => typeof x === 'string');
    t.href = n.href ?? '';
    t.image = n.image && n.image.src ? {
      src: n.image.src,
      w: n.image.width ?? n.image.w ?? 160,
      h: n.image.height ?? n.image.h ?? 120,
      ...(n.image.align ? { align: n.image.align } : {})
    } : null;
    t.pos = n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number'
      ? { x: n.position.x, y: n.position.y } : null;
    const sumTopics = n.children?.summary ?? [];
    t.summaries = (n.summaries ?? []).map((s, i) => {
      let rangeStart = 0, rangeEnd = 0;
      if (typeof s.range === 'string') {
        const m = s.range.match(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (m) { rangeStart = +m[1]!; rangeEnd = +m[2]!; }
      } else {
        rangeStart = s.rangeStart ?? s['range-start'] ?? 0;
        rangeEnd = s.rangeEnd ?? s['range-end'] ?? 0;
      }
      const st = s.topicId ? sumTopics.find(x => x.id === s.topicId) : undefined;
      return {
        id: s.id ?? uid(`sm${i}`),
        topicId: s.topicId ?? st?.id ?? uid('smt'),
        title: st?.title ?? s.title ?? '概要',
        rangeStart, rangeEnd
      };
    });
    t.children = (n.children?.attached ?? []).map(conv);
    t.detachedKids = (n.children?.detached ?? []).map(conv);
    const calloutRaw = n.children?.callout;
    const calloutList = Array.isArray(calloutRaw) ? calloutRaw : calloutRaw ? [calloutRaw] : [];
    t.calloutKids = (calloutList.length ? calloutList : (n.children?.calloutTopics ?? [])).map(conv);
    t.calloutKids.forEach(c => { c.isCallout = true; });
    return t;
  };
  const convSheet = (sh: SheetJSON | undefined, idx: number): Sheet => {
    const s = new Sheet(idx === 0 ? '中心主题' : `画布 ${idx + 1}`);
    if (sh) {
      s.id = sh.id ?? s.id;
      s.structureClass = normalizeStructureClass(sh.structureClass ?? sh.rootTopic?.structureClass) ?? 'logic-chart';
      s.themeClass = sh.themeClass ?? 'classic';
      s.topicOverlapping = sh.topicOverlapping === 'overlap' ? 'overlap' : null;
      const skel = (sh.extensions ?? []).find(e => e.provider === SKELETON_PROVIDER);
      if (skel?.content && typeof skel.content === 'object') {
        const c = skel.content as Record<string, string>;
        s.skeletonStyle = {
          centralTopic: c.centralTopic,
          mainTopic: c.mainTopic,
          subTopic: c.subTopic,
          floatingTopic: c.floatingTopic
        };
        const central = c.centralTopic ?? c.mainTopic;
        if (central && !sh.structureClass) {
          const norm = normalizeStructureClass(central);
          if (norm) s.structureClass = norm;
        }
      }
      if (sh.rootTopic) s.root = conv(sh.rootTopic);
      // 悬空联系（引用不存在主题）过滤
      const idSet = new Set<string>();
      (function collect(t: Topic) { idSet.add(t.id); t.children.forEach(collect); t.detachedKids.forEach(collect); t.calloutKids.forEach(collect); })(s.root);
      s.legend = sh.legend ? {
        visibility: sh.legend.visibility === 'hidden' ? 'hidden' : 'visible',
        position: { x: sh.legend.position?.x ?? 0, y: sh.legend.position?.y ?? 0 },
        meanings: { ...(sh.legend.markers ?? {}) }
      } : null;
      s.relationships = (sh.relationships ?? []).map((r, i) => ({
        id: r.id ?? uid(`rel${i}`),
        fromId: r.end1Id ?? '',
        toId: r.end2Id ?? '',
        title: r.title ?? ''
      })).filter(r => idSet.has(r.fromId) && idSet.has(r.toId));
    }
    return s;
  };
  const all = data.sheets ?? [];
  const first = convSheet(all[0], 0);
  sheets = all.length > 1 ? all.map((sh, i) => convSheet(sh, i)) : [first];
  return sheets[0]!;
}
