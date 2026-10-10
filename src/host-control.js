// The same-origin host owns the human-interaction lock. Public CAD commands
// deliberately do not consult this state: the Agent must keep writing the model.
export function createHostControl(onChange=()=>{}){
  let state={version:1,locked:false,connected:false};
  const get=()=>({...state,mouseMode:state.locked?'view':'editable',pageApiWritable:true});
  return Object.freeze({get,set(patch={}){
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!['locked','connected'].includes(key))||Object.values(patch).some(value=>typeof value!=='boolean'))throw Object.assign(new Error('hostControl.set requires boolean locked/connected fields'),{code:'HOST_CONTROL_INVALID'});
    const changed=Object.entries(patch).some(([key,value])=>state[key]!==value);
    if(changed){state={...state,...patch};onChange(get());}return get();
  }});
}

export function installHostInteractionGuard(surface,isLocked,isViewport){
  const guard=event=>{
    if(!isLocked()||event.isTrusted===false)return;
    // OrbitControls receives only pointer gestures on its canvas. Keyboard,
    // drops, anchor handles, menus, and any open form are unavailable.
    if(['pointerdown','click','dblclick','contextmenu'].includes(event.type)&&isViewport(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();
  };
  const types=['pointerdown','click','dblclick','contextmenu','keydown','input','change','submit','dragover','drop'];
  for(const type of types)surface.addEventListener(type,guard,true);
  return ()=>{for(const type of types)surface.removeEventListener(type,guard,true);};
}
