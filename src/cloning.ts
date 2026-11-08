import type {Component,Editor,CssRule} from 'grapesjs';
import {descendants} from './component-tree';

/** Scoped/ID rules can stop matching a pasted object; preserve its current appearance. */
export function installCloning(editor:Editor){
  const attached=new WeakSet<Component>();
  function attach(component:Component){
    if(component.get('type')==='textnode'||attached.has(component))return;attached.add(component);
    component.on('component:clone',(copy:Component)=>{
      const element=component.getEl();if(!element||element.nodeType!==Node.ELEMENT_NODE)return;
      const computed=element.ownerDocument.defaultView!.getComputedStyle(element),style:Record<string,string>={};
      editor.Css.getAll().forEach((rule:CssRule)=>{
        let matches=false;try{matches=element.matches(rule.selectorsToString())}catch{/* Non-element selectors have no direct style to copy. */}
        if(matches)for(const name of Object.keys(rule.getStyle())){const value=computed.getPropertyValue(name);if(value)style[name]=value}
      });
      if(Object.keys(style).length)copy.addStyle(style);
    });
  }
  const all=()=>editor.Pages.getAll().forEach(page=>descendants(page.getMainComponent()).forEach(attach));
  editor.on('component:add',attach);editor.on('load project:load',all);all();
}
