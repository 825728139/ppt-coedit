import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173/?test=1');await page.waitForFunction(()=>window.pptAgent?.inspect().pages.length);
 // Round 1: malformed requests, idempotency collisions and active-text conflicts.
 await page.click('#add-text');const id=await page.evaluate(()=>window.pptAgent.inspect().selection[0]);
 const protocol=await page.evaluate(id=>{const api=window.pptAgent,s=api.inspect();const tx={baseRevision:s.revision,requestId:'review',patches:[{id,text:'review base'}]};api.apply(tx);const errors=[];for(const value of [null,{...tx,patches:[{id,text:'different'}]}])try{api.apply(value)}catch(e){errors.push(e.message)}return errors},id);
 assert.deepEqual(protocol,['invalid_transaction','request_id_conflict']);
 const box=()=>page.frameLocator('.gjs-frame').locator(`[id="${id}"]`);await box().dblclick();await box().evaluate(el=>{el.textContent='Native unsaved text';el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}))});
 assert.equal(await page.evaluate(id=>{const a=window.pptAgent;try{a.apply({baseRevision:a.inspect().revision,requestId:'while-editing',patches:[{id,text:'overwrite'}]})}catch(e){return e.message}},id),'text_edit_in_progress');
 const downloadWait=page.waitForEvent('download');await page.click('#export');const download=await downloadWait,stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.ok(Buffer.concat(chunks).toString().includes('Native unsaved text'));
 // Round 2: highlighted text must survive flattening; malformed import must roll back.
 await box().click({position:{x:10,y:10}});await page.click('#edit-rich-text');await page.locator('#rich-text-content').evaluate(el=>{el.innerHTML='<p><mark><span>highlighted</span></mark></p>'});await page.click('#text-save');
 assert.equal(await box().locator('span').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 0)');
 const roundtrip=await page.evaluate(async()=>{const parsed=await window.pptAgent.parseHtml('<section class="slide-root"><section class="slide-root"><svg><defs><marker id="tip"><path d="M0 0L2 1L0 2"/></marker><clipPath id="clip"><rect width="10" height="10"/></clipPath></defs><path id="arrow" marker-end="url(#tip)" clip-path="url(#clip)" d="M0 0L100 100"/></svg></section></section>');const doc=new DOMParser().parseFromString(parsed.slides[0].html,'text/html');const path=doc.querySelector('[marker-end]');return {pages:parsed.slides.length,marker:path.getAttribute('marker-end')===`url(#${doc.querySelector('marker').id})`,clip:path.getAttribute('clip-path')===`url(#${doc.querySelector('clipPath').id})`}});
 assert.deepEqual(roundtrip,{pages:1,marker:true,clip:true});
 const before=await page.evaluate(()=>window.pptAgent.inspect().pages.length);await page.click('[data-panel="agent"]');await page.fill('#html-input','<h1>Should rollback</h1>');await page.fill('#css-input','h1 { color: red;');await page.click('#import-html');assert.equal(await page.evaluate(()=>window.pptAgent.inspect().pages.length),before);
 // Round 3: delayed file reading must stay attached to its original page.
 await page.evaluate(()=>{const Native=window.FileReader;window.FileReader=class extends Native{readAsDataURL(file){setTimeout(()=>super.readAsDataURL(file),250)}}});
 const originalPage=await page.evaluate(()=>window.pptAgent.inspect().pageId);const chooserWait=page.waitForEvent('filechooser');await page.click('#add-image');await(await chooserWait).setFiles({name:'review.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>')});await page.click('#add-page');await page.waitForTimeout(400);
 const pages=await page.evaluate(()=>window.pptAgent.inspect().pages);assert.ok(pages.find(p=>p.id===originalPage).objects.some(o=>o.tag==='img'));assert.ok(!pages.at(-1).objects.some(o=>o.tag==='img'));
 assert.deepEqual(errors,[]);console.log('PASS: three review rounds: request validation/conflicts, live-text export, highlight preservation, SVG references/nested slides, rollback, async image destination');
}finally{await browser.close()}
