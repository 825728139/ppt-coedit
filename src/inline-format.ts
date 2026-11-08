/** Canonicalize rich-text runs without turning formatting into nested editor objects. */
export function normalizeInlineFormatting(root: HTMLElement) {
  const doc = root.ownerDocument, view = doc.defaultView!;
  const properties = ['font-family', 'font-size', 'font-weight', 'font-style', 'color', 'letter-spacing', 'text-decoration-line', 'vertical-align', 'background-color'];
  const inline = new Set(['SPAN','B','STRONG','I','EM','U','S','STRIKE','A','FONT','CODE','MARK']);
  function normalize(container: HTMLElement) {
    const base = view.getComputedStyle(container);
    const output = doc.createDocumentFragment();
    let previous: { key: string; text: Text } | undefined;
    function visit(node: Node, link?: HTMLAnchorElement) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.textContent) return;
        const style = view.getComputedStyle(node.parentElement!);
        const decoration = new Set<string>();
        for(let p: HTMLElement | null = node.parentElement; p; p = p.parentElement) {
          view.getComputedStyle(p).textDecorationLine.split(' ').filter(value => value !== 'none').forEach(value => decoration.add(value));
          if(p === container) break;
        }
        const marks = properties.map(prop => [prop, prop === 'text-decoration-line' ? [...decoration].sort().join(' ') || 'none' : style.getPropertyValue(prop)]).filter(([prop,value]) => value !== base.getPropertyValue(prop));
        const key = JSON.stringify([marks, link ? [...link.attributes].filter(a => a.name !== 'id').map(a => [a.name,a.value]) : null]);
        if (previous?.key === key) { previous.text.appendData(node.textContent); return; }
        const text = doc.createTextNode(node.textContent); let run: Node = text;
        if (marks.length) { const span = doc.createElement('span'); marks.forEach(([prop,value]) => span.style.setProperty(prop,value)); span.append(run); run = span; }
        if (link) { const anchor = link.cloneNode(false) as HTMLAnchorElement; anchor.removeAttribute('id'); anchor.append(run); run = anchor; }
        output.append(run); previous = { key, text }; return;
      }
      if (!(node instanceof view.HTMLElement)) { output.append(node.cloneNode(true)); previous = undefined; return; }
      if (inline.has(node.tagName) && view.getComputedStyle(node).display === 'inline' && !node.querySelector('img,svg,video,iframe')) {
        for (const child of [...node.childNodes]) visit(child,node.tagName === 'A' ? node as HTMLAnchorElement : link);
      } else {
        // Paragraphs and non-text objects retain their structure and attributes.
        normalize(node); output.append(node); previous = undefined;
      }
    }
    for (const child of [...container.childNodes]) visit(child);
    container.replaceChildren(output); container.normalize();
  }
  normalize(root);
}
