import type { Component, Editor } from 'grapesjs';
import { descendants } from './component-tree';

export const isLocked = (component?: Component): boolean => !!component && (!!component.get('coeditLocked') || isLocked(component.parent()));
const fields = ['draggable','resizable','removable','editable','stylable','copyable'] as const;

/** Store original capabilities so unlocking never enables controls an object did not have. */
export function installLocking(editor: Editor) {
  let syncing = false;
  function sync() {
    if(syncing)return;syncing=true;
    try {
      editor.Pages.getAll().forEach(page=>descendants(page.getMainComponent()).forEach(component=>{
        const state=component.get('coeditLockState') as Record<string,unknown>|undefined;
        if(isLocked(component)) {
          if(!state){
            const legacy=component.get('coeditLocked')&&component.getClasses().includes('slide-object')&&['draggable','resizable','removable','editable'].every(field=>component.get(field)===false);
            component.set('coeditLockState',Object.fromEntries(fields.map(field=>[field,legacy&&['draggable','resizable','removable','editable'].includes(field)?component.defaults[field]:component.get(field)])),{silent:true});
          }
          const blocked=Object.fromEntries(fields.filter(field=>component.get(field)!==false).map(field=>[field,false]));
          if(Object.keys(blocked).length)component.set(blocked);
        }else if(state){component.unset('coeditLockState',{silent:true});component.set(state)}
      }));
    }finally{syncing=false}
  }
  editor.on('component:update:coeditLocked component:add project:load load',sync);
  return {sync};
}
