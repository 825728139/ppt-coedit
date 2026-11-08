import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const frame=()=>page.frameLocator('.gjs-frame');
const inspect=()=>page.evaluate(()=>window.pptAgent.inspect());
try {
 await page.goto('http://127.0.0.1:5173/?test=1');await page.waitForFunction(()=>window.pptAgent?.inspect().pages.length);
 // A locked card must protect its children, including Delete and native style controls.
 await page.click('#add-card');const cardId=(await inspect()).selection[0];
 await page.click('#lock');
 await page.locator('#object-path button').last().click();
 await frame().locator(`[id="${cardId}"] h2`).click();
 await page.click('#delete-object');
 assert.equal(await frame().locator(`[id="${cardId}"] h2`).count(),1,'Locked parent must prevent child deletion');
 assert.equal(await page.locator('#styles input:visible').count(),0,'Native style controls must not bypass a parent lock');
 await page.reload();await frame().locator(`[id="${cardId}"] h2`).click();
 await page.click('#delete-object');assert.equal(await frame().locator(`[id="${cardId}"] h2`).count(),1);
 await page.locator(`#object-path button[title="${cardId}"]`).click();await page.click('#lock');
 await frame().locator(`[id="${cardId}"] h2`).click();await expect(page.locator('#quick-bold')).toBeEnabled();

 // Live text must be committed before Undo and available again via Redo.
 await page.click('#add-text');const textId=(await inspect()).selection[0];
 await frame().locator(`[id="${textId}"]`).dblclick();
 await frame().locator('[contenteditable="true"]').fill('撤销前最后输入');
 await page.click('#undo');await page.click('#redo');
 await expect(frame().locator(`[id="${textId}"]`)).toContainText('撤销前最后输入');

 // An unfinished arrow gesture must never be saved onto the page switched to.
 await page.click('#add-page');
 await page.locator('#pages .page').first().locator('button').first().click();
 await page.click('#insert-arrow');await page.click('#arrow-done');
 const point=await page.locator('.arrow-canvas .x6-edge path[stroke="transparent"]').evaluate(path=>{const p=path.getPointAtLength(path.getTotalLength()/2).matrixTransform(path.getScreenCTM());return {x:p.x,y:p.y}});
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+30,point.y+15);
 await page.evaluate(async()=>{const raf=window.requestAnimationFrame,queued=[];window.requestAnimationFrame=callback=>{queued.push(callback);return queued.length};try{document.querySelectorAll('#pages .page')[1].querySelector('button').click();document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,20))}finally{window.requestAnimationFrame=raf;queued.forEach(callback=>raf(callback))}});
 await page.mouse.up();await page.waitForTimeout(100);
 assert.equal(await frame().locator('[data-coedit-diagram]').count(),0,'An arrow drag from another page must not create a diagram on this page');

 const svg=color=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="${color}"/></svg>`);
 const sourceA='data:image/svg+xml;base64,'+svg('red').toString('base64'),sourceB='data:image/svg+xml;base64,'+svg('blue').toString('base64');
 await page.click('[data-panel="agent"]');await page.locator('#html-input').fill(`<img id="review-image-a" class="slide-object" src="${sourceA}" style="left:100px;top:120px;width:100px;height:100px"><img id="review-image-b" class="slide-object" src="${sourceB}" style="left:500px;top:120px;width:100px;height:100px">`);
 await page.click('#import-html');
 await frame().locator('#review-image-a').click();const choose=page.waitForEvent('filechooser');await page.click('#replace-image');const chooser=await choose;
 await frame().locator('#review-image-b').click();await chooser.setFiles({name:'replacement.svg',mimeType:'image/svg+xml',buffer:svg('green')});
 await expect(frame().locator('#review-image-a')).not.toHaveAttribute('src',sourceA);
 assert.equal(await frame().locator('#review-image-b').getAttribute('src'),sourceB,'Replacement must remain attached to the image that opened the picker');

 const savedPage=await browser.newPage({viewport:{width:1600,height:1000}});
 savedPage.on('pageerror',e=>errors.push(e.message));
 await savedPage.addInitScript(()=>{window.savedHtml='';window.showSaveFilePicker=async()=>({name:'saved.html',getFile:async()=>new File([window.savedHtml],'saved.html'),createWritable:async()=>({write:async text=>{window.savedHtml=text},close:async()=>{}})})});
 await savedPage.goto('http://127.0.0.1:5173/');
 const heading=()=>savedPage.frameLocator('.gjs-frame').getByText('从想法，到共同创作。',{exact:true});
 await heading().waitFor();const beforeSaveAs=await heading().boundingBox();
 await savedPage.click('#save-source-as');await expect(savedPage.locator('#source-name')).toHaveText('saved.html');
 const afterSaveAs=await heading().boundingBox();
 assert.ok(Math.abs(afterSaveAs.x-beforeSaveAs.x)<2&&Math.abs(afterSaveAs.y-beforeSaveAs.y)<2,'Save As roundtrip must preserve the visible slide geometry');
 await savedPage.click('#insert-arrow');await savedPage.click('#arrow-done');await savedPage.click('#save');
 await savedPage.waitForFunction(()=>window.savedHtml.includes('data-coedit-edges'));
 await savedPage.evaluate(()=>{window.savedHtml=window.savedHtml.replace('从想法，到共同创作。','外部改后的箭头页')});
 await savedPage.frameLocator('.gjs-frame').getByText('外部改后的箭头页',{exact:true}).waitFor();
 const arrowPoint=await savedPage.locator('.arrow-canvas .x6-edge path[stroke="transparent"]').evaluate(path=>{const p=path.getPointAtLength(path.getTotalLength()/2).matrixTransform(path.getScreenCTM());return {x:p.x,y:p.y}});
 await savedPage.mouse.click(arrowPoint.x,arrowPoint.y);await savedPage.locator('#arrow-color').fill('#facade');await savedPage.locator('#arrow-color').dispatchEvent('change');await savedPage.click('#save');
 await savedPage.waitForFunction(()=>window.savedHtml.includes('#facade'));
 await savedPage.evaluate(()=>{window.showOpenFilePicker=async()=>[{name:'fragment.html',getFile:async()=>new File(['<h1>导出失败提示测试</h1>'],'fragment.html')}]});
 await savedPage.click('#open-source');await expect(savedPage.locator('#source-name')).toHaveText('fragment.html');
 await savedPage.frameLocator('.gjs-frame').getByText('导出失败提示测试',{exact:true}).click();await savedPage.click('#object-parent');
 await savedPage.locator('#quick-color').fill('#123456');await savedPage.locator('#quick-color').dispatchEvent('change');
 await savedPage.click('#export');await expect(savedPage.locator('#status')).toContainText('导出失败');
 await savedPage.close();

 const recovery=await browser.newPage();
 await recovery.addInitScript(()=>localStorage.setItem('ppt-coedit-v1',JSON.stringify({schemaVersion:1,revision:7,project:{pages:[]}})));
 await recovery.goto('http://127.0.0.1:5173/');
 await recovery.frameLocator('.gjs-frame').getByText('从想法，到共同创作。',{exact:true}).waitFor({timeout:3000});
 await recovery.close();
 const legacy=await browser.newPage({viewport:{width:1600,height:1000}});
 await legacy.addInitScript(()=>localStorage.setItem('ppt-coedit-v1',JSON.stringify({schemaVersion:1,revision:1,project:{pages:[{id:'legacy-page',frames:[{component:{type:'wrapper',components:[{tagName:'section',attributes:{class:'slide-root'},style:{position:'relative',width:'1280px',height:'720px'},components:[{type:'slide-object',tagName:'article',attributes:{id:'legacy-card',class:'slide-object card'},style:{position:'absolute',left:'100px',top:'120px',width:'400px',height:'200px'},coeditLocked:true,draggable:false,resizable:false,removable:false,editable:false,components:'<h2>旧锁定卡片</h2>'}]}]}}]}]}})));
 await legacy.goto('http://127.0.0.1:5173/');await legacy.frameLocator('.gjs-frame').getByText('旧锁定卡片',{exact:true}).click();
 await legacy.locator('#object-path button[title="legacy-card"]').click();await legacy.click('#lock');await legacy.click('#delete-object');
 assert.equal(await legacy.frameLocator('.gjs-frame').locator('#legacy-card').count(),0,'Legacy locks must regain normal capabilities after unlocking');await legacy.close();

 assert.deepEqual(errors,[]);console.log('PASS: lock ancestry/reload/unlock, active-text undo/redo, arrow page isolation, image picker target, Save As geometry, corrupt draft recovery and export errors');
}finally{await browser.close()}
