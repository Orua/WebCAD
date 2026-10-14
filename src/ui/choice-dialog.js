// Modal choice with an explicit safe default (Cancel). Resolves to a choice id.
export function chooseAction({title,message,choices,defaultId='cancel',root=document.body}){
  return new Promise(resolve=>{
    const d=document.createElement('dialog');d.className='cad-dialog message-dialog choice-dialog';d.setAttribute('role','alertdialog');
    const id=`choice-${crypto.randomUUID()}`;d.setAttribute('aria-labelledby',id);
    const h=document.createElement('h2');h.id=id;h.className='message-title';h.textContent=title;
    const body=document.createElement('div');body.className='message-body';body.textContent=message;
    const footer=document.createElement('div');footer.className='message-footer';
    const finish=value=>{d.close();d.remove();resolve(value);};
    let focus=null;
    for(const choice of choices){const b=document.createElement('button');b.type='button';b.textContent=choice.label;b.dataset.choice=choice.id;if(choice.primary)b.className='primary';b.addEventListener('click',()=>finish(choice.id));footer.append(b);if(choice.id===defaultId)focus=b;}
    d.addEventListener('cancel',e=>{e.preventDefault();finish('cancel');});
    d.append(h,body,footer);root.append(d);d.showModal();focus?.focus();
  });
}
export const UNSAVED_CHOICES=Object.freeze([{id:'save',label:'保存',primary:true},{id:'discard',label:'不保存'},{id:'cancel',label:'取消'}]);
export const DROP_CHOICE_LABELS=Object.freeze({open:'打开（替换当前设计）',insert:'插入到当前设计',cancel:'取消'});
