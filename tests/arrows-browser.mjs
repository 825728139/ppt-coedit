import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const data=()=>page.frameLocator('.gjs-frame').locator('[data-coedit-diagram]').getAttribute('data-coedit-edges').then(JSON.parse);
const selectEdge = async () => { const point = await page.locator('.arrow-canvas .x6-edge path[stroke="transparent"]').evaluate(path => { const point = path.getPointAtLength(path.getTotalLength()/2).matrixTransform(path.getScreenCTM()); return {x:point.x,y:point.y}; }); await page.mouse.click(point.x, point.y); };
try{
 await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.pptAgent?.inspect().pages.length);
 await page.click('#insert-arrow');
 await page.locator('.x6-edge-tool-source-arrowhead').waitFor();
 let original=await data();assert.equal(original.cells.length,1);
 const handle=page.locator('.x6-edge-tool-target-arrowhead');const bounds=await handle.boundingBox();
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+50,bounds.y+bounds.height/2-30,{steps:6});await page.mouse.up();
 await page.waitForTimeout(200);const moved=await data();
 assert.equal(moved.cells[0].source.x,original.cells[0].source.x);
 assert.ok(Math.abs(moved.cells[0].target.x-original.cells[0].target.x-100)<4,JSON.stringify({before:original.cells[0].target,after:moved.cells[0].target,errors}));
 await page.click('#undo');await page.waitForTimeout(100);assert.equal((await data()).cells[0].target.x,original.cells[0].target.x);
 // Select again after restoring the graph; styles apply to this specific edge.
 await selectEdge();
 assert.equal(await page.locator('.x6-edge-tool-target-arrowhead').count(),1,await page.locator('#arrow-tip').innerText());
 await page.selectOption('#zoom','100');await page.waitForTimeout(100);
 const sourceBox=await page.locator('.x6-edge-tool-source-arrowhead').boundingBox();
 await page.mouse.move(sourceBox.x+sourceBox.width/2,sourceBox.y+sourceBox.height/2);await page.mouse.down();await page.mouse.move(sourceBox.x+sourceBox.width/2+20,sourceBox.y+sourceBox.height/2+20,{steps:4});await page.mouse.up();await page.waitForTimeout(100);
 assert.ok(Math.abs((await data()).cells[0].source.x-original.cells[0].source.x-20)<4);
 assert.equal((await data()).cells[0].target.x,original.cells[0].target.x);
 await page.click('#undo');await page.waitForTimeout(100);await page.selectOption('#zoom','50');await page.waitForTimeout(100);await selectEdge();
 await page.selectOption('#arrow-kind','curve');
 assert.equal((await data()).cells[0].data.kind,'curve');assert.equal((await data()).cells[0].vertices.length,1);
 await page.selectOption('#arrow-ends','double');assert.ok((await data()).cells[0].attrs.line.sourceMarker);
 await page.check('#arrow-dash');assert.equal((await data()).cells[0].attrs.line.strokeDasharray,'8 6');
 await page.click('#arrow-done');assert.ok(await page.locator('.arrow-toolbar').isHidden());
 await page.reload();await page.frameLocator('.gjs-frame').locator('[data-coedit-diagram] svg').waitFor({state:'attached'});await page.locator('.arrow-canvas .x6-edge').waitFor();
 assert.equal((await data()).cells[0].data.kind,'curve');
 const downloadPromise=page.waitForEvent('download');await page.click('#export');const download=await downloadPromise;const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const exported=Buffer.concat(chunks).toString();
 assert.ok(exported.includes('data-coedit-edges'));assert.ok(exported.includes('<svg'));assert.ok(!exported.includes('x6-edge-tool-target-arrowhead'));
 await page.click('#present');await page.frameLocator('#player-frame').locator('svg').waitFor();await page.click('#close-player');
 await page.click('#edit-arrows');await selectEdge();await page.click('#arrow-delete');assert.equal((await data()).cells.length,0);
 assert.deepEqual(errors,[]);console.log('PASS: X6 insertion, endpoint drag at 50%, undo, curve, double markers, dashed style, persistence, static SVG export/presentation, deletion');
}finally{await browser.close()}
