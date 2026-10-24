const labels={thinking:'AI 正在思考',working:'AI 正在操作',completed:'任务已完成',failed:'任务失败',canceled:'任务已停止',idle:'AI 空闲',offline:'AI 已断开',connecting:'AI 正在连接'};
export function validateFloatingPosition(position){
  if(!position||typeof position!=='object'||Array.isArray(position)||Object.keys(position).some(key=>!['xPx','yPx'].includes(key))||!['xPx','yPx'].every(key=>Number.isFinite(position[key])&&position[key]>=0&&position[key]<=100000))throw Object.assign(new Error('浮标位置须包含0–100000像素的xPx、yPx。'),{code:'PARAM_SCHEMA_INVALID'});
  return position;
}

// A view control only: moving or opening it never releases the Agent lease.
export function createFloatingToggle({root,onOpen,onMove=()=>{}}){
  const button=document.createElement('button');button.type='button';button.className='agent-floating-toggle';button.hidden=true;
  button.dataset.hostControlAllowed='true';button.dataset.commandId='agentPanelFloating';button.setAttribute('aria-expanded','false');
  button.innerHTML='<span class="agent-floating-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M20 7v5M5 21v7M35 21v7"/><circle class="agent-robot-antenna" cx="20" cy="5" r="2"/><rect x="8" y="12" width="24" height="23" rx="7"/><g class="agent-robot-eyes"><rect x="13" y="20" width="4" height="5" rx="2"/><rect x="23" y="20" width="4" height="5" rx="2"/></g><path d="M17 29h6"/></svg><span class="agent-floating-dots"><i></i><i></i><i></i></span></span>';
  button.insertAdjacentHTML('afterbegin','<span class="agent-floating-timer" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="14" r="7.5"/><path d="M12 10v4l2 1M9 2h6M12 2v4"/></svg><span data-elapsed>0s</span></span>');
  button.insertAdjacentHTML('beforeend','<span class="agent-floating-copy" aria-hidden="true"></span><svg class="agent-floating-complete" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>');
  root.append(button);
  const elapsed=button.querySelector('[data-elapsed]'),copy=button.querySelector('.agent-floating-copy');
  let position=null,drag=null,suppressClick=false,activity='idle',detail={},startedAt=null,text='',elapsedSeconds=0;
  function tick(){
    if(button.hidden)return;
    const end=['completed','failed','canceled'].includes(activity)?Date.parse(detail.finishedAt)||Date.now():Date.now();
    elapsedSeconds=Math.max(0,Math.floor((end-startedAt)/1000));elapsed.textContent=elapsedSeconds+'s';
    const entries=(Array.isArray(detail.entries)?detail.entries:[]).filter(value=>typeof value==='string'&&value.trim()).slice(-4);
    text=activity==='completed'?'':activity==='failed'?'执行失败':activity==='canceled'?'已停止':['waiting','model','preparing','unknown'].includes(detail.phase)||!entries.length?'..':entries[Math.floor((Date.now()-startedAt)/2200)%entries.length].replace(/\s+/g,' ').slice(0,180);
    copy.textContent=text;copy.title=text;button.dataset.phase=detail.phase||'waiting';
    button.setAttribute('aria-label',`展开 AI 对话框 · ${labels[activity]} · ${elapsedSeconds}s${text?' · '+text:''}`);
  }
  const clock=setInterval(tick,250);clock.unref?.();
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
  function get(){return {visible:!button.hidden,activity,position:position?{...position}:null,elapsedSeconds,phase:detail.phase||'waiting',text};}
  return {get,setPosition(value){validateFloatingPosition(value);position={...value};place();return get();},sync({visible,activity:next='idle',detail:nextDetail={}}){
    detail=nextDetail&&typeof nextDetail==='object'?nextDetail:{};
    activity=['completed','failed','canceled'].includes(detail.status)?detail.status:Object.hasOwn(labels,next)?next:'idle';
    startedAt=Date.parse(detail.startedAt)||startedAt||Date.now();
    button.hidden=!visible||!['thinking','working','completed','failed','canceled'].includes(activity);button.dataset.activity=activity;
    if(button.hidden)finish(null,true);else tick();place();
  },destroy(){clearInterval(clock);observer.disconnect();button.remove();}};
}
