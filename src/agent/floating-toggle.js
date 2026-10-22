const labels={thinking:'正在思考',working:'正在操作',idle:'等待指令',offline:'连接已断开',connecting:'正在连接'};
export function validateFloatingPosition(position){
  if(!position||typeof position!=='object'||Array.isArray(position)||Object.keys(position).some(key=>!['xPx','yPx'].includes(key))||!['xPx','yPx'].every(key=>Number.isFinite(position[key])&&position[key]>=0&&position[key]<=100000))throw Object.assign(new Error('浮标位置须包含0–100000像素的xPx、yPx。'),{code:'PARAM_SCHEMA_INVALID'});
  return position;
}

// A view control only: moving or opening it never releases the Agent lease.
export function createFloatingToggle({root,onOpen,onMove=()=>{}}){
  const button=document.createElement('button');button.type='button';button.className='agent-floating-toggle';button.hidden=true;
  button.dataset.hostControlAllowed='true';button.dataset.commandId='agentPanelFloating';button.setAttribute('aria-expanded','false');
  button.innerHTML='<span class="agent-floating-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9L4 7.5M12 12l8-4.5M12 12v9"/></svg><span class="agent-floating-dots"><i></i><i></i><i></i></span></span><span class="agent-floating-copy"><strong>AG</strong><span class="agent-floating-status"></span></span>';
  root.append(button);
  let position=null,drag=null,suppressClick=false,activity='idle';
  function bounds(){return {maxX:Math.max(8,root.clientWidth-button.offsetWidth-8),maxY:Math.max(8,root.clientHeight-button.offsetHeight-8)};}
  function place(value=position){
    if(button.hidden)return;
    const {maxX,maxY}=bounds();
    position={xPx:Math.round(Math.max(8,Math.min(value?.xPx??maxX,maxX))),yPx:Math.round(Math.max(8,Math.min(value?.yPx??72,maxY)))};
    button.style.transform=`translate(${position.xPx}px,${position.yPx}px)`;
  }
  function finish(event,cancelled=false){
    if(!drag||event&&event.pointerId!==drag.id)return;
    const moved=drag.moved;drag=null;button.classList.remove('is-dragging');suppressClick=moved||cancelled;
    if(moved&&!cancelled)onMove(get());
  }
  button.addEventListener('pointerdown',event=>{
    event.stopPropagation();if(event.button!==0)return;
    suppressClick=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY,position:{...position},moved:false};button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;event.stopPropagation();
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(!drag.moved&&Math.hypot(dx,dy)<5)return;
    drag.moved=true;event.preventDefault();button.classList.add('is-dragging');place({xPx:drag.position.xPx+dx,yPx:drag.position.yPx+dy});
  });
  button.addEventListener('pointerup',event=>{event.stopPropagation();finish(event);});
  button.addEventListener('pointercancel',event=>finish(event,true));
  button.addEventListener('lostpointercapture',event=>finish(event,true));
  button.addEventListener('click',event=>{event.stopPropagation();if(suppressClick&&event.detail!==0){suppressClick=false;return;}suppressClick=false;onOpen();});
  button.addEventListener('dblclick',event=>event.stopPropagation());
  button.addEventListener('keydown',event=>{
    const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[event.key];
    if(!delta)return;event.preventDefault();event.stopPropagation();place({xPx:position.xPx+delta[0],yPx:position.yPx+delta[1]});onMove(get());
  });
  const observer=new ResizeObserver(()=>place());observer.observe(root);
  function get(){return {visible:!button.hidden,activity,position:position?{...position}:null};}
  return {get,setPosition(value){validateFloatingPosition(value);position={...value};place();return get();},sync({visible,activity:next='idle'}){
    activity=Object.hasOwn(labels,next)?next:'idle';button.hidden=!visible;button.dataset.activity=activity;
    button.querySelector('.agent-floating-status').textContent=labels[activity];
    button.title=`Agent ${labels[activity]} · 单击展开，拖动移位`;button.setAttribute('aria-label',`展开 Agent 对话框 · ${labels[activity]}`);
    if(!visible)finish(null,true);place();
  },destroy(){observer.disconnect();button.remove();}};
}
