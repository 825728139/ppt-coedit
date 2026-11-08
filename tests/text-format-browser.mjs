import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function selectText(value,start,end){await page.locator('#rich-text-content').evaluate((root,{value,start,end})=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())if(node.textContent.includes(value)){const r=document.createRange();r.setStart(node,start);r.setEnd(node,end);const s=getSelection();s.removeAllRanges();s.addRange(r);root.dispatchEvent(new Event('mouseup',{bubbles:true}));document.dispatchEvent(new Event('selectionchange'));return;}throw Error('text not found')},{value,start,end});}
try{
 await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.pptAgent?.inspect().pages.length);
 await page.click('#add-text');const first=await page.evaluate(()=>window.pptAgent.inspect().selection[0]);
 await page.click('#add-text');const second=await page.evaluate(()=>window.pptAgent.inspect().selection[0]);
 await page.evaluate(({first,second})=>{const a=window.pptAgent,s=a.inspect();a.apply({baseRevision:s.revision,requestId:'setup',patches:[{id:first,text:'甲乙丙丁'},{id:second,text:'另一个文本框',style:{top:'500px'}}]})},{first,second});
 const frame=()=>page.frameLocator('.gjs-frame');const a=()=>frame().locator(`[id="${first}"]`);const b=()=>frame().locator(`[id="${second}"]`);
 await a().click({position:{x:10,y:10}});
 // Quick controls are likewise isolated to the selected component.
 await page.locator('#quick-size').fill('30');await page.locator('#quick-size').press('Tab');
 assert.equal(await a().evaluate(el=>getComputedStyle(el).fontSize),'30px');assert.equal(await b().evaluate(el=>getComputedStyle(el).fontSize),'40px');
 const nativeSize=page.locator('#styles .gjs-sm-property').filter({has:page.locator('[data-sm-label]',{hasText:'Font size'})}).locator('input').first();
 await nativeSize.fill('35');await nativeSize.press('Tab');assert.equal(await a().evaluate(el=>getComputedStyle(el).fontSize),'35px');assert.equal(await b().evaluate(el=>getComputedStyle(el).fontSize),'40px');
 await nativeSize.fill('30');await nativeSize.press('Tab');
 await page.click('#edit-rich-text');await page.locator('#text-format-dialog').waitFor();
 await page.locator('#rich-text-content').evaluate(el=>{el.innerHTML='<p>甲乙丙丁</p><p>第二段内容</p>';});
 await page.selectOption('#text-family','Georgia');
 await page.selectOption('#text-scope','selection');await selectText('甲乙丙丁',1,2);
 await page.locator('#text-size').fill('53');await page.locator('#text-size').press('Tab');await page.click('#text-bold');
 await page.locator('#text-spacing').fill('3');await page.locator('#text-spacing').press('Tab');
 await page.selectOption('#text-scope','paragraph');await selectText('第二段内容',2,2);await page.click('#text-center');
 await page.locator('#text-line-height').fill('2');await page.locator('#text-line-height').press('Tab');
 await page.click('#text-save');await page.locator('#text-format-dialog').waitFor({state:'hidden'});
 const styles=await a().evaluate(root=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const result={};while(walker.nextNode()){const n=walker.currentNode,s=getComputedStyle(n.parentElement);for(const ch of n.textContent)if('甲乙丙丁'.includes(ch))result[ch]={size:s.fontSize,weight:s.fontWeight,spacing:s.letterSpacing}}return {chars:result,paragraphs:[...root.querySelectorAll('p')].map(p=>({align:getComputedStyle(p).textAlign,line:getComputedStyle(p).lineHeight}))}});
 assert.equal(styles.chars['乙'].size,'53px');assert.equal(styles.chars['乙'].weight,'700');assert.equal(styles.chars['乙'].spacing,'3px');assert.equal(styles.chars['甲'].size,'30px');assert.equal(styles.chars['丙'].size,'30px');assert.equal(styles.paragraphs[1].align,'center');assert.notEqual(styles.paragraphs[0].align,'center');
 assert.equal(await b().evaluate(el=>getComputedStyle(el).fontSize),'40px');
 await page.click('#undo');assert.equal(await a().locator('span').count(),0);await page.click('#redo');await page.reload();await a().waitFor();assert.equal(await a().locator('span').filter({hasText:'乙'}).last().evaluate(el=>getComputedStyle(el).fontSize),'53px');
 assert.deepEqual(errors,[]);console.log('PASS: isolated textbox, single-character size/bold/spacing, paragraph alignment/line height, undo/redo and reload');
}finally{await browser.close()}
