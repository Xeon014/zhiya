import type { ZhiyaJSON, TopicJSON } from './model';

/** 将 Markdown 大纲（# 标题 + - 列表）解析为单画布 ZhiyaJSON */
export function markdownToZhiyaJSON(md: string): ZhiyaJSON {
  const lines = md.split(/\r?\n/);
  let title = '中心主题';
  const root: TopicJSON = { title, children: { attached: [] } };
  const stack: { depth: number; node: TopicJSON }[] = [{ depth: 0, node: root }];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      title = h[2]!.trim();
      root.title = title;
      stack.length = 1;
      stack[0] = { depth: 0, node: root };
      continue;
    }
    const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (!bullet) continue;
    const depth = Math.floor(bullet[1]!.length / 2) + 1;
    const node: TopicJSON = { title: bullet[2]!.trim(), children: { attached: [] } };
    while (stack.length > 1 && stack[stack.length - 1]!.depth >= depth) stack.pop();
    const parent = stack[stack.length - 1]!.node;
    parent.children ??= { attached: [] };
    parent.children.attached!.push(node);
    stack.push({ depth, node });
  }
  return { sheets: [{ class: 'sheet', structureClass: 'org.xmind.ui.logic-chart', rootTopic: root }] };
}
