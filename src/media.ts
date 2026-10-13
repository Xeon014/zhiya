import { selectedId, topicOf } from './model';
import { relayout } from './layout';
import { pushHistory } from './persistence';
import { toast } from './ui';
import { putAttachment } from './assets';

/* 图片与附件的文件输入处理（隐藏 input 由右键菜单触发） */
const MAX_IMG_W = 220;

export function initMediaInputs(): void {
  const imgInput = document.getElementById('image-input');
  imgInput?.addEventListener('change', () => {
    const file = (imgInput as HTMLInputElement).files?.[0];
    const t = selectedId ? topicOf(selectedId) : null;
    if (!file || !t) { (imgInput as HTMLInputElement).value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const probe = new Image();
      probe.onload = () => {
        const scale = Math.min(1, MAX_IMG_W / probe.naturalWidth);
        t.image = { src, w: Math.round(probe.naturalWidth * scale), h: Math.round(probe.naturalHeight * scale) };
        pushHistory(); relayout();
        toast('已插入图片');
      };
      probe.src = src;
    };
    reader.readAsDataURL(file);
    (imgInput as HTMLInputElement).value = '';
  });

  const attachInput = document.getElementById('attach-input');
  attachInput?.addEventListener('change', () => {
    const file = (attachInput as HTMLInputElement).files?.[0];
    const t = selectedId ? topicOf(selectedId) : null;
    if (!file || !t) { (attachInput as HTMLInputElement).value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const href = putAttachment(file.name, new Uint8Array(reader.result as ArrayBuffer));
      t.href = href;
      pushHistory(); relayout();
      toast(`已附加文件：${file.name}（已持久保存，导出 .xmind 时嵌入）`);
    };
    reader.readAsArrayBuffer(file);
    (attachInput as HTMLInputElement).value = '';
  });
}
