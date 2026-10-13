import { walkAllTopics } from './model';

/* =====================================================================
 * 资产仓：图片源缓存 + 附件字节仓
 * Xmind 的做法：二进制永远不进 JSON——图片存 ZIP resources/（主题只存
 * xap:resources/<hash> 引用），附件存 attachments/（href 存 xap:attachments/）；
 * 保存时对未引用资产做 GC（4245.js：t.includes(i)||delete e[n]）。
 * 枝桠同构：模型/历史/localStorage 只存轻量引用；大字节放这里；
 * 附件字节镜像进 IndexedDB（网页平台的"磁盘"），重载后注水回内存。
 * file:// 等不支持 IDB 的环境自动降级为会话级。
 * ===================================================================== */

/** 附件字节仓（内存层；IndexedDB 持久镜像） */
const attachmentStore = new Map<string, Uint8Array>();

export function putAttachment(name: string, data: Uint8Array): string {
  const key = `attachments/${name}`;
  attachmentStore.set(key, data);
  void idbPut(key, data);                                  // 异步镜像，失败静默降级
  return `xap:${key}`;
}
export const getAttachment = (href: string): Uint8Array | undefined =>
  href.startsWith('xap:attachments/') ? attachmentStore.get(href.slice(4)) : undefined;
export const isAttachmentHref = (href: string): boolean => href.startsWith('xap:attachments/');
export const allAttachments = (): Map<string, Uint8Array> => attachmentStore;
export function loadAttachment(key: string, data: Uint8Array): void {
  if (key.startsWith('attachments/')) {
    attachmentStore.set(key, data);
    void idbPut(key, data);
  }
}

/** 图片源缓存：历史快照剥离后恢复用（topicId → dataURL） */
const imageSrcCache = new Map<string, string>();
export const cacheImageSrc = (topicId: string, src: string): void => { imageSrcCache.set(topicId, src); };
export const cachedImageSrc = (topicId: string): string | undefined => imageSrcCache.get(topicId);

/** 下载附件（会话内有字节时） */
export function downloadAttachment(href: string, name: string): boolean {
  const data = getAttachment(href);
  if (!data) return false;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data as unknown as BlobPart]));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

/* ---------- 纯函数：模型中仍被引用的附件键集合（保存 GC 用，可单测） ---------- */
export function referencedAttachmentKeys(topics: { href: string }[]): Set<string> {
  const keys = new Set<string>();
  for (const t of topics) {
    if (t.href.startsWith('xap:attachments/')) keys.add(t.href.slice(4));
  }
  return keys;
}

/** 保存时 GC（复刻 Xmind）：删除模型中已无引用的附件（内存 + IndexedDB） */
export function gcAttachments(): void {
  const referenced = referencedAttachmentKeys(walkAllTopics());
  for (const key of [...attachmentStore.keys()]) {
    if (!referenced.has(key)) {
      attachmentStore.delete(key);
      void idbDelete(key);
    }
  }
}

/* ---------- IndexedDB 镜像层（zhiya-assets / attachments） ---------- */
const DB_NAME = 'zhiya-assets', STORE = 'attachments';
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

async function idbPut(key: string, data: Uint8Array): Promise<void> {
  const db = await openDB(); if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}
async function idbDelete(key: string): Promise<void> {
  const db = await openDB(); if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** 启动注水：把 IndexedDB 里的附件字节加载回内存仓（重载后附件存活） */
export async function hydrateAttachments(): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;
  const entries = await new Promise<[string, Uint8Array][]>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const keysReq = store.getAllKeys();
    const valsReq = store.getAll();
    let keys: IDBValidKey[] = [], vals: unknown[] = [];
    let pending = 2;
    const done = () => { if (--pending === 0) resolve(keys.map((k, i) => [String(k), vals[i] as Uint8Array])); };
    keysReq.onsuccess = () => { keys = keysReq.result; done(); };
    valsReq.onsuccess = () => { vals = valsReq.result; done(); };
    keysReq.onerror = () => resolve([]);
    valsReq.onerror = () => resolve([]);
  });
  for (const [key, data] of entries) {
    if (data instanceof Uint8Array && !attachmentStore.has(key)) attachmentStore.set(key, data);
  }
  return true;
}
