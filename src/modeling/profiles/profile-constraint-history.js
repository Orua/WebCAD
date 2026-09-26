import {solveProfileConstraints} from './profile-constraints.js';
import {expandProfilePrimitives} from './profile-primitives.js';

const fail=message=>{throw Object.assign(new Error(message),{code:'PROFILE_CONSTRAINT_INVALID'});};
// Freeze fixEntity at the coordinates visible when that history step is applied.
// Reusing this expanded graph later does not silently re-fix moved geometry.
export function freezeEntityConstraints(profile,constraints) {
 const expanded=expandProfilePrimitives(profile),byId=new Map(expanded.entities.map(entity=>[entity.id,entity]));
 return constraints.flatMap(constraint=>{
  if(constraint.type!=='fixEntity')return [structuredClone(constraint)];
  const entity=byId.get(constraint.entityId);if(!entity)fail('固定实体引用不存在');
  if(entity.type==='line')return ['start','end'].map((point,index)=>({...(!index&&constraint.id?{id:constraint.id}:{}),type:'fixPoint',point:{entityId:entity.id,point},positionMm:[...entity[`${point}Mm`]]}));
  if(entity.type==='circle')return [{...(constraint.id?{id:constraint.id}:{}),type:'fixPoint',point:{entityId:entity.id,point:'center'},positionMm:[...entity.centerMm]},{type:'radius',entityId:entity.id,radiusMm:entity.diameterMm/2}];
  fail('固定实体首版只支持直线和圆');
 });
}
export function constrainProfileRecipe(source,constraints) {
 if(!Array.isArray(constraints))fail('constraints 须为显式数组');
 const combined=[...source.constraints,...freezeEntityConstraints(source.profile,constraints)];
 const solved=solveProfileConstraints(source.profile,combined);
 if(!solved.success)throw Object.assign(new Error(solved.error?.message||'约束未收敛'),{code:solved.error?.code||'PROFILE_CONSTRAINT_CONFLICT',path:solved.error?.path,diagnostics:solved.diagnostics});
 return {...source,profile:solved.profile,constraints:combined,diagnostics:solved.diagnostics,primitiveConversion:solved.primitiveConversion??source.primitiveConversion,intrinsicConstraints:solved.intrinsicConstraints??source.intrinsicConstraints};
}
export function resolveProfileRecipe(features,id,seen=new Set()) {
 if(seen.has(id)||seen.size>128)fail('轮廓约束来源循环或超过128层');seen.add(id);
 const feature=features.find(item=>item.id===id);if(!feature)fail('找不到轮廓约束来源');
 if(feature.op==='sketchProfile')return {profile:structuredClone(feature.params),placement:feature.placement,sourceId:feature.id,constraints:[]};
 if(feature.op==='profileConstraints'&&feature.refs?.length===1){const source=resolveProfileRecipe(features,feature.refs[0],seen);return constrainProfileRecipe(source,feature.params.constraints);}
 fail('约束来源须为保存的绘制轮廓或其约束尺寸派生轮廓');
}
