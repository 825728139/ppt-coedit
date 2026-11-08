import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const data=()=>page.frameLocator('.gjs-frame').locator('[data-coedit-diagram]').getAttribute('data-coedit-edges').then(JSON.parse);
async function move(id,dx,dy){
 const p=await page.locator(`.arrow-canvas .x6-edge[data-cell-id="${id}"] path[stroke="transparent"]`).evaluate(path=>{const p=path.getPointAtLength(path.getTotalLength()/2).matrixTransform(path.getScreenCTM());return {x:p.x,y:p.y}});
 await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:8});await page.mouse.up();await page.waitForTimeout(120);
}
try{
 await page.goto('http://127.0.0.1:5173/?test=1');await page.waitForFunction(()=>window.pptAgent?.inspect().pages.length);
 await page.click('#insert-arrow');await page.selectOption('#arrow-kind','curve');await page.click('#arrow-done');
 const original=(await data()).cells[0];
 await move(original.id,30,25);
 let result=(await data()).cells[0];
 for(const key of ['source','target']){assert.ok(Math.abs(result[key].x-original[key].x-60)<2);assert.ok(Math.abs(result[key].y-original[key].y-50)<2)}
 assert.ok(Math.abs(result.vertices[0].x-original.vertices[0].x-60)<2);
 await page.click('#undo');await page.waitForTimeout(100);assert.deepEqual((await data()).cells[0].source,original.source);
 await page.click('#redo');await page.waitForTimeout(100);const first=(await data()).cells[0];
 await page.click('#insert-arrow');const second=(await data()).cells.find(c=>c.id!==first.id);await page.click('#arrow-done');
 await move(second.id,-30,10);result=await data();
 assert.deepEqual(result.cells.find(c=>c.id===first.id).source,first.source);
 assert.ok(Math.abs(result.cells.find(c=>c.id===second.id).source.x-second.source.x+60)<2,JSON.stringify({second:second.source,result:result.cells.map(c=>({id:c.id,source:c.source}))}));
 await page.click('#arrow-done');
 // Transparent portions of the overlay must still allow ordinary HTML selection.
 await page.frameLocator('.gjs-frame').getByText('从想法，到共同创作。',{exact:true}).click();
 assert.ok(await page.locator('.object-tools').isVisible());
 const final=await data();await page.reload();await page.waitForFunction(()=>window.pptAgent?.inspect().pages.length);assert.deepEqual((await data()).cells.map(c=>c.source),final.cells.map(c=>c.source));
 assert.deepEqual(errors,[]);console.log('PASS: drag arrow body after Done, both endpoints/curve vertices translate, one-step undo/redo, independent arrows, HTML click-through, persistence');
}finally{await browser.close()}
