import * as cad from 'replicad';
import {renderQuality} from './render-quality.js';
import { buildQuickModel } from './quick-models.js';
import { buildLogoOnPlane, buildVectorProfile } from './logo-model.js';
import { buildAdvancedLoft } from './advanced-loft.js';
import { buildCurveSweep } from './curve-sweep.js';
import { buildArcProfile } from './arc-profile.js';
import { buildCurvedLogo } from './curved-logo.js';
import { buildFittedSurface } from './fitted-surface.js';
import { buildFaceThickness } from './surface-thickness.js';
import { extractPlaneSection, extractFaceBoundary } from './reference-curves.js';
import { sewFaces, surfaceTrim, diagnoseSurface } from './surface-repair.js';
import { queryShapeGeometry } from './geometry-query.js';
import { logoFaceSignature } from './logo-face-signature.js';
import { buildReferenceExtrude } from './reference-profile-extrude.js';
import { buildReferenceLoft } from './reference-profile-loft.js';
import { buildSmoothTransition } from './smooth-transition.js';
import {rotateVector,worldPoint} from './work-frame.js';
import {placementPolicy} from './placement-policy.js';

// This adapter owns every BRep handle; displayed topology IDs are array indices,
// not OpenCascade's transient hash codes. It is also executable in Node tests.
const dispose = value => { try { value?.delete(); } catch {} };
function sourcePointForShape(shape,placement){if(placement.sourcePoint!==null)return placement.sourcePoint;const box=shape.boundingBox;try{const [min,max]=box.bounds;return [(min[0]+max[0])/2,(min[1]+max[1])/2,placement.sourceAnchor.kind==='bottom-center'?min[2]:(min[2]+max[2])/2];}finally{dispose(box);}}
function placeCreation(shape,placement){
  const {frameSnapshot:frame}=placement,sourcePoint=sourcePointForShape(shape,placement);
  let out=shape.translate(sourcePoint.map(v=>-v));
  const [x,y,z,w]=frame.quaternion,axisLength=Math.hypot(x,y,z);
  if(axisLength>1e-12){const rotated=out.rotate(2*Math.atan2(axisLength,w)*180/Math.PI,[0,0,0],[x/axisLength,y/axisLength,z/axisLength]);dispose(out);out=rotated;}
  const translated=out.translate(...frame.origin);dispose(out);return translated;
}
// Replicad's non-adaptive BRepGProp.VolumeProperties can misread swept
// B-spline solids by more than 0.1%. Use OCCT's adaptive Gauss-Kronrod
// integration for the body metadata and explicit measurements alike.
const preciseVolume = (shape, oc) => {
  const properties = new oc.GProp_GProps();
  try {
    const error = oc.BRepGProp.VolumePropertiesGK(shape.wrapped, properties, 1e-9, true, true, false, false, false);
    const volume = Math.abs(properties.Mass());
    if (!Number.isFinite(error) || error < 0 || !Number.isFinite(volume)) throw new Error('实体体积自适应积分失败');
    return volume;
  } finally { dispose(properties); }
};
const positive = (p, key, fallback) => {
  const n = Number(p[key] ?? fallback);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${key} 必须大于 0`);
  return n;
};
const finite = (p, key, fallback = 0) => {
  const n = Number(p[key] ?? fallback);
  if (!Number.isFinite(n)) throw new Error(`${key} 必须是有限数值`);
  return n;
};
function planeName(p) {
  const plane = p.plane || 'XY';
  if (!['XY', 'XZ', 'YZ'].includes(plane)) throw new Error('平面必须为 XY、XZ 或 YZ');
  return plane;
}
function localPlaneBasis(name){return {XY:{x:[1,0,0],normal:[0,0,1],offset:d=>[0,0,d]},XZ:{x:[1,0,0],normal:[0,-1,0],offset:d=>[0,d,0]},YZ:{x:[0,1,0],normal:[1,0,0],offset:d=>[d,0,0]}}[name];}
function axisVector(p) {
  const value = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[p.axis || 'Z'];
  if (!value) throw new Error('轴方向必须为 X、Y 或 Z');
  return value;
}
function instanceCount(p) {
  const count = finite(p, 'count', 3);
  if (!Number.isInteger(count) || count < 2 || count > 100) throw new Error('阵列数量必须是 2–100 的整数（包含原件）');
  return count;
}
function profile(p) {
  if(p.profile==='roundedRectangle') {
    const width=positive(p,'width',20),depth=positive(p,'depth',10),radius=positive(p,'cornerRadius',2);
    if(radius>=Math.min(width,depth)/2)throw new Error('圆角半径须小于矩形短边的一半');
    return cad.drawRoundedRectangle(width,depth,radius);
  }
  if(p.profile==='arc') {
    const radius=positive(p,'radius',10),start=finite(p,'startAngle',0)*Math.PI/180,end=finite(p,'endAngle',90)*Math.PI/180,delta=end-start;
    if(Math.abs(delta)<1e-8||Math.abs(delta)>=2*Math.PI-1e-8)throw new Error('圆弧扫角绝对值须大于 0 且小于 360°');
    const pt=t=>[radius*Math.cos(t),radius*Math.sin(t)],drawing=cad.draw(pt(start)).threePointsArcTo(pt(end),pt((start+end)/2));
    if((p.closure||'sector')==='sector')drawing.lineTo([0,0]);
    else if(p.closure!=='segment')throw new Error('圆弧闭合方式须为 sector 或 segment');
    return drawing.close();
  }
  if (p.profile === 'circle') return cad.drawCircle(positive(p, 'radius', 5));
  if (!p.profile || p.profile === 'rectangle') return cad.drawRectangle(positive(p, 'width', 20), positive(p, 'depth', 10));
  if (p.profile !== 'polygon') throw new Error('不支持的轮廓类型');
  const points = p.points;
  if (!Array.isArray(points) || points.length < 3 || points.length > 1000 || points.some(pt => !Array.isArray(pt) || pt.length !== 2 || pt.some(n => !Number.isFinite(n)))) throw new Error('多边形需要 3–1000 个有效坐标点');
  const pen = cad.draw(points[0]);
  for (const pt of points.slice(1)) pen.lineTo(pt);
  return pen.close();
}
function applyTransform(shape, p) {
  let out = shape.clone();
  try {
    const scale = positive(p, 'scale', 1);
    if (scale !== 1) out = out.scale(scale);
    for (const [key, axis] of [['rx', [1, 0, 0]], ['ry', [0, 1, 0]], ['rz', [0, 0, 1]]]) {
      const angle = finite(p, key); if (angle) out = out.rotate(angle, [0, 0, 0], axis);
    }
    const mode=p.positionMode??'relative';
    if(!['relative','absolute'].includes(mode))throw new Error('移动模式必须是 relative 或 absolute');
    const target=['x','y','z'].map(k=>finite(p,k));
    if(mode==='absolute'){
      if(['x','y','z'].some(k=>typeof p[k]!=='number'||!Number.isFinite(p[k])))throw new Error('绝对位置必须明确填写 X、Y、Z');
      const box=out.boundingBox;
      try{const [min,max]=box.bounds;return out.translate(...target.map((v,i)=>v-(min[i]+max[i])/2));}finally{dispose(box);}
    }
    return out.translate(...target);
  } catch (error) { dispose(out); throw error; }
}
function applySpatialTransform(shape,p,placement){
  if(!placement?.frameSnapshot)throw Object.assign(new Error('Spatial transform requires a resolved frame'),{code:'FRAME_INVALID'});
  const frame=placement.frameSnapshot,point=value=>worldPoint(frame,value),vector=value=>rotateVector(frame.quaternion,value);
  if(p.mode==='translate')return shape.clone().translate(...vector(p.delta));
  if(p.mode==='rotate'){const axis=vector(p.axisVector),length=Math.hypot(...axis);return shape.clone().rotate(p.angleDeg,point(p.pivot),axis.map(v=>v/length));}
  if(p.mode==='scale')return shape.clone().scale(p.scale,point(p.pivot));
  if(p.mode==='toPoint'){
    const source=sourcePointForShape(shape,placement),target=point(p.targetPoint);
    if((p.orientation??'preserve')==='preserve')return shape.clone().translate(...target.map((v,i)=>v-source[i]));
    let out=shape.clone().translate(...source.map(v=>-v));
    const [x,y,z,w]=frame.quaternion,length=Math.hypot(x,y,z);
    if(length>1e-12){const rotated=out.rotate(2*Math.atan2(length,w)*180/Math.PI,[0,0,0],[x/length,y/length,z/length]);dispose(out);out=rotated;}
    const positioned=out.translate(...target);dispose(out);return positioned;
  }
  throw Object.assign(new Error('Unsupported spatial transform mode'),{code:'PARAM_SCHEMA_INVALID'});
}
function chosenTopology(shape, type, ids) {
  const all = shape[type];
  if (!Array.isArray(ids) || !ids.length || ids.some(id => !Number.isInteger(id) || id < 0 || id >= all.length)) {
    all.forEach(dispose); throw new Error(`请选择有效的${type === 'edges' ? '边' : '面'}`);
  }
  const selected = new Set(ids); const keep = [];
  all.forEach((part, i) => selected.has(i) ? keep.push(part) : dispose(part));
  return keep;
}
function faceBoundaryEdges(shape, faceIds) {
  const faces=chosenTopology(shape,'faces',faceIds);
  let boundaries=[],edges=[],selected=[],success=false;
  try {
    boundaries=faces.flatMap(face=>face.edges);
    edges=shape.edges;
    selected=edges.filter(edge=>boundaries.some(boundary=>boundary.isSame(edge)));
    if(!selected.length)throw new Error('所选面没有可加工的边界边');
    success=true;
    return selected;
  }finally{
    faces.forEach(dispose);boundaries.forEach(dispose);
    edges.forEach(edge=>{if(!success||!selected.includes(edge))dispose(edge);});
  }
}
export class CadKernel {
  constructor(oc) { cad.setOC(oc); this.oc = oc; this.shapes = new Map(); this.active = new Map(); this.renderCache = new Map(); this.historySignature = []; this.importsSignature = ''; this.renderVersion = 0; }
  async operation(feature, shapes, imports) {
    const original=feature.params||{},targetFrame=feature.placement?.frameSnapshot;
    const p=targetFrame&&['faceHole','logo'].includes(feature.op)?{...original,point:worldPoint(targetFrame,original.point),frameX:rotateVector(targetFrame.quaternion,[1,0,0]),frameNormal:rotateVector(targetFrame.quaternion,[0,0,1])}:original;
    const refs = feature.refs || [];
    const frame=feature.placement?.frameSnapshot,point=value=>frame?worldPoint(frame,value):value,vector=value=>frame?rotateVector(frame.quaternion,value):value;
    const workPlane=(name,offset=0)=>{const basis=localPlaneBasis(name);return new cad.Plane(point(basis.offset(offset)),vector(basis.x),vector(basis.normal));};
    const sources = refs.map(id => { if (!shapes.has(id)) throw new Error(`找不到引用实体 ${id}`); return shapes.get(id); });
    const source = () => { if (sources.length !== 1) throw new Error('此操作需要选择一个实体'); return sources[0]; };
    switch (feature.op) {
      case 'quickModel': return buildQuickModel(p, cad, {roundAll:(shape,radius)=>buildSmoothTransition(shape,{radius,allEdges:true})});
      case 'advancedLoft': return buildAdvancedLoft(p,cad);
      case 'curveSweep': return buildCurveSweep(p,cad);
      case 'arcProfile': return buildArcProfile(p,cad);
      case 'curvedLogo': return buildCurvedLogo(source(),p,cad);
      case 'fittedSurface': return buildFittedSurface(p,cad);
      case 'thickenFace': return buildFaceThickness(source(),p,cad);
      case 'planeSection': return extractPlaneSection(source(),{plane:p.plane||'XY',offset:p.offset??0,frame},cad);
      case 'faceBoundary': return extractFaceBoundary(source(),p.faceId,cad,{boundary:p.boundary??'all'});
      case 'extractFaces': {
        const shape=source(),all=shape.faces,ids=p.faceIds;
        if(!Array.isArray(ids)||!ids.length||ids.some(id=>!Number.isInteger(id)||id<0||id>=all.length)){
          all.forEach(dispose);throw new Error('faceIds 必须是当前源对象范围内的非空面编号数组');
        }
        if(new Set(ids).size!==ids.length){all.forEach(dispose);throw new Error('faceIds 不能包含重复编号');}
        let copies=[],result;
        try{
          copies=ids.map(id=>all[id].clone());
          if(copies.length===1){result=copies[0];copies=[];return result;}
          result=cad.makeCompound(copies);
          if(!result)throw new Error('指定面提取结果为空');
          return result;
        }finally{all.forEach(dispose);copies.forEach(dispose);}
      }
      case 'extractShell': {
        const shape=source(),shells=Array.from(cad.iterTopo(shape.wrapped,'shell'),item=>cad.cast(item)),index=p.shellIndex;
        try{
          if(!Number.isInteger(index)||index<0||index>=shells.length)throw new Error(`壳序号须为 0–${shells.length-1}`);
          return shells[index].clone();
        }finally{shells.forEach(dispose);}
      }
      case 'referenceExtrude': return buildReferenceExtrude(source(),frame?{...p,direction:vector(p.direction)}:p,cad);
      case 'referenceLoft': return buildReferenceLoft(sources,p,cad);
      case 'sewFaces': return sewFaces({refs:sources,tolerance:p.tolerance??0.01,makeSolid:p.makeSolid??false},cad);
      case 'surfaceTrim': {
        if(sources.length!==2)throw new Error('修剪需要源对象和实体刀具');
        const faces=chosenTopology(sources[0],'faces',[p.faceId]);
        try{return surfaceTrim({face:faces[0],tool:sources[1],mode:p.mode==='intersect'||p.mode===undefined?'common':p.mode},cad);}
        finally{faces.forEach(dispose);}
      }
      case 'sweep': {
        const points = p.points;
        if (!Array.isArray(points) || points.length < 2 || points.length > 100 || points.some(v => !Array.isArray(v) || v.length !== 3 || v.some(n => !Number.isFinite(n)))) throw new Error('扫掠路径须为 2–100 个三维坐标点');
        const edges=[]; let wire, plane, drawing, sketch;
        try {
          for(let i=1;i<points.length;i++) {
            if(Math.hypot(...points[i].map((v,k)=>v-points[i-1][k]))<1e-6) throw new Error('扫掠路径不能包含重合的连续点');
            edges.push(cad.makeLine(points[i-1],points[i]));
          }
          wire=cad.assembleWire(edges);
          const t=points[1].map((v,k)=>v-points[0][k]),len=Math.hypot(...t),n=t.map(v=>v/len);
          const seed=Math.abs(n[0])<.9?[1,0,0]:[0,1,0],dot=seed.reduce((s,v,i)=>s+v*n[i],0),x=seed.map((v,i)=>v-dot*n[i]);
          plane=new cad.Plane(points[0],x,n); drawing=profile(p); sketch=drawing.sketchOnPlane(plane);
          return cad.genericSweep(sketch.wire,wire,{frenet:false,transitionMode:'right'});
        } finally {[sketch,drawing,plane,wire,...edges].forEach(dispose);}
      }
      case 'loft': {
        const height=finite(p,'height');if(!height)throw new Error('放样高度不能为 0');
        if(!['circle','rectangle'].includes(p.profile))throw new Error('放样截面支持圆或矩形');
        const a=profile(p),b=profile({...p,radius:p.endRadius??p.radius,width:p.endWidth??p.width,depth:p.endDepth??p.depth});
        let s1,s2;
        try {s1=a.sketchOnPlane('XY');s2=b.sketchOnPlane('XY',[finite(p,'offsetX'),finite(p,'offsetY'),height]);return s1.loftWith(s2,{ruled:true});}
        finally {[s1,s2,a,b].forEach(dispose);}
      }
      case 'split': {
        const name=planeName(p),offset=finite(p,'offset'),plane=frame?workPlane(name,offset):null;
        const result=source().split(plane||name,frame?0:offset);
        try {
          if(!result.positive||!result.negative)throw new Error('分割平面未穿过实体内部');
          return cad.makeCompound([result.positive,result.negative]);
        } finally {dispose(result.positive);dispose(result.negative);dispose(plane);}
      }
      case 'group': {
        if(sources.length<2)throw new Error('组合至少需要两个对象');
        return cad.makeCompound(sources.map(shape=>shape.clone()));
      }
      case 'extractSolid': {
        const solids=source().solids,index=finite(p,'solidIndex');
        try {if(!Number.isInteger(index)||index<0||index>=solids.length)throw new Error(`实体序号须为 0–${solids.length-1}`);return solids[index].clone();}
        finally {solids.forEach(dispose);}
      }
      case 'vectorProfile': return buildVectorProfile(p,cad);
      case 'faceHole': {
        const shape=source(),info=this.planarFace(shape,p.faceId),normal=info.normal;
        let tool,result,vertex,bbox;
        try {
          if(p.frameNormal&&p.frameNormal.reduce((sum,v,i)=>sum+v*normal[i],0)<1-1e-6)throw Object.assign(new Error('工作基准法向与目标面外法向不一致'),{code:'FRAME_SURFACE_MISMATCH'});
          const point=p.point;
          if(!Array.isArray(point)||point.length!==3||point.some(v=>!Number.isFinite(v)))throw new Error('面钻孔起点必须是有效三维坐标');
          vertex=cad.makeVertex(point);
          if(cad.measureDistanceBetween(info.face,vertex)>1e-4)throw new Error('孔中心不在所选平面有效区域内，请在实体面上选择孔中心');
          const radius=positive(p,'radius');let depth;
          if(p.through){bbox=shape.boundingBox;const [min,max]=bbox.bounds;depth=Math.hypot(...max.map((v,i)=>v-min[i]))+1;}
          else depth=positive(p,'depth');
          const epsilon=1e-4,start=point.map((v,i)=>v+normal[i]*epsilon);
          tool=cad.makeCylinder(radius,depth+epsilon,start,normal.map(v=>-v));result=shape.cut(tool);
          if(Math.abs(cad.measureVolume(shape))-Math.abs(cad.measureVolume(result))<=1e-8)throw new Error('面钻孔未切入实体');
          return result;
        } catch(error){dispose(result);throw error;}finally{[info.face,tool,vertex,bbox].forEach(dispose);}
      }
      case 'logo': {
        const shape=source();
        if(p.placementVersion===2){
          const faces=shape.faces;
          let type,area,center,signature;
          try{
            if(!Number.isInteger(p.faceId)||!faces[p.faceId])throw new Error('目标面已失效，请重新选面');
            type=faces[p.faceId].geomType;
            area=cad.measureArea(faces[p.faceId]);
            const c=faces[p.faceId].center;try{center=c.toTuple();}finally{dispose(c);}
            signature=logoFaceSignature(faces[p.faceId],cad);
          }finally{faces.forEach(dispose);}
          if(p.targetSurfaceType&&p.targetSurfaceType!==type)throw new Error('目标面类型已改变，请重新选面');
          if(p.targetFaceArea!==undefined&&Math.abs(area-p.targetFaceArea)>Math.max(1e-5,area*1e-7))throw new Error('目标面面积已改变，请重新选面');
          if(p.targetFaceCenter&&Math.hypot(...center.map((v,i)=>v-p.targetFaceCenter[i]))>1e-5)throw new Error('目标面位置已改变，请重新选面');
          if(p.targetFaceSignature&&signature!==p.targetFaceSignature)throw new Error('目标面几何已改变，请重新选面');
          if(type!=='PLANE')return buildCurvedLogo(shape,p,cad);
        }
        const info=this.planarFace(shape,p.faceId);let prism,vector,anchor,query;
        try {
          const n=info.normal,seed=p.frameX|| (Math.abs(n[0])<.9?[1,0,0]:[0,1,0]);
          if(p.frameNormal&&p.frameNormal.reduce((sum,v,i)=>sum+v*n[i],0)<1-1e-6)throw Object.assign(new Error('工作基准法向与目标面外法向不一致'),{code:'FRAME_SURFACE_MISMATCH'});
          const dot=seed.reduce((s,v,i)=>s+v*n[i],0),projected=seed.map((v,i)=>v-dot*n[i]);
          const length=Math.hypot(...projected);if(length<1e-8)throw Object.assign(new Error('工作基准 X 方向与目标面法向平行'),{code:'FRAME_SURFACE_MISMATCH'});const x=projected.map(v=>v/length);
          const y=[n[1]*x[2]-n[2]*x[1],n[2]*x[0]-n[0]*x[2],n[0]*x[1]-n[1]*x[0]];
          let center=info.origin;
          if(p.placementVersion===2){
            if(!Array.isArray(p.point)||p.point.length!==3||p.point.some(v=>!Number.isFinite(v)))throw new Error('请选择有效的 LOGO 放置点');
            anchor=cad.makeVertex(p.point);query=new cad.DistanceQuery(info.face);
            if(query.distanceTo(anchor)>.1)throw new Error('LOGO 中心不在所选平面内（允许 0.1 mm 显示网格吸附）');
            const projected=query.wrapped.PointOnShape1(1);center=[projected.X(),projected.Y(),projected.Z()];dispose(projected);
          }
          const origin=center.map((v,i)=>v+finite(p,'offsetX')*x[i]+finite(p,'offsetY')*y[i]);
          const depth=positive(p,'depth');
          vector=new cad.Vector(n.map(v=>v*depth*(p.mode==='engrave'?-1:1)));
          prism=cad.basicFaceExtrusion(info.face,vector);
          return buildLogoOnPlane(shape,{...p,depth,scale:positive(p,'scale',1),angle:finite(p,'angle'),x:origin[0],y:origin[1],z:origin[2],faceX:x,faceNormal:n},cad,prism);
        } finally {[info.face,prism,vector,anchor,query].forEach(dispose);}
      }
      case 'faceExtrude': {
        const shape=source(),info=this.planarFace(shape,p.faceId);let tool,vector;
        try {
          const height=finite(p,'height');if(!height)throw new Error('面推拉高度不能为 0');
          vector=new cad.Vector(info.normal.map(v=>v*height));tool=cad.basicFaceExtrusion(info.face,vector);
          return height>0?shape.fuse(tool):shape.cut(tool);
        } finally {[info.face,tool,vector].forEach(dispose);}
      }
      case 'box': return cad.makeBox([0, 0, 0], [positive(p, 'width'), positive(p, 'depth'), positive(p, 'height')]);
      case 'cylinder': return cad.makeCylinder(positive(p, 'radius'), positive(p, 'height'));
      case 'sphere': return cad.makeSphere(positive(p, 'radius'));
      case 'cone': {
        const r1 = finite(p, 'radius1', 10), r2 = finite(p, 'radius2', 0), h = positive(p, 'height');
        if (r1 < 0 || r2 < 0 || r1 + r2 <= 0) throw new Error('圆锥半径不能为负，且至少一个大于 0');
        if (r1 === r2) return cad.makeCylinder(r1, h);
        const pts = [[0, 0, 0], [r1, 0, 0], [r2, 0, h], [0, 0, h]].filter((pt, i, a) => i === 0 || pt.some((v, k) => v !== a[i - 1][k]));
        const face = cad.makePolygon(pts);
        try { return cad.revolution(face, [0, 0, 0], [0, 0, 1], 360); } finally { dispose(face); }
      }
      case 'torus': {
        const major = positive(p, 'majorRadius'), minor = positive(p, 'minorRadius');
        if (major <= minor) throw new Error('圆环主半径必须大于管半径');
        const drawing = cad.drawCircle(minor).translate(major, 0);
        const sketch = drawing.sketchOnPlane('XZ');
        try { return sketch.revolve([0, 0, 1], { origin: [0, 0, 0], angle: 360 }); } finally { dispose(sketch); dispose(drawing); }
      }
      case 'extrude': {
        const h = finite(p, 'height'); if (!h) throw new Error('拉伸距离不能为 0');
        const drawing = profile(p), sketch = drawing.sketchOnPlane(planeName(p));
        try { return sketch.extrude(h); } finally { dispose(sketch); dispose(drawing); }
      }
      case 'revolve': {
        const angle = positive(p, 'angle', 360); if (angle > 360) throw new Error('旋转角度不能大于 360°');
        const plane = planeName(p), drawing = profile(p).translate(finite(p, 'offset', 10), 0);
        const sketch = drawing.sketchOnPlane(plane);
        const axis = plane === 'XY' ? [0, 1, 0] : [0, 0, 1];
        try { return sketch.revolve(axis, { origin: [0, 0, 0], angle }); } finally { dispose(sketch); dispose(drawing); }
      }
      case 'import': {
        const item = imports[p.key]; if (!item || typeof item.data !== 'string') throw new Error('工程中缺少原始导入文件');
        if (item.format === 'iges') throw new Error('此内核不支持 IGES 编辑，请先在原 CAD 软件另存为 STEP');
        if (item.format === 'stl') throw new Error('STL 是三角网格，不能作为精确实体编辑；请使用 STEP 或 BREP');
        const bytes = Uint8Array.from(atob(item.data), c => c.charCodeAt(0));
        if (item.format === 'step') return (await cad.importSTEP(new Blob([bytes]))).asShape3D();
        if (item.format === 'brep') return cad.deserializeShape(new TextDecoder().decode(bytes)).asShape3D();
        throw new Error('导入格式不受支持');
      }
      case 'transform': case 'copy': return p.mode?applySpatialTransform(source(),p,feature.placement):applyTransform(source(),p);
      case 'mirror': {
        if(!frame)return source().clone().mirror(planeName(p));
        const plane=workPlane(planeName(p));try{return source().clone().mirror(plane);}finally{dispose(plane);}
      }
      case 'slot': {
        const shape=source(),length=positive(p,'length',20),width=positive(p,'width',6),depth=positive(p,'depth',5);
        if(length<width)throw new Error('槽总长须大于或等于槽宽');
        const direction=finite(p,'direction',1);if(![1,-1].includes(direction))throw new Error('槽方向必须为 +1 或 -1');
        const normal=vector(axisVector(p)),xDirection=vector({X:[0,1,0],Y:[0,0,1],Z:[1,0,0]}[p.axis||'Z']);
        const center=point([finite(p,'x'),finite(p,'y'),finite(p,'z')]),angle=finite(p,'angle');
        let drawing,plane,sketch,tool,result;
        try {
          drawing=length===width?cad.drawCircle(width/2):cad.drawRoundedRectangle(length,width,width/2);
          plane=new cad.Plane(center,xDirection,normal);sketch=drawing.sketchOnPlane(plane);
          tool=sketch.extrude(depth*direction);if(angle)tool=tool.rotate(angle,center,normal);
          const before=Math.abs(cad.measureVolume(shape));result=shape.cut(tool);
          const after=result.isNull?0:Math.abs(cad.measureVolume(result));
          if(before-after<=Math.max(1e-8,before*1e-12))throw new Error('长圆槽未切入材料，请检查起点、方向和深度');
          const complete=result;result=null;return complete;
        } finally {[result,tool,sketch,plane,drawing].forEach(dispose);}
      }
      case 'multiHole': {
        const shape=source(),radius=positive(p,'radius'),depth=positive(p,'depth'),direction=finite(p,'direction',1);
        if(![1,-1].includes(direction))throw new Error('钻孔方向必须为 +1 或 -1');
        const axis=vector(axisVector(p).map(v=>v*direction)),points=p.points;
        if(!Array.isArray(points)||points.length<1||points.length>100||points.some(point=>!Array.isArray(point)||point.length!==3||point.some(v=>!Number.isFinite(v))))throw new Error('多位置光孔须提供 1–100 个有效三维起点');
        let current=shape.clone();
        try {
          for(let index=0;index<points.length;index++){
            const tool=cad.makeCylinder(radius,depth,point(points[index]),axis);let next;
            try {
              const before=Math.abs(cad.measureVolume(current));next=current.cut(tool);
              const after=next.isNull?0:Math.abs(cad.measureVolume(next));
              if(before-after<=Math.max(1e-8,before*1e-12))throw new Error(`第 ${index+1} 个孔未切入剩余材料，请检查起点、方向、深度或重复孔位`);
              dispose(current);current=next;next=null;
            } finally {dispose(tool);dispose(next);}
          }
          const result=current;current=null;return result;
        } finally {dispose(current);}
      }
      case 'multiPocket': {
        const shape=source(),depth=positive(p,'depth'),direction=finite(p,'direction',-1),pockets=p.pockets;
        if(![1,-1].includes(direction))throw new Error('凹槽方向必须为 +1 或 -1');
        if(!Array.isArray(pockets)||pockets.length<1||pockets.length>64)throw new Error('请提供 1–64 个矩形凹槽');
        const normal=vector(axisVector(p)),xDirection=vector({X:[0,1,0],Y:[0,0,1],Z:[1,0,0]}[p.axis||'Z']);
        let current=shape.clone();
        try {
          for(let index=0;index<pockets.length;index++){
            const pocket=pockets[index];
            if(!pocket||typeof pocket!=='object'||Array.isArray(pocket))throw new Error(`第 ${index+1} 个凹槽参数无效`);
            const center=point([finite(pocket,'x'),finite(pocket,'y'),finite(pocket,'z')]);
            const width=positive(pocket,'width'),height=positive(pocket,'height'),cornerRadius=finite(pocket,'cornerRadius',0);
            if(cornerRadius<0||cornerRadius>=Math.min(width,height)/2)throw new Error(`第 ${index+1} 个凹槽圆角半径须小于短边一半`);
            let drawing,plane,sketch,tool,next;
            try {
              drawing=cornerRadius?cad.drawRoundedRectangle(width,height,cornerRadius):cad.drawRectangle(width,height);
              plane=new cad.Plane(center,xDirection,normal);sketch=drawing.sketchOnPlane(plane);
              tool=sketch.extrude(depth*direction);
              const before=Math.abs(cad.measureVolume(current));next=current.cut(tool);
              const after=next.isNull?0:Math.abs(cad.measureVolume(next));
              if(before-after<=Math.max(1e-8,before*1e-12))throw Object.assign(new Error(`第 ${index+1} 个凹槽未切入剩余材料，请检查位置、方向、深度或重复区域`),{code:'NO_MATERIAL_REMOVED'});
              dispose(current);current=next;next=null;
            } finally {[next,tool,sketch,plane,drawing].forEach(dispose);}
          }
          const result=current;current=null;return result;
        } finally {dispose(current);}
      }
      case 'multiBoss': {
        const shape=source(),radius=positive(p,'radius'),height=positive(p,'height'),direction=finite(p,'direction',1),points=p.points;
        if(![1,-1].includes(direction))throw new Error('凸台方向必须为 +1 或 -1');
        if(!Array.isArray(points)||points.length<1||points.length>64||points.some(point=>!Array.isArray(point)||point.length!==3||point.some(v=>!Number.isFinite(v))))throw new Error('请提供 1–64 个有效的凸台底面中心 XYZ');
        const normal=vector(axisVector(p).map(v=>v*direction));
        let current=shape.clone();
        try {
          for(let index=0;index<points.length;index++){
            const tool=cad.makeCylinder(radius,height,point(points[index]),normal);let builder,next;
            try {
              builder=new (cad.getOC().BRepAlgoAPI_Fuse)(current.wrapped,tool.wrapped);
              builder.Build();next=cad.cast(builder.Shape());
              const before=Math.abs(cad.measureVolume(current)),after=next.isNull?0:Math.abs(cad.measureVolume(next));
              const solids=next.solids;
              try {
                if(solids.length!==1)throw new Error(`第 ${index+1} 个凸台未与主体连成单一实体，请检查起点和方向`);
              } finally {solids.forEach(dispose);}
              if(after-before<=Math.max(1e-8,before*1e-12))throw Object.assign(new Error(`第 ${index+1} 个凸台未增加材料，请检查位置或重复凸台`),{code:'NO_MATERIAL_ADDED'});
              dispose(current);current=next;next=null;
            } finally {[next,builder,tool].forEach(dispose);}
          }
          const result=current;current=null;return result;
        } finally {dispose(current);}
      }
      case 'hole': {
        const shape = source(), radius = positive(p, 'radius'), depth = positive(p, 'depth');
        const direction = finite(p, 'direction', 1);
        if (![1, -1].includes(direction)) throw new Error('钻孔方向必须为 +1 或 -1');
        const localAxis=axisVector(p).map(v => v * direction),localPoint=[finite(p, 'x'), finite(p, 'y'), finite(p, 'z')];
        const frame=feature.placement?.frameSnapshot;
        const axis=frame?rotateVector(frame.quaternion,localAxis):localAxis;
        const point=frame?worldPoint(frame,localPoint):localPoint;
        const tool = cad.makeCylinder(radius, depth, point, axis);
        let result;
        try {
          const before = Math.abs(cad.measureVolume(shape));
          result = shape.cut(tool);
          const after = result.isNull ? 0 : Math.abs(cad.measureVolume(result));
          if (before - after <= Math.max(1e-8, before * 1e-12)) throw new Error('钻孔未切入实体，请检查起点、轴方向和深度');
          return result;
        } catch (error) { dispose(result); throw error; } finally { dispose(tool); }
      }
      case 'linearPattern': {
        const shape = source(), count = instanceCount(p), delta = vector([finite(p, 'dx'), finite(p, 'dy'), finite(p, 'dz')]);
        if (delta.every(v => v === 0)) throw new Error('线性阵列的位移不能全部为 0');
        const instances = [];
        try {
          for (let i = 0; i < count; i++) instances.push(shape.clone().translate(delta.map(v => v * i)));
          return cad.makeCompound(instances);
        } finally { instances.forEach(dispose); }
      }
      case 'circularPattern': {
        const shape = source(), count = instanceCount(p), angle = positive(p, 'angle', 360), axis = vector(axisVector(p));
        if (angle > 360) throw new Error('圆周阵列角度不能大于 360°');
        const center = point([finite(p, 'cx'), finite(p, 'cy'), finite(p, 'cz')]);
        const step = angle / (angle === 360 ? count : count - 1), instances = [];
        try {
          for (let i = 0; i < count; i++) instances.push(shape.clone().rotate(step * i, center, axis));
          return cad.makeCompound(instances);
        } finally { instances.forEach(dispose); }
      }
      case 'union': case 'cut': case 'intersect': {
        if (sources.length < 2) throw new Error('布尔操作至少需要两个实体');
        let out = sources[0].clone(); const method = { union: 'fuse', cut: 'cut', intersect: 'intersect' }[feature.op];
        try { for (const tool of sources.slice(1)) { const next = out[method](tool); dispose(out); out = next; } return out; }
        catch (error) { dispose(out); throw error; }
      }
      case 'autoRound': return buildSmoothTransition(source(),{...p,allEdges:true});
      case 'smoothTransition': return buildSmoothTransition(source(),p);
      case 'fillet': case 'chamfer': {
        const shape = source(), amount = positive(p, feature.op === 'fillet' ? 'radius' : 'distance');
        const scopes=Number(!!p.edgeIds?.length)+Number(!!p.faceIds?.length)+Number(p.allEdges===true);
        if(scopes!==1)throw new Error('圆角/倒角必须明确选择边、面边界或整个实体的全部边');
        const edges=p.allEdges===true?null:p.faceIds?.length?faceBoundaryEdges(shape,p.faceIds):chosenTopology(shape,'edges',p.edgeIds);
        if(!edges){
          try{return shape[feature.op](amount);}
          catch(error){throw Object.assign(new Error(`${feature.op==='fillet'?'圆角半径':'倒角距离'} ${amount} mm 无法用于整个实体的全部边；请减小数值或改选面/边。`,{cause:error}),{code:'GEOMETRY_INVALID',recoveryAction:'CORRECT_PARAMETERS'});}
        }
        let finder;
        try { finder = new cad.EdgeFinder().inList(edges);return shape[feature.op]({ radius: amount, filter: finder }); }
        catch(error){throw Object.assign(new Error(`${feature.op==='fillet'?'圆角半径':'倒角距离'} ${amount} mm 无法用于所选${p.faceIds?.length?'面边界':'边'}；请减小数值或缩小选择范围。`,{cause:error}),{code:'GEOMETRY_INVALID',recoveryAction:'CORRECT_PARAMETERS'});}
        finally { dispose(finder); edges.forEach(dispose); }
      }
      case 'shell': {
        const shape = source(), thickness = finite(p, 'thickness'); if (!thickness) throw new Error('抽壳厚度不能为 0');
        const faces = chosenTopology(shape, 'faces', p.faceIds);
        const finder = new cad.FaceFinder().inList(faces);
        // Replicad already negates this for OCCT: positive is an inward shell.
        try { return shape.shell({ thickness, filter: finder }); } finally { dispose(finder); faces.forEach(dispose); }
      }
      case 'remove': if (!sources.length) throw new Error('请选择要删除的实体'); return null;
      default: throw new Error(`不支持的操作：${feature.op}`);
    }
  }
  remesh(quality) {
    renderQuality(quality);
    const previous=this.quality;
    this.quality=quality;
    try {
      const bodies=[...this.active].map(([id,feature])=>{
        const body=this.describe(this.shapes.get(id),feature);
        body.renderVersion=String(++this.renderVersion);
        return body;
      });
      this.renderCache=new Map(bodies.map(body=>[body.id,{body}]));
      return {bodies,quality};
    } catch(error) {this.quality=previous;throw error;}
  }
  describe(shape, feature) {
    const quality=this.quality||'standard', settings=renderQuality(quality);
    const mesh = shape.mesh(settings);
    const wire = shape.meshEdges({ tolerance: settings.tolerance*0.75, angularTolerance: settings.angularTolerance*0.8 });
    const faces = shape.faces, edges = shape.edges, solids = shape.solids, shells=Array.from(cad.iterTopo(shape.wrapped,'shell'),item=>cad.cast(item)), bbox = shape.boundingBox;
    try {
      const faceMap = new Map(faces.map((v, i) => [v.hashCode, i])), edgeMap = new Map(edges.map((v, i) => [v.hashCode, i]));
      const [min, max] = bbox.bounds;
      const mappedFaces = mesh.faceGroups.map(g => ({ ...g, faceId: faceMap.get(g.faceId) }));
      const mappedEdges = wire.edgeGroups.map(g => ({ edgeId: edgeMap.get(g.edgeId), positions: Array.from(wire.lines.slice(g.start * 3, (g.start + g.count) * 3)) }));
      const snapPoints=[];
      edges.forEach((edge,edgeId)=>{
        for(const [type,get] of [['endpoint',()=>edge.startPoint],['endpoint',()=>edge.endPoint],['midpoint',()=>edge.pointAt(.5)]]) {
          const vector=get();try{snapPoints.push({point:vector.toTuple(),type,edgeId});}finally{dispose(vector);}
        }
        if(edge.geomType==='CIRCLE') {
          const adaptor=new this.oc.BRepAdaptor_Curve(edge.wrapped);let circle,center;
          try{circle=adaptor.Circle();center=circle.Location();snapPoints.push({point:[center.X(),center.Y(),center.Z()],type:'center',edgeId});}finally{[center,circle,adaptor].forEach(dispose);}
        }
      });
      if (mappedFaces.some(g => g.faceId === undefined) || mappedEdges.some(g => g.edgeId === undefined)) throw new Error('拓扑索引映射失败');
      return { id: feature.id, name: feature.name || feature.id, positions: new Float32Array(mesh.vertices), normals: new Float32Array(mesh.normals), indices: new Uint32Array(mesh.triangles), faceGroups: mappedFaces, edges: mappedEdges, snapPoints, bounds: { min, max }, volume: solids.length ? preciseVolume(shape,this.oc) : null, solidCount: solids.length, shellCount:shells.length, transitionReport:shape.transitionReport, surfaceDiagnostics: feature.op==='sewFaces'?diagnoseSurface(shape,cad):undefined };
    } finally { [...faces, ...edges, ...solids, ...shells, bbox].forEach(dispose); }
  }
  async rebuild(document) {
    if (!document || ![1,2].includes(document.version) || !Array.isArray(document.features)) throw new Error('无效的 WebCAD 工程');
    const next = new Map(), active = new Map(), ids = new Set(); let current;
    const importsSignature = JSON.stringify(document.imports || {});
    const features = document.features;
    const signatures = features.map(feature => JSON.stringify(feature));
    let prefix = 0;
    while (prefix < signatures.length && prefix < this.historySignature.length && signatures[prefix] === this.historySignature[prefix] && importsSignature === this.importsSignature) prefix++;
    const reused = new Set();
    const nextRenderCache = new Map();
    try {
      for (let index = 0; index < features.length; index++) {
        const feature = features[index];
        current = feature.id;
        if (!current || ids.has(current)) throw new Error('特征 ID 缺失或重复');
        ids.add(current);
        let shape;
        if (index < prefix) { shape = this.shapes.get(current); if(shape){next.set(current, shape); reused.add(current);} }
        else {
          // OCC builders can add p-curves/flags to input TShapes even on failure.
          // A cheap wrapper clone shares that topology. Isolate only committed
          // references; otherwise an unsuccessful edit corrupts the cached BRep.
          const inputs=new Map(next),copies=[];
          try {
            for(const id of new Set(feature.refs||[]))if(reused.has(id)){
              const copy=cad.deserializeShape(next.get(id).serialize());
              copies.push(copy);inputs.set(id,copy);
            }
            shape=await this.operation(feature,inputs,document.imports||{});
            if(shape&&feature.placement&&placementPolicy(feature.op)==='C'){const placed=placeCreation(shape,feature.placement);dispose(shape);shape=placed;}
          } finally {copies.forEach(dispose);}
        }
        if (shape) {
          next.set(current, shape);
          if (!reused.has(current)) {
            if (shape.isNull) throw new Error('操作生成空模型，请检查尺寸和实体交集');
            const faces = shape.faces; const hasFaces = faces.length > 0; faces.forEach(dispose);
            if (!hasFaces) {
              const edges=shape.edges; const hasEdges=edges.length>0; edges.forEach(dispose);
              if(!hasEdges)throw new Error('操作未生成有效面或曲线');
            }
            const checker = new this.oc.BRepCheck_Analyzer(shape.wrapped, true, false, false);
            try { if (!checker.IsValid()) throw new Error('操作生成无效几何，请减小参数或检查轮廓是否自交'); } finally { dispose(checker); }
          }
          active.set(current, feature);
        }
      const keepOriginal = ['copy','planeSection','faceBoundary','extractFaces','extractShell','surfaceTrim','referenceExtrude','referenceLoft'].includes(feature.op) || (['mirror','extractSolid'].includes(feature.op) && feature.params?.keepOriginal !== false);
        if (!keepOriginal) for (const id of feature.refs || []) active.delete(id);
      }
      const bodies = [...active].map(([id, feature]) => {
        current = id;
        const cached = reused.has(id) ? this.renderCache.get(id) : null;
        const body = cached ? cached.body : this.describe(next.get(id), feature);
        if (!cached) body.renderVersion = String(++this.renderVersion);
        nextRenderCache.set(id, { body });
        return body;
      });
      this.shapes.forEach((shape, id) => { if (!reused.has(id) && !next.has(id)) dispose(shape); });
      this.shapes.forEach((shape, id) => { if (next.has(id) && next.get(id) !== shape && !reused.has(id)) dispose(shape); });
      this.shapes = next; this.active = active; this.historySignature = signatures; this.importsSignature = importsSignature; this.renderCache = nextRenderCache;
      return { bodies, renderVersion: String(this.renderVersion), stats: { bodies: bodies.length, solids: bodies.reduce((n, b) => n + b.solidCount, 0), volume: bodies.reduce((n, b) => n + (b.volume || 0), 0) } };
    } catch (error) {
      next.forEach((shape, id) => { if (!reused.has(id)) dispose(shape); });
      const raw=String(error?.message||error||'');
      const descriptive=raw.replace(/\s*\[object WebAssembly\.Exception\]\s*$/,'').trim();
      const message=descriptive||'几何内核未能生成有效实体；请减小加工尺寸或缩小目标范围。原模型保持。';
      throw Object.assign(new Error(message,{cause:error}), { featureId: current, code:error?.code||'GEOMETRY_INVALID', path:error?.path, recoveryAction:error?.recoveryAction||'CORRECT_PARAMETERS' });
    }
  }
  activeShape(bodyId) {
    if(!this.active.has(bodyId))throw new Error('找不到当前实体');
    return this.shapes.get(bodyId);
  }
  planarFace(shape,faceId) {
    const all=shape.faces;
    if(!Number.isInteger(faceId)||faceId<0||faceId>=all.length){all.forEach(dispose);throw new Error('请选择有效的面');}
    const face=all[faceId];all.forEach((v,i)=>{if(i!==faceId)dispose(v);});let center,normal;
    try {
      if(face.geomType!=='PLANE')throw new Error('此操作仅支持真实平面，请选择平面面片');
      center=face.center;normal=face.normalAt();
      const coords=normal.toTuple(),length=Math.hypot(...coords);
      if(length<1e-12)throw new Error('无法确定平面法向');
      return {face,origin:center.toTuple(),normal:coords.map(v=>v/length),planar:true,area:cad.measureArea(face)};
    } catch(error){dispose(face);throw error;}finally{dispose(center);dispose(normal);}
  }
  faceInfo(bodyId,faceId) {
    const {face,...info}=this.planarFace(this.activeShape(bodyId),faceId);dispose(face);return info;
  }
  async logoTarget(bodyId,faceId){
    const shape=this.activeShape(bodyId),faces=shape.faces;
    try{
      if(!Number.isInteger(faceId)||faceId<0||!faces[faceId])throw new Error('目标面已失效，请重新选面');
      const face=faces[faceId],center=face.center;
      let point;try{point=center.toTuple();}finally{dispose(center);}
      const bytes=new TextEncoder().encode(shape.serialize()),digest=await crypto.subtle.digest('SHA-256',bytes);
      return {bodyId,faceId,geomType:face.geomType,areaMm2:cad.measureArea(face),center:point,stableFaceSignature:logoFaceSignature(face,cad),geometryFingerprint:'brep-sha256:'+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('')};
    }finally{faces.forEach(dispose);}
  }
  async queryGeometry(bodyId, kind, filter = {}) {
    const shape = this.activeShape(bodyId);
    const result = queryShapeGeometry(shape, this.oc, kind, filter);
    const bytes = new TextEncoder().encode(shape.serialize());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const geometryFingerprint = 'brep-sha256:' + Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    return { bodyId, ...result, geometryFingerprint };
  }
  measure(bodyId,topologyType,topologyId) {
    const shape=this.activeShape(bodyId);
    if(topologyType===undefined||topologyType==='body'){
      const box=shape.boundingBox,solids=shape.solids,shells=Array.from(cad.iterTopo(shape.wrapped,'shell'),item=>cad.cast(item));
      try{const [min,max]=box.bounds;return {bodyId,bounds:{min,max},volume:solids.length?preciseVolume(shape,this.oc):null,solidCount:solids.length,shellCount:shells.length};}
      finally{dispose(box);solids.forEach(dispose);shells.forEach(dispose);}
    }
    if(!['edge','face'].includes(topologyType))throw new Error('请选择边或面');
    const all=shape[topologyType==='edge'?'edges':'faces'];
    try {
      if(!Number.isInteger(topologyId)||topologyId<0||topologyId>=all.length)throw new Error('拓扑序号无效');
      const part=all[topologyId],result={bodyId,topologyType,topologyId,geomType:part.geomType};
      if(topologyType==='face'){result.area=cad.measureArea(part);return result;}
      result.length=cad.measureLength(part);
      if(part.geomType==='CIRCLE') {
        const adaptor=new this.oc.BRepAdaptor_Curve(part.wrapped);let circle;
        try{circle=adaptor.Circle();result.radius=circle.Radius();result.diameter=result.radius*2;}
        finally{dispose(circle);dispose(adaptor);}
      }
      return result;
    } finally {all.forEach(dispose);}
  }
  async export(format, ids) {
    const selected = ids === undefined ? [...this.active.keys()] : ids;
    if (!Array.isArray(selected) || !selected.length) throw new Error('没有可导出的实体');
    const shapes = selected.map(id => { if (!this.active.has(id)) throw new Error(`找不到导出实体 ${id}`); return this.shapes.get(id); });
    if (format === 'step') {
      const blob = cad.exportSTEP(shapes.map((shape, i) => ({ shape, name: this.active.get(selected[i]).name || selected[i] })), { unit: 'MM', modelUnit: 'MM' });
      return { data: new Uint8Array(await blob.arrayBuffer()), mime: 'application/step', extension: 'step' };
    }
    const combined = shapes.length > 1 ? cad.makeCompound(shapes) : shapes[0];
    try {
      if (format === 'stl') return { data: new Uint8Array(await combined.blobSTL({ binary: true, tolerance: 0.05, angularTolerance: 0.1 }).arrayBuffer()), mime: 'model/stl', extension: 'stl' };
      if (format === 'brep') return { data: combined.serialize(), mime: 'application/octet-stream', extension: 'brep' };
      throw new Error('不支持的导出格式');
    } finally { if (shapes.length > 1) dispose(combined); }
  }
  dispose() { this.shapes.forEach(dispose); this.shapes.clear(); this.active.clear(); this.renderCache.clear(); this.historySignature = []; this.importsSignature = ''; }
}

