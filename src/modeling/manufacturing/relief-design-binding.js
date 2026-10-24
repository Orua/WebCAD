// Strict physical binding between a retained numerical relief-design fit and an
// existing planar relief feature. The binding is part of feature.params, so it
// is saved in the recipe and participates in recipe/cache fingerprints.
// Rebuild never re-runs the fit: params.values+depthMm+regions are authoritative
// and this module only re-derives and checks them against the stored binding.
import {analyzeDesignMask} from '../../relief-design-core/closed-mesh.mjs';
import {binaryHash,contractHash} from '../../contracts/operation-schema.js';
import {classifyComplexity} from '../../services/execution-router.js';

import {RELIEF_DESIGN_BINDING_VERSION,RELIEF_DESIGN_MASK_GENERATOR,RELIEF_DESIGN_MASK_OPTIONS,RELIEF_DESIGN_BINDING_SCHEMA} from './relief-design-binding-schema.js';
export {RELIEF_DESIGN_BINDING_VERSION,RELIEF_DESIGN_MASK_GENERATOR,RELIEF_DESIGN_MASK_OPTIONS,RELIEF_DESIGN_BINDING_SCHEMA};
export const bindingError=(code,message,path='params.designBinding')=>{throw Object.assign(new Error(message),{code,path,recovery:'READ_STATE_AND_REPLAN'});};
const fail=(message,path)=>bindingError('RELIEF_DESIGN_BINDING_INVALID',message,path);
export function encodeU8(bytes){return typeof Buffer!=='undefined'?Buffer.from(bytes).toString('base64'):btoa(String.fromCharCode(...bytes));}
export function decodeU8(text,length,path){
 let bytes;try{bytes=typeof Buffer!=='undefined'?new Uint8Array(Buffer.from(text,'base64')):Uint8Array.from(atob(text),c=>c.charCodeAt(0));}catch{fail('设计绑定掩码编码无效',path);}
 if(bytes.length!==length||bytes.some(v=>v!==0&&v!==1))fail('设计绑定掩码长度或取值无效',path);
 return bytes;
}
export const sha=bytes=>binaryHash(bytes).slice(7);
export const controlsSha256=(values,depthMm,mode)=>contractHash({values,depthMm,mode}).slice(7);
export const regionsSha256=regions=>contractHash(regions).slice(7);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};

// Exactly the same in-plane basis relief.js derives from the face normal.
export function reliefFaceAxes(normal){const seed=Math.abs(normal[0])<.9?[1,0,0]:[0,1,0],x=unit(seed.map((v,i)=>v-dot(seed,normal)*normal[i]));return {x,y:cross(normal,x)};}
export function placementToReliefOffsets(centerMm,normal,originMm,xDirection){
 const {x,y}=reliefFaceAxes(normal),d=originMm.map((v,i)=>v-centerMm[i]);
 return {offsetX:dot(d,x),offsetY:dot(d,y),angleDeg:Math.atan2(dot(xDirection,y),dot(xDirection,x))*180/Math.PI};
}

// Original fit masks are row0=-Y; analyzeDesignMask expects row0=+Y (same flip
// as relief-design-field.js). Only exactly collinear grid vertices are removed.
export function regionsFromActiveMask({columns,rows,widthMm,heightMm},active){
 const flipped=new Uint8Array(columns*rows);
 for(let j=0;j<rows;j++)for(let i=0;i<columns;i++)flipped[j*columns+i]=active[(rows-1-j)*columns+i];
 let analysis;
 try{analysis=analyzeDesignMask({columns,rows,widthMm,depthMm:heightMm},flipped);}
 catch(error){bindingError('RELIEF_DESIGN_MASK_BLOCKED','拟合保留域无法形成单一连通轮廓：'+error.message,'fit.sourceMasks.active');}
 const simplify=loop=>loop.filter((p,k)=>{const a=loop[(k+loop.length-1)%loop.length],b=loop[(k+1)%loop.length];return !(a[0]===p[0]&&p[0]===b[0]||a[1]===p[1]&&p[1]===b[1]);});
 const norm=loop=>simplify(loop).map(([x,y])=>[x/widthMm,y/heightMm]);
 const outer=analysis.loops.filter(l=>l.signedAreaMm2>0),holes=analysis.loops.filter(l=>l.signedAreaMm2<0);
 const regions=[{outer:norm(outer[0].pointsMm),holes:holes.map(l=>norm(l.pointsMm))}];
 const vertices=regions[0].outer.length+regions[0].holes.reduce((s,h)=>s+h.length,0);
 return {regions,vertexCount:vertices,holeCount:holes.length,report:analysis.report};
}
export function reliefDesignComplexity(params){return classifyComplexity({operation:'relief',params});}

// Trusted planar support facts, read with the same calls relief.js uses.
export function readPlanarSupport(shape,faceId,cad,planarFace){
 const faces=shape.faces,solids=shape.solids;
 try{
  const face=faces[faceId];if(!face)bindingError('STALE_REFERENCE','目标面已失效，请重新选择','params.faceId');
  const plane=planarFace(face,cad);let center,normal;
  if(plane){const c=face.center;try{center=c.toTuple();}finally{c.delete?.();}const n=face.normalAt(center);try{normal=unit(n.toTuple());}finally{n.delete?.();}}
  return {faceId,planar:!!plane,solidCount:solids.length,faceCount:faces.length,centerMm:center??null,normal:normal??null};
 }finally{faces.forEach(f=>f.delete?.());solids.forEach(s=>s.delete?.());}
}

const close=(a,b,tol)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=tol);
// Called by CadKernel before buildRelief whenever params.designBinding exists.
export function verifyReliefDesignBinding(p,{sourceSha256,support}){
 const b=p.designBinding;if(!b)return null;
 if(p.layers||p.strokes||p.sculpt||p.localPatches||!p.values||!p.regions)fail('拟合绑定浮雕只接受单层控制网格与保留域轮廓，不能混入分层、刻线或精修','params');
 for(const [key,value]of Object.entries(RELIEF_DESIGN_MASK_OPTIONS))if(p[key]!==value)fail(`拟合绑定浮雕要求显式 ${key}=${value}，不允许改用其他轮廓策略`,'params.'+key);
 if(!sourceSha256||sourceSha256!==b.support.sourceSha256)bindingError('RELIEF_DESIGN_SOURCE_CHANGED','来源实体已变化，拟合绑定失效；请重新选择支撑面并重新准备','params.designBinding.support.sourceSha256');
 if(p.faceId!==b.support.faceId)fail('选面与拟合绑定不一致','params.faceId');
 if(!support?.planar||support.solidCount!==1)bindingError('RELIEF_DESIGN_SUPPORT_INVALID','拟合绑定需要单个有效实体上的真实平面','params.faceId');
 if(!close(support.centerMm,b.support.centerMm,1e-7)||!close(support.normal,b.support.normal,1e-9))bindingError('RELIEF_DESIGN_SOURCE_CHANGED','支撑面位置或法向已变化，拒绝重新绑定旧面','params.designBinding.support');
 const n=b.support.normal,{originMm,xDirection}=b.placement;
 if(Math.abs(dot(originMm.map((v,i)=>v-b.support.centerMm[i]),n))>1e-6)fail('图案中心不在支撑平面上','params.designBinding.placement.originMm');
 if(Math.abs(Math.hypot(...xDirection)-1)>1e-9||Math.abs(dot(xDirection,n))>1e-9)fail('图案X方向必须是支撑面内的单位切向','params.designBinding.placement.xDirection');
 const o=placementToReliefOffsets(b.support.centerMm,n,originMm,xDirection);
 if(Math.abs((p.offsetX??0)-o.offsetX)>1e-9||Math.abs((p.offsetY??0)-o.offsetY)>1e-9||Math.abs((p.angleDeg??0)-o.angleDeg)>1e-9)fail('浮雕偏移/旋转与绑定的放置不一致','params.offsetX');
 const f=b.field,count=f.columns*f.rows;
 if(p.widthMm!==f.widthMm||p.heightMm!==f.heightMm)fail('浮雕尺寸与拟合场尺寸不一致','params.widthMm');
 const active=decodeU8(f.active,count,'params.designBinding.field.active'),fixed=decodeU8(f.fixedMask,count,'params.designBinding.field.fixedMask');
 if(sha(active)!==f.activeSha256||sha(fixed)!==f.fixedMaskSha256)fail('保留域/固定掩码哈希不一致','params.designBinding.field');
 const c=b.controls;
 if(p.values.length!==c.rows||p.values.some(r=>r.length!==c.columns))fail('控制网格尺寸与绑定不一致','params.values');
 if((p.mode??'emboss')!==c.mode)fail('浮雕方向与拟合方向不一致','params.mode');
 const locked=decodeU8(c.locked,c.columns*c.rows,'params.designBinding.controls.locked');
 if(sha(locked)!==c.lockedSha256)fail('控制锁定掩码哈希不一致','params.designBinding.controls.locked');
 for(let j=0;j<c.rows;j++)for(let i=0;i<c.columns;i++)if(locked[j*c.columns+i]&&p.values[j][i]!==0)fail('受保护的锁定控制点必须保持基线（零增量）','params.values');
 if(controlsSha256(p.values,p.depthMm,c.mode)!==c.controlsSha256)fail('控制网格或深度与绑定哈希不一致','params.values');
 if(!(c.maxDeltaMm>0&&c.maxDeltaMm<=20)||p.depthMm!==Math.max(.01,c.maxDeltaMm))fail('控制深度与最大拟合增量不一致','params.depthMm');
 const derived=regionsFromActiveMask(f,active);
 if(regionsSha256(derived.regions)!==b.mask.regionsSha256||regionsSha256(p.regions)!==b.mask.regionsSha256)fail('保留域轮廓与原拟合掩码不一致','params.regions');
 const complexity=reliefDesignComplexity(p);
 // Executor routing/capacity is checked by the shared operation path, after this source binding is verified.
 return {kind:'relief-design-binding-verified',version:b.version,sourceSha256,regionsSha256:b.mask.regionsSha256,controlsSha256:c.controlsSha256,lockedControlCount:locked.reduce((s,v)=>s+v,0)};
}
