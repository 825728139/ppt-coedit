import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
let disk = '', written = '', reads = 0;
await page.exposeFunction('reviewRead', () => { reads++; return disk; });
await page.exposeFunction('reviewWrite', text => { disk = written = text; });
await page.addInitScript(() => {
  window.showOpenFilePicker = async () => [{ name: 'review.html', getFile: async () => new File([await window.reviewRead()], 'review.html'), createWritable: async () => {
    let text; return { write: async value => { text = value; }, close: async () => window.reviewWrite(text) };
  } }];
});
const frame = () => page.frameLocator('.gjs-frame');
async function open(source) {
  disk = source; written = '';
  await page.goto('http://127.0.0.1:5173/');
  await page.click('#open-source');
  await expect(page.locator('#source-name')).toHaveText('review.html');
}
async function save() { written = ''; await page.click('#save'); }
try {
  await open('<!doctype html><html><body><section class="slide"><h1>标题<script>window.retained=1</script></h1></section></body></html>');
  await frame().getByText('标题', { exact: true }).dblclick();
  await frame().locator('[contenteditable="true"]').fill('改后标题');
  await save(); await expect.poll(() => disk).toContain('改后标题');
  assert.ok(disk.includes('<script>window.retained=1</script>'), 'Text replacement must preserve source-only scripts');

  await open('<h1>片段标题</h1>');
  await save(); await expect(page.locator('#source-state')).toContainText('已写回');
  assert.equal(disk, '<h1>片段标题</h1>', 'Fragment no-op save must be byte-identical');
  await page.click('#add-text'); await save(); await expect.poll(() => disk).toContain('双击编辑文字');
  await page.click('#add-page'); await save();
  await expect.poll(() => (disk.match(/<section/g) || []).length).toBe(2);
  await page.click('#reload-source');
  await expect(page.locator('#pages .page')).toHaveCount(2);
  await page.locator('#pages .page').first().locator('button').first().click();
  await frame().getByText('片段标题', { exact: true }).waitFor();

  await open('<!doctype html><body><p>省略结束标签');
  await frame().getByText('省略结束标签', { exact: true }).dblclick();
  await frame().locator('[contenteditable="true"]').fill('省略标签修改成功');
  await save(); await expect.poll(() => disk).toContain('省略标签修改成功');

  await open('<!doctype html><html><body><section class="slide"><h1>第一页</h1></section><section class="slide"><h1>第二页</h1></section></body></html>');
  await page.click('#add-page');
  await page.locator('#pages .page').nth(1).locator('button').last().click();
  await save(); await expect.poll(() => disk).not.toContain('第二页');
  assert.equal((disk.match(/<section/g) || []).length, 2, 'Deleting the last original page must preserve an appended page');

  const deck = text => `<!doctype html><html><head><style>.slide{color:red}h1{font-size:40px}</style></head><body><section class="slide"><h1>${text}</h1></section></body></html>`;
  await open(deck('精细编辑前'));
  await frame().getByText('精细编辑前', {exact:true}).click();await page.click('#edit-rich-text');
  await expect(page.locator('#text-format-dialog')).toBeVisible();
  disk=deck('外部接管');
  await expect(page.locator('#text-format-dialog')).not.toBeVisible();
  await frame().getByText('外部接管', {exact:true}).waitFor();
  const cssSize=()=>frame().locator('style').evaluateAll(nodes=>nodes.reduce((sum,node)=>sum+node.textContent.length,0));
  const initialCssSize=await cssSize();
  for(let i=0;i<4;i++){disk=deck('更新标题'+i);await frame().getByText('更新标题'+i,{exact:true}).waitFor()}
  assert.ok(await cssSize()<=initialCssSize+500, 'Repeated reloads must not retain old imported CSS');
  await frame().getByText('更新标题3', {exact:true}).dblclick();
  await frame().locator('[contenteditable="true"]').fill('未保存输入');
  disk=deck('输入时外部更新');await frame().getByText('输入时外部更新',{exact:true}).waitFor();
  await save();await expect(page.locator('#source-state')).toContainText('已写回');
  assert.equal(disk,deck('输入时外部更新'));

  await page.click('[data-panel="agent"]');
  await page.locator('#html-input').fill('<h1 class="review-added">带样式的新页</h1>');
  await page.locator('#css-input').fill('.review-added{color:rgb(12,34,56);font-size:55px}');
  await page.click('#import-html');await save();await expect.poll(()=>disk).toContain('带样式的新页');
  const exported=await browser.newPage();await exported.setContent(disk);
  assert.equal(await exported.getByText('带样式的新页',{exact:true}).evaluate(el=>getComputedStyle(el).color),'rgb(12, 34, 56)');
  assert.equal(await exported.getByText('输入时外部更新',{exact:true}).evaluate(el=>getComputedStyle(el).color),'rgb(255, 0, 0)');
  await exported.close();

  assert.deepEqual(errors, []);
  console.log('PASS: source scripts, fragment pagination, optional end tags, deletion boundary, stale text dialog/RTE, bounded CSS reloads');
} finally { await browser.close(); }
