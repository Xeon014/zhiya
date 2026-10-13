import type { Topic } from './model';

/* 查找匹配纯函数（无 DOM，可单测）—— 范围：标题 + 备注 + 标签 */
export type FindField = 'title' | 'note' | 'labels';
export interface FindMatch { topicId: string; field: FindField; index: number; labelIdx?: number }

/** 收集全部命中（给定顺序，标题优先于备注；大小写不敏感；多处逐一列出） */
export function findMatches(topics: Topic[], query: string): FindMatch[] {
  const out: FindMatch[] = [];
  if (!query) return out;
  const q = query.toLowerCase();
  for (const t of topics) {
    const title = t.title.toLowerCase();
    let i = title.indexOf(q);
    while (i >= 0) { out.push({ topicId: t.id, field: 'title', index: i }); i = title.indexOf(q, i + q.length); }
    const note = t.note.toLowerCase();
    i = note.indexOf(q);
    while (i >= 0) { out.push({ topicId: t.id, field: 'note', index: i }); i = note.indexOf(q, i + q.length); }
    t.labels.forEach((lb, li) => {
      const l = lb.toLowerCase();
      let j = l.indexOf(q);
      while (j >= 0) { out.push({ topicId: t.id, field: 'labels', index: j, labelIdx: li }); j = l.indexOf(q, j + q.length); }
    });
  }
  return out;
}
