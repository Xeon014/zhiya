import './style.css';
import { selectedId, sheet, sheets, switchSheet, addSheet, removeSheet } from './model';
import { addChild, addSibling, navigate, removeTopic, startEdit, stopEdit, toggleCollapse, editingId } from './interactions';
import { undo, redo, pushHistory } from './persistence';
import { saveFile, saveFileAs, openFileSmart, doExport, toggleWatermark, watermarkOn } from './exports';
import { openFindBar, closeFindBar, findBarVisible, initFind, refreshFind } from './find';
import { startPresent, isPresenting, endPresent, presentKey } from './present';
import { toggleLegend } from './legend';
import { clearMultiSelect, multiTargets, removeTopics } from './interactions';
import { initLinkPanel, closeLinkPanel } from './linkpanel';
import { initMediaInputs } from './media';
import { openNoteFor, closeNote } from './notes';
import { hideCtxMenu, showCtxMenu, canvasMenu, topicMenu, type CtxMenuItems } from './menus';
import { StructureEngines, engine } from './engines';
import { relayout } from './layout';
import { fitView, applyWorld, setZoom, zoom } from './view';
import { toast } from './ui';
import { boot, init } from './boot';
import { initTouchGestures } from './gestures';
import { isPickingRelationship, cancelRelationshipPick } from './relationships';
import { notePanel, noteInput, ctxMenu } from './dom';
import { renderSheetTabs } from './overlays';

/* =====================================================================
 * 九、键盘与工具栏接线
 * ===================================================================== */
window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (presentKey(e)) return;                          // ZEN 演示模式接管方向键/空格/Esc
  if (e.key === 'Escape') {
    hideCtxMenu();
    if (isPickingRelationship()) { cancelRelationshipPick(); toast('已取消联系'); }
    if (findBarVisible()) closeFindBar();
    closeLinkPanel();
  }
  if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); findBarVisible() ? closeFindBar() : openFindBar(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); clearMultiSelect(); toast('已取消多选'); return; }
  if (e.key === 'F5') { e.preventDefault(); isPresenting() ? endPresent() : startPresent(); return; }
  if (mod && e.key.toLowerCase() === 'm') {
    e.preventDefault();
    if (notePanel.classList.contains('open')) closeNote(true);
    else if (selectedId) openNoteFor(selectedId);
    return;
  }
  const sbNote = document.getElementById('sb-note');
  if (document.activeElement === noteInput || (sbNote && document.activeElement === sbNote)) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (document.activeElement === noteInput) closeNote(true);
      else (document.activeElement as HTMLElement).blur();
    }
    return;                                   // 备注输入时不劫持按键
  }
  if (editingId) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const id = editingId;
      stopEdit(true);
      addSibling(id);   // Enter 编辑确认后新增同级
    }
    else if (e.key === 'Escape') { e.preventDefault(); stopEdit(false); }
    return;
  }
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); refreshFind(); return; }
  if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); refreshFind(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(); return; }
  switch (e.key) {
    case 'Tab': e.preventDefault(); addChild(selectedId ?? sheet.root.id); break;
    case 'Enter': e.preventDefault(); addSibling(selectedId ?? sheet.root.id); break;
    case 'F2': e.preventDefault(); if (selectedId) startEdit(selectedId); break;
    case 'Delete': case 'Backspace': {
      e.preventDefault();
      const multi = multiTargets();
      if (multi.length > 1) { removeTopics(multi); toast(`已删除 ${multi.length} 个分支`); }
      else if (selectedId) removeTopic(selectedId);
      break;
    }
    case ' ': e.preventDefault(); if (selectedId) toggleCollapse(selectedId); break;
    case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
      e.preventDefault(); navigate(e.key); break;
  }
});

const $btn = (id: string) => document.getElementById(id) as HTMLButtonElement;
$btn('btn-undo').onclick = () => { undo(); refreshFind(); };
$btn('btn-redo').onclick = () => { redo(); refreshFind(); };
$btn('zoom-in').onclick = () => { setZoom(zoom * 1.2); applyWorld(); };
$btn('zoom-out').onclick = () => { setZoom(zoom / 1.2); applyWorld(); };
$btn('zoom-fit').onclick = fitView;

/* ---------- 文件 / 导出 下拉菜单（顶栏收纳） ---------- */
function menuAt(btnId: string, items: CtxMenuItems): void {
  const btn = $btn(btnId);
  btn.onclick = () => {
    if (ctxMenu.classList.contains('open') && (ctxMenu as HTMLElement & { _from?: string })._from === btnId) { hideCtxMenu(); return; }
    const r = btn.getBoundingClientRect();
    showCtxMenu(r.left, r.bottom + 6, items);
    (ctxMenu as HTMLElement & { _from?: string })._from = btnId;
  };
}
menuAt('btn-file', [
  { label: '新建导图', action: () => { boot(null); toast('新建导图'); } },
  { label: '打开文件…', action: () => void openFileSmart() },
  '-',
  { label: '保存 .xmind', kbd: 'Ctrl+S', action: saveFile },
  { label: '另存为…', action: saveFileAs },
  { label: '演示模式', kbd: 'F5', action: () => startPresent() },
  { label: `图例 ${sheet.legend?.visibility === 'visible' ? '✓' : '○'}`, action: () => { toggleLegend(); } }
]);
menuAt('btn-export', [
  { label: 'PNG 图片', action: () => doExport('png') },
  { label: `PNG 水印 ${watermarkOn() ? '✓' : '○'}`, action: () => toggleWatermark() },
  { label: 'SVG 矢量图', action: () => doExport('svg') },
  { label: 'Markdown', action: () => doExport('md') },
  { label: 'OPML 大纲', action: () => doExport('opml') },
  { label: 'FreeMind (.mm)', action: () => doExport('mm') },
  { label: '大纲文本', action: () => doExport('txt') },
  '-',
  { label: 'Word (.docx)', action: () => doExport('docx') },
  { label: 'Excel (.xlsx)', action: () => doExport('xlsx') },
  { label: 'PPT (.pptx)', action: () => doExport('pptx') },
  { label: 'TextBundle', action: () => doExport('textbundle') },
  '-',
  { label: 'PDF（打印）', action: () => doExport('pdf') }
]);

const selEl = document.getElementById('structure-select') as HTMLSelectElement;
for (const [id, eng] of Object.entries(StructureEngines)) {
  const opt = document.createElement('option'); opt.value = id; opt.textContent = eng.label; selEl.appendChild(opt);
}
selEl.onchange = () => {
  sheet.structureClass = selEl.value;
  pushHistory(); relayout(); setTimeout(fitView, 280);
  toast(`结构引擎：${engine().label}`);
};

/* ---------- 触屏手势（长按菜单 / 双击编辑；Pointer Events + gestureSession 复刻） ---------- */
initTouchGestures({
  topicMenu: (id, x, y) => topicMenu(id, x, y),
  canvasMenu,
  toggleCollapse,
  startEdit
});

/* ---------- 多画布标签栏 ---------- */
const sheetBar = document.getElementById('sheet-bar');
function refreshSheetTabs(): void {
  if (!sheetBar) return;
  renderSheetTabs(
    sheetBar,
    () => { relayout(false); fitView(); selEl.value = sheet.structureClass; },   // switch
    () => { relayout(false); fitView(); toast('新建画布'); },                     // add
    (id) => { removeSheet(id); relayout(false); fitView(); refreshSheetTabs(); toast('画布已删除'); }  // remove
  );
}
refreshSheetTabs();

initFind();
initLinkPanel();
initMediaInputs();
init();
