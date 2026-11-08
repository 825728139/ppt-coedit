import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function select(start,end){await page.locator('#rich-text-content').evaluate((root,{start,end})=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);const r=document.createRange();let offset=0;for(const n of nodes){if(start>=offset&&start<offset+n.length){r.setStart(n,start-offset);break}offset+=n.length}offset=0;for(const n of nodes){if(end>offset&&end<=offset+n.length){r.setEnd(n,end-offset);break}offset+=n.length}const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'))},{start,end});}
try{
 await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.pptAgent?.inspect().pages.length);
 await page.click('#add-text');const id=await page.evaluate(()=>{const a=window.pptAgent,s=a.inspect(),id=s.selection[0];a.apply({baseRevision:s.revision,requestId:'normalize',patches:[{id,text:'甲乙丙丁'}]});return id});
 const box=()=>page.frameLocator('.gjs-frame').locator(`[id="${id}"]`);
 await page.click('#edit-rich-text');await page.selectOption('#text-scope','selection');
 for(let i=0;i<4;i++){await select(1,2);await page.click('#text-bold');await page.click('#text-normal')}
 await page.click('#text-save');assert.equal(await box().locator('span').count(),0);assert.equal(await box().innerText(),'甲乙丙丁');
 await box().click({position:{x:10,y:10}});await page.click('#edit-rich-text');await page.selectOption('#text-scope','selection');
 await select(0,1);await page.click('#text-bold');await select(1,2);await page.click('#text-bold');await page.click('#text-save');
 assert.equal(await box().locator('span').count(),1);assert.equal(await box().locator('span').innerText(),'甲乙');assert.equal(await box().locator('span span').count(),0);
 await box().locator('span').click({position:{x:8,y:8}});assert.deepEqual(await page.evaluate(()=>window.pptAgent.inspect().selection),[id]);assert.ok(await page.locator('#object-child').isDisabled());
 await page.reload();await box().waitFor();await box().locator('span').click({position:{x:8,y:8}});assert.deepEqual(await page.evaluate(()=>window.pptAgent.inspect().selection),[id]);
 await page.click('#edit-rich-text');await page.selectOption('#text-scope','selection');await select(0,2);await page.click('#text-normal');await page.click('#text-save');assert.equal(await box().locator('span').count(),0);
 await page.click('#undo');assert.equal(await box().locator('span').count(),1);await page.click('#redo');assert.equal(await box().locator('span').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: repeated bold/unbold restores plain text, adjacent marks merge, no nested spans, one selectable textbox after reload, undo/redo');
}finally{await browser.close()}
