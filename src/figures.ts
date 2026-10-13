import { metaOf, selectedId, sheet, type Topic } from './model';
import type { MeasureCtx } from './engines';
import { SHAPES, getShape, clipPathOf } from './shapes';
import { markersHTML } from './markers';
import { isAttachmentHref, getAttachment, downloadAttachment } from './assets';
import { isPickingRelationship, tryCompleteRelationshipPick } from './relationships';
import { figuresEl } from './dom';
import { toast as _toast } from './ui';
import { effectiveStyle } from './edges';
const toastRef: ((m: string) => void) | null = _toast;

/* =====================================================================
 * 三、Figure 图层（对应 topicFigureByTopicId 桥）
 * ===================================================================== */
export interface Figure {
  el: HTMLDivElement;
  ttl: HTMLSpanElement;
  mkEl: HTMLDivElement;     // 标记行（Xmind markers）
  lbEl: HTMLDivElement;     // 标签芯片行（Xmind labels）
  imgEl: HTMLImageElement;  // 主题图片（Xmind image）
  lnkEl: HTMLAnchorElement; // 链接角标（Xmind href）
  noteEl: HTMLDivElement;
  chev: HTMLDivElement;
  cur: { x: number; y: number } | null;
}
export const figureMap = new Map<string, Figure>();
export const chevronMap = new Map<string, HTMLDivElement>();

// 事件处理函数来自交互/菜单/笔记/拖拽模块（运行期循环引用安全）
import { select, startEdit, toggleCollapse, toggleMultiSelect } from './interactions';
import { startTopicDragWatch } from './dragdrop';
import { topicMenu } from './menus';
import { openNoteFor } from './notes';

export function figureOf(topic: Topic): Figure {
  let f = figureMap.get(topic.id);
  if (!f) {
    const el = document.createElement('div');
    el.className = 'topic ghost';
    el.dataset.id = topic.id;
    el.style.left = '0px'; el.style.top = '0px';   // 创建即定位：保证 shrink-to-fit 测量与布局后一致
    const mkEl = document.createElement('div');    // 标记行（Xmind markers，置于标题上方）
    mkEl.className = 't-markers';
    el.appendChild(mkEl);
    const lbEl = document.createElement('div');    // 标签芯片行（Xmind labels）
    lbEl.className = 't-labels';
    el.appendChild(lbEl);
    const imgEl = document.createElement('img');   // 主题图片（Xmind image）
    imgEl.className = 't-image';
    imgEl.draggable = false;
    imgEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.appendChild(imgEl);
    const ttl = document.createElement('span');    // 标题独立 span（保护子元素不被 textContent 清掉）
    ttl.className = 't-title';
    el.appendChild(ttl);
    const lnkEl = document.createElement('a');     // 链接角标（Xmind href）
    lnkEl.className = 't-link';
    lnkEl.target = '_blank';
    lnkEl.rel = 'noopener';
    lnkEl.title = '打开链接';
    lnkEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
    lnkEl.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      const href = lnkEl.dataset.href || '';
      if (!href) return;
      if (isAttachmentHref(href)) {
        const name = href.split('/').pop() ?? '附件';
        if (!downloadAttachment(href, name)) toastRef?.('附件已失效（重载后需重新附加）');
        return;
      }
      window.open(href, '_blank', 'noopener');
    });
    el.appendChild(lnkEl);
    const noteEl = document.createElement('div');  // 笔记块（Xmind notesDisplay: Block）
    noteEl.className = 't-note';
    el.appendChild(noteEl);
    const dot = document.createElement('div');     // 备注角标：Xmind 式黄底三横线（info_notes.svg）
    dot.className = 'note-dot'; dot.dataset.id = topic.id;
    dot.title = '备注';
    dot.innerHTML = '<svg viewBox="0 0 20 20"><g fill="#22262A"><rect x="5.5" y="6.5" width="9" height="1.4" rx="0.7"/><rect x="5.5" y="9.3" width="9" height="1.4" rx="0.7"/><rect x="5.5" y="12.1" width="5" height="1.4" rx="0.7"/></g></svg>';
    dot.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
    dot.addEventListener('click', (e) => { e.stopPropagation(); openNoteFor(topic.id); });
    dot.addEventListener('dblclick', (e) => e.stopPropagation());
    el.appendChild(dot);
    const chev = document.createElement('div');
    chev.className = 'chevron'; chev.dataset.id = topic.id;
    chev.style.left = '0px'; chev.style.top = '0px';
    figuresEl.appendChild(el); figuresEl.appendChild(chev);
    f = { el, ttl, mkEl, lbEl, imgEl, lnkEl, noteEl, chev, cur: null };
    figureMap.set(topic.id, f); chevronMap.set(topic.id, chev);
    bindFigureEvents(el, chev);
  }
  return f;
}

function bindFigureEvents(el: HTMLDivElement, chev: HTMLDivElement): void {
  el.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;                      // 只响应主键/触摸（右键留给菜单）
    e.stopPropagation();
    if (isPickingRelationship()) {                   // 联系拾取模式：点击即建立联系
      tryCompleteRelationshipPick(el.dataset.id!);
      return;
    }
    if (!el.classList.contains('editing')) {
      if (e.ctrlKey || e.metaKey) { toggleMultiSelect(el.dataset.id!); return; }
      select(el.dataset.id!); startTopicDragWatch(e, el.dataset.id!);
    }
  });
  el.addEventListener('dblclick', (e) => { e.stopPropagation(); startEdit(el.dataset.id!); });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    topicMenu(el.dataset.id!, e.clientX, e.clientY);
  });
  chev.addEventListener('pointerdown', (e: PointerEvent) => { if (e.button === 0) { e.stopPropagation(); toggleCollapse(chev.dataset.id!); } });
}

/** 应用形状到 Figure（Xmind shape-class → 注册表驱动：clip-path / border-radius / 线条类） */
const SHAPE_CLASSES = Object.keys(SHAPES).map(k => `shape-${k}`);
function applyShapeStyle(el: HTMLElement, shape: string): void {
  el.classList.remove(...SHAPE_CLASSES);
  el.style.clipPath = '';
  el.style.borderRadius = '';
  el.style.paddingLeft = el.style.paddingRight = el.style.paddingTop = el.style.paddingBottom = '';
  if (!shape) return;
  el.classList.add(`shape-${shape}`);
  const def = getShape(shape);
  if (!def) return;
  const padX = def.padX ?? 1, padY = def.padY ?? 1;
  // 填充多边形：点尖形状按系数加宽内边距（参与布局测量，引擎自适应）
  if (def.pts) {
    el.style.clipPath = clipPathOf(def.pts);
    el.style.paddingLeft = el.style.paddingRight = Math.round(14 * padX) + 'px';
    el.style.paddingTop = el.style.paddingBottom = Math.round(7 * padY) + 'px';
    return;
  }
  if (def.ellipse) {
    el.style.borderRadius = '50%';
    el.style.paddingLeft = el.style.paddingRight = Math.round(14 * padX) + 'px';
    el.style.paddingTop = el.style.paddingBottom = Math.round(7 * padY) + 'px';
    return;
  }
  if (def.radius !== undefined) {
    el.style.borderRadius = def.radius === 'half' ? '500px' : def.radius + 'px';
    el.style.paddingLeft = el.style.paddingRight = Math.round(14 * padX) + 'px';
    el.style.paddingTop = el.style.paddingBottom = Math.round(7 * padY) + 'px';
    return;
  }
  // 线条型（括号/引号/下划线家族）：padding 由 CSS 形状类控制
}

/** 尺寸缓存：同一内容签名跨 relayout 复用，避免拖拽每帧对每个主题强制重排。
 *  图片 dataURL 用引用相等比较，不把整段 base64 拼进 key。 */
interface SizeMemo { w: number; h: number; key: string; img: string | null }
const sizeMemo = new Map<string, SizeMemo>();

function sizeIdentity(topic: Topic): { key: string; img: string | null } {
  const meta = metaOf(topic.id);
  const eff = effectiveStyle(topic);
  const st = topic.style ?? {};
  const img = topic.image;
  const key = [
    sheet.themeClass,
    meta?.depth ?? 0, meta?.parent?.id ?? '', meta?.hue ?? '',
    topic.title, topic.note, topic.markers.join(','), topic.labels.join('\u0001'),
    topic.href, img ? `${img.w}x${img.h}` : '',
    eff.shape ?? '', eff.fill ?? '', eff.text ?? '', st.line ?? '',
    eff.fontSize ?? '', eff.bold ? 1 : 0, eff.italic ? 1 : 0, eff.align ?? '',
    st.border ?? '', st.borderWidth ?? '',
    topic.isCallout ? 1 : 0
  ].join('\u0002');
  return { key, img: img?.src ?? null };
}

function imageReady(topic: Topic, f: Figure): boolean {
  if (!topic.image?.src) return true;
  return f.imgEl.complete && f.imgEl.naturalWidth > 0;
}

function rememberSize(topic: Topic, f: Figure): { w: number; h: number } {
  const w = f.el.offsetWidth, h = f.el.offsetHeight;
  if (f.el.style.display !== 'none' && w > 0 && h > 0 && imageReady(topic, f)) {
    const id = sizeIdentity(topic);
    sizeMemo.set(topic.id, { w, h, key: id.key, img: id.img });
  }
  return { w, h };
}

function cachedSize(topic: Topic): { w: number; h: number } | null {
  const hit = sizeMemo.get(topic.id);
  if (!hit) return null;
  const id = sizeIdentity(topic);
  if (hit.key !== id.key || hit.img !== id.img) return null;
  return hit;
}

/** 拖拽参考线等热路径读取，未测量过则返回 null */
export function cachedTopicSize(id: string): { w: number; h: number } | null {
  const hit = sizeMemo.get(id);
  return hit ? { w: hit.w, h: hit.h } : null;
}

/** 注入给布局引擎的测量函数：真实 DOM 度量（offsetWidth/Height 不受缩放影响） */
export function makeMeasureContext(): MeasureCtx & { prime(topics: Topic[]): void } {
  // 单次布局内必中：图片尚未解码时不写入跨帧缓存，但同一轮 measure/arrange 不重复读 DOM。
  // 尺寸可以跨帧复用；内容同步不能省（编辑结束会清掉 dataset.title 等 DOM 状态）。
  const local = new Map<string, { w: number; h: number }>();
  const sizeOf = (topic: Topic) => {
    const loc = local.get(topic.id);
    if (loc) return loc;
    const f = figureOf(topic);
    syncFigureContent(f, topic);
    const hit = cachedSize(topic);
    if (hit) { local.set(topic.id, hit); return hit; }
    const size = rememberSize(topic, f);
    local.set(topic.id, size);
    return size;
  };
  return {
    gapV: 14, gapH: 58,
    sizeOf,
    /** 先同步内容（写入已去重），再只对未缓存的节点连续读取尺寸 */
    prime(topics: Topic[]) {
      const figs = topics.map(t => figureOf(t));
      for (let i = 0; i < topics.length; i++) syncFigureContent(figs[i]!, topics[i]!);
      const pending: number[] = [];
      for (let i = 0; i < topics.length; i++) {
        const t = topics[i]!;
        if (local.has(t.id)) continue;
        const hit = cachedSize(t);
        if (hit) { local.set(t.id, hit); continue; }
        pending.push(i);
      }
      for (const i of pending) {
        const size = rememberSize(topics[i]!, figs[i]!);
        local.set(topics[i]!.id, size);
      }
    }
  };
}

export function syncFigureContent(f: Figure, topic: Topic): void {
  const meta = metaOf(topic.id);
  const depth = meta?.depth ?? 0;
  const depthStr = String(depth);
  const parentId = meta?.parent?.id ?? '';
  if (f.el.dataset.parent !== parentId) f.el.dataset.parent = parentId;
  // 深度类名只在变化时重建，避免每次测量都跑正则并改写 className（会弄脏布局）
  if (f.el.dataset.depth !== depthStr) {
    f.el.dataset.depth = depthStr;
    const wanted = depth === 0 ? 'topic root' : depth === 1 ? 'topic l1' : 'topic';
    const shapeCls = f.el.className.match(/shape-[\w-]+/);
    const flags = ['selected', 'editing', 'ghost', 'has-note', 'has-markers', 'has-labels', 'has-image', 'callout', 'dragging', 'drop-into'];
    let cls = wanted;
    for (const fl of flags) if (f.el.classList.contains(fl)) cls += ' ' + fl;
    if (shapeCls) cls += ' ' + shapeCls[0];
    f.el.className = cls;
  }
  f.el.classList.toggle('has-note', !!topic.note);
  const noteText = topic.note ? topic.note.trim() : '';
  if (f.noteEl.dataset.txt !== noteText && !f.el.classList.contains('editing')) {
    f.noteEl.textContent = noteText;
    f.noteEl.dataset.txt = noteText;
  }
  if (f.el.dataset.title !== topic.title && !f.el.classList.contains('editing')) {
    f.ttl.textContent = topic.title; f.el.dataset.title = topic.title;
  }
  const mkKey = topic.markers.join(',');
  if (f.el.dataset.markers !== mkKey) {
    f.el.dataset.markers = mkKey;
    f.mkEl.innerHTML = markersHTML(topic.markers);
    f.el.classList.toggle('has-markers', topic.markers.length > 0);
  }
  const lbKey = topic.labels.join('\u0001');
  if (f.el.dataset.labels !== lbKey) {
    f.el.dataset.labels = lbKey;
    f.lbEl.innerHTML = topic.labels.map((l, i) => `<span class="lb-chip hue-${LABEL_HUES[l.length % LABEL_HUES.length]}">${escHtml(l)}</span>`).join('');
    f.el.classList.toggle('has-labels', topic.labels.length > 0);
  }
  const hrefKey = topic.href || '';
  if (f.el.dataset.href !== hrefKey) {
    f.el.dataset.href = hrefKey;
    f.lnkEl.dataset.href = hrefKey;
    f.lnkEl.textContent = hrefKey ? (isAttachmentHref(hrefKey) ? '📎' : '🔗') : '';
    f.lnkEl.style.display = hrefKey ? 'block' : 'none';
  }
  const imgKey = topic.image?.src ?? '';
  if (f.el.dataset.img !== imgKey) {
    f.el.dataset.img = imgKey;
    if (topic.image && topic.image.src) {
      f.imgEl.src = topic.image.src;
      f.imgEl.style.width = topic.image.w + 'px';
      f.imgEl.style.display = '';
      f.el.classList.add('has-image');
    } else {
      f.imgEl.removeAttribute('src');
      f.imgEl.style.display = 'none';
      f.el.classList.remove('has-image');
    }
  }
  f.el.classList.toggle('callout', topic.isCallout);
  // 样式：节点覆盖优先，否则用当前主题该层角色（不把主题写回 topic.style）
  const eff = effectiveStyle(topic);
  const st = topic.style ?? {};
  const shapeKey = eff.shape ?? '';
  if (f.el.dataset.shape !== shapeKey) {
    applyShapeStyle(f.el, shapeKey);
    f.el.dataset.shape = shapeKey;
  }
  const fill = eff.fill || '';
  if ((f.el.dataset.fillv ?? '') !== fill) {
    f.el.dataset.fillv = fill;
    f.el.style.background = fill;
  }
  const text = eff.text || '';
  if ((f.el.dataset.textv ?? '') !== text) {
    f.el.dataset.textv = text;
    f.el.style.color = text;
  }
  const typo = `${eff.fontSize ?? ''}|${eff.bold ? 1 : 0}|${eff.italic ? 1 : 0}|${eff.align ?? ''}`;
  if (f.el.dataset.typo !== typo) {
    f.el.dataset.typo = typo;
    f.el.style.fontSize = eff.fontSize ? `${eff.fontSize}px` : '';
    f.el.style.textAlign = eff.align ?? '';
    f.ttl.style.fontWeight = eff.bold ? '700' : '';
    f.ttl.style.fontStyle = eff.italic ? 'italic' : '';
  }
  // 边框与填充分开。没设边框时保留一级分支左侧色条。
  const borderOn = !!(st.border || st.borderWidth);
  const borderKey = borderOn ? `${st.border ?? ''}|${st.borderWidth ?? ''}` : '';
  if ((f.el.dataset.borderk ?? '') !== borderKey) {
    f.el.dataset.borderk = borderKey;
    if (borderOn) {
      f.el.style.borderStyle = 'solid';
      f.el.style.borderWidth = `${st.borderWidth ?? 1.5}px`;
      f.el.style.borderColor = st.border || 'var(--ink)';
    } else {
      f.el.style.borderStyle = '';
      f.el.style.borderWidth = '';
      f.el.style.borderColor = '';
      f.el.style.borderLeftWidth = '';
      delete f.el.dataset.hue;
    }
  }
  if (!borderOn && depth >= 1) {
    const hue = meta?.hue;
    if (hue && f.el.dataset.hue !== hue) {
      f.el.dataset.hue = hue;
      f.el.style.borderColor = `color-mix(in srgb, var(--${hue}) 45%, transparent)`;
      f.el.style.borderLeftWidth = '3px';
    }
  } else if (!borderOn && f.el.dataset.hue && depth < 1) {
    f.el.style.borderColor = '';
    f.el.style.borderLeftWidth = '';
    delete f.el.dataset.hue;
  }
}

/** 读取当前选中主题的 Figure（供外部 UI 定位用） */
export const figureOfSelected = (): Figure | null => (selectedId ? figureMap.get(selectedId) ?? null : null);

const LABEL_HUES = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
function escHtml(x: string): string {
  return x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
