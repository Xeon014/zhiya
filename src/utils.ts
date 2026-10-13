/** 通用工具（迁移自单文件版的“工具”节） */
let uidCounter = 0;
export const uid = (p: string): string =>
  `${p}${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
