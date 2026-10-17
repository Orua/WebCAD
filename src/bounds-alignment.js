const axes=['x','y','z'];
const fail=()=>{throw Object.assign(new Error('包围盒对齐须指定世界轴、min/center/max 和有限目标值；不能同时指定平移或定位模式。'),{code:'PARAM_SCHEMA_INVALID',path:'params.align'});};

export function assertBoundsAlignment(params){
  if(params.align===undefined)return;
  const a=params.align;
  if(!a||Array.isArray(a)||typeof a!=='object'||Object.keys(a).length!==3||Object.keys(a).some(k=>!['axis','to','valueMm'].includes(k))||!axes.includes(a.axis)||!['min','max','center'].includes(a.to)||!Number.isFinite(a.valueMm))fail();
  if(['mode','positionMode','x','y','z','delta','targetPoint'].some(key=>Object.hasOwn(params,key)))fail();
}

export function boundsAlignment(bounds,align){
  assertBoundsAlignment({align});
  if(!Array.isArray(bounds)||bounds.length!==2||bounds.some(row=>!Array.isArray(row)||row.length!==3||row.some(v=>!Number.isFinite(v))))fail();
  const axis=axes.indexOf(align.axis),before=align.to==='center'?(bounds[0][axis]+bounds[1][axis])/2:bounds[align.to==='min'?0:1][axis];
  const delta=[0,0,0];delta[axis]=align.valueMm-before;
  return {axis:align.axis,to:align.to,valueMm:align.valueMm,beforeMm:before,deltaMm:delta,coordinateSystem:'world',source:'current-exact-brep-bounds'};
}
