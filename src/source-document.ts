import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { Component, Editor } from 'grapesjs';
import { descendants, slideRoot } from './component-tree';
import { scopeCss } from './html-import';

export const SOURCE_KEY = 'data-coedit-source';
type ElementNode = DefaultTreeAdapterMap['element'];
type Snapshot = { component: Component; key: string; attrs: Record<string, string>; style: Record<string,string>; children: string };
type Patch = { start: number; end: number; text: string };
const ignored = (name: string) => name === SOURCE_KEY || name === 'data-coedit-textbox' || name.startsWith('data-gjs-');
const attrs = (c: Component) => Object.fromEntries(Object.entries(c.getAttributes()).filter(([k]) => !ignored(k)).map(([k,v]) => [k,String(v)]));
const childSignature = (element: Element): string => JSON.stringify([...element.childNodes].map(node => node.nodeType === Node.TEXT_NODE ? ['text',node.textContent] : node instanceof Element ? node.hasAttribute(SOURCE_KEY) ? ['source',node.getAttribute(SOURCE_KEY)] : ['new',node.tagName,childSignature(node)] : ['other',node.nodeType,node.textContent]));
const modelElement = (c: Component) => new DOMParser().parseFromString(c.toHTML(),'text/html').body.firstElementChild!;
const escapeAttribute = (s: string) => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

/** Patch the original source ranges instead of exporting an entirely regenerated deck. */
export class SourceDocument {
  readonly original: string;
  private doc: Document;
  private nodes = new Map<string, { element: Element; location: NonNullable<ElementNode['sourceCodeLocation']> }>();
  private baseline = new Map<string, Snapshot>();
  private pageKeys = new Set<string>();
  private virtualKeys = new Set<string>();
  constructor(source: string) {
    this.original = source; this.doc = new DOMParser().parseFromString(source,'text/html');
    const ast = parse(source,{sourceCodeLocationInfo:true});
    const astElements: ElementNode[] = [];
    const walk = (node: DefaultTreeAdapterMap['node']) => { if('tagName' in node) astElements.push(node); if('childNodes' in node) node.childNodes.forEach(walk); };
    walk(ast);
    const domElements = [...this.doc.querySelectorAll('*')];
    if(astElements.length !== domElements.length || astElements.some((node,i) => node.tagName.toLowerCase() !== domElements[i].localName.toLowerCase())) throw new Error('文件包含暂不支持的 HTML 结构，不能安全映射源码。请使用导入副本。');
    astElements.forEach((node,index) => {
      if(!node.sourceCodeLocation?.startTag) return;
      if(!node.sourceCodeLocation.endTag && !['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(node.tagName)) {
        const location=node.sourceCodeLocation;
        location.endTag={startOffset:location.endOffset,endOffset:location.endOffset,startLine:location.endLine,endLine:location.endLine,startCol:location.endCol,endCol:location.endCol};
      }
      const key = `s${index}`, element = domElements[index];
      this.nodes.set(key,{element,location:node.sourceCodeLocation}); element.setAttribute(SOURCE_KEY,key);
    });
    if(!this.doc.body.hasAttribute(SOURCE_KEY)) {
      const body = astElements.find(node=>node.tagName==='body')!;
      const locations = body.childNodes.map(node=>node.sourceCodeLocation).filter(location=>!!location);
      const start=locations[0]?.startOffset ?? source.length, end=locations.at(-1)?.endOffset ?? start;
      const position={startOffset:start,endOffset:end,startLine:1,endLine:1,startCol:1,endCol:1};
      const key='source-body';this.virtualKeys.add(key);this.doc.body.setAttribute(SOURCE_KEY,key);
      this.nodes.set(key,{element:this.doc.body,location:{...position,startTag:{...position,endOffset:start},endTag:{...position,startOffset:end}}});
    }
  }
  preparedHtml() { return this.doc.documentElement.outerHTML; }
  capture(editor: Editor) {
    this.baseline.clear(); this.pageKeys.clear();
    editor.Pages.getAll().forEach(page => {
      const key = page.get('coeditSourceRoot') as string | undefined; if(key) this.pageKeys.add(key);
      descendants(page.getMainComponent()).forEach(component => {
        const key = String(component.getAttributes()[SOURCE_KEY] || ''); if(!key || !this.nodes.has(key)) return;
        this.baseline.set(component.getId(),{component,key,attrs:attrs(component),style:{...component.getStyle()} as Record<string,string>,children:childSignature(modelElement(component))});
      });
    });
  }
  render(editor: Editor): string {
    const patches: Patch[] = [], innerPatches: Patch[] = [], newPages: string[] = [], models = editor.Pages.getAll().flatMap(page => descendants(page.getMainComponent()));
    const current = new Map(models.map(c => [c.getId(),c]));
    const changed = new Map<string,string>();
    const originalNode = (key: string) => this.nodes.get(key)!;
    const removal = (key:string):Patch => {const {element,location}=originalNode(key);return {start:element.tagName==='BODY'?location.startTag!.endOffset:location.startOffset,end:element.tagName==='BODY'?location.endTag!.startOffset:location.endOffset,text:''}};
    const preserveOmitted = (key: string, target: Element) => {
      const retained = new Set([...target.querySelectorAll(`[${SOURCE_KEY}]`)].map(el=>el.getAttribute(SOURCE_KEY)));
      [...originalNode(key).element.children].filter(child => ['SCRIPT','STYLE','LINK','IFRAME','OBJECT','EMBED'].includes(child.tagName) && !retained.has(child.getAttribute(SOURCE_KEY))).forEach(child => {
        const preserved = child.cloneNode(true) as Element;
        [preserved,...preserved.querySelectorAll('*')].forEach(el=>el.removeAttribute(SOURCE_KEY));
        target.append(preserved);
      });
    };
    const attributes = (component: Component, before: Snapshot, element: Element) => {
      const now = attrs(component);
      for(const name of new Set([...Object.keys(before.attrs),...Object.keys(now)])) {
        if(name === 'id' || name === 'style' || before.attrs[name] === now[name]) continue;
        if(name === 'class') {
          const old = new Set((before.attrs.class || '').split(/\s+/)), next = new Set((now.class || '').split(/\s+/));
          const classes = new Set((element.getAttribute('class') || '').split(/\s+/).filter(Boolean));
          old.forEach(c => { if(!next.has(c)) classes.delete(c); }); next.forEach(c => {if(c && !old.has(c)) classes.add(c)});
          classes.size ? element.setAttribute('class',[...classes].join(' ')) : element.removeAttribute('class');
        } else now[name] === undefined ? element.removeAttribute(name) : element.setAttribute(name,now[name]);
      }
      const style = component.getStyle();
      for(const name of new Set([...Object.keys(before.style),...Object.keys(style)])) if(before.style[name] !== style[name]) {
        const target = element as HTMLElement;
        style[name] === undefined ? target.style.removeProperty(name) : target.style.setProperty(name,String(style[name]));
      }
    };
    const clean = (node: Node): Node => {
      if(!(node instanceof Element)) return node.cloneNode(true);
      const key = node.getAttribute(SOURCE_KEY), model = models.find(c => c.getAttributes()[SOURCE_KEY] === key);
      const before = model && this.baseline.get(model.getId());
      const copy = key && before && this.nodes.has(key) ? originalNode(key).element.cloneNode(false) as Element : node.cloneNode(false) as Element;
      if(before && model) attributes(model,before,copy);
      for(const attribute of [...copy.attributes]) if(ignored(attribute.name)) copy.removeAttribute(attribute.name);
      if(!key && copy.classList.contains('slide-object')) {
        (copy as HTMLElement).style.position = 'absolute'; (copy as HTMLElement).style.boxSizing = 'border-box';
        if(copy.classList.contains('card')) Object.assign((copy as HTMLElement).style,{padding:'30px',borderRadius:'18px',background:'#fff',display:'flex',flexDirection:'column',gap:'16px'});
      }
      [...node.childNodes].forEach(child => copy.append(clean(child)));
      // Source-only scripts/styles are kept in source, but never executed in the editor.
      if(key && this.nodes.has(key)) preserveOmitted(key,copy);
      return copy;
    };
    for(const before of this.baseline.values()) {
      const component = current.get(before.component.getId()), original = originalNode(before.key);
      if(!component) {
        patches.push(removal(before.key)); continue;
      }
      const desired = original.element.cloneNode(false) as Element; desired.removeAttribute(SOURCE_KEY); attributes(component,before,desired);
      const signature = JSON.stringify([desired.outerHTML,childSignature(modelElement(component))]);
      const unchanged = original.element.cloneNode(false) as Element; unchanged.removeAttribute(SOURCE_KEY);
      if(desired.outerHTML === unchanged.outerHTML && childSignature(modelElement(component)) === before.children) continue;
      const previous = changed.get(before.key);
      if(previous && previous !== signature) throw new Error('同一个源码容器在多个页面产生了不同修改，请先分别调整其内部对象。');
      changed.set(before.key,signature);
      for(const name of new Set([...original.element.attributes,...desired.attributes].map(a=>a.name))) {
        if(ignored(name) || original.element.getAttribute(name) === desired.getAttribute(name)) continue;
        if(this.virtualKeys.has(before.key)) throw new Error('HTML 片段没有 body 标签，修改整体容器前请先补全 HTML 外壳。');
        const position = original.location.attrs?.[name];
        const text = desired.hasAttribute(name) ? `${name}="${escapeAttribute(desired.getAttribute(name)!)}"` : '';
        if(position) patches.push({start:position.startOffset,end:position.endOffset,text});
        else if(text) { const end = original.location.startTag!.endOffset; const at = this.original[end-2] === '/' ? end-2 : end-1; patches.push({start:at,end:at,text:' '+text}); }
      }
      const element = modelElement(component);
      if(childSignature(element) !== before.children && original.location.endTag) {
        const fragment = this.doc.createElement('div'); [...element.childNodes].forEach(child=>fragment.append(clean(child)));
        preserveOmitted(before.key,fragment);
        innerPatches.push({start:original.location.startTag!.endOffset,end:original.location.endTag.startOffset,text:fragment.innerHTML});
      }
    }
    const activeKeys = new Set(editor.Pages.getAll().map(p=>p.get('coeditSourceRoot')));
    this.pageKeys.forEach(key => {if(!activeKeys.has(key))patches.push(removal(key))});
    // Add newly inserted objects to the corresponding original slide, not synthetic editor wrappers.
    editor.Pages.getAll().forEach(page => {
      const root = slideRoot(page.getMainComponent()), key = page.get('coeditSourceRoot') as string | undefined;
      if(!root) return;
      const extra = root.components().filter((c: Component)=>!descendants(c).some(n=>n.getAttributes()[SOURCE_KEY]) && !c.getAttributes()[SOURCE_KEY]);
      const container = this.doc.createElement('div');
      extra.forEach((c: Component)=>container.append(clean(modelElement(c))));
      if(key && this.nodes.has(key) && container.childNodes.length) {
        const location = originalNode(key).location;
        if(!location.endTag) throw new Error('页面缺少结束标签，无法安全插入新对象。');
        patches.push({start:location.endTag.startOffset,end:location.endTag.startOffset,text:container.innerHTML});
      } else if(!key) {
        const section = this.doc.createElement('section'); section.id=root.getId();section.className='slide-root'; section.setAttribute('style','position:relative;width:1280px;height:720px;overflow:hidden;background:#f5f1e9');
        Object.entries(root.getStyle()).forEach(([name,value])=>section.style.setProperty(name,String(value)));
        const css=editor.getCss({component:root});
        if(css){const style=this.doc.createElement('style');style.textContent=scopeCss(css,section.id,true);section.append(style)}
        section.append(...container.childNodes);
        newPages.push(section.outerHTML);
      }
    });
    if(newPages.length) {
      const bodyKey=[...this.pageKeys].find(key=>originalNode(key).element.tagName==='BODY');
      if(bodyKey) {
        const {location}=originalNode(bodyKey), start=location.startTag!.endOffset, end=location.endTag!.startOffset;
        if(activeKeys.has(bodyKey)) {
          const opening='<section class="slide-root" style="position:relative;width:1280px;height:720px">';
          const replacement=innerPatches.find(p=>p.start===start&&p.end===end);
          if(replacement)replacement.text=opening+replacement.text;
          else patches.push({start,end:start,text:opening});
        }
        patches.push({start:end,end,text:(activeKeys.has(bodyKey)?'</section>':'')+'\n'+newPages.join('\n')});
      }else{
        const last = [...this.pageKeys].map(k=>originalNode(k).location.endOffset).sort((a,b)=>b-a)[0];
        if(last === undefined) throw new Error('无法确定新页面的源码插入位置。');
        patches.push({start:last,end:last,text:'\n'+newPages.join('\n')});
      }
    }
    const all = [...patches,...innerPatches];
    const filtered = all.filter((p,i)=>!all.some((outer,j)=>j!==i && outer.start <= p.start && outer.end >= p.end && (p.start !== p.end || p.start < outer.end) && (outer.start < p.start || outer.end > p.end)));
    const unique = [...new Map(filtered.map(p=>[`${p.start}:${p.end}:${p.text}`,p])).values()].sort((a,b)=>b.start-a.start || b.end-a.end || all.indexOf(b)-all.indexOf(a));
    let result = this.original;
    for(const patch of unique) result=result.slice(0,patch.start)+patch.text+result.slice(patch.end);
    return result;
  }
}
