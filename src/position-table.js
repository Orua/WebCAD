const finite=(value,label)=>{const n=Number(value);if(!String(value).trim()||!Number.isFinite(n))throw new Error(`${label} 需要有效数字`);return n;};
export function parsePositionRows(text,mode){
  const columns=mode==='multiPocket'?['x','y','z','width','height','cornerRadius']:['x','y','z'];
  const rows=String(text).trim().split(/[\r\n;]+/).filter(Boolean).map((line,index)=>{
    const values=line.trim().split(/[\t,， ]+/);if(values.length<3||values.length>columns.length)throw new Error(`第 ${index+1} 行需要 ${columns.length===3?'X,Y,Z':'X,Y,Z,宽,高[,圆角]'}。`);
    const result={};for(let i=0;i<values.length;i++)result[columns[i]]=finite(values[i],`第 ${index+1} 行 ${columns[i]}`);
    if(mode==='multiPocket'&&(result.width<=0||result.height<=0||result.cornerRadius<0))throw new Error(`第 ${index+1} 行宽、高须大于零，圆角不能为负。`);
    return result;
  });
  const limit=mode==='multiHole'?100:64;if(!rows.length||rows.length>limit)throw new Error(`位置表须有 1 至 ${limit} 行。`);
  return rows;
}
export function generatePositionRows({pattern,count=2,origin=[0,0,0],step=[10,0,0],radius=10,angleDeg=360}){
  if(!Number.isInteger(count)||count<1||count>100||origin.length!==3||origin.some(v=>!Number.isFinite(v)))throw new Error('位置数量或中心无效');
  if(pattern==='line')return Array.from({length:count},(_,i)=>origin.map((value,k)=>value+i*step[k]));
  if(pattern==='circle'){if(!(radius>0))throw new Error('圆周半径须大于零');return Array.from({length:count},(_,i)=>{const angle=angleDeg*Math.PI/180*i/(angleDeg===360?count:Math.max(1,count-1));return [origin[0]+radius*Math.cos(angle),origin[1]+radius*Math.sin(angle),origin[2]];});}
  if(pattern==='symmetric'){if(count!==2)throw new Error('对称位置须为两行');return [origin.map((value,k)=>value-step[k]/2),origin.map((value,k)=>value+step[k]/2)];}
  throw new Error('未知位置生成方式');
}
export function mountPositionTable(form,mode){
  const key=mode==='multiPocket'?'pockets':'points',textarea=form.elements.namedItem(key);if(!textarea)return;
  const original=textarea.closest('[data-field]');original.hidden=true;
  const host=document.createElement('div');host.className='position-table';
  const heading=document.createElement('strong');heading.textContent=mode==='multiPocket'?'凹槽位置与共用尺寸':'位置表 · 共用直径与深度';
  const help=document.createElement('p');help.textContent='每行一个位置；支持粘贴多行 X,Y,Z。行内尺寸仅凹槽可设，孔径和深度仍由上方统一参数控制。';
  const table=document.createElement('table'),thead=document.createElement('thead'),tbody=document.createElement('tbody');
  const columns=mode==='multiPocket'?['x','y','z','width','height','cornerRadius']:['x','y','z'];
  const header=document.createElement('tr');for(const title of ['行',...columns,'操作']){const th=document.createElement('th');th.textContent=title;header.append(th);}thead.append(header);table.append(thead,tbody);
  const notice=document.createElement('p');notice.setAttribute('aria-live','polite');
  const row=(values={})=>{const tr=document.createElement('tr');tr.append(document.createElement('th'));for(const name of columns){const td=document.createElement('td'),input=document.createElement('input');input.type='number';input.step='any';input.required=true;input.name=`table-${name}`;input.setAttribute('aria-label',`${name} mm`);input.value=String(values[name]??(name==='width'||name==='height'?4:0));input.addEventListener('input',sync);input.addEventListener('focus',()=>{for(const item of tbody.children)item.classList.toggle('active',item===tr);});td.append(input);tr.append(td);}const action=document.createElement('td'),remove=document.createElement('button');remove.type='button';remove.textContent='删';remove.addEventListener('click',()=>{if(tbody.children.length<=1)return;tr.remove();sync();});action.append(remove);tr.append(action);tbody.append(tr);sync();};
  const values=()=>[...tbody.children].map(tr=>Object.fromEntries(columns.map(name=>[name,Number(tr.querySelector(`[name="table-${name}"]`).value)])));
  const sync=()=>{[...tbody.children].forEach((tr,i)=>tr.querySelector('th').textContent=String(i+1));const data=values();textarea.value=mode==='multiPocket'?JSON.stringify(data):data.map(item=>[item.x,item.y,item.z].join(',')).join('\n');form.dispatchEvent(new Event('input',{bubbles:true}));};
  const makeButton=(label,handler)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',handler);return b;};
  const controls=document.createElement('div');controls.className='position-table-controls';
  controls.append(makeButton('加一行',()=>row(values().at(-1))),makeButton('粘贴多行',async()=>{const raw=prompt('粘贴多行 X,Y,Z；凹槽可追加宽,高,圆角');if(raw===null)return;try{for(const item of parsePositionRows(raw,mode))row(item);notice.textContent='已追加位置，请检查每行。';}catch(error){notice.textContent=error.message;}}));
  const pattern=document.createElement('select');pattern.setAttribute('aria-label','生成位置方式');for(const [id,label] of [['line','等距单列'],['circle','圆周分布'],['symmetric','中心线对称']]){const option=document.createElement('option');option.value=id;option.textContent=label;pattern.append(option);}
  const count=document.createElement('input');count.type='number';count.min='1';count.max='100';count.step='1';count.value='2';count.setAttribute('aria-label','生成数量');
  const step=document.createElement('input');step.type='number';step.step='any';step.value='10';step.setAttribute('aria-label','间距或半径 mm');
  controls.append(pattern,count,step,makeButton('生成位置',()=>{try{const existing=values().at(0),points=generatePositionRows({pattern:pattern.value,count:Number(count.value),origin:[existing.x,existing.y,existing.z],step:[Number(step.value),0,0],radius:Number(step.value)});tbody.replaceChildren();for(const point of points)row({x:point[0],y:point[1],z:point[2],...(mode==='multiPocket'?{width:existing.width,height:existing.height,cornerRadius:existing.cornerRadius}:{})});notice.textContent='位置已生成；提交前可逐行修改或删除。';}catch(error){notice.textContent=error.message;}}));
  table.addEventListener('paste',event=>{const raw=event.clipboardData?.getData('text/plain')||'';if(!/[\r\n]/.test(raw))return;event.preventDefault();try{for(const item of parsePositionRows(raw,mode))row(item);notice.textContent='已追加粘贴的多行位置。';}catch(error){notice.textContent=error.message;}});
  host.append(heading,help,table,controls,notice);original.after(host);
  try{const initial=mode==='multiPocket'?JSON.parse(textarea.value):parsePositionRows(textarea.value,mode);for(const item of initial)row(Array.isArray(item)?{x:item[0],y:item[1],z:item[2]}:item);}catch{row();}
}
