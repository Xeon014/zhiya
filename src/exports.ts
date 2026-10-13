import { sheet, toJSON, toXmindSheets, xmindPackageFiles, walkVisible, applySheet, fromJSON, topicOf, styleToProperties, hasStyle, type ZhiyaJSON } from './model';
import { uid } from './utils';
import { figureMap } from './figures';
import { pushHistory } from './persistence';
import { relayout } from './layout';
import { fitView } from './view';
import { toast } from './ui';
import { edgesEl } from './dom';
import { collectSummaryLayout } from './overlays';
import { collectRelationships } from './relationships';
import { drawMarkersCanvas, markersSVG } from './markers';
import { legendRows } from './legend';
import { buildDocx, buildXlsx, buildPptx, buildTextbundle } from './ooxml';
import { putAttachment, loadAttachment, allAttachments, isAttachmentHref, gcAttachments } from './assets';
import { getShape, polyAt, QUOTE_CHARS, type LineKind, type Pt } from './shapes';
import { effectiveStyle } from './edges';

/* =====================================================================
 * 八、导出：零依赖 ZIP（.xmind）/ PNG / SVG / Markdown / OPML / FreeMind / 文本 / PDF
 * ===================================================================== */

export { buildZip, unzipEntry } from './zip';
import { buildZip, unzipEntry } from './zip';

/** 组装 .xmind 字节（保存与 FS 直写共用；含资源嵌入与附件 GC） */
export function buildXmindBytes(): Uint8Array {
  gcAttachments();                                     // Xmind 同款：保存时回收未引用附件
  // Xmind 同构：图片存 resources/<sha>.<ext>（主题存 xap:resources 引用），附件存 attachments/
  const files: { name: string; data: Uint8Array }[] = [];
  const j = toJSON();
  const hashOf = (s: string): string => {
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < s.length; i += 2) {
      h1 = (h1 ^ s.charCodeAt(i)) * 16777619 >>> 0;
      h2 = (h2 + s.charCodeAt(i) * (i + 7)) * 2654435761 >>> 0;
    }
    return (h1.toString(16) + h2.toString(16)).padStart(16, '0');
  };
  const dataUrlToBytes = (u: string): { data: Uint8Array; ext: string } | null => {
    const m = u.match(/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,(.*)$/s);
    if (!m) return null;
    const b = atob(m[2]!);
    const data = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) data[i] = b.charCodeAt(i);
    return { data, ext: m[1]!.replace('jpeg', 'jpg').replace('svg+xml', 'svg') };
  };
  const walkNode = (n: { image?: { src?: string }; children?: { attached?: unknown[]; detached?: unknown[]; calloutTopics?: unknown[] } }): void => {
    const src = n.image?.src ?? '';
    if (src.startsWith('data:')) {
      const conv = dataUrlToBytes(src);
      if (conv) {
        const name = `resources/${hashOf(src)}.${conv.ext}`;
        files.push({ name, data: conv.data });
        n.image!.src = `xap:${name}`;
      }
    }
    const ch = n.children ?? {};
    for (const key of ['attached', 'detached', 'calloutTopics'] as const) {
      for (const c of (ch[key] ?? []) as Parameters<typeof walkNode>[0][]) walkNode(c);
    }
  };
  for (const sh of j.sheets ?? []) if (sh.rootTopic) walkNode(sh.rootTopic as never);
  for (const [key, data] of allAttachments()) files.push({ name: key, data });
  const thumb = thumbnailPngBytes();
  if (thumb) files.push({ name: 'Thumbnails/thumbnail.png', data: thumb });
  return buildZip(xmindPackageFiles(toXmindSheets(j), files));
}

/* ---------- File System Access API：原生对话框 + 句柄直写（回退下载流） ---------- */
interface FSHandleLike {
  name: string;
  getFile?(): Promise<File>;
}

const fsPickers = window as unknown as {
  showOpenFilePicker?: (o: unknown) => Promise<FSHandleLike[]>;
};

function downloadXmind(): void {
  const bytes = buildXmindBytes();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  downloadBlob(`枝桠-${stamp()}.xmind`, new Blob([copy], { type: 'application/octet-stream' }));
  toast('已导出 .xmind（可直接用 Xmind 打开）');
}

export function saveFile(): void { downloadXmind(); }
export function saveFileAs(): void { downloadXmind(); }

/** 打开：优先原生对话框，回退隐藏 input */
export async function openFileSmart(): Promise<void> {
  if (fsPickers.showOpenFilePicker && !navigator.webdriver) {
    try {
      const [h] = await fsPickers.showOpenFilePicker({
        multiple: false,
        types: [{ description: '导图文件', accept: { 'application/octet-stream': ['.xmind'], 'application/json': ['.json'] } }]
      });
      if (!h) return;
      const file = await h.getFile?.();
      if (!file) return;
      await openBuffer(await file.arrayBuffer(), file.name);
      return;
    } catch { /* 对话框取消或不可用 → 回退 */ }
  }
  document.getElementById('file-input')?.click();
}

/* ---------- PNG 导出：canvas 自绘（边=解析现有 SVG 路径，题=计算样式重建） ---------- */
export function cssVar(name: string): string {
  const canvas = document.getElementById('viewport') ?? document.documentElement;
  return getComputedStyle(canvas).getPropertyValue(name).trim();
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const chars = [...text], lines: string[] = []; let cur = '';
  for (const ch of chars) {
    if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}
/* ---------- 主题形状几何（shapes.ts 注册表驱动，PNG/SVG 共用） ---------- */

function fillPolyPath(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
}
/** 线条型形状（括号/引号/下划线家族）——canvas 描线 */
function drawLineShape(
  ctx: CanvasRenderingContext2D, line: LineKind, x: number, y: number, w: number, h: number, stroke: string
): void {
  ctx.strokeStyle = stroke;
  ctx.lineCap = 'round';
  if (line === 'underline' || line === 'dblUnderline') {
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
    if (line === 'dblUnderline') { ctx.beginPath(); ctx.moveTo(x, y + h - 5); ctx.lineTo(x + w, y + h - 5); ctx.stroke(); }
    return;
  }
  if (line === 'bracket' || line === 'bracketRound' || line === 'bracketCurly') {
    ctx.lineWidth = 2.5;
    const r = line === 'bracket' ? 2 : Math.min(18, h / 3);
    ctx.beginPath();
    ctx.moveTo(x + w, y);                       // 上边起点（右侧开口）
    ctx.lineTo(x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.lineTo(x, y + h - r);
    ctx.quadraticCurveTo(x, y + h, x + r, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
    if (line === 'bracketCurly') {              // 花括号中点小凸
      ctx.beginPath(); ctx.arc(x, y + h / 2, 3.5, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    }
    return;
  }
  const ch = QUOTE_CHARS[line];
  if (ch) {
    ctx.fillStyle = stroke;
    ctx.font = `700 ${Math.round(h * 0.6)}px ${ctx.font.split('px')[1] ?? ''}`.trim() || '700 16px sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(ch, x - Math.round(w * 0.14) - 4, y - Math.round(h * 0.3));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  }
}
/** 画一个主题形状（填充+描边；线条型只画线） */
function drawTopicShape(
  ctx: CanvasRenderingContext2D, shape: string, x: number, y: number, w: number, h: number, fill: string, stroke: string, lineWidth = 1.5
): void {
  const def = getShape(shape) ?? getShape('roundedRect')!;
  if (def.line) { drawLineShape(ctx, def.line, x, y, w, h, stroke); return; }
  if (def.ellipse) {
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke();
    return;
  }
  if (def.radius !== undefined) {
    roundRect(ctx, x, y, w, h, def.radius === 'half' ? h / 2 : def.radius);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke();
    if (def.deco) drawDeco(ctx, def.deco, x, y, w, h, stroke);
    return;
  }
  if (def.pts) {
    fillPolyPath(ctx, polyAt(def.pts, x, y, w, h));
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke();
    if (def.deco) drawDeco(ctx, def.deco, x, y, w, h, stroke);
  }
}
const LABEL_PALETTE = ['#B3563B', '#A67B2E', '#5E7E4E', '#3E7C82', '#4E6398', '#8A5A83'];
function drawLabelsCanvas(ctx: CanvasRenderingContext2D, labels: string[], cx: number, topY: number): void {
  ctx.font = '500 11px sans-serif';
  const widths = labels.map(l => ctx.measureText(l).width + 14);
  const total = widths.reduce((a, b) => a + b, 0) + (labels.length - 1) * 4;
  let x = cx - total / 2;
  labels.forEach((l, i) => {
    ctx.fillStyle = LABEL_PALETTE[l.length % LABEL_PALETTE.length]!;
    const r = 4, yy = topY, ww = widths[i]!, hh = 18;
    ctx.beginPath();
    ctx.moveTo(x + r, yy); ctx.arcTo(x + ww, yy, x + ww, yy + hh, r);
    ctx.arcTo(x + ww, yy + hh, x, yy + hh, r); ctx.arcTo(x, yy + hh, x, yy, r); ctx.arcTo(x, yy, x + ww, yy, r);
    ctx.closePath(); ctx.globalAlpha = 0.16; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = cssVar('--ink');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(l, x + ww / 2, yy + hh / 2 + 0.5);
    x += ww + 4;
  });
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
}

function drawDeco(ctx: CanvasRenderingContext2D, deco: [Pt, Pt][], x: number, y: number, w: number, h: number, stroke: string): void {
  ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
  ctx.beginPath();
  deco.forEach(([a, b]) => {
    ctx.moveTo(x + a[0] * w, y + a[1] * h);
    ctx.lineTo(x + b[0] * w, y + b[1] * h);
  });
  ctx.stroke();
}
function svgTopicShape(shape: string, x: number, y: number, w: number, h: number, fill: string, stroke: string, strokeWidth = 1.5): string {
  const def = getShape(shape) ?? getShape('roundedRect')!;
  const sw = `stroke-width="${strokeWidth}"`;
  const fmt = (n: number) => n.toFixed(1);
  if (def.line) {
    if (def.line === 'underline' || def.line === 'dblUnderline') {
      let s = `<line x1="${fmt(x)}" y1="${fmt(y + h)}" x2="${fmt(x + w)}" y2="${fmt(y + h)}" stroke="${stroke}" stroke-width="2"/>\n`;
      if (def.line === 'dblUnderline') s += `<line x1="${fmt(x)}" y1="${fmt(y + h - 5)}" x2="${fmt(x + w)}" y2="${fmt(y + h - 5)}" stroke="${stroke}" stroke-width="2"/>\n`;
      return s;
    }
    if (def.line === 'bracket' || def.line === 'bracketRound' || def.line === 'bracketCurly') {
      const r = def.line === 'bracket' ? 2 : Math.min(18, h / 3);
      let d = `M ${fmt(x + w)} ${fmt(y)} L ${fmt(x + r)} ${fmt(y)} Q ${fmt(x)} ${fmt(y)} ${fmt(x)} ${fmt(y + r)}`;
      d += ` L ${fmt(x)} ${fmt(y + h - r)} Q ${fmt(x)} ${fmt(y + h)} ${fmt(x + r)} ${fmt(y + h)} L ${fmt(x + w)} ${fmt(y + h)}`;
      let s = `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>\n`;
      if (def.line === 'bracketCurly') {
        s += `<path d="M ${fmt(x)} ${fmt(y + h / 2 - 4)} A 4 4 0 0 0 ${fmt(x)} ${fmt(y + h / 2 + 4)}" fill="none" stroke="${stroke}" stroke-width="2.5"/>\n`;
      }
      return s;
    }
    const ch = QUOTE_CHARS[def.line];
    if (ch) return `<text x="${fmt(x - w * 0.14 - 2)}" y="${fmt(y - h * 0.22)}" font-size="${Math.round(h * 0.6)}" font-weight="700" fill="${stroke}">${escXml(ch)}</text>\n`;
    return '';
  }
  if (def.ellipse) {
    return `<ellipse cx="${fmt(x + w / 2)}" cy="${fmt(y + h / 2)}" rx="${fmt(w / 2)}" ry="${fmt(h / 2)}" fill="${fill}" stroke="${stroke}" ${sw}/>\n`;
  }
  let decoSvg = '';
  if (def.deco) {
    decoSvg = def.deco.map(([a, b]) =>
      `<line x1="${fmt(x + a[0] * w)}" y1="${fmt(y + a[1] * h)}" x2="${fmt(x + b[0] * w)}" y2="${fmt(y + b[1] * h)}" stroke="${stroke}" stroke-width="1.5"/>`
    ).join('\n') + '\n';
  }
  if (def.radius !== undefined) {
    return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${w}" height="${h}" rx="${def.radius === 'half' ? fmt(h / 2) : def.radius}" fill="${fill}" stroke="${stroke}" ${sw}/>\n${decoSvg}`;
  }
  if (def.pts) {
    return `<polygon points="${polyAt(def.pts, x, y, w, h).map(([px, py]) => `${fmt(px)},${fmt(py)}`).join(' ')}" fill="${fill}" stroke="${stroke}" ${sw}/>\n${decoSvg}`;
  }
  return '';
}

function renderMapCanvas(): HTMLCanvasElement | null {
  const visible = [...walkVisible()].filter(t => figureMap.has(t.id) && figureMap.get(t.id)!.cur);
  if (!visible.length) return null;
  const PAD = 70, S = 2;   // 2x 高清
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of visible) {
    const f = figureMap.get(t.id)!, p = f.cur!;
    minX = Math.min(minX, p.x - f.el.offsetWidth / 2 - 20); maxX = Math.max(maxX, p.x + f.el.offsetWidth / 2 + 20);
    minY = Math.min(minY, p.y - f.el.offsetHeight / 2 - 20); maxY = Math.max(maxY, p.y + f.el.offsetHeight / 2 + 20);
  }
  const W = maxX - minX + PAD * 2, H = maxY - minY + PAD * 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * S; canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(S, 0, 0, S, (-minX + PAD) * S, (-minY + PAD) * S);

  ctx.fillStyle = cssVar('--paper');
  ctx.fillRect(minX - PAD, minY - PAD, W, H);
  if (watermarkOn()) drawWatermark(ctx, W, H);

  for (const path of edgesEl.querySelectorAll('path')) {
    const d = path.getAttribute('d') || '';
    const strokeVar = (path.getAttribute('stroke') || '').replace(/^var\(|\)$/g, '');
    const color = strokeVar.startsWith('--') ? cssVar(strokeVar) : strokeVar;
    const fillRaw = (path.getAttribute('fill') || 'none').replace(/^var\(|\)$/g, '');
    const fillColor = fillRaw !== 'none' && fillRaw !== 'transparent' && fillRaw
      ? (fillRaw.startsWith('--') ? cssVar(fillRaw) : fillRaw) : null;
    ctx.strokeStyle = color;
    ctx.globalAlpha = parseFloat(path.getAttribute('stroke-opacity') || '1');
    ctx.lineWidth = parseFloat(path.getAttribute('stroke-width') || '2');
    ctx.lineCap = 'round';
    const re = /([MCL])\s*([^MCL]+)/g; let m2: RegExpExecArray | null;
    ctx.beginPath();
    while ((m2 = re.exec(d))) {
      const nums = m2[2]!.replace(/,/g, ' ').trim().split(/\s+/).map(Number);
      if (m2[1] === 'M') ctx.moveTo(nums[0] ?? 0, nums[1] ?? 0);
      else if (m2[1] === 'L') ctx.lineTo(nums[0] ?? 0, nums[1] ?? 0);
      else if (m2[1] === 'C') ctx.bezierCurveTo(nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0, nums[3] ?? 0, nums[4] ?? 0, nums[5] ?? 0);
    }
    ctx.stroke();
    if (fillColor) { ctx.fillStyle = fillColor; ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1; }
  }
  ctx.globalAlpha = 1;

  for (const t of visible) {
    const f = figureMap.get(t.id)!, el = f.el, cs = getComputedStyle(el);
    const w = el.offsetWidth, h = el.offsetHeight;
    const x = f.cur!.x - w / 2, y = f.cur!.y - h / 2;
    const isRoot = t.id === sheet.root.id;
    const eff = effectiveStyle(t);
    const shape = eff.shape ?? 'roundedRect';
    const isLine = !!getShape(shape)?.line;
    const fill = eff.fill ?? cs.backgroundColor;
    const borderOn = !!(t.style.border || t.style.borderWidth);
    const stroke = t.style.border ?? (cs.borderColor.startsWith('rgb') ? cs.borderColor : cssVar('--hairline'));
    const strokeW = t.style.borderWidth ?? 1.5;
    if (!isLine) {
      ctx.save();
      ctx.shadowColor = 'rgba(35,39,47,.10)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
      drawTopicShape(ctx, shape, x, y, w, h, fill, stroke, strokeW);
      ctx.restore();
    } else {
      drawTopicShape(ctx, shape, x, y, w, h, 'transparent', stroke, strokeW);
    }
    if (!borderOn && (shape === 'roundedRect' || shape === 'rect') && !isRoot) {
      ctx.strokeStyle = stroke; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 1.5, y + 5); ctx.lineTo(x + 1.5, y + h - 5); ctx.stroke();
    }
    if (t.markers.length) drawMarkersCanvas(ctx, t.markers, f.cur!.x, y + 6);
    let contentTop = y + 6 + (t.markers.length ? 18 : 0);
    if (t.labels.length) drawLabelsCanvas(ctx, t.labels, f.cur!.x, contentTop);
    contentTop += t.labels.length ? 22 : 0;
    if (t.image?.src && f.imgEl?.src) {
      try {
        ctx.drawImage(f.imgEl, f.cur!.x - t.image.w / 2, contentTop, t.image.w, t.image.h);
      } catch { /* 图片未就绪则跳过 */ }
    }
    if (t.href) {
      ctx.font = '700 11px sans-serif';
      ctx.fillStyle = cssVar('--ink-soft');
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(t.href.startsWith('xap:') ? '📎' : '🔗', x + w - 5, y + 4);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    }
    const fontSizePx = eff.fontSize ?? parseFloat(cs.fontSize);
    const fontWeight = eff.bold ? '700' : cs.fontWeight;
    const fontStyle = eff.italic ? 'italic' : 'normal';
    const align = eff.align ?? 'center';
    ctx.fillStyle = eff.text ?? cs.color;
    ctx.font = `${fontStyle} ${fontWeight} ${fontSizePx}px ${cs.fontFamily}`;
    const padX = 14, lh = fontSizePx * 1.45;
    const lines = wrapText(ctx, t.title, w - padX * 2);
    const startY = f.cur!.y - (lines.length - 1) * lh / 2;
    ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
    ctx.textBaseline = 'middle';
    const tx = align === 'left' ? x + padX : align === 'right' ? x + w - padX : f.cur!.x;
    lines.forEach((ln, i) => ctx.fillText(ln, tx, startY + i * lh));
  }

  // 图例（Xmind sheet.legend）
  if (sheet.legend?.visibility === 'visible' && legendRows().length) {
    const rows = legendRows();
    const bx = sheet.legend.position.x, by = sheet.legend.position.y;
    const bw = 170, bh = 30 + rows.length * 22 + 10;
    roundRect(ctx, bx, by, bw, bh, 10);
    ctx.fillStyle = cssVar('--paper'); ctx.fill();
    ctx.strokeStyle = cssVar('--hairline'); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = cssVar('--ink-soft');
    ctx.font = `600 11.5px ${cssVar('--font') || 'sans-serif'}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('图 例', bx + 14, by + 16);
    rows.forEach((r, i) => {
      const ry = by + 34 + i * 22;
      drawMarkersCanvas(ctx, [r.id], bx + 22, ry);
      ctx.fillStyle = cssVar('--ink');
      ctx.font = `500 12px ${cssVar('--font') || 'sans-serif'}`;
      ctx.fillText(r.text, bx + 40, ry + 7);
    });
    ctx.textAlign = 'center';
  }
  // 联系标签（虚线边框 + 文本）
  for (const it of collectRelationships()) {
    if (!it.rel.title) continue;
    ctx.font = `500 11.5px ${cssVar('--font') || 'sans-serif'}`;
    const tw = ctx.measureText(it.rel.title).width + 16;
    const th = 18;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = cssVar('--ink-faint'); ctx.lineWidth = 1;
    roundRect(ctx, it.midX - tw / 2, it.midY - th / 2, tw, th, 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = cssVar('--paper'); ctx.fill();
    ctx.fillStyle = cssVar('--ink-soft');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(it.rel.title, it.midX, it.midY);
  }
  // 概要标签（复用覆盖层布局：白底圆角块 + 文本）
  for (const it of collectSummaryLayout()) {
    const fontSize = 12.5, pad = 10;
    ctx.font = `600 ${fontSize}px ${cssVar('--font') || 'sans-serif'}`;
    const tw = ctx.measureText(it.sum.title).width + pad * 2;
    const th = fontSize + pad;
    const x = it.labelX - tw / 2, y = it.labelY - th / 2;
    roundRect(ctx, x, y, tw, th, 8);
    ctx.fillStyle = cssVar('--paper'); ctx.fill();
    ctx.strokeStyle = cssVar(`--${it.hue}`); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = cssVar('--ink');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(it.sum.title, it.labelX, it.labelY + fontSize * 0.35);
  }

  return canvas;
}
function exportPNG(): void {
  const canvas = renderMapCanvas();
  if (!canvas) { toast('没有可导出的内容'); return; }
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(`枝桠-${new Date().toISOString().slice(0, 10)}.png`, blob);
    toast(`已导出 PNG（${Math.round(canvas.width / 2)}×${Math.round(canvas.height / 2)} @2x）`);
  }, 'image/png');
}
/** 文件列表预览。没有已排好的主题时不写入。 */
function thumbnailPngBytes(): Uint8Array | null {
  if (typeof document === 'undefined') return null;
  const canvas = renderMapCanvas();
  if (!canvas) return null;
  const max = 480;
  const scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const thumb = document.createElement('canvas');
  thumb.width = Math.max(1, Math.round(canvas.width * scale));
  thumb.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = thumb.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
  const m = thumb.toDataURL('image/png').match(/^data:image\/png;base64,(.*)$/);
  if (!m) return null;
  const b = atob(m[1]!);
  const data = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) data[i] = b.charCodeAt(i);
  return data;
}

/* ---------- 主流格式导出器 ---------- */
const escXml = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function downloadBlob(name: string, blob: Blob): void {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 浏览器「另存为」会挡住下载。1.5 秒就收回链接时，确认保存读到的是空文件，Xmind 会报损坏。
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
const stamp = (): string => new Date().toISOString().slice(0, 10);

export function toMarkdown(): string {
  const lines = [`# ${sheet.root.title}`, ''];
  const walk = (t: import('./model').Topic, d: number) => {
    const safe = t.title.replace(/^([-*>#+\d.]+)(\s)/, '\\$1$2');
    lines.push('  '.repeat(d) + '- ' + safe);
    if (t.note) t.note.split('\n').forEach(l => lines.push('  '.repeat(d + 1) + '> ' + l));
    for (const c of t.children) walk(c, d + 1);
  };
  sheet.root.children.forEach(c => walk(c, 0));
  return lines.join('\n') + '\n';
}
export function toOPML(): string {
  const node = (t: import('./model').Topic): string => {
    const attrs = `text="${escXml(t.title)}"` + (t.note ? ` _note="${escXml(t.note)}"` : '');
    return t.children.length
      ? `<outline ${attrs}>${t.children.map(node).join('')}</outline>`
      : `<outline ${attrs}/>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>${escXml(sheet.root.title)}</title></head><body>${node(sheet.root)}</body></opml>`;
}
export function toFreeMind(): string {
  const node = (t: import('./model').Topic, pos: string | null, depth: number): string => {
    const attrs = [`TEXT="${escXml(t.title)}"`];
    if (depth === 1 && pos) attrs.push(`POSITION="${pos}"`);
    if (t.collapsed) attrs.push('FOLDED="true"');
    const note = t.note ? `<richcontent TYPE="NOTE"><html><body><p>${escXml(t.note)}</p></body></html></richcontent>` : '';
    const kids = t.children.map((c, i) => node(c, depth === 0 ? (i % 2 ? 'left' : 'right') : null, depth + 1)).join('');
    return `<node ${attrs.join(' ')}>${note}${kids}</node>`;
  };
  return `<map version="1.0.1">${node(sheet.root, null, 0)}</map>`;
}
export function toOutlineText(): string {
  const lines = [sheet.root.title];
  const walk = (t: import('./model').Topic, d: number) => {
    lines.push('  '.repeat(d) + '- ' + t.title);
    if (t.note) t.note.split('\n').forEach(l => lines.push('  '.repeat(d) + '    ' + l));
    t.children.forEach(c => walk(c, d + 1));
  };
  sheet.root.children.forEach(c => walk(c, 1));
  return lines.join('\n');
}
function exportSVGString(): string | null {
  const visible = [...walkVisible()].filter(t => figureMap.has(t.id) && figureMap.get(t.id)!.cur);
  if (!visible.length) return null;
  const PAD = 70;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of visible) {
    const f = figureMap.get(t.id)!, p = f.cur!;
    minX = Math.min(minX, p.x - f.el.offsetWidth / 2 - 20); maxX = Math.max(maxX, p.x + f.el.offsetWidth / 2 + 20);
    minY = Math.min(minY, p.y - f.el.offsetHeight / 2 - 20); maxY = Math.max(maxY, p.y + f.el.offsetHeight / 2 + 20);
  }
  const W = maxX - minX + PAD * 2, H = maxY - minY + PAD * 2;
  const meas = document.createElement('canvas').getContext('2d');
  const bx = minX - PAD, by = minY - PAD;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="${bx.toFixed(1)} ${by.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}">\n`;
  s += `<rect x="${bx}" y="${by}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="${cssVar('--paper')}"/>\n`;
  for (const path of edgesEl.querySelectorAll('path')) {
    const sv = (path.getAttribute('stroke') || '').replace(/^var\(|\)$/g, '');
    const color = sv.startsWith('--') ? cssVar(sv) : sv;
    const fillAttr = path.getAttribute('fill') || 'none';
    const fillResolved = fillAttr.startsWith('var(') ? color : fillAttr;
    s += `<path d="${path.getAttribute('d')}" fill="${fillResolved}" stroke="${color}" stroke-width="${path.getAttribute('stroke-width') || '2'}" stroke-opacity="${path.getAttribute('stroke-opacity') || '1'}" stroke-linecap="round"/>\n`;
  }
  for (const t of visible) {
    const f = figureMap.get(t.id)!, el = f.el, cs = getComputedStyle(el);
    const w = el.offsetWidth, h = el.offsetHeight, x = f.cur!.x - w / 2, y = f.cur!.y - h / 2;
    const isRoot = t.id === sheet.root.id;
    const eff = effectiveStyle(t);
    const shape = eff.shape ?? 'roundedRect';
    const isLine = !!getShape(shape)?.line;
    const fill = eff.fill ?? cs.backgroundColor;
    const borderOn = !!(t.style.border || t.style.borderWidth);
    const border = t.style.border ?? (cs.borderColor.startsWith('rgb') ? cs.borderColor : cssVar('--hairline'));
    const borderW = t.style.borderWidth ?? 1.5;
    s += svgTopicShape(shape, x, y, w, h, isLine ? 'transparent' : fill, border, borderW);
    if (!borderOn && (shape === 'roundedRect' || shape === 'rect') && !isRoot) s += `<line x1="${(x + 1.5).toFixed(1)}" y1="${(y + 5).toFixed(1)}" x2="${(x + 1.5).toFixed(1)}" y2="${(y + h - 5).toFixed(1)}" stroke="${border}" stroke-width="3"/>\n`;
    const fontSizePx = eff.fontSize ?? parseFloat(cs.fontSize);
    const fontWeight = eff.bold ? '700' : cs.fontWeight;
    const fontStyle = eff.italic ? 'italic' : 'normal';
    const align = eff.align ?? 'center';
    if (meas) meas.font = `${fontStyle} ${fontWeight} ${fontSizePx}px ${cs.fontFamily}`;
    if (t.markers.length) s += markersSVG(t.markers, f.cur!.x, y + 7);
    let svgTop = y + 7 + (t.markers.length ? 18 : 0);
    if (t.labels.length) {
      const widths2 = t.labels.map(l => [...l].length * 11 * 0.9 + 14);
      const total2 = widths2.reduce((a, b) => a + b, 0) + (t.labels.length - 1) * 4;
      let lx = f.cur!.x - total2 / 2;
      t.labels.forEach((l, i) => {
        const ww = widths2[i]!;
        const col = LABEL_PALETTE[l.length % LABEL_PALETTE.length]!;
        s += `<rect x="${lx.toFixed(1)}" y="${svgTop.toFixed(1)}" width="${ww.toFixed(1)}" height="18" rx="4" fill="${col}" fill-opacity=".14" stroke="${col}" stroke-width="1"/>`;
        s += `<text x="${(lx + ww / 2).toFixed(1)}" y="${(svgTop + 12.5).toFixed(1)}" text-anchor="middle" font-size="11" fill="${cssVar('--ink')}">${escXml(l)}</text>`;
        lx += ww + 4;
      });
      svgTop += 22;
    }
    if (t.image?.src) {
      s += `<image x="${(f.cur!.x - t.image.w / 2).toFixed(1)}" y="${svgTop.toFixed(1)}" width="${t.image.w}" height="${t.image.h}" href="${escXml(t.image.src)}"/>`;
    }
    if (t.href) {
      s += `<text x="${(x + w - 5).toFixed(1)}" y="${(y + 16).toFixed(1)}" text-anchor="end" font-size="11" fill="${cssVar('--ink-soft')}">${t.href.startsWith('xap:') ? '📎' : '🔗'}</text>`;
    }
    const lh = fontSizePx * 1.45;
    const lines = meas ? wrapText(meas, t.title, w - 28) : [t.title];
    const startY = f.cur!.y - (lines.length - 1) * lh / 2;
    const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
    const tx = align === 'left' ? x + 14 : align === 'right' ? x + w - 14 : f.cur!.x;
    s += `<text text-anchor="${anchor}" font-family='${cs.fontFamily}' font-size="${fontSizePx}" font-weight="${fontWeight}" font-style="${fontStyle}" fill="${eff.text ?? cs.color}">`;
    lines.forEach((ln, i) => { s += `<tspan x="${tx.toFixed(1)}" y="${(startY + i * lh + lh * 0.35).toFixed(1)}">${escXml(ln)}</tspan>`; });
    s += `</text>\n`;
  }
  // 图例
  if (sheet.legend?.visibility === 'visible' && legendRows().length) {
    const rows = legendRows();
    const bx = sheet.legend.position.x, by = sheet.legend.position.y;
    const bw = 170, bh = 30 + rows.length * 22 + 10;
    s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10" fill="${cssVar('--paper')}" stroke="${cssVar('--hairline')}" stroke-width="1"/>`;
    s += `<text x="${bx + 14}" y="${by + 20}" font-size="11.5" font-weight="600" letter-spacing="2" fill="${cssVar('--ink-soft')}">图 例</text>`;
    rows.forEach((r, i) => {
      const ry = by + 34 + i * 22;
      s += markersSVG([r.id], bx + 22, ry);
      s += `<text x="${bx + 40}" y="${ry + 10}" font-size="12" fill="${cssVar('--ink')}">${escXml(r.text)}</text>`;
    });
    s += '\n';
  }
  // 联系标签
  for (const it of collectRelationships()) {
    if (!it.rel.title) continue;
    const fontSize2 = 11.5;
    const tw2 = [...it.rel.title].length * fontSize2 + 16;
    s += `<rect x="${(it.midX - tw2 / 2).toFixed(1)}" y="${(it.midY - 9).toFixed(1)}" width="${tw2.toFixed(1)}" height="18" rx="6" fill="${cssVar('--paper')}" stroke="${cssVar('--ink-faint')}" stroke-width="1" stroke-dasharray="4,3"/>\n`;
    s += `<text x="${it.midX.toFixed(1)}" y="${(it.midY + 4).toFixed(1)}" text-anchor="middle" font-size="${fontSize2}" font-family="inherit" fill="${cssVar('--ink-soft')}">${escXml(it.rel.title)}</text>\n`;
  }
  // 概要标签（复用覆盖层布局）
  for (const it of collectSummaryLayout()) {
    const fontSize = 12.5, pad = 10;
    const tw = [...it.sum.title].length * fontSize * 0.85 + pad * 2;
    const th = fontSize + pad;
    const x = it.labelX - tw / 2;
    s += `<rect x="${x.toFixed(1)}" y="${(it.labelY - th / 2).toFixed(1)}" width="${tw.toFixed(1)}" height="${th.toFixed(1)}" rx="8" fill="${cssVar('--paper')}" stroke="${cssVar(`--${it.hue}`)}" stroke-width="1.5" stroke-opacity=".5"/>\n`;
    s += `<text x="${it.labelX.toFixed(1)}" y="${(it.labelY + fontSize * 0.35).toFixed(1)}" text-anchor="middle" font-size="${fontSize}" font-family="inherit" font-weight="600" fill="${cssVar('--ink')}">${escXml(it.sum.title)}</text>\n`;
  }
  return s + '</svg>\n';
}
export type ExportKind = 'png' | 'svg' | 'md' | 'opml' | 'mm' | 'txt' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'textbundle';

/* ---------- PNG 水印开关（文本 = 根标题，状态存 localStorage） ---------- */
export const WM_KEY = 'zhiya.watermark';
export const watermarkOn = (): boolean => localStorage.getItem(WM_KEY) === '1';
export function toggleWatermark(): boolean {
  const on = !watermarkOn();
  if (on) localStorage.setItem(WM_KEY, '1'); else localStorage.removeItem(WM_KEY);
  toast(on ? 'PNG 水印已开启（文本：' + sheet.root.title + '）' : 'PNG 水印已关闭');
  return on;
}
function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const text = sheet.root.title;
  ctx.save();
  ctx.rotate(-30 * Math.PI / 180);
  ctx.font = `600 ${Math.max(18, W / 42)}px ${cssVar('--font') || 'sans-serif'}`;
  ctx.fillStyle = cssVar('--ink-soft');
  ctx.globalAlpha = 0.12;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const stepX = Math.max(220, W / 5), stepY = Math.max(120, W / 12);
  for (let x = -H; x < W + H; x += stepX) {
    for (let y = -W; y < H + W; y += stepY) {
      ctx.fillText(text, x, y);
    }
  }
  ctx.restore();
}
export function doExport(kind: ExportKind): void {
  switch (kind) {
    case 'png': exportPNG(); return;
    case 'svg': {
      const s = exportSVGString();
      if (s) { downloadBlob(`枝桠-${stamp()}.svg`, new Blob([s], { type: 'image/svg+xml;charset=utf-8' })); toast('已导出 SVG'); }
      return;
    }
    case 'md': downloadBlob(`枝桠-${stamp()}.md`, new Blob([toMarkdown()], { type: 'text/markdown;charset=utf-8' })); toast('已导出 Markdown'); return;
    case 'opml': downloadBlob(`枝桠-${stamp()}.opml`, new Blob([toOPML()], { type: 'text/x-opml+xml;charset=utf-8' })); toast('已导出 OPML'); return;
    case 'mm': downloadBlob(`枝桠-${stamp()}.mm`, new Blob([toFreeMind()], { type: 'application/x-freemind;charset=utf-8' })); toast('已导出 FreeMind'); return;
    case 'txt': downloadBlob(`枝桠-${stamp()}.txt`, new Blob([toOutlineText()], { type: 'text/plain;charset=utf-8' })); toast('已导出大纲文本'); return;
    case 'docx': downloadBlob(`枝桠-${stamp()}.docx`, new Blob([buildDocx() as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); toast('已导出 Word (.docx)'); return;
    case 'xlsx': downloadBlob(`枝桠-${stamp()}.xlsx`, new Blob([buildXlsx() as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); toast('已导出 Excel (.xlsx)'); return;
    case 'pptx': downloadBlob(`枝桠-${stamp()}.pptx`, new Blob([buildPptx() as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })); toast('已导出 PPT (.pptx)'); return;
    case 'textbundle': downloadBlob(`枝桠-${stamp()}.textbundle`, new Blob([buildTextbundle(toMarkdown()) as unknown as BlobPart], { type: 'application/octet-stream' })); toast('已导出 TextBundle'); return;
    case 'pdf': fitView(); setTimeout(() => window.print(), 350); toast('已唤起打印（选择"另存为 PDF"）'); return;
  }
}

/* ---------- 分支级导出：以指定主题为根重建导图 ---------- */
function branchToJSON(t: import('./model').Topic): import('./model').TopicJSON {
  return {
    id: t.id, title: t.title,
    children: { attached: t.children.map(branchToJSON) },
    notes: t.note ? { plain: { content: t.note } } : undefined,
    style: hasStyle(t.style) ? { properties: styleToProperties(t.style) } : undefined,
    boundary: t.boundary || undefined,
    summaries: t.summaries.length ? t.summaries.map(x => ({ id: x.id, range: `(${x.rangeStart},${x.rangeEnd})`, topicId: x.topicId })) : undefined,
    markers: t.markers.length ? t.markers.map(m => ({ markerId: m })) : undefined,
    extensions: { collapsed: t.collapsed ? true : undefined, side: t.side !== 'auto' ? t.side : undefined }
  };
}
export function exportBranchXmind(id: string): void {
  const t = topicOf(id); if (!t) return;
  const zip = buildZip(xmindPackageFiles(toXmindSheets({
    sheets: [{ id: uid('s'), class: 'sheet', structureClass: 'org.xmind.ui.logic-chart', rootTopic: branchToJSON(t) }]
  })));
  downloadBlob(`枝桠-分支-${t.title.slice(0, 10)}-${stamp()}.xmind`, new Blob([zip as unknown as BlobPart], { type: 'application/octet-stream' }));
  toast(`已导出分支「${t.title.slice(0, 12)}」(.xmind)`);
}
export function exportBranchMarkdown(id: string): void {
  const t = topicOf(id); if (!t) return;
  const lines = [`# ${t.title}`, ''];
  const walk = (x: import('./model').Topic, d: number) => {
    lines.push('  '.repeat(d) + '- ' + x.title.replace(/^([-*>#+\d.]+)(\s)/, '\\$1$2'));
    if (x.note) x.note.split('\n').forEach(l => lines.push('  '.repeat(d + 1) + '> ' + l));
    x.children.forEach(c => walk(c, d + 1));
  };
  t.children.forEach(c => walk(c, 0));
  downloadBlob(`枝桠-分支-${t.title.slice(0, 10)}-${stamp()}.md`, new Blob([lines.join('\n') + '\n'], { type: 'text/markdown;charset=utf-8' }));
  toast(`已导出分支「${t.title.slice(0, 12)}」(Markdown)`);
}

/** layoutEngineVersion < 5 时 Xmind 会丢弃 image 宽高；导入前规范化避免脏尺寸 */
function stripLegacyImageMetrics(node: unknown): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(stripLegacyImageMetrics); return; }
  const o = node as Record<string, unknown>;
  const img = o.image;
  if (img && typeof img === 'object') {
    delete (img as Record<string, unknown>).width;
    delete (img as Record<string, unknown>).height;
    delete (img as Record<string, unknown>).w;
    delete (img as Record<string, unknown>).h;
  }
  for (const v of Object.values(o)) stripLegacyImageMetrics(v);
}

/* ---------- 文件打开（.json / .xmind；FS 对话框与隐藏 input 共用） ---------- */
export async function openMarkdownText(md: string): Promise<void> {
  const { markdownToZhiyaJSON } = await import('./markdown-import');
  const data = markdownToZhiyaJSON(md);
  const s = fromJSON(data);
  applySheet(s, s.root.id);
  pushHistory(); relayout(false); fitView();
  toast('已从 Markdown 导入');
}

export async function openBuffer(buf: ArrayBuffer, fileName: string): Promise<void> {
  try {
    let data: ZhiyaJSON;
    let zipBytes: Uint8Array | null = null;
    const head = new Uint8Array(buf.slice(0, 4));
    const isXmindFile = fileName.toLowerCase().endsWith('.xmind') || (head[0] === 0x50 && head[1] === 0x4B);
    if (isXmindFile) {
      zipBytes = new Uint8Array(buf);
      const manifest = await unzipEntry(zipBytes, 'manifest.json');
      if (manifest) {
        const mf = JSON.parse(new TextDecoder().decode(manifest)) as { 'file-entries'?: Record<string, { 'encryption-data'?: unknown }> };
        const entries = mf['file-entries'] ?? {};
        if (Object.values(entries).some(e => e && typeof e === 'object' && e['encryption-data'])) {
          throw new Error('加密思维导图暂不支持，请在 Xmind 中另存为未加密文件');
        }
      }
      const metaRaw = await unzipEntry(zipBytes, 'metadata.json');
      let layoutEngineVersion: string | undefined;
      if (metaRaw) {
        const meta = JSON.parse(new TextDecoder().decode(metaRaw)) as { layoutEngineVersion?: string };
        layoutEngineVersion = meta.layoutEngineVersion;
      }
      const content = await unzipEntry(zipBytes, 'content.json');
      if (!content) throw new Error('包内没有 content.json');
      const parsed: unknown = JSON.parse(new TextDecoder().decode(content));
      if (layoutEngineVersion && parseInt(layoutEngineVersion, 10) < 5) {
        stripLegacyImageMetrics(parsed);
      }
      if (Array.isArray(parsed)) data = { sheets: parsed as ZhiyaJSON['sheets'] };
      else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as ZhiyaJSON).sheets)) data = parsed as ZhiyaJSON;
      else if (parsed && typeof parsed === 'object' && (parsed as { rootTopic?: unknown }).rootTopic) {
        data = { sheets: [parsed as NonNullable<ZhiyaJSON['sheets']>[number]] };
      } else throw new Error('content.json 不是 Xmind 工作簿');
    } else {
      data = JSON.parse(new TextDecoder().decode(buf)) as ZhiyaJSON;
      if (!data.sheets && (data as never as { rootTopic?: unknown }).rootTopic) data = { sheets: [{ rootTopic: (data as never as { rootTopic: never }).rootTopic }] };
    }
    const s = fromJSON(data.sheets ? data : { sheets: [{ rootTopic: data as never }] });
    await resolveXapAssets(s.root, zipBytes ?? new Uint8Array(buf), !!zipBytes);
    applySheet(s, s.root.id);
    pushHistory(); relayout(false); fitView();
    toast('已打开');
  } catch (err) { toast('文件解析失败：' + (err as Error).message); }
}

document.getElementById('file-input')?.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => void openBuffer(reader.result as ArrayBuffer, file.name);
  reader.readAsArrayBuffer(file);
  input.value = '';
});

/** 导入时解析 ZIP 内资产：xap:resources/ 图片 → dataURL（进模型），xap:attachments/ → 附件仓 */
async function resolveXapAssets(root: import('./model').Topic, zipBytes: Uint8Array, fromZip: boolean): Promise<void> {
  if (!fromZip) return;
  const walk = async (t: import('./model').Topic): Promise<void> => {
    if (t.image?.src.startsWith('xap:resources/')) {
      const name = t.image.src.slice(4);
      try {
        const bytes = await unzipEntry(zipBytes, name);
        if (bytes) {
          const ext = name.split('.').pop()?.toLowerCase() ?? 'png';
          const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          let bin = '';
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
          t.image.src = `data:${mime};base64,${btoa(bin)}`;
        } else t.image = null;
      } catch { t.image = null; }
    }
    if (t.href.startsWith('xap:attachments/')) {
      const name = t.href.slice(4);
      try {
        const bytes = await unzipEntry(zipBytes, name);
        if (bytes) loadAttachment(name, bytes);
        else t.href = '';
      } catch { t.href = ''; }
    }
    for (const c of t.children) await walk(c);
    for (const c of t.detachedKids) await walk(c);
    for (const c of t.calloutKids) await walk(c);
  };
  await walk(root);
}
