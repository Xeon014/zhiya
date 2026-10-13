import { Sheet, Topic, applySheet, fromJSON, renameLegacyTitles, type ZhiyaJSON } from './model';
import { relayout } from './layout';
import { pushHistory, resetHistory, LS_KEY } from './persistence';
import { hydrateAttachments } from './assets';
import { fitView } from './view';

/* =====================================================================
 * 十、启动：种子导图（首帧海报）与 boot
 * ===================================================================== */
export function seedSheet(): Sheet {
  const s = new Sheet('枝桠');
  const add = (parent: Topic, ...titles: string[]) =>
    titles.map(x => { const t = new Topic(x); parent.children.push(t); return t; });

  const eng = add(s.root, '结构引擎', '自动布局', '编辑交互', '持久化')[0]!;
  add(eng, '插件注册表', '思维导图引擎', '组织架构引擎');

  const layout = s.root.children[1]!;
  add(layout, '双侧平衡生长', '递归子树度量', '贝塞尔连接线');

  const inter = s.root.children[2]!;
  add(inter, 'Tab / Enter 增删', '折叠与展开', '撤销 / 重做', '键盘导航');

  const persist = s.root.children[3]!;
  add(persist, '本地自动保存', 'JSON 导入导出', 'xmind 格式兼容');
  return s;
}

export function boot(saved: Sheet | null): void {
  const s = saved ?? seedSheet();
  renameLegacyTitles(s.root);
  applySheet(s);
  const selEl = document.getElementById('structure-select') as HTMLSelectElement | null;
  if (selEl) selEl.value = s.structureClass;
  relayout(false);                                   // 先布局，后入栈——栈底快照与 autosave 存档一致
  resetHistory(); pushHistory();
  fitView();
}

export function init(): void {
  void hydrateAttachments().catch(() => { /* IDB 不可用则维持会话级 */ });
  let saved: Sheet | null = null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) saved = fromJSON(JSON.parse(raw) as ZhiyaJSON);
  } catch { /* 忽略损坏的存档 */ }
  boot(saved && saved.root.children.length ? saved : null);
  // 首帧入场：先适应画布，再给节点一次“生长”动画
  requestAnimationFrame(() => { fitView(); relayout(true); });
}
