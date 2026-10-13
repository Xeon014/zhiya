import { indexModel, metaOf, sheet, subtreeCount, topicOf, walkVisible } from './model';
import { engine } from './engines';
import { figureMap, figureOf, makeMeasureContext } from './figures';
import { updateStatus } from './ui';
import { updateNoteAnchor } from './notes';
import { updateMiniBar } from './minibar';
import { clamp, easeOutCubic } from './utils';
import { edgesEl } from './dom';
import { edgePathFor, getTheme, applyTheme, effectiveStyle, releaseThemePaint, releaseStaleThemePaint } from './edges';
import { renderOverlays, updateSummaryFigures } from './overlays';
import { relationshipsSVG, updateRelationshipFigures } from './relationships';
import { placeDetachedSubtree } from './engines';
import { renderLegend } from './legend';

/* =====================================================================
 * 四、布局编排 + 动画（布局结果 → 目标位 → 230ms 补间）
 * ===================================================================== */
let animToken = 0;
let lastAppliedTheme = '';
let lastThemedSheet = '';
let lastAppliedStructure = '';

interface Target { from: { x: number; y: number }; to: { x: number; y: number }; p: any; f: import('./figures').Figure }
interface EdgeSpec { d: string; hue: string; color?: string; width?: number }

const SVG_NS = 'http://www.w3.org/2000/svg';
let branchPaths: SVGPathElement[] = [];
let paintedHead = '\u0000';
let paintedTail = '\u0000';

/** 连线层拆成三组：外框 / 分支曲线 / 装饰+联系+概要。动画只改分支 d。 */
function edgeLayers(): { head: SVGGElement; branches: SVGGElement; tail: SVGGElement } {
  let head = edgesEl.querySelector('#zy-head') as SVGGElement | null;
  let branches = edgesEl.querySelector('#zy-branches') as SVGGElement | null;
  let tail = edgesEl.querySelector('#zy-tail') as SVGGElement | null;
  if (!head || !branches || !tail) {
    edgesEl.replaceChildren();
    head = document.createElementNS(SVG_NS, 'g');
    head.id = 'zy-head';
    branches = document.createElementNS(SVG_NS, 'g');
    branches.id = 'zy-branches';
    tail = document.createElementNS(SVG_NS, 'g');
    tail.id = 'zy-tail';
    edgesEl.append(head, branches, tail);
    branchPaths = [];
    paintedHead = '\u0000';
    paintedTail = '\u0000';
  }
  for (const n of [...edgesEl.children]) {
    if (n !== head && n !== branches && n !== tail) n.remove();
  }
  return { head, branches, tail };
}

function paintStatic(el: SVGGElement, html: string, slot: 'head' | 'tail'): void {
  if ((slot === 'head' ? paintedHead : paintedTail) === html) return;
  el.innerHTML = html;
  if (slot === 'head') paintedHead = html;
  else paintedTail = html;
}

function paintBranches(g: SVGGElement, specs: EdgeSpec[]): void {
  while (branchPaths.length < specs.length) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke-opacity', '.55');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    p.setAttribute('stroke-linecap', 'round');
    g.appendChild(p);
    branchPaths.push(p);
  }
  while (branchPaths.length > specs.length) branchPaths.pop()!.remove();
  for (let i = 0; i < specs.length; i++) {
    const p = branchPaths[i]!;
    const s = specs[i]!;
    if (p.getAttribute('d') !== s.d) p.setAttribute('d', s.d);
    const stroke = s.color || `var(--${s.hue})`;
    if (p.getAttribute('stroke') !== stroke) p.setAttribute('stroke', stroke);
    const width = s.width != null ? String(s.width) : '1.8';
    if (p.getAttribute('stroke-width') !== width) p.setAttribute('stroke-width', width);
  }
}

export function relayout(animate = true): void {
  const token = ++animToken;   // 含无动画重排：旧补间不得再覆盖自由主题拖拽 / 概要预览
  indexModel();
  // 恢复路径（撤销/导入/切画布）后：主题 CSS 变量与引擎下拉与模型重新同步
  if (sheet.id !== lastThemedSheet) {
    lastThemedSheet = sheet.id;
    lastAppliedTheme = sheet.themeClass;
    releaseStaleThemePaint(sheet.root);
    applyTheme(sheet.themeClass);
  } else if (sheet.themeClass !== lastAppliedTheme) {
    if (lastAppliedTheme) releaseThemePaint(sheet.root, getTheme(lastAppliedTheme));
    releaseStaleThemePaint(sheet.root);
    lastAppliedTheme = sheet.themeClass;
    applyTheme(sheet.themeClass);
  }
  if (sheet.structureClass !== lastAppliedStructure) {
    lastAppliedStructure = sheet.structureClass;
    const sel = document.getElementById('structure-select') as HTMLSelectElement | null;
    if (sel && sel.value !== sheet.structureClass) sel.value = sheet.structureClass;
  }
  // 先恢复可见性再度量：折叠过的主题若仍 display:none，offsetHeight=0
  // 会污染 heights（表现为展开后兄弟行叠在一起——v1.19.3 修复）
  const visible = [...walkVisible()];
  const visibleSet = new Set(visible.map(t => t.id));
  for (const [id, f] of figureMap) {
    const show = visibleSet.has(id);
    const disp = show ? '' : 'none';
    if (f.el.style.display !== disp) f.el.style.display = disp;
    const chevDisp = (show && (topicOf(id)?.children.length ?? 0)) ? '' : 'none';
    if (f.chev.style.display !== chevDisp) f.chev.style.display = chevDisp;
  }

  const ctx = makeMeasureContext();
  ctx.prime(visible);

  // 双阶段：先同步内容再度量（引擎内部调用 sizeOf 时已同步）
  const heights = engine().measure(ctx);
  const split = engine().growthSplit?.(sheet.root, heights as Map<string, number>) ?? null;
  const pos = engine().arrange(ctx, heights, split);
  // 自由主题：以自身 position 为子根独立布局（Xmind detached 通道）
  for (const t of visible) {
    if (t.pos) for (const [id, b] of placeDetachedSubtree(ctx, t, t.pos)) pos.set(id, b);
  }

  for (const t of visible) figureOf(t);

  const targets = new Map<string, Target>();
  for (const t of visible) {
    const p = pos.get(t.id); if (!p) continue;
    const f = figureOf(t);
    const meta = metaOf(t.id);
    const from = f.cur ?? {
      x: meta?.parent ? pos.get(meta.parent.id)?.x ?? 0 : 0,
      y: meta?.parent ? pos.get(meta.parent.id)?.y ?? 0 : 0
    };
    targets.set(t.id, { from, to: { x: p.x, y: p.y }, p, f });
    f.cur = { x: p.x, y: p.y };   // 立即设置语义正确位置（fitView/侧栏/备注锚点都依赖它）
  }

  // 外框 / 装饰 / 联系 / 概要都读最终坐标，一次布局内不变；只有分支曲线跟随补间
  const overlay = renderOverlays();
  const engDef = engine();
  const headSVG = overlay.boundary;
  const tailSVG = (engDef.decorEdges?.(pos) ?? '') + relationshipsSVG() + overlay.summary;

  const branchSpecs = (posNow: Map<string, { x: number; y: number }>): EdgeSpec[] => {
    const specs: EdgeSpec[] = [];
    const full = (id: string) => {
      const live = posNow.get(id), t = targets.get(id);
      return (live && t) ? { x: live.x, y: live.y, w: t.p.w, h: t.p.h, side: t.p.side as string } : null;
    };
    for (const t of visible) {
      if (t.collapsed) continue;
      const pp = full(t.id); if (!pp) continue;
      for (const c of t.children) {
        const cp = full(c.id); if (!cp) continue;
        const hue = metaOf(c.id)?.hue ?? metaOf(t.id)?.hue ?? 'b5';
        // 线型、颜色、粗细都记在子主题上，画的是父主题连向这个子主题的同一条线
        const eff = effectiveStyle(c);
        const lineClass = engDef.fixedEdges ? null : (eff.lineClass || null);
        const d = lineClass
          ? edgePathFor(lineClass, pp, cp)
          : engDef.edgePath(pp, cp, cp.side);
        specs.push({ d, hue, color: eff.line, width: eff.lineWidth });
      }
    }
    return specs;
  };

  let staticReady = false;
  const applyFrame = (posNow: Map<string, { x: number; y: number }>) => {
    for (const [id, t] of targets) {
      const { f, p } = t;
      const cur = posNow.get(id); if (!cur) continue;
      f.el.style.left = cur.x + 'px';
      f.el.style.top = cur.y + 'px';
      const topic = topicOf(id); if (!topic) continue;
      const anch = engDef.chevronAt(topic, p);
      f.chev.style.left = anch.x + 'px'; f.chev.style.top = anch.y + 'px';
      const badge = topic.collapsed ? String(subtreeCount(topic) - 1) : '';
      if (f.chev.textContent !== badge) f.chev.textContent = badge;
      f.chev.classList.toggle('collapsed', topic.collapsed);
    }
    const layers = edgeLayers();
    if (!staticReady) {
      paintStatic(layers.head, headSVG, 'head');
      paintStatic(layers.tail, tailSVG, 'tail');
      staticReady = true;
    }
    paintBranches(layers.branches, branchSpecs(posNow));
    updateNoteAnchor();
    updateMiniBar();
  };

  const livePos = new Map<string, { x: number; y: number }>();
  if (!animate) {
    for (const [id, t] of targets) livePos.set(id, { ...t.to });
    applyFrame(livePos);
    for (const [, t] of targets) t.f.el.classList.remove('ghost');
    updateSummaryFigures();
    updateRelationshipFigures();
    renderLegend();
    updateStatus();
    return;
  }

  const t0 = performance.now(), DUR = 230;
  for (const [id, t] of targets) livePos.set(id, { ...t.from });
  const tick = (now: number) => {
    if (token !== animToken) return;   // 更新的布局已接管 DOM
    const k = easeOutCubic(clamp((now - t0) / DUR, 0, 1));
    for (const [id, t] of targets) {
      const lp = livePos.get(id); if (!lp) continue;
      lp.x = t.from.x + (t.to.x - t.from.x) * k;
      lp.y = t.from.y + (t.to.y - t.from.y) * k;
    }
    applyFrame(livePos);
    if (k < 1) requestAnimationFrame(tick);
    else {
      for (const [, t] of targets) t.f.el.classList.remove('ghost');
      updateSummaryFigures();
      updateRelationshipFigures();
      renderLegend();
    }
  };
  requestAnimationFrame(tick);
  const hint = document.getElementById('hint');
  if (hint) hint.style.opacity = '0';
  updateStatus();
}
