import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1600,height:1000}});
let disk='';const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.exposeFunction('readDeepFile',()=>disk);await page.exposeFunction('writeDeepFile',text=>{disk=text});
await page.addInitScript(()=>{window.showOpenFilePicker=async()=>[{name:'deep.html',getFile:async()=>new File([await window.readDeepFile()],'deep.html'),createWritable:async()=>({write:async text=>window.writeDeepFile(text),close:async()=>{}})}]});
const frame=()=>page.frameLocator('.gjs-frame');
async function open(source){disk=source;await page.goto('http://127.0.0.1:5173/');await page.click('#open-source');await expect(page.locator('#source-name')).toHaveText('deep.html')}
async function saveContaining(text){await page.click('#save');await expect.poll(()=>disk).toContain(text)}
try{
 const original='<!doctype html><html><body><section class="slide"><h1>表格和图形</h1><table><tbody><tr><td>表格单元</td></tr></tbody></table><svg width="100" height="100"><title>SVG 标题</title><rect width="50" height="50"/></svg></section></body></html>';
 await open(original);await page.click('#save');await expect(page.locator('#source-state')).toContainText('已写回');assert.equal(disk,original);
 await frame().getByText('表格单元',{exact:true}).click();await page.locator('#quick-size').fill('34');await page.locator('#quick-size').press('Tab');await saveContaining('font-size: 34px');
 await open('<!doctype html><html><body><section class="slide"><h1>卡片测试</h1></section></body></html>');
 await page.click('#add-card');await page.locator('#quick-gap').fill('29');await page.locator('#quick-gap').press('Tab');await saveContaining('gap: 29px');
 await frame().getByText('卡片测试',{exact:true}).click();await page.locator('#object-path button').first().click();
 await page.locator('#quick-color').fill('#124578');await page.locator('#quick-color').dispatchEvent('change');await saveContaining('rgb(18, 69, 120)');
 await page.click('#undo');await page.click('#save');await expect.poll(()=>disk).not.toContain('rgb(18, 69, 120)');assert.ok(disk.includes('gap: 29px'));
 await page.evaluate(()=>{const native=File.prototype.text;File.prototype.text=function(){if(this.name==='slow.html')return new Promise(resolve=>{window.releaseImport=resolve});return native.call(this)}});
 await page.click('#open-html');await page.setInputFiles('#deck-file',{name:'slow.html',mimeType:'text/html',buffer:Buffer.from('<h1>待导入旧内容</h1>')});await page.click('#confirm-import');
 await page.waitForFunction(()=>typeof window.releaseImport==='function');
 disk='<!doctype html><html><body><section class="slide"><h1>外部新文稿</h1></section></body></html>';
 await frame().getByText('外部新文稿',{exact:true}).waitFor();
 await page.evaluate(()=>window.releaseImport('<h1>待导入旧内容</h1>'));
 await expect(page.locator('#import-summary')).toContainText('文稿已被替换');await expect(page.locator('#pages .page')).toHaveCount(1);
 await open('<!doctype html><html><head><style>.slide{h1{color:rgb(11,22,33)}}</style></head><body><section class="slide"><h1>嵌套 CSS</h1></section></body></html>');
 assert.equal(await frame().getByText('嵌套 CSS',{exact:true}).evaluate(el=>getComputedStyle(el).color),'rgb(11, 22, 33)');
 const nestedCases=[
  ['.outer,#absent{h1{color:rgb(100,20,30)}} .outer h1{color:blue}','<div class="outer"><h1>优先级</h1></div>','h1'],
  ['.outer .inner{.target&{color:rgb(30,40,50)}}','<div class="outer"><div class="inner target">复杂父选择器</div></div>','.target'],
  ['.outer{color:red;&{color:blue}color:green;@media(min-width:1px){letter-spacing:3px}}','<div class="outer">声明顺序</div>','.outer'],
 ];
 for(const [css,html,selector]of nestedCases){const reference=await browser.newPage();await reference.setContent(`<style>${css}</style>${html}`);const expected=await reference.locator(selector).evaluate(el=>{const s=getComputedStyle(el);return[s.color,s.letterSpacing]});await reference.close();await open(`<!doctype html><html><head><style>${css}</style></head><body><section class="slide">${html}</section></body></html>`);assert.deepEqual(await frame().locator(selector).evaluate(el=>{const s=getComputedStyle(el);return[s.color,s.letterSpacing]}),expected)}
 await page.goto('http://127.0.0.1:5173/?test=1');await page.waitForFunction(()=>window.pptAgent?.parseHtml);
 const resource=await page.evaluate(async()=>{const result=await window.pptAgent.parseHtml('<section class="slide"><img src="100%.svg"></section>',[new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'],'100%.svg',{type:'image/svg+xml'})]);return {html:result.slides[0].html,warnings:result.warnings}});
 assert.ok(resource.html.includes('data:image/svg+xml'));assert.ok(!resource.warnings.some(w=>w.includes('缺少本地资源')));
 const encoded=await page.evaluate(async()=>{const assets=['part#one.svg','literal%20.svg'].map(name=>new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'],name,{type:'image/svg+xml'}));return window.pptAgent.parseHtml('<section class="slide"><img src="part%23one.svg"><img src="literal%2520.svg"></section>',assets)});
 assert.equal((encoded.slides[0].html.match(/data:image\/svg\+xml/g)||[]).length,2);assert.ok(!encoded.warnings.some(w=>w.includes('缺少本地资源')));
 await open('<!doctype html><html><body><div class="reveal"><div class="slides"><section><h1>保留页一</h1></section><section><h1>删除页二</h1></section><section><h1>保留页三</h1></section></div></div></body></html>');
 await page.locator('#pages .page').nth(1).locator('button').last().click();await page.click('#save');await expect.poll(()=>disk).not.toContain('删除页二');
 assert.ok(disk.includes('保留页一')&&disk.includes('保留页三'),'Deleting a page must preserve shared reveal wrappers and sibling pages');
 await open('<!doctype html><html><head><style>#copy-me{color:rgb(99,11,22)}</style></head><body><section class="slide"><div id="copy-me" class="slide-object" style="position:absolute;left:100px;top:120px">复制正文</div></section></body></html>');
 await frame().getByText('复制正文',{exact:true}).click();await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');await expect(frame().getByText('复制正文',{exact:true})).toHaveCount(2);
 await page.click('#save');await expect.poll(()=>(disk.match(/复制正文/g)||[]).length).toBe(2);
 const duplicateIds=await page.evaluate(source=>{const ids=[...new DOMParser().parseFromString(source,'text/html').querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,index)=>ids.indexOf(id)!==index)},disk);
 assert.deepEqual(duplicateIds,[],'Copy/paste must not reuse source mappings or original IDs');
 const copyPreview=await browser.newPage();await copyPreview.setContent(disk);assert.deepEqual(await copyPreview.getByText('复制正文',{exact:true}).evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).color)),['rgb(99, 11, 22)','rgb(99, 11, 22)']);await copyPreview.close();
 assert.deepEqual(errors,[]);console.log('PASS: table/SVG roundtrip, custom styles, page-root undo/save, obsolete async import cancellation, CSS nesting and percent filenames');
}catch(error){console.error('browser errors',errors);throw error}finally{await browser.close()}
