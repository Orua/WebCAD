// Separate from the tool dialog: an error must not destroy entered parameters.
export function displayMessage(message){
  const text=String(message||'操作失败，请重试。');
  if(text.startsWith('平面增厚')&&(text.includes('轮廓')||text.includes('面积/体积')))
    return '这个面无法可靠增厚。请换一个面或调整厚度。';
  if(text.includes('WebAssembly.Exception'))return '模型计算失败，请调整参数后重试。';
  return text;
}
export function createMessagePresenter(root){
  let active=null;const queue=[];
  const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  function next(){
    if(active||!queue.length)return;
    const item=queue.shift(),previous=document.activeElement,d=make('dialog',`cad-dialog message-dialog message-${item.kind}`);
    const id=`message-${crypto.randomUUID()}`;
    d.setAttribute('role','alertdialog');d.setAttribute('aria-labelledby',id);d.setAttribute('aria-describedby',`${id}-body`);
    const title=make('h2','message-title',item.title);title.id=id;
    const body=make('div','message-body',item.message);body.id=`${id}-body`;
    const repeat=make('p','message-repeat'),footer=make('div','message-footer'),confirm=make('button','primary','关闭'),close=make('button','message-close','×');
    close.setAttribute('aria-label','关闭提示');confirm.type=close.type='button';confirm.autofocus=true;
    const dismiss=()=>{if(active?.dialog!==d)return;active=null;d.close();d.remove();if(previous?.isConnected)previous.focus({preventScroll:true});next();};
    close.addEventListener('click',dismiss);confirm.addEventListener('click',dismiss);d.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
    footer.append(confirm);d.append(close,title,body,repeat,footer);root.append(d);
    active={...item,dialog:d,repeat,dismiss};d.showModal();confirm.focus();
  }
  function show(kind,title,message){
    const text=displayMessage(message),key=`${kind}:${title}:${text}`;
    if(active?.key===key){active.count++;active.repeat.textContent=`相同提示出现 ${active.count} 次`;return;}
    if(queue.some(item=>item.key===key))return;
    queue.push({kind,title,message:text,key,count:1});next();
  }
  return {error:message=>show('error','操作未完成',message),warning:(message,title='请注意')=>show('warning',title,message),
    clearErrors(){for(let i=queue.length-1;i>=0;i--)if(queue[i].kind==='error')queue.splice(i,1);if(active?.kind==='error')active.dismiss();},
    destroy(){queue.length=0;active?.dismiss();}};
}
