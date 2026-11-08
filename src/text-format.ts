import type { Component, Editor } from 'grapesjs';
import { normalizeInlineFormatting } from './inline-format';
type Styles = Record<string, string>;
const blocks = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,div';
export function installTextFormat(editor: Editor, batch: (action: () => void) => void) {
  const button = document.createElement('button'); button.id = 'edit-rich-text'; button.textContent = '精细文字编辑';
  document.querySelector('.object-controls')!.append(button);
  const dialog = document.createElement('dialog'); dialog.id = 'text-format-dialog';
  dialog.innerHTML = `<h2>文字与段落</h2><p class="hint">仅修改这个文本框。选中文字可单独设置格式，光标所在段落可单独对齐。</p><div class="text-format-controls"><label>修改范围 <select id="text-scope"><option value="box">整个文本框</option><option value="paragraph">当前段落</option><option value="selection">选中文字</option></select></label><label>字体 <select id="text-family"><option>Arial</option><option>Microsoft YaHei</option><option>SimSun</option><option>Georgia</option></select></label><label>字号 <input id="text-size" type="number" value="32" min="6" max="300"></label><input id="text-color" type="color" aria-label="文字颜色"><button id="text-bold">加粗</button><button id="text-normal">取消加粗</button><label>字距 <input id="text-spacing" type="number" value="0" min="-5" max="50" step="0.5"></label><label>行高 <input id="text-line-height" type="number" value="1.5" min="0.5" max="5" step="0.1"></label><label>段后距 <input id="text-paragraph-gap" type="number" value="0" min="0" max="100"></label><button id="text-left">左对齐</button><button id="text-center">居中</button><button id="text-right">右对齐</button></div><div id="rich-text-content" contenteditable="true" role="textbox" aria-label="文本框内容" aria-multiline="true"></div><p id="text-format-status" role="status"></p><div class="import-actions"><button id="text-cancel">取消</button><button id="text-save" class="primary">保存文字修改</button></div>`;
  document.body.append(dialog);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const content = el('rich-text-content'); let targetId = '', saved: Range | undefined, base = '';
  const locked = (c?: Component): boolean => !!c && (!!c.get('coeditLocked') || locked(c.parent()));
  function capture() { const selection = document.getSelection(); if (selection?.rangeCount && content.contains(selection.anchorNode) && content.contains(selection.focusNode)) saved = selection.getRangeAt(0).cloneRange(); }
  document.addEventListener('selectionchange', capture);
  dialog.querySelector('.text-format-controls')!.addEventListener('mousedown', event => { capture(); if ((event.target as Element).closest('button')) event.preventDefault(); });
  function set(node: HTMLElement, styles: Styles, descend = false) { for (const item of descend ? [node, ...node.querySelectorAll<HTMLElement>('*')] : [node]) for (const [name, value] of Object.entries(styles)) item.style.setProperty(name, value); }
  function apply(styles: Styles, paragraphOnly = false) {
    capture(); const scope = el<HTMLSelectElement>('text-scope').value;
    const paragraphStyle = paragraphOnly || ['text-align','line-height','margin-bottom'].some(key => key in styles);
    if (scope === 'box') { set(content, styles, !paragraphStyle); if (paragraphStyle) content.querySelectorAll<HTMLElement>(blocks).forEach(node => set(node, styles)); }
    else {
      if (!saved || !content.contains(saved.commonAncestorContainer)) { el('text-format-status').textContent = '请先放置光标或选中文字。'; return; }
      if (scope === 'paragraph' || paragraphStyle) {
        const node = saved.startContainer.nodeType === Node.ELEMENT_NODE ? saved.startContainer as Element : saved.startContainer.parentElement!;
        const selected = [...content.querySelectorAll<HTMLElement>(blocks)].filter(node => saved!.intersectsNode(node) && !node.querySelector(blocks));
        const block = node.closest<HTMLElement>(blocks);
        const targets = saved.collapsed ? [block && content.contains(block) ? block : content] : selected.length ? selected : [content];
        targets.forEach(node => set(node, styles, !paragraphStyle));
      } else {
        if (saved.collapsed) { el('text-format-status').textContent = '请先选中一个字或一段文字。'; return; }
        const range = saved.cloneRange(), walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT), nodes: Text[] = [];
        while (walker.nextNode()) { const node = walker.currentNode as Text; if (range.intersectsNode(node) && node.length) nodes.push(node); }
        // Capture offsets before splitting nodes changes the live Range.
        const portions = nodes.map(node => ({ node, start: node === range.startContainer ? range.startOffset : 0, end: node === range.endContainer ? range.endOffset : node.length }));
        let first: HTMLElement | undefined, last: HTMLElement | undefined;
        for (const {node,start,end} of portions) { if (end <= start) continue; const text = node.splitText(start); text.splitText(end-start); const span = document.createElement('span'); set(span,styles); text.replaceWith(span); span.append(text); first ||= span; last = span; }
        if (first && last) { saved = document.createRange(); saved.setStartBefore(first); saved.setEndAfter(last); const selection = document.getSelection(); selection?.removeAllRanges(); selection?.addRange(saved); }
      }
    }
    el('text-format-status').textContent = '已应用到当前范围，保存后写回文稿。';
  }
  button.onclick = async () => {
    const c = editor.getSelected(), node = c?.getEl(); if (!c || !node || locked(c) || !node.textContent?.trim() || ['img','svg'].includes(c.get('tagName')!)) return;
    await (c.getView() as unknown as { disableEditing?: () => Promise<void> })?.disableEditing?.();
    targetId = c.getId(); base = c.toHTML(); saved = undefined; content.innerHTML = node.innerHTML; content.removeAttribute('style');
    const computed = node.ownerDocument.defaultView!.getComputedStyle(node);
    const inherited = ['font-family','font-size','font-weight','font-style','color','line-height','letter-spacing','text-align'];
    inherited.forEach(prop => content.style.setProperty(prop, computed.getPropertyValue(prop)));
    const originals = [...node.querySelectorAll<HTMLElement>('*')];
    [...content.querySelectorAll<HTMLElement>('*')].forEach((copy,i) => { const original = originals[i]; if (original) { const style = original.ownerDocument.defaultView!.getComputedStyle(original); inherited.forEach(prop => copy.style.setProperty(prop,style.getPropertyValue(prop))); } });
    if (!content.querySelector(blocks)) { const lines: HTMLParagraphElement[] = []; let p = document.createElement('p'); p.style.margin = '0'; lines.push(p); for (const child of [...content.childNodes]) { if (child.nodeName === 'BR') { p = document.createElement('p'); p.style.margin = '0'; lines.push(p); } else p.append(child); } content.replaceChildren(...lines); }
    el<HTMLInputElement>('text-size').value = String(parseFloat(computed.fontSize)); el<HTMLSelectElement>('text-scope').value = 'box'; el('text-format-status').textContent = ''; dialog.showModal();
  };
  el('text-bold').onclick = () => apply({'font-weight':'700'}); el('text-normal').onclick = () => apply({'font-weight':'400'});
  el<HTMLSelectElement>('text-family').onchange = () => apply({'font-family':el<HTMLSelectElement>('text-family').value});
  el<HTMLInputElement>('text-color').onchange = () => apply({color:el<HTMLInputElement>('text-color').value});
  const number = (id:string,property:string,min:number,max:number,unit:string) => { el<HTMLInputElement>(id).onchange = () => { const value=Number(el<HTMLInputElement>(id).value); if(Number.isFinite(value)&&value>=min&&value<=max) apply({[property]:value+unit}); }; };
  number('text-size','font-size',6,300,'px'); number('text-spacing','letter-spacing',-5,50,'px'); number('text-line-height','line-height',0.5,5,''); number('text-paragraph-gap','margin-bottom',0,100,'px');
  for(const align of ['left','center','right']) el(`text-${align}`).onclick = () => apply({'text-align':align},true);
  el('text-cancel').onclick = () => dialog.close();
  el('text-save').onclick = () => { const c=editor.Components.getById(targetId); if(!c||locked(c)){el('text-format-status').textContent='目标已删除或锁定，未保存。';return;} if(c.toHTML()!==base){el('text-format-status').textContent='原文本框已被其他操作修改，请关闭并重新打开。';return;} normalizeInlineFormatting(content); batch(()=>{c.addStyle(Object.fromEntries([...content.style].map(key=>[key,content.style.getPropertyValue(key)]))); c.addAttributes({'data-coedit-textbox':'true'}); c.components(content.innerHTML); protect(c);}); dialog.close(); };
  function protect(c: Component) {
    if(!c.getAttributes()['data-coedit-textbox']) c.addAttributes({'data-coedit-textbox':'true'});
    c.find('*').forEach(child => child.set({selectable:false,hoverable:false,draggable:false,resizable:false,layerable:false}, {silent:true}));
  }
  const isTextBox = (c: Component) => c.get('type') === 'slide-text' || !!c.getAttributes()['data-coedit-textbox'];
  const protectAll = () => editor.Pages.getAll().forEach(page => page.getMainComponent().find('*').filter(isTextBox).forEach(protect));
  editor.on('load project:load', protectAll);
  editor.on('component:add', (component: Component) => { let c: Component | undefined = component; while(c) { if(isTextBox(c)) { protect(c); break; } c = c.parent(); } });
  // The built-in canvas RTE syncs its model asynchronously after rte:disable.
  // Normalize only after that sync, so typing selections are never rebuilt mid-edit.
  editor.on('rte:disable', (view: { model: Component }) => {
    const id = view.model.getId();
    setTimeout(() => {
      const c = editor.Components.getById(id), node = c?.getEl();
      if(!c || c !== view.model || !node || dialog.open || !isTextBox(c) || locked(c) || node.isContentEditable) return;
      const before = node.innerHTML;
      normalizeInlineFormatting(node);
      if(node.innerHTML !== before) c.components(node.innerHTML);
      protect(c);
    },0);
  });
  editor.on('destroy',()=>{document.removeEventListener('selectionchange',capture);dialog.remove();button.remove();});
}
