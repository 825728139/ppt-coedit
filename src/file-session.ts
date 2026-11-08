export interface HtmlFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{write(value: string): Promise<void>; close(): Promise<void>; abort?(): Promise<void>}>;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (options: unknown) => Promise<HtmlFileHandle[]>;
  showSaveFilePicker?: (options: unknown) => Promise<HtmlFileHandle>;
};
export function installFileSession(options: { load(source:string):Promise<void>; render():string; editing():boolean; flush():Promise<void> }) {
  const bar = document.createElement('div'); bar.className='file-session';
  bar.innerHTML=`<button id="open-source">打开并同步 HTML</button><span id="source-name">未绑定文件</span><span id="source-state" role="status">Codex / OpenCode 直接修改同一份 HTML，无需连接编辑器。</span><button id="reload-source" disabled>重新加载</button><button id="save-source-as">另存为</button>`;
  document.querySelector('nav')!.after(bar);
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>bar.querySelector<T>(`#${id}`)!;
  const picker=window as PickerWindow;
  let handle:HtmlFileHandle|undefined, baseline='', busy=false;
  let activePoll:Promise<void>|undefined;
  const report=(message:string)=>{el('source-state').textContent=message};
  const dirty=()=>{if(options.editing())return true;try{return options.render()!==baseline}catch{return true}};
  async function load(source:string,next=handle){if(!source.trim())throw new Error('文件暂为空，等待写入完成。');await options.load(source);handle=next;baseline=source;el('source-name').textContent=handle!.name;el<HTMLButtonElement>('reload-source').disabled=false;report('已加载原文件 · 自动检测外部修改');}
  async function open(){
    if(!picker.showOpenFilePicker){report('当前浏览器不支持直接读写本地文件，请使用 Chrome/Edge，或使用“导入副本”和“导出 HTML”。');return}
    await activePoll;if(busy)return;busy=true;
    try{
      if(handle&&dirty()&&!confirm('当前有未保存修改，打开其他文件将放弃这些修改，是否继续？'))return;
      const [next]=await picker.showOpenFilePicker({multiple:false,types:[{description:'HTML 演示文稿',accept:{'text/html':['.html','.htm']}}]});
      if(!next)return;await load(await(await next.getFile()).text(),next);
    }catch(error){if((error as DOMException).name!=='AbortError')report(`打开失败：${String(error)}`)}finally{busy=false}
  }
  async function reload(){
    await activePoll;
    if(!handle||busy)return;
    if(dirty()&&!confirm('重新加载会放弃编辑器内尚未保存的修改，是否加载磁盘版本？'))return;
    busy=true;try{await load(await(await handle.getFile()).text())}catch(error){report(`加载失败，保留当前编辑内容：${String(error)}`)}finally{busy=false}
  }
  async function runPoll(){
    if(!handle||busy)return;
    busy=true;
    try{
      const source=await(await handle.getFile()).text();
      if(source!==baseline){
        await load(source);report('已同步磁盘上的外部修改');
      }
    }catch(error){report(`文件同步失败，当前内容已保留：${String(error)}`)}finally{busy=false}
  }
  function poll(){if(activePoll)return activePoll;activePoll=runPoll().finally(()=>{activePoll=undefined});return activePoll}
  async function save(){
    await activePoll;
    if(busy){report('正在同步，请稍后保存。');return}
    if(!handle){await saveAs();return}
    busy=true;let writable:Awaited<ReturnType<HtmlFileHandle['createWritable']>>|undefined;
    try{
      await options.flush();
      const text=options.render(),current=await(await handle.getFile()).text();
      if(current!==baseline){await load(current);report('已同步磁盘上的外部修改');return}
      if(text!==current){writable=await handle.createWritable();await writable.write(text);await writable.close();writable=undefined}
      baseline=text;report('已写回原 HTML 文件 · 可交给 Codex / OpenCode 继续修改');
    }catch(error){await writable?.abort?.().catch(()=>{});report(`保存失败，磁盘未确认更新：${String(error)}`)}finally{busy=false}
  }
  async function saveAs(){
    if(!picker.showSaveFilePicker){report('当前浏览器不支持直接保存文件，请点击“导出 HTML”下载副本。');return}
    await activePoll;if(busy)return;
    busy=true;let writable:Awaited<ReturnType<HtmlFileHandle['createWritable']>>|undefined;
    try{
      await options.flush();
      const text=options.render(),next=await picker.showSaveFilePicker({suggestedName:handle?.name||'演示文稿.html',types:[{description:'HTML 演示文稿',accept:{'text/html':['.html']}}]});
      writable=await next.createWritable();await writable.write(text);await writable.close();writable=undefined;
      // Reopening establishes source ranges for newly created documents as well.
      await load(text,next);report('已另存并绑定新文件');
    }catch(error){await writable?.abort?.().catch(()=>{});if((error as DOMException).name!=='AbortError')report(`另存失败：${String(error)}`)}finally{busy=false}
  }
  el('open-source').onclick=open;el('reload-source').onclick=reload;el('save-source-as').onclick=saveAs;
  const interval=setInterval(poll,500);window.addEventListener('focus',poll);
  return {save,reload,poll,isBound:()=>!!handle,dispose(){clearInterval(interval);window.removeEventListener('focus',poll);bar.remove()}};
}
