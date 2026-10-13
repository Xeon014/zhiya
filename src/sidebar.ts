import { parentOf, selectedId, sheet, topicOf, SHAPE_LABELS, LINE_CLASS_LABELS, type Topic, type ShapeKind, type TopicStyle, type LineClass, type TextAlign } from './model';
import { figureMap } from './figures';
import { select, multiTargets } from './interactions';
import { flushNote, inputNote } from './notes';
import { repositionTopic } from './dragdrop';
import { centerOn } from './view';
import { pushHistory } from './persistence';
import { relayout } from './layout';
import { sidebarEl, sbBody } from './dom';
import { allThemes, effectiveStyle, getTheme, releaseThemePaint } from './edges';
import { xmindThemeToPreset, presetToXmindTheme, addCustomTheme } from './theme-presets';
import { SHAPE_GROUPS } from './shapes';
import { MARKER_GROUPS, MARKERS } from './markers';

/* =====================================================================
 * 6.8a 侧边栏（大纲 / 备注 / 样式 / 快捷键）
 * ===================================================================== */
let sbTab: 'outline' | 'notes' | 'style' | 'keys' = 'outline';
/** 样式页「更多」展开态。挂在模块上，侧栏重绘不会把它收回去。 */
const styleMore = { shapes: false, markers: false, themes: false };

const FILL_SWATCHES: (string | undefined)[] = [
  undefined, '#FFFFFF', '#F4D607', '#B3563B', '#A67B2E', '#5E7E4E', '#3E7C82', '#4E6398', '#8A5A83', '#23272F'
];
const LINE_SWATCHES: (string | undefined)[] = [
  undefined, '#B3563B', '#A67B2E', '#5E7E4E', '#3E7C82', '#4E6398', '#8A5A83', '#23272F', '#3B5BDB'
];
const TEXT_SWATCHES: (string | undefined)[] = [undefined, '#23272F', '#FFFFFF', '#3B5BDB', '#B3563B', '#5E7E4E'];
const FONT_SIZES = [12, 14, 16, 18, 22, 28];
const LINE_WIDTHS = [1, 2, 3, 5];
const BORDER_WIDTHS = [1, 2, 3, 4];

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function stepButtons(key: string, current: number | undefined, steps: number[]): string {
  let h = `<button type="button" class="shape-btn${current == null ? ' active' : ''}" data-step="${key}" data-v="">默认</button>`;
  for (const n of steps) h += `<button type="button" class="shape-btn${current === n ? ' active' : ''}" data-step="${key}" data-v="${n}">${n}</button>`;
  return h;
}

/** 把样式补丁应用到选中主题（多选时批量应用；对应 Xmind 的 style.properties 写入） */
export function applyStyleToSelected(patch: Partial<TopicStyle>): void {
  const targets = multiTargets().map(id => topicOf(id)).filter(Boolean) as Topic[];
  const primary = topicOf(selectedId);
  if (!primary && !targets.length) return;
  for (const t of (targets.length ? targets : primary ? [primary] : [])) {
    t.style = { ...t.style, ...patch };
    for (const k of Object.keys(t.style) as (keyof TopicStyle)[]) {
      if (t.style[k] === undefined) delete t.style[k];
    }
  }
  pushHistory();
  relayout();
  renderSidebar();
}

interface OutlineHit { id: string; mode: 'before' | 'after' | 'child' }
let outlineDrag: { id: string; sx: number; sy: number; started: boolean; target: OutlineHit | null } | null = null;
let outlineSuppressClick = false;

function topicDescendsFrom(ancId: string, id: string): boolean {
  let cur = topicOf(id);
  while (cur) {
    if (cur.id === ancId) return true;
    cur = parentOf(cur.id);
  }
  return false;
}

function clearOutlineHint(): void {
  sbBody.querySelectorAll('.ol-before, .ol-after, .ol-into, .ol-drag').forEach(el => {
    el.classList.remove('ol-before', 'ol-after', 'ol-into', 'ol-drag');
  });
}

function outlineHitAt(x: number, y: number, dragId: string): OutlineHit | null {
  for (const el of sbBody.querySelectorAll<HTMLElement>('.ol-item')) {
    const r = el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    const id = el.dataset.id!;
    if (id === dragId || topicDescendsFrom(dragId, id)) return null;
    const rel = (y - r.top) / Math.max(r.height, 1);
    const mode: OutlineHit['mode'] = rel < 0.28 ? 'before' : rel > 0.72 ? 'after' : 'child';
    if (mode !== 'child' && !parentOf(id)) return null;
    return { id, mode };
  }
  return null;
}

function showOutlineHint(hit: OutlineHit | null, dragId: string): void {
  clearOutlineHint();
  sbBody.querySelector<HTMLElement>(`.ol-item[data-id="${dragId}"]`)?.classList.add('ol-drag');
  if (!hit) return;
  const el = sbBody.querySelector<HTMLElement>(`.ol-item[data-id="${hit.id}"]`);
  el?.classList.add(hit.mode === 'child' ? 'ol-into' : hit.mode === 'before' ? 'ol-before' : 'ol-after');
}

function beginOutlineDrag(e: PointerEvent, el: HTMLElement): void {
  if (e.button !== 0) return;
  const id = el.dataset.id!;
  if (id === sheet.root.id) return;
  outlineDrag = { id, sx: e.clientX, sy: e.clientY, started: false, target: null };
  el.setPointerCapture(e.pointerId);
}

export function renderSidebar(): void {
  if (!sidebarEl.classList.contains('open')) return;
  if (sbTab === 'outline') {
    let html = '';
    (function walk(t: Topic, d: number) {
      const hidden = !figureMap.has(t.id) || figureMap.get(t.id)!.el.style.display === 'none';
      const rootCls = t.id === sheet.root.id ? ' ol-root' : '';
      html += `<div class="ol-item${rootCls}${t.id === selectedId ? ' sel' : ''}" data-id="${t.id}" style="padding-left:${8 + d * 14}px;${hidden ? 'opacity:.45;' : ''}">${t.title.replace(/</g, '&lt;')}${t.note ? '<span class="ol-note-mark">✎</span>' : ''}</div>`;
      t.children.forEach(c => walk(c, d + 1));
    })(sheet.root, 0);
    sbBody.innerHTML = html || '<div class="sb-empty">空</div>';
    sbBody.querySelectorAll<HTMLElement>('.ol-item').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.id!;
        select(id);
        const f = figureMap.get(id);
        if (f?.cur) centerOn(f.cur.x, f.cur.y);
      };
      el.onpointerdown = (e) => beginOutlineDrag(e, el);
    });
  } else if (sbTab === 'notes') {
    const t = topicOf(selectedId);
    if (!t) {
      sbBody.innerHTML = '<div class="sb-empty">选中一个主题后编辑备注</div>';
    } else {
      const existing = sbBody.querySelector<HTMLTextAreaElement>('#sb-note');
      if (existing && existing.dataset.id === t.id) {
        const title = sbBody.querySelector('.style-target');
        if (title) { title.textContent = t.title; title.setAttribute('title', t.title); }
        if (document.activeElement !== existing && existing.value !== t.note) existing.value = t.note;
      } else {
        if (existing?.dataset.id) flushNote();
        const titleEsc = escAttr(t.title);
        sbBody.innerHTML = `<div class="style-target" title="${titleEsc}">${titleEsc}</div><textarea id="sb-note" class="sb-note" placeholder="写备注…"></textarea><div class="sb-note-hint">画布上的备注框改的是同一份</div>`;
        const ta = sbBody.querySelector('#sb-note') as HTMLTextAreaElement;
        ta.dataset.id = t.id;
        ta.value = t.note;
        const noteId = t.id;
        ta.addEventListener('input', () => inputNote(noteId, ta.value, 'sidebar'));
        ta.addEventListener('blur', () => flushNote());
      }
    }
  } else if (sbTab === 'style') {
    const t = topicOf(selectedId);
    const st: TopicStyle = t?.style ?? {};
    const shown: TopicStyle = t ? effectiveStyle(t) : {};
    const shapeBtn = (k: string, groupName: string) => {
      const label = SHAPE_LABELS[k] ?? k;
      return `<button type="button" class="shape-btn${shown.shape === k ? ' active' : ''}" data-shape="${k}" title="${groupName} · ${label}">${label}</button>`;
    };
    let html = '';
    if (!t) {
      html += '<div class="sb-empty">选中一个主题后设置样式</div>';
    } else {
    const titleEsc = escAttr(t.title);
    html += `<div class="style-target" title="${titleEsc}">${titleEsc}</div>`;
    html += `<div class="style-group is-first">改这个节点</div>`;
    html += `<div class="style-sec">形状</div>`;
    const shapeTotal = SHAPE_GROUPS.reduce((n, g) => n + g.shapes.length, 0);
    if (styleMore.shapes) {
      for (const grp of SHAPE_GROUPS) {
        html += `<div class="shape-row">`;
        for (const k of grp.shapes) html += shapeBtn(k, grp.name);
        html += `</div>`;
      }
    } else {
      const base = SHAPE_GROUPS[0];
      const keys = base ? base.shapes.slice(0, 8) : [];
      if (st.shape && !keys.includes(st.shape)) keys.push(st.shape);
      html += `<div class="shape-row">${keys.map(k => shapeBtn(k, base?.name ?? '')).join('')}</div>`;
    }
    if (shapeTotal > 8) html += `<button type="button" class="style-more" data-more="shapes">${styleMore.shapes ? '收起' : '更多'}</button>`;
    const swatchRow = (title: string, key: 'fill' | 'text' | 'line' | 'border', swatches: (string | undefined)[]) => {
      let h = `<div class="style-sec">${title}</div><div class="swatch-row">`;
      for (const c of swatches) {
        const cur = st[key];
        const isActive = c === undefined ? !cur : cur === c;
        if (c === undefined) h += `<div class="swatch swatch-none${isActive ? ' active' : ''}" data-k="${key}" data-c="" title="默认"></div>`;
        else h += `<div class="swatch${isActive ? ' active' : ''}" data-k="${key}" data-c="${c}" style="background:${c}" title="${c}"></div>`;
      }
      return h + `</div>`;
    };
    html += swatchRow('填充', 'fill', FILL_SWATCHES);
    html += swatchRow('边框颜色', 'border', FILL_SWATCHES);
    html += `<div class="style-sec">边框粗细</div><div class="shape-row">${stepButtons('borderWidth', st.borderWidth, BORDER_WIDTHS)}</div>`;
    html += swatchRow('文字颜色', 'text', TEXT_SWATCHES);
    html += `<div class="style-sec">字号</div><div class="shape-row">${stepButtons('fontSize', st.fontSize, FONT_SIZES)}</div>`;
    const alignShown = st.align ?? 'center';
    html += `<div class="shape-row type-row">`;
    html += `<button type="button" class="shape-btn${st.bold ? ' active' : ''}" data-bold="1">粗体</button>`;
    html += `<button type="button" class="shape-btn${st.italic ? ' active' : ''}" data-italic="1">斜体</button>`;
    html += `<button type="button" class="shape-btn${alignShown === 'left' ? ' active' : ''}" data-align="left">左</button>`;
    html += `<button type="button" class="shape-btn${alignShown === 'center' ? ' active' : ''}" data-align="center">中</button>`;
    html += `<button type="button" class="shape-btn${alignShown === 'right' ? ' active' : ''}" data-align="right">右</button>`;
    html += `</div>`;
    html += `<div class="style-sec">连线</div><div class="shape-row">`;
    for (const [k, label] of Object.entries(LINE_CLASS_LABELS)) {
      html += `<button type="button" class="shape-btn${shown.lineClass === k ? ' active' : ''}" data-lc="${k}">${label}</button>`;
    }
    html += `</div>`;
    html += swatchRow('线条颜色', 'line', LINE_SWATCHES);
    html += `<div class="style-sec">线条粗细</div><div class="shape-row">${stepButtons('lineWidth', st.lineWidth, LINE_WIDTHS)}</div>`;
    // 标签（Xmind labels：字符串数组，多选批量增删）
    html += `<div class="style-sec">标签</div><div class="label-editor">`;
    html += t.labels.map((l, i) => `<span class="lb-chip lb-edit hue-${['b1','b2','b3','b4','b5','b6'][l.length % 6]}" data-lb="${i}">${l.replace(/</g, '&lt;')}<b class="lb-x">×</b></span>`).join('');
    html += `<input id="lb-add-input" placeholder="回车添加标签…" />`;
    html += `</div>`;
    // 标记（Xmind markers：点击切换，可多选）
    const markerBtn = (m: { id: string; label: string; glyph?: string; color?: string; badge?: string }, groupName: string) => {
      const on = t.markers.includes(m.id);
      return `<button class="marker-btn${on ? ' active' : ''}" data-mk="${m.id}" title="${groupName} · ${m.label}">` +
        (m.badge
          ? `<i class="mk mk-badge" style="--mk-c:${m.color}">${m.badge}</i>`
          : `<i class="mk" style="color:${m.color}">${m.glyph}</i>`) +
        `</button>`;
    };
    const markerGroups = styleMore.markers ? MARKER_GROUPS : MARKER_GROUPS.filter(g => g.name === '优先级' || g.name === '任务');
    html += `<div class="style-sec style-split">标记</div><div class="shape-row marker-row">`;
    for (const grp of markerGroups) for (const m of grp.markers) html += markerBtn(m, grp.name);
    if (!styleMore.markers) {
      const visibleIds = new Set(markerGroups.flatMap(g => g.markers.map(m => m.id)));
      for (const id of t.markers) {
        if (visibleIds.has(id)) continue;
        const m = MARKERS[id];
        if (m) html += markerBtn(m, '已选');
      }
    }
    html += `</div>`;
    if (MARKER_GROUPS.length > markerGroups.length) html += `<button type="button" class="style-more" data-more="markers">${styleMore.markers ? '收起' : '更多'}</button>`;
    html += `<button type="button" class="style-clear" id="style-clear">清除此节点样式</button>`;
    }
    const themes = allThemes();
    let shownThemes = styleMore.themes ? themes : themes.slice(0, 4);
    if (!styleMore.themes) {
      const cur = themes.find(th => th.id === sheet.themeClass);
      if (cur && !shownThemes.some(th => th.id === cur.id)) shownThemes = [...shownThemes, cur];
    }
    html += `<div class="style-group">改整张图</div><div class="style-sec">主题</div><div class="shape-row theme-grid${styleMore.themes ? ' is-open' : ''}">`;
    for (const th of shownThemes) {
      const label = th.label.replace(/</g, '&lt;');
      html += `<button class="shape-btn${sheet.themeClass === th.id ? ' active' : ''}" data-theme="${th.id}" title="${label}">${label}</button>`;
    }
    html += `</div>`;
    if (themes.length > 4) html += `<button type="button" class="style-more" data-more="themes">${styleMore.themes ? '收起' : '更多'}</button>`;
    html += `<div class="shape-row" style="margin-top:8px"><button type="button" class="style-clear" id="theme-import" style="margin:0">导入主题…</button><button type="button" class="style-clear" id="theme-export" style="margin:0">导出当前主题</button></div>`;
    sbBody.innerHTML = html;

    if (t) {
    const topic = t;
    const lbInput = sbBody.querySelector('#lb-add-input') as HTMLInputElement | null;
    lbInput?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = lbInput.value.trim();
        if (!v) return;
        const targets = multiTargets().map(id => topicOf(id)).filter(Boolean) as Topic[];
        for (const x of (targets.length ? targets : [topic])) {
          if (!x.labels.includes(v)) x.labels.push(v);
        }
        pushHistory(); relayout(); renderSidebar();
      }
    });
    sbBody.querySelectorAll<HTMLElement>('.lb-edit').forEach(chip => {
      const q = chip.querySelector('.lb-x') as HTMLElement;
      q.onclick = () => {
        const i = +(chip.dataset.lb ?? 0);
        const targets = multiTargets().map(id => topicOf(id)).filter(Boolean) as Topic[];
        for (const x of (targets.length ? targets : [topic])) x.labels.splice(Math.min(i, x.labels.length - 1), 1);
        pushHistory(); relayout(); renderSidebar();
      };
    });
    sbBody.querySelectorAll<HTMLElement>('.marker-btn').forEach(b => {
      b.onclick = () => {
        const mk = b.dataset.mk!;
        const targets = multiTargets().map(id => topicOf(id)).filter(Boolean) as Topic[];
        for (const x of (targets.length ? targets : [topic])) {
          const i = x.markers.indexOf(mk);
          if (i >= 0) x.markers.splice(i, 1);
          else x.markers.push(mk);
        }
        pushHistory(); relayout(); renderSidebar();
      };
    });
    sbBody.querySelectorAll<HTMLElement>('.shape-btn[data-shape]').forEach(b => {
      b.onclick = () => applyStyleToSelected({ shape: b.dataset.shape === st.shape ? undefined : (b.dataset.shape as ShapeKind) });
    });
    sbBody.querySelectorAll<HTMLElement>('.shape-btn[data-lc]').forEach(b => {
      b.onclick = () => applyStyleToSelected({ lineClass: b.dataset.lc === st.lineClass ? undefined : (b.dataset.lc as LineClass) });
    });
    sbBody.querySelectorAll<HTMLElement>('[data-step]').forEach(b => {
      b.onclick = () => {
        const key = b.dataset.step as 'fontSize' | 'lineWidth' | 'borderWidth';
        const raw = b.dataset.v ?? '';
        const next = raw === '' ? undefined : Number(raw);
        if (raw !== '' && !Number.isFinite(next)) return;
        const cur = st[key];
        if (raw === '' || cur === next) {
          if (cur != null) applyStyleToSelected({ [key]: undefined });
          return;
        }
        applyStyleToSelected({ [key]: next });
      };
    });
    sbBody.querySelector('[data-bold]')?.addEventListener('click', () => {
      applyStyleToSelected({ bold: st.bold ? undefined : true });
    });
    sbBody.querySelector('[data-italic]')?.addEventListener('click', () => {
      applyStyleToSelected({ italic: st.italic ? undefined : true });
    });
    sbBody.querySelectorAll<HTMLElement>('[data-align]').forEach(b => {
      b.onclick = () => {
        const next = b.dataset.align as TextAlign;
        const cur = st.align ?? 'center';
        if (cur === next) {
          if (st.align) applyStyleToSelected({ align: undefined });
          return;
        }
        applyStyleToSelected({ align: next === 'center' ? undefined : next });
      };
    });
    sbBody.querySelectorAll<HTMLElement>('.swatch').forEach(s => {
      s.onclick = () => {
        const k = s.dataset.k as 'fill' | 'text' | 'line' | 'border';
        const raw = s.dataset.c ?? '';
        const cur = st[k];
        const next = (raw === cur || (raw === '' && !cur)) ? undefined : (raw || undefined);
        applyStyleToSelected({ [k]: next } as Partial<TopicStyle>);
      };
    });
    document.getElementById('style-clear')?.addEventListener('click', () => {
      topic.style = {};
      pushHistory(); relayout(); renderSidebar();
    });
    }
    document.getElementById('theme-import')?.addEventListener('click', () => {
      document.getElementById('theme-input')?.click();
    });
    document.getElementById('theme-export')?.addEventListener('click', () => {
      const json = presetToXmindTheme(getTheme(sheet.themeClass));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = `枝桠主题-${getTheme(sheet.themeClass).label}.json`;
      a.click(); URL.revokeObjectURL(a.href);
    });
    sbBody.querySelectorAll<HTMLElement>('.style-more').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.more as keyof typeof styleMore;
        if (k in styleMore) styleMore[k] = !styleMore[k];
        renderSidebar();
      };
    });
    sbBody.querySelectorAll<HTMLElement>('.shape-btn[data-theme]').forEach(b => {
      b.onclick = () => {
        const next = b.dataset.theme ?? 'classic';
        if (next === sheet.themeClass) return;
        releaseThemePaint(sheet.root, getTheme(sheet.themeClass));
        sheet.themeClass = next;
        pushHistory(); relayout(); renderSidebar();
      };
    });
  } else {
    sbBody.innerHTML = `<div class="keys-body">
      <div><em>Tab</em>添加子主题</div><div><em>Enter</em>添加同级</div>
      <div><em>F2 / 双击</em>重命名</div><div><em>Space</em>折叠 / 展开</div>
      <div><em>Delete</em>删除分支</div><div><em>↑↓←→</em>导航</div>
      <div><em>Ctrl+M</em>备注</div><div><em>Ctrl+Z / Y</em>撤销 / 重做</div>
      <div><em>Ctrl+S</em>保存 .xmind</div><div><em>Ctrl+F</em>查找替换</div>
      <div><em>Ctrl+左键</em>多选（批量删除/样式/标记）</div><div><em>Ctrl+D</em>取消多选</div>
      <div><em>F5</em>演示模式（→/空格 步进，Esc 退出）</div><div><em>拖拽主题</em>调序 / 换父 / 拖空白转自由主题</div>
      <div><em>拖拽空白</em>平移</div><div><em>滚轮</em>缩放</div>
      <div><em>右键</em>上下文菜单（链接/图片/附件/联系/分支方向/概要）</div>
      <div><em>双指捏合</em>缩放画布</div><div><em>长按</em>打开菜单（触屏）</div></div>`;
  }
}

document.querySelectorAll<HTMLElement>('.sb-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.sb-tab').forEach(x => x.classList.remove('active'));
    tab.classList.add('active');
    sbTab = (tab.dataset.tab as typeof sbTab) ?? 'outline';
    renderSidebar();
  };
});
document.getElementById('btn-sidebar')?.addEventListener('click', () => {
  sidebarEl.classList.toggle('open');
  renderSidebar();
});

/* 主题文件导入（Xmind 主题 JSON / 枝桠导出的主题） */
document.getElementById('theme-input')?.addEventListener('change', () => {
  const input = document.getElementById('theme-input') as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const preset = xmindThemeToPreset(JSON.parse(reader.result as string));
      if (!preset) throw new Error('无法识别的主题格式');
      addCustomTheme(preset);
      if (preset.id !== sheet.themeClass) releaseThemePaint(sheet.root, getTheme(sheet.themeClass));
      sheet.themeClass = preset.id;
      pushHistory(); relayout(); renderSidebar();
      import('./ui').then(m => m.toast(`已导入主题：${preset.label}`));
    } catch {
      import('./ui').then(m => m.toast('主题解析失败（需 Xmind 主题 JSON）'));
    }
  };
  reader.readAsText(file);
  input.value = '';
});

window.addEventListener('pointermove', (e) => {
  if (!outlineDrag) return;
  if (!outlineDrag.started) {
    if (Math.hypot(e.clientX - outlineDrag.sx, e.clientY - outlineDrag.sy) < 5) return;
    outlineDrag.started = true;
  }
  outlineDrag.target = outlineHitAt(e.clientX, e.clientY, outlineDrag.id);
  showOutlineHint(outlineDrag.target, outlineDrag.id);
});
window.addEventListener('pointerup', () => {
  if (!outlineDrag) return;
  const d = outlineDrag;
  outlineDrag = null;
  clearOutlineHint();
  if (!d.started) return;
  outlineSuppressClick = true;
  if (d.target) repositionTopic(d.id, d.target);
  // 松手后浏览器可能补发 click；拖动距离够大时又可能不发。只吞这一下，下一拍放行。
  setTimeout(() => { outlineSuppressClick = false; }, 0);
});
window.addEventListener('pointercancel', () => {
  if (!outlineDrag) return;
  outlineDrag = null;
  clearOutlineHint();
});
document.addEventListener('click', (e) => {
  if (!outlineSuppressClick) return;
  outlineSuppressClick = false;
  e.preventDefault();
  e.stopPropagation();
}, true);
