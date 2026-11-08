import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1500,height:950}});
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(()=>window.pptAgent?.inspect().pages.length>0);
  await page.getByText('已保存到本机',{exact:true}).waitFor();
  await page.click('#add-text');
  await page.waitForTimeout(600);
  const result=await page.evaluate(()=>{
    const api=window.pptAgent, before=api.inspect();
    const target=before.pages[0].objects.find(o=>o.text==='双击编辑文字');
    const tx={baseRevision:before.revision,requestId:'browser-test',patches:[{id:target.id,text:'Agent 修改后的标题',style:{color:'#2563eb'}}]};
    const applied=api.apply(tx); const again=api.apply(tx);
    let conflict=false; try{api.apply({...tx,requestId:'stale'})}catch(e){conflict=e.message==='revision_conflict'}
    return {applied,again,conflict,id:target.id};
  });
  assert.deepEqual(result.applied,result.again); assert.ok(result.conflict);
  const frame=page.frameLocator('.gjs-frame');
  await frame.getByText('Agent 修改后的标题',{exact:true}).waitFor();
  await page.click('#undo');
  await frame.getByText('双击编辑文字',{exact:true}).waitFor();
  await page.click('#redo');
  await frame.getByText('Agent 修改后的标题',{exact:true}).waitFor();
  await page.reload();
  await page.frameLocator('.gjs-frame').getByText('Agent 修改后的标题',{exact:true}).waitFor();
  await page.click('#add-page');
  assert.equal(await page.locator('#pages .page').count(),2);
  await page.click('#present');
  await page.frameLocator('#player-frame').getByText('Agent 修改后的标题',{exact:true}).waitFor();
  await page.click('#close-player');
  await page.screenshot({path:'preview.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: real browser editor, agent patch/idempotency/conflict, undo/redo, persistence, pages and presentation');
}finally{await browser.close()}
