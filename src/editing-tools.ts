import type { Component, Editor } from 'grapesjs';

export function installEditingTools(editor: Editor, batch: (action: () => void) => void) {
  const workspace = document.querySelector('.workspace')!;
  const bar = document.createElement('div');
  bar.className = 'object-tools'; bar.hidden = true;
  bar.innerHTML = `<div id="object-path" aria-label="对象层级"></div><div class="object-controls"><span id="layout-kind"></span><label>字号 <input id="quick-size" type="number" min="6" max="300" aria-label="文字字号"></label><input id="quick-color" type="color" title="文字颜色" aria-label="文字颜色"><button id="quick-bold" title="加粗">B</button><button id="quick-left" title="文字左对齐">左</button><button id="quick-center" title="文字居中">中</button><button id="quick-right" title="文字右对齐">右</button><label id="gap-control" hidden>间距 <input id="quick-gap" type="number" min="0" max="300" aria-label="布局间距"></label><button id="replace-image" hidden>替换图片</button><button id="object-parent">选择父级 ↑</button></div><div id="object-tip" role="status"></div><input id="replace-image-file" type="file" accept="image/*" hidden>`;
  workspace.append(bar);
  const enter = document.createElement('button'); enter.id = 'object-child'; enter.textContent = '进入内部 ↓';
  bar.querySelector('.object-controls')!.append(enter);
  enter.onclick = () => { const child = editor.getSelected()?.components().find((c: Component) => c.get('type') !== 'textnode'); if (child) editor.select(child); };
  const el = <T extends HTMLElement = HTMLElement>(id: string) => bar.querySelector<T>(`#${id}`)!;
  const isRoot = (c: Component) => c.getClasses().includes('slide-root') || c === editor.getWrapper();
  const locked = (c?: Component): boolean => !!c && (!!c.get('coeditLocked') || locked(c.parent()));
  const computed = (c: Component) => { const node = c.getEl(); return node && node.ownerDocument.defaultView!.getComputedStyle(node); };
  function update() {
    const c = editor.getSelected(); bar.hidden = !c;
    if (!c) return;
    const path: Component[] = []; for (let p: Component | undefined = c; p && p !== editor.getWrapper(); p = p.parent()) path.unshift(p);
    el('object-path').replaceChildren(...path.map(p => { const b = document.createElement('button'); b.textContent = p.get('tagName') + (p.getName() !== p.get('tagName') ? ` · ${p.getName()}` : ''); b.title = p.getId(); b.classList.toggle('current', p === c); b.onclick = () => editor.select(p); return b; }));
    const style = computed(c), parentStyle = c.parent() && computed(c.parent()!);
    const free = style?.position === 'absolute' || style?.position === 'fixed';
    const layout = /flex|grid/.test(style?.display || '');
    el('layout-kind').textContent = locked(c) ? '已锁定' : isRoot(c) ? '页面' : free ? '自由定位' : /flex|grid/.test(parentStyle?.display || '') ? `${parentStyle!.display.toUpperCase()} 子元素` : '流式排版';
    el('object-tip').textContent = locked(c) ? '对象或父级已锁定，先解锁再修改。' : free ? '方向键移动 1px，Shift + 方向键移动 10px；Esc 选择父级。' : '保留原始排版；选择容器可调整间距，文字可双击编辑。';
    const image = c.get('tagName') === 'img';
    el('replace-image').hidden = !image;
    el('gap-control').hidden = !layout;
    el<HTMLInputElement>('quick-gap').value = String(parseFloat(style?.gap || '') || 0);
    el<HTMLInputElement>('quick-size').value = String(Math.round(parseFloat(style?.fontSize || '') || 16));
    const rgb = style?.color.match(/\d+/g); if (rgb && rgb.length >= 3) el<HTMLInputElement>('quick-color').value = '#' + rgb.slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
    el('quick-bold').classList.toggle('active', Number(style?.fontWeight) >= 600 || style?.fontWeight === 'bold');
    bar.querySelectorAll<HTMLInputElement | HTMLButtonElement>('.object-controls input,.object-controls button').forEach(control => { control.disabled = locked(c); });
    el<HTMLButtonElement>('object-parent').disabled = !c.parent() || c.parent() === editor.getWrapper();
    enter.disabled = !c.components().some((child: Component) => child.get('type') !== 'textnode');
    // Enable direct manipulation only when browser layout already places this object freely.
    if (!isRoot(c) && free && !locked(c)) c.set({ draggable: true, resizable: true }, { silent: true });
  }
  function changeStyle(styles: Record<string, string>) {
    const c = editor.getSelected(); if (!c || locked(c)) return;
    batch(() => c.addStyle(styles)); update();
  }
  el<HTMLInputElement>('quick-size').onchange = event => { const value = Number((event.target as HTMLInputElement).value); if (value >= 6 && value <= 300) changeStyle({ 'font-size': `${value}px` }); else update(); };
  el<HTMLInputElement>('quick-color').onchange = event => changeStyle({ color: (event.target as HTMLInputElement).value });
  el('quick-bold').onclick = () => changeStyle({ 'font-weight': el('quick-bold').classList.contains('active') ? '400' : '700' });
  for (const alignment of ['left', 'center', 'right']) el(`quick-${alignment}`).onclick = () => changeStyle({ 'text-align': alignment });
  el<HTMLInputElement>('quick-gap').onchange = event => { const value = Number((event.target as HTMLInputElement).value); if (value >= 0 && value <= 300) changeStyle({ gap: `${value}px` }); else update(); };
  el('object-parent').onclick = () => { const p = editor.getSelected()?.parent(); if (p && p !== editor.getWrapper()) editor.select(p); };
  el('replace-image').onclick = () => { el<HTMLInputElement>('replace-image-file').value = ''; el<HTMLInputElement>('replace-image-file').click(); };
  el<HTMLInputElement>('replace-image-file').onchange = async () => {
    const targetId = editor.getSelected()?.getId();
    const file = el<HTMLInputElement>('replace-image-file').files?.[0]; if (!file || !targetId || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => { const c = editor.Components.getById(targetId); if (!c || locked(c)) return; batch(() => { c.addAttributes({ src: String(reader.result) }); if (c.get('type') === 'image') c.set('src', String(reader.result)); }); update(); };
    reader.onerror = () => { el('object-tip').textContent = '图片读取失败，请重新选择。'; }; reader.readAsDataURL(file);
  };
  function keyboard(event: KeyboardEvent) {
    const target = event.target as Element | null;
    if (target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]') || editor.getModel().isEditing()) return;
    const c = editor.getSelected(); if (!c) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); const p = c.parent(); if (p && p !== editor.getWrapper()) editor.select(p); else editor.select(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (isRoot(c) || locked(c)) return;
    const node = c.getEl(), style = computed(c); if (!node || !style || !['absolute', 'fixed'].includes(style.position)) { el('object-tip').textContent = '这是流式布局对象，方向键不会破坏原来的 Flex/Grid 排版。'; return; }
    const step = event.shiftKey ? 10 : 1;
    const axis = ['ArrowLeft', 'ArrowRight'].includes(event.key) ? 'left' : 'top';
    const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -step : step;
    const current = parseFloat(style[axis]);
    if (!Number.isFinite(current)) { el('object-tip').textContent = '请先在样式面板设置明确的 left/top，再进行微调。'; return; }
    batch(() => c.addStyle({ [axis]: `${current + delta}px`, ...(axis === 'left' ? { right: 'auto' } : { bottom: 'auto' }) })); update();
  }
  document.addEventListener('keydown', keyboard, true);
  const attached = new WeakSet<Document>();
  const attach = () => { const doc = editor.Canvas.getDocument(); if (doc && !attached.has(doc)) {
    doc.addEventListener('keydown', keyboard, true);
    doc.addEventListener('click', event => {
      if ((event.target as Element).closest('[contenteditable="true"]')) return;
      const node = (event.target as Element).closest('[id]');
      const c = node && editor.Components.getById(node.id);
      if (c) { if (event.altKey) { event.preventDefault(); event.stopImmediatePropagation(); } editor.select(c); }
    }, true);
    attached.add(doc);
  } };
  const attachLater = () => requestAnimationFrame(attach);
  editor.on('canvas:frame:load canvas:frame:load:body load page:select', attachLater);
  editor.on('component:selected component:deselected component:styleUpdate component:update page:select', update);
  editor.on('destroy', () => { document.removeEventListener('keydown', keyboard, true); bar.remove(); });
}
