import { selectedId, topicOf } from './model';
import { pushHistory } from './persistence';
import { relayout } from './layout';
import { toast } from './ui';

/* 链接设置面板（Xmind href：网页 URL 或 xap:attachments/ 附件引用） */
let linkTargetId: string | null = null;

export function openLinkPanel(id: string | null = null): void {
  const panel = document.getElementById('href-panel');
  const input = document.getElementById('href-input') as HTMLInputElement;
  if (!panel || !input) return;
  linkTargetId = id ?? selectedId;
  const t = linkTargetId ? topicOf(linkTargetId) : null;
  if (!t) return;
  input.value = t.href || '';
  panel.classList.add('open');
  input.focus(); input.select();
}

export function closeLinkPanel(): void {
  document.getElementById('href-panel')?.classList.remove('open');
  linkTargetId = null;
}

export function commitLink(): void {
  const input = document.getElementById('href-input') as HTMLInputElement;
  const t = linkTargetId ? topicOf(linkTargetId) : null;
  if (!t || !input) return;
  let v = input.value.trim();
  if (v && !/^(https?:|mailto:|file:|xap:)/.test(v)) v = 'https://' + v;
  t.href = v === t.href ? t.href : v;
  pushHistory(); relayout();
  toast(v ? (t.href.startsWith('xap:') ? '已附加文件' : '已设置链接') : '已移除链接');
  closeLinkPanel();
}

export function initLinkPanel(): void {
  const panel = document.getElementById('href-panel');
  if (!panel) return;
  const input = document.getElementById('href-input') as HTMLInputElement;
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commitLink(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeLinkPanel(); }
  });
  document.getElementById('href-ok')?.addEventListener('click', commitLink);
  document.getElementById('href-cancel')?.addEventListener('click', closeLinkPanel);
}
