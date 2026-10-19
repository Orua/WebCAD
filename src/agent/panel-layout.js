// Keep Goldenluck Web/AI/WebCAD/panel-layout.js identical; each repo imports its own copy.
export function isMobileLayout(win=window){
  // Honor Chrome's desktop-site UA independently of the phone's physical input.
  const mobile=win.navigator.userAgentData?.mobile;
  return typeof mobile==='boolean'?mobile:/Android|iPhone|iPod|Mobile/i.test(win.navigator.userAgent||'');
}
export function isMobileInput(win=window){
  if(win.navigator.userAgentData?.mobile===true||/Android|iPhone|iPod|Mobile/i.test(win.navigator.userAgent||''))return true;
  return win.matchMedia('(pointer: coarse) and (hover: none)').matches&&Math.min(win.screen.width,win.screen.height)<=700;
}
export function clampPanelSize(value,extent,mobile){
  const maximum=Math.max(0,extent-(mobile?160:280));
  return Math.round(Math.max(Math.min(mobile?156:240,maximum),Math.min(value,maximum)));
}
export function createPanelLayout({root,visible=()=>true,collapsed=()=>false,collapsedSize=()=>44,onCollapsed=()=>{},onChange=()=>{},widthProperty,heightProperty}){
  let widthPx=360,heightPx=null,drag=null,shield=null,hint=null;
  const handle=document.createElement('div');handle.className='cad-assistant-resizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-label','调整 CAD 助手尺寸');root.append(handle);
  const mobile=()=>isMobileLayout();
  function hideHint(){hint?.remove();hint=null;}
  function showHint(event){
    if(!hint){
      hint=document.createElement('span');hint.className='cad-assistant-resize-hint';hint.setAttribute('aria-hidden','true');
      hint.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;display:grid;place-items:center;width:32px;height:32px;border-radius:6px;background:var(--gl-surface,var(--ui-surface,#fff));color:var(--gl-blue,var(--accent,#245dd8));box-shadow:0 2px 8px #162a3b26';
      hint.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg>';document.body.append(hint);
    }
    const boundary=handle.getBoundingClientRect();
    hint.style.left=(mobile()?Math.max(18,Math.min(window.innerWidth-18,event.clientX)):boundary.left+boundary.width/2)+'px';
    hint.style.top=(mobile()?boundary.top+boundary.height/2:Math.max(18,Math.min(window.innerHeight-18,event.clientY)))+'px';
    hint.style.transform='translate(-50%,-50%)'+(mobile()?' rotate(90deg)':'');
  }
  const extent=()=>{const rect=root.getBoundingClientRect();return mobile()?Math.min(rect.height,window.visualViewport?.height||rect.height):rect.width;};
  const size=()=>clampPanelSize(mobile()?(heightPx??extent()*.4):widthPx,extent(),mobile());
  function sync(){
    root.style.setProperty('--cad-layout-height',(window.visualViewport?.height||window.innerHeight)+'px');
    root.dataset.cadMobile=String(mobile());root.style.setProperty(widthProperty,clampPanelSize(widthPx,root.getBoundingClientRect().width,false)+'px');root.style.setProperty(heightProperty,size()+'px');
    handle.hidden=!visible()||collapsed();handle.setAttribute('aria-orientation',mobile()?'horizontal':'vertical');handle.setAttribute('aria-valuemin',String(Math.min(mobile()?156:240,Math.max(0,extent()-(mobile()?160:280)))));handle.setAttribute('aria-valuemax',String(Math.max(0,extent()-(mobile()?160:280))));handle.setAttribute('aria-valuenow',String(size()));
  }
  const get=()=>({version:1,mobile:mobile(),axis:mobile()?'height':'width',widthPx:clampPanelSize(widthPx,root.getBoundingClientRect().width,false),heightPx:clampPanelSize(heightPx??extent()*.4,Math.min(root.getBoundingClientRect().height,window.visualViewport?.height||window.innerHeight),true),effectiveSizePx:collapsed()?collapsedSize():size(),collapsed:collapsed(),visible:visible()});
  function set(input={}){
    if(!input||Array.isArray(input)||Object.keys(input).some(key=>!['widthPx','heightPx','collapsed'].includes(key)))throw Object.assign(new Error('无效的助手布局字段'),{code:'PARAM_SCHEMA_INVALID'});
    for(const key of ['widthPx','heightPx'])if(input[key]!==undefined&&(!Number.isFinite(input[key])||input[key]<1||input[key]>4096))throw Object.assign(new Error(key+'须为1–4096像素'),{code:'PARAM_SCHEMA_INVALID'});
    if(input.collapsed!==undefined&&typeof input.collapsed!=='boolean')throw Object.assign(new Error('collapsed须为布尔值'),{code:'PARAM_SCHEMA_INVALID'});
    if(input.widthPx!==undefined)widthPx=input.widthPx;if(input.heightPx!==undefined)heightPx=input.heightPx;if(input.collapsed!==undefined)onCollapsed(input.collapsed);sync();onChange(get());return get();
  }
  function end(event){if(!drag||event?.pointerId!==undefined&&event.pointerId!==drag.id)return;drag=null;hideHint();shield?.remove();shield=null;document.body.classList.remove('cad-assistant-resizing');onChange(get());}
  handle.addEventListener('pointerenter',showHint);
  handle.addEventListener('pointermove',showHint);
  handle.addEventListener('pointerleave',()=>{if(!drag)hideHint();});
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0||collapsed())return;event.preventDefault();drag={id:event.pointerId,start:mobile()?event.clientY:event.clientX,size:size(),mobile:mobile()};showHint(event);
    // Capture on a full-window shield prevents pointer loss over either iframe.
    shield=document.createElement('div');shield.className='cad-assistant-drag-shield';shield.style.cssText='position:fixed;inset:0;z-index:2147483646;touch-action:none;cursor:'+(drag.mobile?'row-resize':'col-resize');document.body.append(shield);shield.setPointerCapture?.(event.pointerId);document.body.classList.add('cad-assistant-resizing');
  });
  function move(event){if(!drag||event.pointerId!==drag.id)return;event.preventDefault();showHint(event);const value=clampPanelSize(drag.size+drag.start-(drag.mobile?event.clientY:event.clientX),extent(),drag.mobile);if(drag.mobile)heightPx=value;else widthPx=value;sync();}
  handle.addEventListener('keydown',event=>{const delta=['ArrowLeft','ArrowUp'].includes(event.key)?16:['ArrowRight','ArrowDown'].includes(event.key)?-16:0;if(!delta)return;event.preventDefault();set({[mobile()?'heightPx':'widthPx']:Math.max(1,size()+delta)});});
  window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);window.addEventListener('blur',end);
  window.addEventListener('resize',sync);window.visualViewport?.addEventListener('resize',sync);const observer=new ResizeObserver(sync);observer.observe(root);sync();
  return {get,set,sync,destroy(){end();hideHint();observer.disconnect();handle.remove();window.removeEventListener('resize',sync);window.visualViewport?.removeEventListener('resize',sync);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);window.removeEventListener('blur',end);}};
}
