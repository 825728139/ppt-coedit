import { Graph, type Edge } from '@antv/x6';
import type { Component, Editor } from 'grapesjs';
import { descendants, slideRoot } from './component-tree';

/** X6 owns live gestures; GrapesJS owns the saved JSON + static SVG and undo history. */
export function installArrows(editor: Editor, batch: (action: () => void) => void) {
  const workspace = document.querySelector<HTMLElement>('.workspace')!;
  const insert = document.createElement('button'); insert.id = 'insert-arrow'; insert.textContent = '↗ 箭头';
  const toggle = document.createElement('button'); toggle.id = 'edit-arrows'; toggle.textContent = '编辑箭头';
  document.querySelector('nav > div')!.append(insert, toggle);
  const host = document.createElement('div'); host.className = 'arrow-canvas'; host.hidden = true; workspace.append(host);
  // Keep drag events in this document when the pointer passes over the editor iframe.
  const shield = document.createElement('div');
  let bodyDrag: { edge: Edge; x: number; y: number; zoom: number } | undefined;
  Object.assign(shield.style, { position: 'fixed', inset: '0', zIndex: '9999', cursor: 'grabbing', background: 'transparent' });
  host.addEventListener('mousedown', event => {
    if (event.button !== 0 || !allowed()) return;
    document.body.append(shield);
    const target = event.target as Element;
    if (target.closest('.x6-cell-tool')) return;
    const id = target.closest('.x6-edge')?.getAttribute('data-cell-id');
    const cell = id && graph.getCellById(id);
    if (cell && cell.isEdge()) {
      event.preventDefault(); event.stopImmediatePropagation(); activate(cell);
      bodyDrag = { edge: cell, x: event.clientX, y: event.clientY, zoom: graph.scale().sx };
    }
  }, true);
  const toolbar = document.createElement('div'); toolbar.className = 'arrow-toolbar'; toolbar.hidden = true;
  toolbar.innerHTML = `<span>连接线</span><select id="arrow-kind" aria-label="箭头线型"><option value="straight">直线</option><option value="curve">曲线</option><option value="elbow">圆角折线</option></select><input type="color" id="arrow-color" value="#32796b" aria-label="箭头颜色"><label>粗细 <input type="number" id="arrow-width" min="1" max="20" value="3"></label><select id="arrow-ends" aria-label="箭头端点"><option value="single">单向</option><option value="double">双向</option><option value="none">无线头</option></select><label><input type="checkbox" id="arrow-dash"> 虚线</label><button id="arrow-delete">删除</button><button id="arrow-done">完成编辑</button><small id="arrow-tip">选中线条后，拖动两端圆点调整方向。</small>`;
  workspace.append(toolbar);
  const control = <T extends HTMLElement = HTMLElement>(id: string) => toolbar.querySelector<T>(`#${id}`)!;
  const graph = new Graph({ container: host, width: 1280, height: 720, async: false, grid: false,
    panning: false, mousewheel: false, connecting: { allowBlank: true, allowEdge: false, allowNode: false, snap: false },
    interacting: () => ({ edgeMovable: false, arrowheadMovable: allowed(), vertexMovable: allowed() }),
  });
  let mode = false, loading = false, dirty = false, currentPage = '', loaded = '', selected = '';
  const root = () => { const page = editor.Pages.getSelected(); return page && slideRoot(page.getMainComponent()); };
  const diagram = () => { const c = root(); return c && descendants(c).find(child => child.getAttributes()['data-coedit-diagram']); };
  const allowed = () => !root()?.get('coeditLocked') && !diagram()?.get('coeditLocked');
  const selectedEdge = () => { const cell = graph.getCellById(selected); return cell?.isEdge() ? cell : undefined; };
  function json() { const value = graph.toJSON(); value.cells.forEach(cell => { delete cell.tools; }); return value; }
  function svg() {
    const clone = graph.view.svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', '1280'); clone.setAttribute('height', '720'); clone.setAttribute('viewBox', '0 0 1280 720');
    clone.querySelector('.x6-graph-svg-viewport')?.removeAttribute('transform');
    clone.querySelectorAll('.x6-cell-tools,.x6-graph-svg-decorator,.x6-graph-svg-overlay').forEach(el => el.remove());
    return new XMLSerializer().serializeToString(clone);
  }
  function save() {
    if (loading || !allowed()) return;
    const pageRoot = root(); if (!pageRoot) return;
    const value = JSON.stringify(json()), output = svg();
    batch(() => {
      let c = diagram();
      if (!c) c = pageRoot.append({ tagName: 'div', attributes: { 'data-coedit-diagram': 'true', class: 'coedit-diagram', id: 'diagram-' + crypto.randomUUID() }, style: { position: 'absolute', left: '0', top: '0', width: '1280px', height: '720px', 'pointer-events': 'none', 'z-index': '20' }, selectable: false, draggable: false, resizable: false, removable: false })[0];
      c.addAttributes({ 'data-coedit-edges': value }); c.components(output);
    });
    loaded = value; dirty = false; align();
  }
  function pick(edge?: Edge) {
    graph.getEdges().forEach(e => e.removeTools()); selected = edge?.id || '';
    if (!edge) { control('arrow-tip').textContent = '点击线条选择箭头，拖动两端圆点调整方向。'; return; }
    if (allowed()) edge.addTools([
      { name: 'source-arrowhead', args: { tagName: 'circle', attrs: { r: 8, fill: '#fff', stroke: '#32796b', 'stroke-width': 2, cursor: 'grab' } } },
      { name: 'target-arrowhead', args: { tagName: 'circle', attrs: { r: 8, fill: '#fff', stroke: '#32796b', 'stroke-width': 2, cursor: 'grab' } } },
      ...(edge.getData()?.kind !== 'straight' ? [{ name: 'vertices' }] : []),
    ]);
    const line = edge.getAttrs().line || {};
    control<HTMLSelectElement>('arrow-kind').value = edge.getData()?.kind || 'straight';
    control<HTMLInputElement>('arrow-color').value = String(line.stroke || '#32796b');
    control<HTMLInputElement>('arrow-width').value = String(line.strokeWidth || 3);
    control<HTMLSelectElement>('arrow-ends').value = line.sourceMarker ? 'double' : line.targetMarker ? 'single' : 'none';
    control<HTMLInputElement>('arrow-dash').checked = !!line.strokeDasharray;
    control('arrow-tip').textContent = allowed() ? '拖动线身移动整条箭头；拖两端圆点改方向，曲线和折线可调整折点。' : '图形层已锁定。';
  }
  function align() {
    const node = root()?.getEl(), frame = editor.Canvas.getFrameEl();
    if (!node || !frame) return;
    const rect = node.getBoundingClientRect(), iframe = frame.getBoundingClientRect(), outer = workspace.getBoundingClientRect();
    const z = iframe.width / frame.offsetWidth || editor.Canvas.getZoom() / 100;
    Object.assign(host.style, { left: `${iframe.left - outer.left + rect.left * z}px`, top: `${iframe.top - outer.top + rect.top * z}px`, width: `${1280 * z}px`, height: `${720 * z}px` });
    graph.resize(1280 * z, 720 * z); graph.scale(z, z);
    host.hidden = false; toolbar.hidden = !mode;
    const baked = diagram()?.getEl(); if (baked) baked.style.visibility = 'hidden';
  }
  function sync() {
    const page = editor.Pages.getSelected()?.getId() || '';
    const value = String(diagram()?.getAttributes()['data-coedit-edges'] || '{"cells":[]}');
    if (page !== currentPage || value !== loaded) {
      loading = true; currentPage = page; loaded = value; dirty = false;
      try { graph.fromJSON(JSON.parse(value)); pick(); } catch { graph.clearCells(); control('arrow-tip').textContent = '箭头数据读取失败。'; }
      finally { loading = false; }
    }
    align();
  }
  function edit(value: boolean) { if (!value && dirty) save(); mode = value; toggle.classList.toggle('primary', mode); editor.select(); if (!value) pick(); sync(); }
  insert.onclick = () => {
    if (!allowed()) return;
    edit(true);
    const edge = graph.addEdge({ id: 'arrow-' + crypto.randomUUID(), source: { x: 280, y: 300 }, target: { x: 740, y: 440 }, data: { kind: 'straight' }, attrs: { line: { stroke: '#32796b', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', targetMarker: { name: 'classic', size: 9 } } } });
    save(); pick(edge);
  };
  toggle.onclick = () => edit(!mode); control('arrow-done').onclick = () => edit(false);
  function activate(edge: Edge) { mode = true; toggle.classList.add('primary'); editor.select(); toolbar.hidden = false; pick(edge); }
  graph.on('edge:click', ({ edge }) => activate(edge));
  graph.on('edge:mousedown', ({ edge }) => activate(edge));
  graph.on('blank:click', () => pick());
  for (const event of ['edge:change:source', 'edge:change:target', 'edge:change:vertices'] as const) graph.on(event, () => { if (!loading) dirty = true; });
  const moveBody = (event: MouseEvent) => {
    if (!bodyDrag) return;
    const dx = (event.clientX - bodyDrag.x) / bodyDrag.zoom, dy = (event.clientY - bodyDrag.y) / bodyDrag.zoom;
    if (dx || dy) bodyDrag.edge.translate(dx, dy);
    bodyDrag.x = event.clientX; bodyDrag.y = event.clientY;
  };
  const finish = () => { bodyDrag = undefined; setTimeout(() => { shield.remove(); if (dirty && !loading) { save(); pick(selectedEdge()); } }, 0); };
  document.addEventListener('mousemove', moveBody);
  document.addEventListener('mouseup', finish); document.addEventListener('touchend', finish);
  control<HTMLSelectElement>('arrow-kind').onchange = () => {
    const edge = selectedEdge(); if (!edge || !allowed()) return;
    const kind = control<HTMLSelectElement>('arrow-kind').value;
    edge.setData({ kind }); edge.setRouter(kind === 'elbow' ? 'orth' : 'normal'); edge.setConnector(kind === 'curve' ? 'smooth' : kind === 'elbow' ? 'rounded' : 'normal');
    const source = edge.getSourcePoint(), target = edge.getTargetPoint();
    edge.setVertices(kind === 'curve' ? [{ x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 - 100 }] : []); save(); pick(edge);
  };
  function appearance() {
    const edge = selectedEdge(); if (!edge || !allowed()) return;
    const width = Number(control<HTMLInputElement>('arrow-width').value); if (!Number.isFinite(width) || width < 1 || width > 20) return;
    const ends = control<HTMLSelectElement>('arrow-ends').value;
    edge.attr('line', { stroke: control<HTMLInputElement>('arrow-color').value, strokeWidth: width, strokeDasharray: control<HTMLInputElement>('arrow-dash').checked ? '8 6' : '', sourceMarker: ends === 'double' ? { name: 'classic', size: 9 } : null, targetMarker: ends !== 'none' ? { name: 'classic', size: 9 } : null });
    save(); pick(edge);
  }
  for (const id of ['arrow-color', 'arrow-width', 'arrow-ends', 'arrow-dash']) control(id).onchange = appearance;
  control('arrow-delete').onclick = () => { const edge = selectedEdge(); if (edge && allowed()) { edge.remove(); save(); pick(); } };
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; sync(); }); };
  editor.on('load page:select canvas:frame:load canvas:zoom canvas:coords component:update', schedule);
  editor.on('component:selected', () => { if (mode) { mode = false; toggle.classList.remove('primary'); pick(); align(); } });
  const resize = new ResizeObserver(align); resize.observe(workspace);
  editor.on('destroy', () => { shield.remove(); resize.disconnect(); document.removeEventListener('mousemove', moveBody); document.removeEventListener('mouseup', finish); document.removeEventListener('touchend', finish); graph.dispose(); host.remove(); toolbar.remove(); });
}
