import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import assert from 'node:assert/strict';

// Exercise the actual module with controlled file latency and failures.
const source = await readFile('src/file-session.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
try {
  await page.setContent('<nav></nav>');
  const result = await page.evaluate(async url => {
    const { installFileSession } = await import(url);
    const files = { a: 'initial', b: 'other' };
    let content = '', failNext = false, pickerCalls = 0, releasePicker;
    let reads = 0;
    const handles = Object.fromEntries(Object.keys(files).map(key => [key, {
      name: key + '.html', getFile: async () => { reads++; return new File([files[key]], key + '.html'); },
      createWritable: async () => { let text; return { write: async value => { text = value; }, close: async () => { files[key] = text; } }; },
    }]));
    window.showOpenFilePicker = async () => { pickerCalls++; if (releasePicker === undefined) await new Promise(resolve => { releasePicker = resolve; }); return [handles.a]; };
    window.showSaveFilePicker = async () => handles.b;
    const session = installFileSession({ load: async text => { if (failNext) { failNext = false; throw new Error('transient load failure'); } content = text; }, render: () => content, editing: () => false, flush: async () => {} });
    // A second click during the native picker must not open another picker or unlock the first one.
    const first = document.querySelector('#open-source').onclick();
    await Promise.resolve(); await Promise.resolve();
    await document.querySelector('#open-source').onclick();
    const concurrentPickerCalls = pickerCalls;
    releasePicker(); await first;

    // A failed reimport after Save As must leave the previous handle bound.
    content = 'save-as-content'; failNext = true;
    await document.querySelector('#save-source-as').onclick();
    const boundAfterFailedSaveAs = document.querySelector('#source-name').textContent;
    content = 'recovered-on-original'; await session.save();
    const originalAfterRecovery = files.a, otherAfterRecovery = files.b;

    // Disk changed before the next timer tick: Save must show that version, not overwrite it.
    files.a = 'external-before-tick'; content = 'stale-editor';
    await session.save(); const externalAfterSave = files.a, displayedAfterSave = content;

    // A transient import error is retried even when the disk text remains identical.
    files.a = 'retry-content'; failNext = true;
    await session.poll(); await session.poll();
    const retriedContent = content;

    // An agent may truncate then write. Empty intermediate state should not clear the editor.
    files.a = ''; await session.poll(); const afterEmpty = content;
    files.a = 'completed-write'; await session.poll();
    const afterCompleted = content;
    session.dispose();
    return { concurrentPickerCalls, boundAfterFailedSaveAs, originalAfterRecovery, otherAfterRecovery, externalAfterSave, displayedAfterSave, retriedContent, afterEmpty, afterCompleted, reads };
  }, moduleUrl);
  assert.equal(result.concurrentPickerCalls, 1);
  assert.equal(result.boundAfterFailedSaveAs, 'a.html');
  assert.equal(result.originalAfterRecovery, 'recovered-on-original');
  assert.equal(result.otherAfterRecovery, 'save-as-content');
  assert.equal(result.externalAfterSave, 'external-before-tick');
  assert.equal(result.displayedAfterSave, 'external-before-tick');
  assert.equal(result.retriedContent, 'retry-content');
  assert.equal(result.afterEmpty, 'retry-content');
  assert.equal(result.afterCompleted, 'completed-write');
  console.log('PASS: picker exclusivity, failed Save As binding, latest disk priority, retry after transient load, empty intermediate writes');
} finally { await browser.close(); }
