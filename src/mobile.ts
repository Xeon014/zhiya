import { sidebarEl } from './dom';
import { hideCtxMenu } from './menus';

export function isMobileLayout(): boolean {
  return matchMedia('(max-width: 720px)').matches || matchMedia('(pointer: coarse)').matches;
}

/** 窄屏/触屏：侧栏遮罩、键盘视口、body 标记 */
export function initMobileUX(): void {
  const backdrop = document.getElementById('sidebar-backdrop');
  backdrop?.addEventListener('click', () => {
    sidebarEl.classList.remove('open');
    backdrop.classList.remove('open');
  });

  const syncBody = () => {
    document.body.classList.toggle('mobile-ui', isMobileLayout());
    if (isMobileLayout()) {
      sidebarEl.classList.remove('open');
      backdrop?.classList.remove('open');
    }
  };
  syncBody();
  matchMedia('(max-width: 720px)').addEventListener('change', syncBody);
  matchMedia('(pointer: coarse)').addEventListener('change', syncBody);

  window.visualViewport?.addEventListener('resize', () => {
    document.dispatchEvent(new CustomEvent('zhiya:viewport-resize'));
  });
}

export function openSidebarMobile(): void {
  if (!isMobileLayout()) return;
  document.getElementById('sidebar-backdrop')?.classList.add('open');
}

export function closeSidebarMobile(): void {
  document.getElementById('sidebar-backdrop')?.classList.remove('open');
}

/** 长按菜单在手机上贴近底部、可滚动 */
export function positionCtxMenuForMobile(menu: HTMLElement, x: number, y: number): void {
  if (!isMobileLayout()) return;
  menu.classList.add('mobile-sheet');
  menu.style.left = '8px';
  menu.style.right = '8px';
  menu.style.width = 'auto';
  menu.style.top = 'auto';
  menu.style.bottom = `calc(8px + env(safe-area-inset-bottom, 0px))`;
  menu.style.maxHeight = 'min(70vh, 520px)';
  menu.style.overflowY = 'auto';
}

export function resetCtxMenuLayout(menu: HTMLElement): void {
  menu.classList.remove('mobile-sheet');
  menu.style.right = '';
  menu.style.width = '';
  menu.style.bottom = '';
  menu.style.maxHeight = '';
  menu.style.overflowY = '';
}
