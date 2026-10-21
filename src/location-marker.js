// Conversation references only: mesh-picked positions are never machining constraints.
export function createLocationMarker(hit,context,number){
  if(!hit||typeof hit.bodyId!=='string'||!Array.isArray(hit.point)||hit.point.length!==3||hit.point.some(v=>!Number.isFinite(v)))throw Object.assign(new Error('请点击可见模型表面'),{code:'LOCATION_NO_HIT'});
  const marker={version:1,id:crypto.randomUUID(),label:`P${number}`,context:{...context},bodyId:hit.bodyId,faceId:hit.faceId??null,point:[...hit.point],units:'mm',coordinateSystem:'world',source:'display-mesh',precision:'approximate'};
  const coordinates=marker.point.map(v=>Number(v.toFixed(4)));
  return {...marker,text:`位置 ${marker.label}：X=${coordinates[0]}，Y=${coordinates[1]}，Z=${coordinates[2]} mm（世界坐标，显示表面拾取）\n位置标记：${JSON.stringify(marker)}\n此标记用于指出位置；精确加工前请按当前修订重新查询几何。`};
}
export function showLocationDraft(marker){
  const dialog=document.createElement('dialog');dialog.className='cad-dialog message-dialog';dialog.dataset.hostControlAllowed='true';
  const title=document.createElement('h2');title.className='message-title';title.textContent='位置标记';
  const hint=document.createElement('p');hint.className='message-body';hint.textContent='AI 输入框尚未连接。复制以下文本到对话框；不会自动发送。';
  const input=document.createElement('textarea');input.readOnly=true;input.value=marker.text;input.rows=9;input.style.width='100%';input.setAttribute('aria-label','位置标记文本');input.dataset.hostControlAllowed='true';
  const footer=document.createElement('div');footer.className='message-footer';
  const copy=document.createElement('button');copy.type='button';copy.className='primary';copy.textContent='复制标记';copy.dataset.hostControlAllowed='true';copy.onclick=async()=>{try{await navigator.clipboard.writeText(marker.text);copy.textContent='已复制';}catch{input.focus();input.select();hint.textContent='请按 Ctrl+C 复制所选文本。';}};
  const close=document.createElement('button');close.type='button';close.textContent='关闭';close.dataset.hostControlAllowed='true';const dismiss=()=>{dialog.close();dialog.remove();};close.onclick=dismiss;dialog.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
  footer.append(copy,close);dialog.append(title,hint,input,footer);document.body.append(dialog);dialog.showModal();input.focus();input.select();
  return {status:'draft',delivery:'local-draft',markerId:marker.id,automaticSend:false};
}
