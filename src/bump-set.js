import * as cad from 'replicad';
import {robustUnion} from './modeling/robust-union.js';
import {initializeFaceOrigins} from './modeling/face-origins.js';
import {finishBooleanBlend} from './modeling/boolean-blend.js';
import {buildEllipsoid} from './ellipsoid.js';
export function buildBumpSet(source,params,featureId,sourceId){
  if(!Array.isArray(params.bumps)||!params.bumps.length||params.bumps.length>64)throw Object.assign(new Error('批量凸点需要1–64个球或椭球'),{code:'PARAM_SCHEMA_INVALID'});
  const tools=[],ids=[sourceId];
  try{
    for(let i=0;i<params.bumps.length;i++){
      const bump=params.bumps[i],ellipsoid=bump.radiiMm!==undefined;
      const validCenter=Array.isArray(bump.centerMm)&&bump.centerMm.length===3&&bump.centerMm.every(Number.isFinite),validRadius=ellipsoid?bump.radiusMm===undefined&&Array.isArray(bump.radiiMm)&&bump.radiiMm.length===3&&bump.radiiMm.every(v=>Number.isFinite(v)&&v>0):Number.isFinite(bump.radiusMm)&&bump.radiusMm>0;
      if(!validCenter||!validRadius)throw Object.assign(new Error(`第${i+1}个凸点需要中心和唯一的正半径或三轴半径`),{code:'PARAM_SCHEMA_INVALID'});
      const tool=ellipsoid?buildEllipsoid(bump,cad):cad.makeSphere(bump.radiusMm).translate(...bump.centerMm),id=`${featureId}:bump:${i}`;initializeFaceOrigins(tool,{id});tools.push(tool);ids.push(id);
    }
    // Keep the primitive intersection seams for the one subsequent fillet.
    // OCCT same-domain simplification can corrupt spherical trim curves in a
    // large batch, and is not needed to form this valid solid.
    const shape=robustUnion([source,...tools],{toolIds:ids,simplifyResult:false});return finishBooleanBlend(shape,params,ids);
  }finally{tools.forEach(tool=>tool.delete());}
}
