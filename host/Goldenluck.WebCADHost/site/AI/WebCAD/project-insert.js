const formats=/\.(webcad|stl|mesh|step|stp|brep|brp)$/i;
const same=(a,b)=>['sessionId','documentId','documentInstanceId'].every(key=>a?.[key]===b?.[key]);
const fail=(code,message)=>Object.assign(Error(message),{code});

export const canInsertFile=file=>formats.test(file?.originalName||file?.name||'')&&
  Number.isSafeInteger(file?.size)&&file.size>0&&/^[a-f0-9]{64}$/.test(file.sha256||'');

export function requestInsertOptions(name){
  const extension=name.split('.').at(-1).toLowerCase();
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog'),form=document.createElement('form');
    dialog.className='cad-insert-dialog';
    const title=document.createElement('h2');title.textContent='插入当前工程';
    const caption=document.createElement('p');caption.textContent=name;form.append(title,caption);
    function select(label,items){
      const field=document.createElement('label'),input=document.createElement('select');input.required=true;
      field.append(label,input);form.append(field);
      for(const [value,label] of items){const option=document.createElement('option');option.value=value;option.textContent=label;input.append(option);}
      return input;
    }
    const units=extension==='stl'?select('STL 源单位',[['','请选择'],['mm','毫米 (mm)'],['cm','厘米 (cm)'],['m','米 (m)'],['in','英寸 (in)']]):null;
    const mode=extension==='webcad'?select('对象组织',[['assembly','整体装配'],['parts','保留分件']]):null;
    const frame=select('放置方式',[['world','保留源坐标'],['work','工作基准 · 源包围盒中心']]);
    const buttons=document.createElement('div'),cancel=document.createElement('button'),apply=document.createElement('button');
    cancel.type='button';cancel.textContent='取消';apply.type='submit';apply.textContent='插入';buttons.append(cancel,apply);
    const finish=value=>{dialog.close();dialog.remove();resolve(value);};
    cancel.onclick=()=>finish(null);
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    form.onsubmit=event=>{
      event.preventDefault();
      finish({frame:frame.value,...(mode?{projectMode:mode.value}:{}),...(units?{units:units.value}:extension==='mesh'?{units:'mm'}:{})});
    };
    form.append(buttons);dialog.append(form);document.body.append(dialog);dialog.showModal();
  });
}

export function createConversationImporter({api,download}){
  async function stateAt(expected){
    const state=await api().getState({include:['summary']});
    if(!same(state.context,expected)||state.context.revision!==expected.expectedRevision)throw fail('REVISION_CONFLICT','目标工程或修订已变化。');
    if(!state.summary?.kernelReady||state.summary?.busy||state.preview?.active||state.preview?.computing)throw fail('CAPABILITY_UNAVAILABLE','请先完成当前计算或预览。');
    return state;
  }
  async function register(file,expected,session){
    await stateAt(expected);
    if(!canInsertFile(file)||!/^[a-zA-Z0-9_-]{1,100}$/.test(file.fileId||'')||/[\\/]/.test(file.name))
      throw fail('ASSET_INVALID','原件描述不完整。');
    if(file.source==='project'&&file.conversationId!==session.conversationId)throw fail('INSTANCE_MISMATCH','原件不属于当前对话。');
    const bytes=await download(session,file);
    if(bytes.byteLength!==file.size)throw fail('ARTIFACT_SIZE_MISMATCH','原件大小与登记记录不符。');
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    if(sha256!==file.sha256)throw fail('ARTIFACT_HASH_MISMATCH','原件 SHA-256 与登记记录不符。');
    await stateAt(expected);
    const originalPage=api(),resource=await originalPage.files.register({name:file.name,data:bytes});
    try{
      if(resource.status!=='registered'||resource.size!==file.size||resource.sha256!==file.sha256)
        throw fail('ATTACHMENT_REGISTER_MISMATCH','画布登记回执与原件不符。');
      await stateAt(expected);
      return resource;
    }catch(error){
      if(resource.resourceId)try{await originalPage.files.release({resourceId:resource.resourceId});}catch{/* Resource TTL remains in effect. */}
      throw error;
    }
  }
  async function confirm(result){
    if(result.status!=='committed')return result;
    const state=await api().getState({include:['summary']});
    const check=display=>['documentId','documentInstanceId','revision'].every(key=>display?.rendered?.[key]===result.context[key]);
    if(check(state.display))return {...result,render:{status:'rendered',context:state.display.rendered}};
    if(!same(state.context,result.context)||state.context.revision!==result.context.revision)
      return {...result,render:{status:'unverified',code:'REVISION_CONFLICT'}};
    const drawn=await api().redraw({context:result.context});
    return {...result,render:check(drawn.display)?{status:'rendered',context:drawn.display.rendered}:
      {status:'unverified',code:drawn.error?.code||'DISPLAY_FAILED'}};
  }
  return {register,confirm};
}
