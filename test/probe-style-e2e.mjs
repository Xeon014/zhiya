// probe-style-e2e.mjs — 样式应用链路探针
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'msedge', headless: true });
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', e.message));
await p.goto('file:///C:/Users/x5che/Documents/deepseek-harness/default-workspace/zhiya/dist/index.html');
await p.waitForTimeout(900);
await p.locator('.topic', { hasText: '结构引擎' }).first().click();
await p.click('#btn-sidebar'); await p.waitForTimeout(350);
await p.click('.sb-tab[data-tab="style"]'); await p.waitForTimeout(300);
const before = await p.evaluate(() => {
  const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '结构引擎');
  return { cls: el?.className, ds: el?.dataset.shape, style: JSON.stringify(el?.dataset) };
});
console.log('点击前:', JSON.stringify(before));
await p.locator('.shape-btn', { hasText: '菱形' }).click();
await p.waitForTimeout(400);
const after = await p.evaluate(() => {
  const el = [...document.querySelectorAll('.topic')].find(t => t.querySelector('.t-title')?.textContent === '结构引擎');
  const model = (() => { try { return topicOf(selectedId)?.style ?? null; } catch { return 'ERR'; } })();
  return { cls: el?.className, ds: el?.dataset.shape, model, bg: el?.style.background };
});
console.log('点击后:', JSON.stringify(after));
await b.close();
