// Both buttons settle the same public job decision; neither creates a new job.
export function showServicesWait({jobId,elapsedMs,execution,onDecision}){
 const dialog=document.createElement('dialog');dialog.className='dialog';dialog.style.cssText='max-width:460px;width:calc(100% - 48px);padding:24px';
 const title=document.createElement('h2');title.textContent='服务器运算仍在进行';
 const description=document.createElement('p');description.textContent=`已等待 ${Math.round(elapsedMs/1000)} 秒，任务状态：${execution}。继续等待会查询同一个任务；停止会终止这次服务器运算，当前工程保留。`;
 const identity=document.createElement('p');identity.className='property-footnote';identity.textContent=`任务 ${jobId}`;
 const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:12px;justify-content:flex-end;margin-top:20px';
 for(const [decision,label]of [['continue','继续等待'],['stop','停止运算']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.className=decision==='continue'?'primary':'secondary';button.onclick=()=>onDecision(jobId,decision);buttons.append(button);}
 dialog.append(title,description,identity,buttons);dialog.addEventListener('cancel',event=>event.preventDefault());document.body.append(dialog);dialog.showModal();
 return {close:()=>{dialog.close();dialog.remove();}};
}
