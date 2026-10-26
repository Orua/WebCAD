// Programmatic host input: real bytes only; no picker events, paths or URLs.
const canvasSource=name=>/\.(step|stp|brep|brp|stl|obj|ply|3mf)$/i.test(name||'');
const sameDocument=(a,b)=>a&&b&&['sessionId','documentId','documentInstanceId'].every(key=>a[key]===b[key]);
// File selection can finish before the page knowledge handshake. Resolve that
// race before creating a model task instead of sending an unusable attachment.
export async function ensureCanvasResources(items,{snapshot,register,release=async()=>{}}){
 const needed=items.filter(item=>canvasSource(item.name));if(!needed.length)return;
 const initial=await snapshot();
 if(!initial.ready||!initial.context?.documentInstanceId)throw Object.assign(Error('画布尚未就绪，附件已保留；连接完成后再发送。'),{code:'ATTACHMENT_CANVAS_NOT_READY'});
 for(const item of needed){
  if(item.resourceId&&sameDocument(item.resourceBinding,initial.context))continue;
  let resource;
  try{
   resource=await register(item.file);
   if(!resource?.resourceId||resource.size!==item.size||resource.sha256!==item.sha256)throw Object.assign(Error('画布资源回执与选定原件不符，未发送任务。'),{code:'ATTACHMENT_REGISTER_MISMATCH'});
   const latest=await snapshot();if(!latest.ready||!sameDocument(initial.context,latest.context))throw Object.assign(Error('附件登记期间工程已变化，附件保留；请核对当前工程后再发送。'),{code:'ATTACHMENT_BINDING_CHANGED'});
   item.resourceId=resource.resourceId;item.resourceBinding={...initial.context};
  }catch(error){if(resource?.resourceId)try{await release(resource.resourceId);}catch{}throw error;}
 }
}
export function createAttachmentBytesAPI({snapshot,accept,validate,FileType=File}){
  let running=false;
  const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
  const binding=state=>({cadSessionId:state.cadSessionId,leaseEpoch:state.leaseEpoch,...state.context});
  const blocked=state=>!state.ready||state.active||state.busy||state.preview;
  const same=(a,b)=>['cadSessionId','leaseEpoch','sessionId','documentId','documentInstanceId','revision'].every(key=>a?.[key]===b?.[key]);
  async function getState(){const state=await snapshot();return {status:'read',binding:binding(state),canAttach:!running&&!blocked(state),maxFiles:5,maxTotalBytes:536870912};}
  async function attach(input){
    if(running)fail('ATTACHMENT_BUSY','附件正在接收，请等待原接收完成。');
    if(!input||typeof input!=='object'||Object.keys(input).some(key=>!['name','mime','data','expectedSize','expectedSha256','binding'].includes(key)))fail('PARAM_SCHEMA_INVALID','请提供文件名、原始字节、大小、SHA256和当前binding。');
    const {name,data,expectedSize,expectedSha256}=input,mime=input.mime||'application/octet-stream';
    if(typeof name!=='string'||!name.length||name.length>255||/[\\/\x00-\x1f]/.test(name)||['.','..'].includes(name))fail('ATTACHMENT_NAME_INVALID','请使用不含目录的文件名。');
    if(typeof mime!=='string'||mime.length>128||!/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(mime))fail('PARAM_SCHEMA_INVALID','附件MIME格式无效。');
    if(!ArrayBuffer.isView(data)||Object.prototype.toString.call(data)!=='[object Uint8Array]'||!Number.isSafeInteger(expectedSize)||expectedSize<1||data.byteLength!==expectedSize)fail('ATTACHMENT_SIZE_MISMATCH','请提供与原大小一致的非空Uint8Array字节。');
    if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256))fail('PARAM_SCHEMA_INVALID','请提供原文件的完整小写SHA256。');
    validate([{name,size:expectedSize}]);
    running=true;
    try{
      const state=await snapshot(),anchor=binding(state);
      if(blocked(state))fail('ATTACHMENT_HOST_BUSY','当前任务、回执或工程计算尚未结束，请先核对后再添加附件。');
      if(!same(input.binding,anchor))fail('ATTACHMENT_BINDING_CHANGED','当前工程或会话已变化，请重新读取附件入口binding。');
      const bytes=new Uint8Array(data); // Copy before asynchronous hashing; caller changes cannot alter input.
      const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
      if(sha256!==expectedSha256)fail('ATTACHMENT_HASH_MISMATCH','附件SHA256与原件不符，未接收。');
      const latest=await snapshot();
      if(blocked(latest)||!same(anchor,binding(latest)))fail('ATTACHMENT_BINDING_CHANGED','接收期间工程或任务状态变化，未添加附件。');
      const result=await accept(new FileType([bytes],name,{type:mime}),anchor);
      if(result.sha256!==sha256||result.size!==expectedSize)fail('ATTACHMENT_REGISTER_MISMATCH','页面登记回执与原件不符，请核对附件，勿发送。');
      return {status:'attached',name,size:expectedSize,sha256,resourceId:result.resourceId,binding:anchor,serverUploaded:false,nextAction:'附件已加入当前输入；通过正常控制台发送后才上传到Agent任务。'};
    }finally{running=false;}
  }
  return Object.freeze({getState,attach});
}
