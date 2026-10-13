/** DOM 引用集中地：类型安全的元素获取与全局元素句柄 */
export function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`DOM 元素不存在: #${id}`);
  return el as T;
}

export const figuresEl = $('figures') as HTMLDivElement;
export const edgesEl = $('edges') as unknown as SVGSVGElement;
export const worldEl = $('world') as HTMLDivElement;
export const viewportEl = $('viewport') as HTMLDivElement;
export const notePanel = $('note-panel') as HTMLDivElement;
export const noteInput = $('note-input') as HTMLTextAreaElement;
export const noteTopic = $('note-topic') as HTMLSpanElement;
export const ctxMenu = $('ctx-menu') as HTMLDivElement;
export const dropLine = $('drop-line') as HTMLDivElement;
export const sidebarEl = $('sidebar') as HTMLDivElement;
export const sbBody = $('sb-body') as HTMLDivElement;
