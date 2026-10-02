const fail=(message,code='PARAM_SCHEMA_INVALID')=>{throw Object.assign(new Error(message),{code});};
const at=(box,where,i)=>where==='min'?box.min[i]:where==='max'?box.max[i]:(box.min[i]+box.max[i])/2;
export function planBodyAlignment(input,bodies,referenceSystem){
 const {bodyIds,target,axes=['X','Y','Z'],sourceSide='center',targetSide='center',group=true,gapMm=[0,0,0]}=input;
 if(!Array.isArray(bodyIds)||!bodyIds.length||bodyIds.length>200||new Set(bodyIds).size!==bodyIds.length||bodyIds.some(id=>!bodies.some(b=>b.id===id)))fail('请选择当前工程中的移动实体','STALE_REFERENCE');
 if(!Array.isArray(axes)||!axes.length||new Set(axes).size!==axes.length||axes.some(a=>!['X','Y','Z'].includes(a))||![sourceSide,targetSide].every(s=>['min','center','max'].includes(s))||typeof group!=='boolean'||!Array.isArray(gapMm)||gapMm.length!==3||gapMm.some(x=>!Number.isFinite(x)))fail('对齐轴、位置或间距无效');
 if(!target||!['body','origin','anchor','point'].includes(target.kind))fail('请选择基准件、原点或基准点');
 if(Object.keys(target).some(k=>!['kind',...(target.kind==='body'?['bodyId']:target.kind==='point'?['point']:[])].includes(k)))fail('基准目标包含无效字段');
 let to;
 if(target.kind==='body'){if(bodyIds.includes(target.bodyId))fail('基准件不能同时是移动件');const body=bodies.find(b=>b.id===target.bodyId);if(!body)fail('基准件已变化','STALE_REFERENCE');to=[0,1,2].map(i=>at(body.bounds,targetSide,i));}
 else to=target.kind==='origin'?[0,0,0]:target.kind==='anchor'?referenceSystem.workFrame.origin:target.point;
 if(!Array.isArray(to)||to.length!==3||to.some(x=>!Number.isFinite(x)))fail('基准点需要三个世界坐标');
 const selected=bodyIds.map(id=>bodies.find(b=>b.id===id)),union={min:[0,1,2].map(i=>Math.min(...selected.map(b=>b.bounds.min[i]))),max:[0,1,2].map(i=>Math.max(...selected.map(b=>b.bounds.max[i])))};
 return {kind:'axis-position-alignment',axes,sourceSide,targetSide,group,targetPoint:[...to],moves:selected.map(b=>({bodyId:b.id,delta:[0,1,2].map(i=>axes.includes('XYZ'[i])?to[i]+gapMm[i]-at(group?union:b.bounds,sourceSide,i):0)}))};
}
