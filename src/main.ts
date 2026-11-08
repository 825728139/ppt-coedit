import grapesjs, { type Component } from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import './style.css';
import { validateTransaction, type Transaction } from './protocol';
import { importHtmlDeck, scopeCss } from './html-import';
import { installEditingTools } from './editing-tools';
import { installArrows } from './arrows';
import { installTextFormat } from './text-format';

document.querySelector('#app')!.innerHTML = `
<header><div class="brand">◈ 共页 <small>COEDIT / LAB</small></div><div class="document">人机协同演示文稿 <span id="status">准备中</span></div><button id="open-html"></button><button id="export">导出 HTML</button><button id="present" class="primary">▶ 放映</button></header>
<nav><div><button id="add-page">＋ 新建页面</button><button id="add-text">T 文字</button><button id="add-card">▣ 卡片</button><button id="add-image">▧ 图片</button></div><div><button id="undo">↶ 撤销</button><button id="redo">↷ 重做</button><button id="save">保存</button><label>缩放 <select id="zoom"><option>40</option><option selected>50</option><option>75</option><option>100</option></select>%</label></div></nav>
<main><aside class="slides"><div class="section-label">幻灯片 <span id="count"></span></div><div id="pages"></div><p class="hint">单击选择对象，双击编辑文字。<br>卡片内部使用 HTML/CSS 排版。</p></aside><section class="workspace"><div id="editor"></div></section><aside class="inspector"><div class="tabs"><button data-panel="design" class="active">设计</button><button data-panel="agent">Agent</button></div><section id="design"><div class="section-label">当前对象</div><p id="selected">请选择画布中的元素</p><button id="lock">锁定 / 解锁</button><button id="delete-object">删除对象</button><div class="section-label">样式属性</div><div id="styles"></div><div class="section-label">图层</div><div id="layers"></div></section><section id="agent" hidden><h3>让人和 Agent 编辑同一页</h3><p class="hint">当前提供结构化事务接口，尚未连接大模型。选中对象后生成示例，或直接粘贴事务。</p><button id="example">生成选中对象示例</button><textarea id="transaction" spellcheck="false" placeholder="选择一个文字对象后生成示例"></textarea><button id="apply" class="primary">应用局部修改</button><pre id="result">window.pptAgent.inspect()\nwindow.pptAgent.apply(transaction)</pre><hr><div class="section-label">导入 HTML / CSS</div><p class="hint">导入为新页面；内容经过 GrapesJS 解析，不执行脚本。</p><textarea id="html-input" placeholder="<h1>我的新页面</h1>"></textarea><textarea id="css-input" placeholder="h1 { color: #2563eb; }"></textarea><button id="import-html">导入新页</button></section></aside></main><footer><span>HTML / CSS 原生编辑</span><span id="revision">revision 0</span><span>1280 × 720 · 本地自动保存</span></footer><dialog id="import-dialog"></dialog><dialog id="player"><button id="close-player">退出放映 ×</button><iframe id="player-frame" title="幻灯片放映"></iframe></dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const workspace = document.querySelector<HTMLElement>('.workspace')!;
const zoomTools = document.createElement('div');
zoomTools.className = 'preview-zoom';
zoomTools.setAttribute('role', 'group');
zoomTools.setAttribute('aria-label', '预览缩放');
zoomTools.innerHTML = `<button id="zoom-out" aria-label="缩小预览" title="缩小预览">−</button><button id="zoom-reset" title="恢复 100%" aria-label="恢复原始大小"><span id="zoom-value">50%</span></button><button id="zoom-in" aria-label="放大预览" title="放大预览">＋</button><span class="zoom-divider"></span><button id="zoom-fit" title="完整显示幻灯片">适应窗口</button>`;
workspace.append(zoomTools);
function setPreviewZoom(value: number) {
  const zoom = Math.max(10, Math.min(200, Math.round(value)));
  editor.Canvas.setZoom(zoom);
  $('zoom-value').textContent = `${zoom}%`;
  const select = $<HTMLSelectElement>('zoom');
  select.replaceChildren(...[...new Set([10, 25, 40, 50, 75, 100, 125, 150, 175, 200, zoom])].sort((a, b) => a - b).map(value => new Option(String(value), String(value))));
  select.value = String(zoom);
  $<HTMLButtonElement>('zoom-out').disabled = zoom <= 10;
  $<HTMLButtonElement>('zoom-in').disabled = zoom >= 200;
}
$('open-html').textContent = '打开 HTML PPT';
$('import-dialog').innerHTML = `<h2>打开已有 HTML PPT</h2><p class="hint">追加到当前文稿，不覆盖已有页面。支持 reveal.js、.slide、.slide-root 和 section。</p><label>HTML 文件<input id="deck-file" type="file" accept=".html,.htm"></label><label>资源文件夹（可选：图片、CSS、字体）<input id="asset-folder" type="file" webkitdirectory multiple></label><p id="import-summary" role="status"></p><div id="import-warnings"></div><div class="import-actions"><button id="cancel-import">关闭</button><button id="confirm-import" class="primary">导入页面</button></div>`;
const uid = () => 'o-' + crypto.randomUUID();
const baseCss = `.slide-root{position:relative;width:1280px;height:720px;overflow:hidden;background:#f5f1e9;color:#192f32;font-family:Arial,'Microsoft YaHei',sans-serif}.slide-object{position:absolute;box-sizing:border-box}.card{padding:30px;border-radius:18px;background:#fff;display:flex;flex-direction:column;gap:16px}.card h2,.card p{margin:0}.card p{line-height:1.7;color:#526867}*{box-sizing:border-box}body{margin:0}`;
const editor = grapesjs.init({
  container: '#editor', height: '100%', width: '100%', storageManager: false,
  panels: { defaults: [] }, dragMode: 'absolute',
  selectorManager: { componentFirst: true },
  avoidInlineStyle: false,
  forceClass: false,
  layerManager: { appendTo: '#layers' },
  styleManager: { appendTo: '#styles', sectors: [
    { name: '位置与尺寸', open: true, buildProps: ['left', 'top', 'width', 'height'] },
    { name: '文字', open: true, buildProps: ['font-family', 'font-size', 'font-weight', 'color', 'text-align', 'line-height'] },
    { name: '外观', open: false, buildProps: ['background-color', 'border-radius', 'padding', 'opacity'] },
  ] },
  deviceManager: { devices: [{ id: 'slide', name: '幻灯片', width: '1280px', height: '720px' }] },
});
editor.DomComponents.addType('slide-object', { isComponent: el => el.classList?.contains('slide-object') ? { type: el.tagName === 'DIV' ? 'slide-text' : 'slide-object' } : false, model: { defaults: { draggable: '.slide-root', droppable: false, resizable: true } } });
editor.DomComponents.addType('slide-text', { extend: 'text', isComponent: () => false, model: { defaults: { attributes: { 'data-coedit-textbox': 'true' }, draggable: '.slide-root', droppable: false, resizable: true } } });
editor.DomComponents.addType('slide-root', { isComponent: el => el.classList?.contains('slide-root') ? { type: 'slide-root' } : false, model: { defaults: { draggable: false, removable: false, copyable: false, resizable: false, droppable: true } } });

let revision = 0, muted = true, timer: ReturnType<typeof setTimeout>;
let history: string[] = [], cursor = -1;
const requests = new Map<string, { revision: number }>();
const storageKey = 'ppt-coedit-v1';
const snapshot = () => JSON.stringify({ project: editor.getProjectData(), selectedPageId: editor.Pages.getSelected()?.getId() });
function restoreSnapshot(value: string) { const state = JSON.parse(value); editor.loadProjectData(state.project); const selected = editor.Pages.get(state.selectedPageId); if (selected) editor.Pages.select(selected); }
function status(text: string) { $('status').textContent = text; $('revision').textContent = `revision ${revision}`; }
function persist() { try { localStorage.setItem(storageKey, JSON.stringify({ schemaVersion: 1, revision, project: editor.getProjectData() })); status('已保存到本机'); } catch { status('保存失败：存储空间不足'); } }
function commit() { clearTimeout(timer); const value = snapshot(); if (!history[cursor] || JSON.stringify(JSON.parse(value).project) !== JSON.stringify(JSON.parse(history[cursor]).project)) { history = history.slice(0, cursor + 1); history.push(value); cursor++; } else { history[cursor] = value; } persist(); renderPages(); }
function changed() { if (muted) return; revision++; status('正在保存…'); clearTimeout(timer); timer = setTimeout(commit, 450); }
function batch(action: () => void) { commit(); const before = snapshot(); muted = true; try { action(); } catch (error) { restoreSnapshot(before); throw error; } finally { muted = false; } revision++; commit(); }
const currentRoot = () => editor.Pages.getSelected()?.getMainComponent().find('.slide-root')[0];
function normalize(root: Component) { [root, ...root.find('*')].forEach(c => { if (!c.getAttributes().id) c.addAttributes({ id: uid() }); if (c.parent() && !c.getClasses().includes('slide-object') && !c.getClasses().includes('slide-root')) c.set({ draggable: false }); }); }
function addPage(html?: string, css = '') {
  const id = uid(); const name = `幻灯片 ${editor.Pages.getAll().length + 1}`;
  const page = editor.Pages.add({ id, name, component: `<section id="${id}-root" class="slide-root">${html ?? `<div class="slide-object" style="left:80px;top:80px;width:1000px;height:170px;font-size:64px;font-weight:700">从想法，到共同创作。</div><div class="slide-object" style="left:84px;top:300px;width:800px;height:110px;font-size:28px;color:#617877">Agent 负责构思与排版，你负责最后的判断。<br>每个元素都可以继续编辑。</div><div class="slide-object" style="left:84px;top:590px;width:500px;height:40px;color:#3b7972;font-size:20px">COEDIT / HUMAN × AGENT</div>`}</section>`, styles: baseCss });
  if (!page) throw new Error('page_creation_failed');
  editor.Pages.select(page); normalize(page.getMainComponent());
  if (css) editor.addStyle(scopeCss(css, `${id}-root`));
}
function renderPages() { const list = $('pages'); list.replaceChildren(); editor.Pages.getAll().forEach((page, index) => { const item = document.createElement('div'); item.className = 'page' + (page === editor.Pages.getSelected() ? ' active' : ''); const button = document.createElement('button'); button.textContent = `${String(index + 1).padStart(2, '0')}   ${page.get('name') || '幻灯片'}`; button.onclick = () => editor.Pages.select(page); item.append(button); const del = document.createElement('button'); del.textContent = '×'; del.title = '删除页面'; del.disabled = editor.Pages.getAll().length <= 1; del.onclick = () => batch(() => { editor.Pages.remove(page); }); item.append(del); list.append(item); }); $('count').textContent = `${editor.Pages.getAll().length} 页`; }
function selectInfo() { const c = editor.getSelected(); $('selected').textContent = c ? `${c.getName()} · ${c.getId()}${c.get('coeditLocked') ? ' · 已锁定' : ''}` : '请选择画布中的元素'; }
function addObject(html: string) { batch(() => { const root = currentRoot(); if (!root) return; const components = root.append(html); normalize(root); editor.select(components[0]); }); }

const api = {
  parseHtml: importHtmlDeck,
  inspect() { return { revision, pageId: editor.Pages.getSelected()?.getId(), selection: editor.getSelectedAll().map(c => c.getId()), pages: editor.Pages.getAll().map(p => ({ id: p.getId(), name: p.get('name'), objects: p.getMainComponent().find('*').map(c => ({ id: c.getId(), tag: c.get('tagName'), locked: !!c.get('coeditLocked'), text: c.getEl()?.textContent?.slice(0, 180), style: c.getStyle() })) })) }; },
  apply(transaction: Transaction) {
    const previous = requests.get(transaction.requestId); if (previous) return previous;
    const get = (id: string) => editor.Components.getById(id);
    validateTransaction(transaction, revision, id => !!get(id), id => { let c: Component | undefined = get(id); while (c) { if (c.get('coeditLocked')) return true; c = c.parent(); } return false; });
    for (const patch of transaction.patches) if (patch.text !== undefined && get(patch.id)!.components().some((c: Component) => c.get('type') !== 'textnode')) throw new Error('text_target_has_children');
    batch(() => { transaction.patches.forEach(patch => { const c = get(patch.id)!; if (patch.text !== undefined) c.components(document.createTextNode(patch.text).textContent!.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')); if (patch.style) c.addStyle(patch.style); }); });
    const result = { revision }; requests.set(transaction.requestId, result); return result;
  },
};
(window as unknown as { pptAgent: typeof api }).pptAgent = api;
installEditingTools(editor, batch);
installTextFormat(editor, batch);
installArrows(editor, batch);
editor.on('update', changed); editor.on('page:select', renderPages); editor.on('component:selected component:deselected', selectInfo);
editor.on('load', () => {
  try { const stored = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (stored?.schemaVersion === 1) { editor.loadProjectData(stored.project); revision = stored.revision; } else { [...editor.Pages.getAll()].forEach(p => editor.Pages.remove(p)); addPage(); } } catch { addPage(); status('存档读取失败，已创建新文稿'); }
  editor.UndoManager.stop(); setPreviewZoom(50); muted = false; commit();
});
$('add-page').onclick = () => batch(() => addPage());
$('add-text').onclick = () => addObject('<div class="slide-object" style="left:100px;top:180px;width:600px;height:90px;font-size:40px">双击编辑文字</div>');
$('add-card').onclick = () => addObject('<article class="slide-object card" style="left:130px;top:240px;width:480px;height:260px"><h2>一个值得分享的想法</h2><p>这是可编辑的 HTML 卡片。外层自由定位，内部保持流式排版。</p></article>');
$('add-image').onclick = () => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = () => { const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => addObject(`<img class="slide-object" src="${reader.result}" style="left:180px;top:150px;width:480px;height:320px;object-fit:contain">`); reader.readAsDataURL(file); }; input.click(); };
$('save').onclick = commit;
for (const [id, delta] of [['undo', -1], ['redo', 1]] as const) $(id).onclick = () => { commit(); const next = cursor + delta; if (next < 0 || next >= history.length) return; muted = true; restoreSnapshot(history[next]); muted = false; cursor = next; history[cursor] = snapshot(); revision++; persist(); renderPages(); };
$('zoom').onchange = () => setPreviewZoom(Number($<HTMLSelectElement>('zoom').value));
$('zoom-out').onclick = () => setPreviewZoom(editor.Canvas.getZoom() - 10);
$('zoom-in').onclick = () => setPreviewZoom(editor.Canvas.getZoom() + 10);
$('zoom-reset').onclick = () => setPreviewZoom(100);
$('zoom-fit').onclick = () => setPreviewZoom(Math.floor(Math.min((workspace.clientWidth - 80) / 1280, (workspace.clientHeight - 120) / 720) * 100));
$('lock').onclick = () => { const c = editor.getSelected(); if (c && c.getClasses().includes('slide-object')) batch(() => { const locked = !c.get('coeditLocked'); c.set({ coeditLocked: locked, draggable: !locked, resizable: !locked, removable: !locked, editable: !locked }); selectInfo(); }); };
$('delete-object').onclick = () => { const c = editor.getSelected(); if (c && c.get('removable') && !c.get('coeditLocked')) batch(() => { c.remove(); }); };
document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(b => b.onclick = () => { for (const id of ['design', 'agent']) $(id).hidden = id !== b.dataset.panel; document.querySelectorAll('[data-panel]').forEach(x => x.classList.toggle('active', x === b)); });
$('example').onclick = () => { const c = editor.getSelected(); if (!c) { $('result').textContent = '请先选中文字对象'; return; } $<HTMLTextAreaElement>('transaction').value = JSON.stringify({ baseRevision: revision, requestId: crypto.randomUUID(), patches: [{ id: c.getId(), text: '让创作更进一步', style: { color: '#26756d' } }] }, null, 2); };
$('apply').onclick = () => { try { $('result').textContent = JSON.stringify(api.apply(JSON.parse($<HTMLTextAreaElement>('transaction').value)), null, 2); } catch (e) { $('result').textContent = String(e); } };
$('import-html').onclick = () => { try { batch(() => addPage($<HTMLTextAreaElement>('html-input').value, $<HTMLTextAreaElement>('css-input').value)); $('result').textContent = '已导入新页面'; } catch (e) { $('result').textContent = String(e); } };
function presentation() { const slides = editor.Pages.getAll().map(p => { const c = p.getMainComponent().find('.slide-root')[0] || p.getMainComponent(); return { html: new DOMParser().parseFromString(c.toHTML(), 'text/html').body.innerHTML, css: editor.getCss({ component: c }) }; }); return `<!doctype html><html><head><meta charset="utf-8"><title>共页演示</title><style>body{margin:0;background:#15292b}.frame{position:absolute;width:1280px;height:720px;left:50%;top:50%;transform-origin:center}.frame[hidden]{display:none}</style></head><body>${slides.map((s,i) => `<div class="frame" ${i ? 'hidden' : ''}><style>${s.css}</style>${s.html}</div>`).join('')}<script>const slides=[...document.querySelectorAll('.frame')];let i=0;function fit(){slides.forEach(s=>s.style.transform='translate(-50%,-50%) scale('+Math.min(innerWidth/1280,innerHeight/720)+')')}onresize=fit;fit();onkeydown=e=>{if(['ArrowRight',' ','ArrowLeft'].includes(e.key)){e.preventDefault();slides[i].hidden=true;i=(i+(e.key==='ArrowLeft'?-1:1)+slides.length)%slides.length;slides[i].hidden=false}};<\/script></body></html>`; }
$('export').onclick = () => { const url = URL.createObjectURL(new Blob([presentation()], { type: 'text/html' })); const a = document.createElement('a'); a.href = url; a.download = '共页演示.html'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
$('present').onclick = () => { $<HTMLIFrameElement>('player-frame').srcdoc = presentation(); $<HTMLDialogElement>('player').showModal(); $<HTMLIFrameElement>('player-frame').focus(); };
$('close-player').onclick = () => $<HTMLDialogElement>('player').close();

$('open-html').onclick = () => $<HTMLDialogElement>('import-dialog').showModal();
$('cancel-import').onclick = () => $<HTMLDialogElement>('import-dialog').close();
$('confirm-import').onclick = async () => {
  const file = $<HTMLInputElement>('deck-file').files?.[0];
  if (!file) { $('import-summary').textContent = '请先选择 HTML 文件。'; return; }
  const button = $<HTMLButtonElement>('confirm-import'); button.disabled = true;
  $('import-summary').textContent = '正在解析文件与资源…'; $('import-warnings').replaceChildren();
  try {
    const assets = [...($<HTMLInputElement>('asset-folder').files || [])];
    const result = await importHtmlDeck(await file.text(), assets, file.name);
    batch(() => { for (const slide of result.slides) { addPage(slide.html, slide.css); editor.Pages.getSelected()!.set('name', slide.name); } });
    $('import-summary').textContent = `已导入 ${result.slides.length} 页，追加到当前文稿。可关闭窗口继续编辑；整次导入可撤销。`;
    for (const warning of result.warnings) { const item = document.createElement('p'); item.textContent = warning; $('import-warnings').append(item); }
  } catch (error) { $('import-summary').textContent = `导入失败，原文稿已保留：${String(error)}`; }
  finally { button.disabled = false; }
};
