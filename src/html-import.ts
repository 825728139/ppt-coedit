import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

export interface ImportedSlide { name: string; html: string; css: string }
export interface ImportResult { slides: ImportedSlide[]; warnings: string[] }

/** Scope selectors with an AST so commas inside :is() and attributes stay intact. */
export function scopeCss(css: string, rootId: string): string {
  const tree = postcss.parse(css);
  tree.walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    rule.selector = selectorParser(selectors => {
      selectors.each(selector => {
        selector.prepend(selectorParser.combinator({ value: ' ' }));
        selector.prepend(selectorParser.id({ value: rootId }));
      });
    }).processSync(rule.selector);
  });
  return tree.toString();
}

const pathKey = (path: string) => decodeURIComponent(path.split(/[?#]/)[0]).replace(/\\/g, '/').replace(/^\.\//, '');
const fileData = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
});

export async function importHtmlDeck(source: string, assets: File[] = [], sourcePath = 'deck.html'): Promise<ImportResult> {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const warnings = new Set<string>();
  const files = new Map<string, File>();
  assets.forEach(file => {
    const path = pathKey(file.webkitRelativePath || file.name);
    files.set(path, file);
    if (path.includes('/')) files.set(path.slice(path.indexOf('/') + 1), file);
  });
  const resolvePath = (url: string, from: string) => {
    const path = new URL(url, `https://import.local/${from}`).pathname.slice(1);
    return pathKey(path);
  };
  const data = new Map<File, Promise<string>>();
  async function resource(url: string, from: string): Promise<string> {
    if (/^(data:|https?:|#)/i.test(url)) return url;
    if (/^(javascript:|file:|blob:)/i.test(url)) { warnings.add(`未保留资源：${url}`); return ''; }
    const file = files.get(resolvePath(url, from)) || files.get(pathKey(url));
    if (!file) { warnings.add(`缺少本地资源：${url}（可选择资源文件夹后重新导入）`); return ''; }
    if (!data.has(file)) data.set(file, fileData(file));
    return data.get(file)!;
  }
  async function cssResources(css: string, from: string) {
    const tree = postcss.parse(css);
    tree.walkAtRules('import', rule => { warnings.add(`未加载 CSS @import：${rule.params}`); rule.remove(); });
    const declarations: postcss.Declaration[] = [];
    tree.walkDecls(decl => { declarations.push(decl); });
    for (const decl of declarations) {
      const urls = [...decl.value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)];
      for (const match of urls) decl.value = decl.value.replace(match[0], `url("${await resource(match[2], from)}")`);
    }
    return tree.toString();
  }
  const cssParts: string[] = [];
  for (const node of doc.querySelectorAll('style,link[rel="stylesheet"]')) {
    if (node.tagName === 'STYLE') cssParts.push(await cssResources(node.textContent || '', sourcePath));
    else {
      const href = node.getAttribute('href') || '';
      const path = resolvePath(href, sourcePath);
      const file = files.get(path) || files.get(pathKey(href));
      if (file) cssParts.push(await cssResources(await file.text(), path));
      else warnings.add(`未加载样式表：${href}（请一并选择本地 CSS 文件）`);
    }
  }
  if (doc.querySelector('script')) warnings.add('脚本未执行；依赖 JavaScript 的图表、动画与交互可能无法恢复。');
  doc.querySelectorAll('script,style,link,base,iframe,object,embed').forEach(el => el.remove());
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) if (/^on/i.test(attr.name) || attr.name === 'srcdoc') el.removeAttribute(attr.name);
    if (el.hasAttribute('style')) el.setAttribute('style', await cssResources(`x{${el.getAttribute('style')}}`, sourcePath).then(css => postcss.parse(css).first?.type === 'rule' ? css.slice(css.indexOf('{') + 1, css.lastIndexOf('}')) : ''));
    for (const attr of ['src', 'poster', 'xlink:href']) if (el.hasAttribute(attr)) el.setAttribute(attr, await resource(el.getAttribute(attr)!, sourcePath));
    if (el.hasAttribute('srcset')) { el.removeAttribute('srcset'); warnings.add('已移除 srcset，使用图片 src。'); }
    if (/^javascript:/i.test(el.getAttribute('href') || '')) el.removeAttribute('href');
  }
  let candidates = [...doc.querySelectorAll('.reveal .slides section')].filter(el => !el.querySelector('section'));
  if (!candidates.length) candidates = [...doc.querySelectorAll('.slide-root')].filter(el => !el.parentElement?.closest('.slide-root'));
  if (!candidates.length) candidates = [...doc.querySelectorAll('[data-slide],.slide')].filter(el => !el.parentElement?.closest('[data-slide],.slide'));
  if (!candidates.length) candidates = [...doc.body.children].filter(el => el.tagName === 'SECTION');
  if (!candidates.length) { candidates = [doc.body]; warnings.add('未发现多页标记，已按单页导入。'); }
  const slides: ImportedSlide[] = [];
  for (const [index, element] of candidates.entries()) {
    const prefix = `import-${crypto.randomUUID()}-`;
    const content = element.cloneNode(true) as Element;
    content.removeAttribute('hidden'); content.setAttribute('aria-hidden', 'false');
    content.classList.remove('past', 'future');
    content.classList.add('import-page');
    let branch: Element = content;
    for (let parent = element.parentElement; parent && parent !== doc.body; parent = parent.parentElement) {
      const wrapper = parent.cloneNode(false) as Element; wrapper.removeAttribute('hidden'); wrapper.append(branch); branch = wrapper;
    }
    const body = doc.createElement('div'); body.className = `${doc.body.className} import-body`; body.style.cssText = doc.body.style.cssText;
    if (doc.body.id) body.id = doc.body.id;
    if (element === doc.body) body.innerHTML = content.innerHTML; else body.append(branch);
    const html = doc.createElement('div'); html.className = `${doc.documentElement.className} import-html`; html.style.cssText = doc.documentElement.style.cssText; html.append(body);
    const idMap = new Map<string, string>();
    html.querySelectorAll('[id]').forEach(el => { const old = el.id; if (!idMap.has(old)) idMap.set(old, prefix + old); el.id = idMap.get(old)!; });
    html.querySelectorAll('[href^="#"]').forEach(el => { const id = el.getAttribute('href')!.slice(1); if (idMap.has(id)) el.setAttribute('href', '#' + idMap.get(id)); });
    const rewriteUrls = (value: string) => value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, (match, _quote, id) => idMap.has(id) ? `url(#${idMap.get(id)})` : match);
    html.querySelectorAll('*').forEach(el => { for(const attr of [...el.attributes]) {
      if(attr.name === 'xlink:href' && attr.value.startsWith('#') && idMap.has(attr.value.slice(1))) el.setAttribute(attr.name,'#'+idMap.get(attr.value.slice(1)));
      else if(attr.value.includes('url(')) el.setAttribute(attr.name,rewriteUrls(attr.value));
    } });
    const tree = postcss.parse(cssParts.join('\n'));
    tree.walkDecls(decl => { decl.value = rewriteUrls(decl.value); });
    tree.walkRules(rule => {
      if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
      rule.selector = selectorParser(selectors => {
        selectors.walkIds(id => { if (idMap.has(id.value)) id.value = idMap.get(id.value)!; });
        selectors.walkTags(tag => { if (['html', 'body'].includes(tag.value)) tag.replaceWith(selectorParser.className({ value: `import-${tag.value}` })); });
        selectors.walkPseudos(pseudo => { if (pseudo.value === ':root') pseudo.replaceWith(selectorParser.className({ value: 'import-html' })); });
      }).processSync(rule.selector);
    });
    tree.walkAtRules(rule => { if (/keyframes$/i.test(rule.name)) { warnings.add('已停用导入动画，保留静态内容。'); rule.remove(); } });
    slides.push({ name: element.querySelector('h1,h2')?.textContent?.trim().slice(0, 40) || `导入页 ${index + 1}`, html: html.outerHTML,
      css: tree.toString() + '\n.import-html,.import-body{width:100%;height:100%;margin:0}.import-page{display:block!important;visibility:visible!important;opacity:1!important;animation:none!important}.reveal,.reveal .slides{width:100%;height:100%;transform:none!important;position:relative;inset:auto}.reveal .slides>section,.reveal .slides>section>section{position:relative;inset:auto;transform:none!important}' });
  }
  warnings.add('采用 1280×720 画布；不同原始尺寸、复杂定位或脚本布局可能需要手动调整。');
  return { slides, warnings: [...warnings] };
}
