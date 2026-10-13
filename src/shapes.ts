/* =====================================================================
 * 形状注册表 —— 44 种 org.xmind.topicShape.* 的统一几何源
 * 逆向来源：Xmind v25.04 编辑器核心（modules-4654/24654.js + 4666.js）
 *   枚举清单与类名完全一致，几何比例采用规范流程图标准。
 * 三渲染器共用：DOM（clip-path/border-radius）· PNG（canvas 多边形）· SVG（polygon）
 * ===================================================================== */
export type Pt = [number, number];

export type LineKind =
  | 'underline' | 'dblUnderline'        // 下划线家族
  | 'bracket' | 'bracketRound' | 'bracketCurly'   // 括号家族
  | 'quoteDQ' | 'quoteSQ' | 'quoteSBQ' | 'quoteDBQ'; // 引号家族

export interface ShapeDef {
  label: string;
  /** 填充多边形（归一化 0-1，顺时针）；与 radius/ellipse/line 互斥优先 */
  pts?: Pt[];
  /** border-radius 像素；'half' = 胶囊（h/2） */
  radius?: number | 'half';
  /** 椭圆特例（ellipse/circle） */
  ellipse?: boolean;
  /** 线条型特例（透明背景 + 边框/装饰） */
  line?: LineKind;
  /** 附加装饰线段（归一化坐标）：导出画线，DOM 由 CSS 伪元素近似 */
  deco?: [Pt, Pt][];
  /** 水平/垂直 padding 放大系数（点尖形状需要更宽内边距） */
  padX?: number;
  padY?: number;
}

const documentPts: Pt[] = [[0, 0], [1, 0], [1, .72], [.83, .84], [.66, .97], [.5, .87], [.33, 1], [.17, .9], [0, .78]];

export const SHAPES = {
  /* ---------- 基础 ---------- */
  rect: { label: '矩形', radius: 0 },
  roundedRect: { label: '圆角矩形', radius: 10 },
  ellipse: { label: '椭圆', ellipse: true, padX: 1.6, padY: 1.5 },
  circle: { label: '正圆', ellipse: true, padX: 2.1, padY: 1.9 },
  ellipserect: { label: '胶囊', radius: 'half', padX: 1.3 },
  ellipticrectangle: { label: '胶囊', radius: 'half', padX: 1.3 },   // Xmind 别名类
  underline: { label: '下划线', line: 'underline' },
  doubleunderline: { label: '双下划线', line: 'dblUnderline' },
  label: { label: '标签', pts: [[0, .5], [.2, 0], [.8, 0], [1, .5], [.8, 1], [.2, 1]], padX: 1.35 },
  card: { label: '卡片', pts: [[0, 0], [.86, 0], [1, .14], [1, 1], [0, 1]] },
  bookmark: { label: '书签', pts: [[.12, 0], [.88, 0], [.88, 1], [.5, .7], [.12, 1]], padY: 1.15 },
  stack: {
    label: '堆叠', radius: 4, padY: 1.3,
    deco: [[[.03, .87], [.97, .87]], [[.03, .985], [.97, .985]]]
  },

  /* ---------- 流程图 ---------- */
  diamond: { label: '菱形', pts: [[.5, 0], [1, .5], [.5, 1], [0, .5]], padX: 1.9, padY: 1.6 },
  decision: { label: '决策', pts: [[.5, 0], [.92, .5], [.5, 1], [.08, .5]], padX: 2.1, padY: 1.7 },
  cutdiamond: { label: '切角菱形', pts: [[.2, 0], [.8, 0], [1, .5], [.8, 1], [.2, 1], [0, .5]], padX: 1.5 },
  hexagon: { label: '六边形', pts: [[.25, 0], [.75, 0], [1, .5], [.75, 1], [.25, 1], [0, .5]], padX: 1.35 },
  roundedhexagon: { label: '圆角六边形', pts: [[.24, .02], [.76, .02], [.98, .5], [.76, .98], [.24, .98], [.02, .5]], padX: 1.4 },
  parallelogram: { label: '平行四边形', pts: [[.14, 0], [1, 0], [.86, 1], [0, 1]], padX: 1.25 },
  data: { label: '数据', pts: [[0, 0], [.86, 0], [1, 1], [.14, 1]], padX: 1.25 },
  database: {
    label: '数据库', pts: [[0, .12], [.05, .04], [.5, 0], [.95, .04], [1, .12], [1, .88], [.95, .96], [.5, 1], [.05, .96], [0, .88]],
    deco: [[[.05, .2], [.5, .33]], [[.5, .33], [.95, .2]]], padY: 1.35
  },
  document: { label: '文档', pts: documentPts, padY: 1.3 },
  multiDocument: {
    label: '多文档', pts: documentPts, padY: 1.4,
    deco: [[[0, .16], [.33, .08]], [[.33, .08], [.66, .16]], [[.66, .16], [1, .08]]]
  },
  delay: { label: '延迟', pts: [[0, 0], [.55, 0], [.83, .05], [1, .22], [1, .78], [.83, .95], [.55, 1], [0, 1]] },
  manualInput: { label: '手动输入', pts: [[.18, 0], [1, 0], [1, 1], [0, 1]], padX: 1.15 },
  manualOperation: { label: '手动操作', pts: [[.12, 0], [1, 0], [.88, 1], [0, 1]], padX: 1.15 },
  predefinedProcess: {
    label: '预定义过程', radius: 0,
    deco: [[[.08, 0], [.08, 1]], [[.92, 0], [.92, 1]]]
  },
  offPageReference: { label: '离页连接', pts: [[0, 0], [1, 0], [1, .7], [.5, 1], [0, .7]], padY: 1.25 },
  onPageReference: { label: '在页连接', pts: [[0, 0], [1, 0], [1, .78], [.5, .55], [0, .78]], padY: 1.2 },
  fatLeftArrow: { label: '左箭头', pts: [[1, 0], [.4, 0], [0, .5], [.4, 1], [1, 1]], padX: 1.4 },
  fatRightArrow: { label: '右箭头', pts: [[0, 0], [.6, 0], [1, .5], [.6, 1], [0, 1]], padX: 1.4 },
  shield: { label: '盾形', pts: [[.5, 0], [1, .16], [1, .58], [.5, 1], [0, .58], [0, .16]] },
  singlebreakangle: {
    label: '折角', pts: [[0, 0], [.84, 0], [1, .16], [1, 1], [0, 1]],
    deco: [[[.84, 0], [.84, .16]], [[.84, .16], [1, .16]]]
  },

  /* ---------- 括号 ---------- */
  squareBracket: { label: '方括号', line: 'bracket' },
  roundBracket: { label: '圆括号', line: 'bracketRound' },
  curlyBracket: { label: '花括号', line: 'bracketCurly' },

  /* ---------- 引号 ---------- */
  doubleQuote: { label: '双引号', line: 'quoteDQ' },
  squareQuote: { label: '直角引号', line: 'quoteSQ' },
  singleBookQuote: { label: '单书名号', line: 'quoteSBQ' },
  doubleBookQuote: { label: '双书名号', line: 'quoteDBQ' },

  /* ---------- 趣味 ---------- */
  heart: {
    label: '心形', padX: 1.5, padY: 1.45,
    pts: [[.5, .231], [.528, .136], [.677, 0], [.894, .044], [1, .266], [.894, .521], [.677, .742], [.528, .922], [.5, 1], [.472, .922], [.323, .742], [.106, .521], [0, .266], [.106, .044], [.323, 0], [.472, .136]]
  },
  star: {
    label: '星形', padX: 1.9, padY: 1.9,
    pts: [[.5, 0], [.612, .345], [.976, .345], [.682, .559], [.794, .905], [.5, .691], [.206, .905], [.318, .559], [.024, .345], [.388, .345]]
  },
  waterdrop: {
    label: '水滴', padX: 1.4, padY: 1.4,
    pts: [[.5, 0], [.12, .62], [.133, .718], [.171, .81], [.231, .889], [.31, .949], [.402, .987], [.5, 1], [.598, .987], [.69, .949], [.769, .889], [.829, .81], [.867, .718], [.88, .62]]
  },
  simpleCloud: {
    label: '云形', padX: 1.3, padY: 1.4,
    pts: [[.14, .66], [.06, .5], [.1, .32], [.24, .22], [.38, .18], [.5, .1], [.64, .14], [.8, .14], [.92, .26], [.96, .42], [.92, .58], [.8, .68], [.62, .74], [.42, .76], [.28, .74]]
  }
} satisfies Record<string, ShapeDef>;

/** 全部形状类名（44 种，含 ellipticrectangle 别名） */
export type ShapeKind = keyof typeof SHAPES & string;

/** 字符串键安全查找（style-class 反序列化 / 运行时按名取形） */
export const getShape = (k: string): ShapeDef | undefined =>
  (SHAPES as Record<string, ShapeDef>)[k];

/** 引号装饰字符（DOM ::before content 与导出 fillText 共用） */
export const QUOTE_CHARS: Partial<Record<LineKind, string>> = {
  quoteDQ: '\u201C', quoteSQ: '\u300C', quoteSBQ: '\u3008', quoteDBQ: '\u300A'
};

/** 归一化点表 → clip-path polygon() 百分比字符串 */
export function clipPathOf(pts: Pt[]): string {
  return `polygon(${pts.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(', ')})`;
}

/** 归一化点表 → 绝对坐标多边形（导出渲染用） */
export function polyAt(pts: Pt[], x: number, y: number, w: number, h: number): Pt[] {
  return pts.map(([px, py]) => [x + px * w, y + py * h] as Pt);
}

/** 侧栏按钮分组（展示顺序） */
export const SHAPE_GROUPS: { name: string; shapes: string[] }[] = [
  { name: '基础', shapes: ['rect', 'roundedRect', 'ellipse', 'circle', 'ellipserect', 'underline', 'doubleunderline', 'label', 'card', 'bookmark', 'stack'] },
  { name: '流程图', shapes: ['diamond', 'decision', 'cutdiamond', 'hexagon', 'roundedhexagon', 'parallelogram', 'data', 'database', 'document', 'multiDocument', 'delay', 'manualInput', 'manualOperation', 'predefinedProcess', 'offPageReference', 'onPageReference', 'fatLeftArrow', 'fatRightArrow', 'shield', 'singlebreakangle'] },
  { name: '括号与引号', shapes: ['squareBracket', 'roundBracket', 'curlyBracket', 'doubleQuote', 'squareQuote', 'singleBookQuote', 'doubleBookQuote'] },
  { name: '趣味', shapes: ['heart', 'star', 'waterdrop', 'simpleCloud'] }
];
