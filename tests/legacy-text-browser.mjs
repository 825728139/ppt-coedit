import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173/?test=1');await page.waitForFunction(()=>window.pptAgent?.inspect().pages.length);
 await page.click('#open-html');await page.setInputFiles('#deck-file','tests/fixtures/legacy-export.html');await page.click('#confirm-import');await page.waitForFunction(()=>document.querySelector('#import-summary').textContent.includes('已导入'));await page.click('#cancel-import');await page.locator('#pages .page').first().locator('button').last().click();
 const box=()=>page.frameLocator('.gjs-frame').locator('.slide-object').filter({hasText:'Agent 负责构思'});
 assert.equal(await box().getAttribute('data-coedit-textbox'),'true');
 await box().locator('span').click();const id=await box().getAttribute('id');assert.deepEqual(await page.evaluate(()=>window.pptAgent.inspect().selection),[id]);
 await box().dblclick();await page.frameLocator('.gjs-frame').locator('[contenteditable="true"]').waitFor();
 // Exercise the native canvas editor path, without using the separate dialog.
 await box().evaluate(root=>{const d=root.ownerDocument,w=d.defaultView,walker=d.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())if(node.textContent.includes('Agent'))break;const r=d.createRange();r.setStart(node,0);r.setEnd(node,5);const s=w.getSelection();s.removeAllRanges();s.addRange(r);d.execCommand('bold');d.execCommand('bold');});
 await page.locator('header .brand').click();await page.waitForTimeout(700);
 assert.equal(await box().locator('span span').count(),0);
 assert.equal(await box().locator('b,strong').count(),0);
 await box().click({position:{x:10,y:10}});assert.deepEqual(await page.evaluate(()=>window.pptAgent.inspect().selection),[id]);
 const wait=page.waitForEvent('download');await page.click('#export');const download=await wait;if(process.env.REPAIRED_HTML_OUTPUT)await download.saveAs(process.env.REPAIRED_HTML_OUTPUT);const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const html=Buffer.concat(chunks).toString();assert.equal((html.match(/<body\b/g)||[]).length,1,JSON.stringify(html.match(/.{0,70}<body.{0,160}/g)));assert.ok(html.includes('data-coedit-textbox'));
 assert.deepEqual(errors,[]);console.log('PASS: supplied HTML imported as intact textboxes, canvas bold/unbold normalized, original text remains selectable as one box, valid single-body export');
}finally{await browser.close()}
