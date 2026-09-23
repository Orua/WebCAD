import * as cad from 'replicad';
import { buildQuickModel } from './quick-models.js';
import { buildLogoOnPlane, buildVectorProfile } from './logo-model.js';
import { buildAdvancedLoft } from './advanced-loft.js';
import { buildCurveSweep } from './curve-sweep.js';
import { buildCurvedLogo } from './curved-logo.js';
import { buildFittedSurface } from './fitted-surface.js';
import { buildFaceThickness } from './surface-thickness.js';
import { extractPlaneSection, extractFaceBoundary } from './reference-curves.js';
import { sewFaces, surfaceTrim, diagnoseSurface } from './surface-repair.js';
import { queryShapeGeometry } from './geometry-query.js';

// This adapter owns every BRep handle; displayed topology IDs are array indices,
// not OpenCascade's transient hash codes. It is also executable in Node tests.
const dispose = value => { try { value?.delete(); } catch {} };
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
function chosenTopology(shape, type, ids) {
  const all = shape[type];
  if (!Array.isArray(ids) || !ids.length || ids.some(id => !Number.isInteger(id) || id < 0 || id >= all.length)) {
    all.forEach(dispose); throw new Error(`请选择有效的${type === 'edges' ? '边' : '面'}`);
  }
  const selected = new Set(ids); const keep = [];
  all.forEach((part, i) => selected.has(i) ? keep.push(part) : dispose(part));
  return keep;
}
export class CadKernel {
  constructor(oc) { cad.setOC(oc); this.oc = oc; this.shapes = new Map(); this.active = new Map(); this.renderCache = new Map(); this.historySignature = []; this.importsSignature = ''; this.renderVersion = 0; }
  async operation(feature, shapes, imports) {
    const p = feature.params || {}, refs = feature.refs || [];
    const sources = refs.map(id => { if (!shapes.has(id)) throw new Error(`找不到引用实体 ${id}`); return shapes.get(id); });
    const source = () => { if (sources.length !== 1) throw new Error('此操作需要选择一个实体'); return sources[0]; };
    switch (feature.op) {
      case 'quickModel': return buildQuickModel(p, cad);
      case 'advancedLoft': return buildAdvancedLoft(p,cad);
      case 'curveSweep': return buildCurveSweep(p,cad);
      case 'curvedLogo': return buildCurvedLogo(source(),p,cad);
      case 'fittedSurface': return buildFittedSurface(p,cad);
      case 'thickenFace': return buildFaceThickness(source(),p,cad);
      case 'planeSection': return extractPlaneSection(source(),{plane:p.plane||'XY',offset:p.offset??0},cad);
      case 'faceBoundary': return extractFaceBoundary(source(),p.faceId,cad);
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
        const result=source().split(planeName(p),finite(p,'offset'));
        try {
          if(!result.positive||!result.negative)throw new Error('分割平面未穿过实体内部');
          return cad.makeCompound([result.positive,result.negative]);
        } finally {dispose(result.positive);dispose(result.negative);}
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
        const shape=source(),info=this.planarFace(shape,p.faceId);let prism,vector;
        try {
          const n=info.normal,seed=Math.abs(n[0])<.9?[1,0,0]:[0,1,0];
          const dot=seed.reduce((s,v,i)=>s+v*n[i],0),projected=seed.map((v,i)=>v-dot*n[i]);
          const length=Math.hypot(...projected),x=projected.map(v=>v/length);
          const y=[n[1]*x[2]-n[2]*x[1],n[2]*x[0]-n[0]*x[2],n[0]*x[1]-n[1]*x[0]];
          const origin=info.origin.map((v,i)=>v+finite(p,'offsetX')*x[i]+finite(p,'offsetY')*y[i]);
          const depth=positive(p,'depth');
          vector=new cad.Vector(n.map(v=>v*depth*(p.mode==='engrave'?-1:1)));
          prism=cad.basicFaceExtrusion(info.face,vector);
          return buildLogoOnPlane(shape,{...p,depth,scale:positive(p,'scale',1),angle:finite(p,'angle'),x:origin[0],y:origin[1],z:origin[2],faceX:x,faceNormal:n},cad,prism);
        } finally {[info.face,prism,vector].forEach(dispose);}
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
      case 'transform': case 'copy': return applyTransform(source(), p);
      case 'mirror': return source().clone().mirror(planeName(p));
      case 'slot': {
        const shape=source(),length=positive(p,'length',20),width=positive(p,'width',6),depth=positive(p,'depth',5);
        if(length<width)throw new Error('槽总长须大于或等于槽宽');
        const direction=finite(p,'direction',1);if(![1,-1].includes(direction))throw new Error('槽方向必须为 +1 或 -1');
        const normal=axisVector(p),xDirection={X:[0,1,0],Y:[0,0,1],Z:[1,0,0]}[p.axis||'Z'];
        const center=[finite(p,'x'),finite(p,'y'),finite(p,'z')],angle=finite(p,'angle');
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
        const axis=axisVector(p).map(v=>v*direction),points=p.points;
        if(!Array.isArray(points)||points.length<1||points.length>100||points.some(point=>!Array.isArray(point)||point.length!==3||point.some(v=>!Number.isFinite(v))))throw new Error('多位置光孔须提供 1–100 个有效三维起点');
        let current=shape.clone();
        try {
          for(let index=0;index<points.length;index++){
            const tool=cad.makeCylinder(radius,depth,points[index],axis);let next;
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
      case 'hole': {
        const shape = source(), radius = positive(p, 'radius'), depth = positive(p, 'depth');
        const direction = finite(p, 'direction', 1);
        if (![1, -1].includes(direction)) throw new Error('钻孔方向必须为 +1 或 -1');
        const axis = axisVector(p).map(v => v * direction);
        const tool = cad.makeCylinder(radius, depth, [finite(p, 'x'), finite(p, 'y'), finite(p, 'z')], axis);
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
        const shape = source(), count = instanceCount(p), delta = [finite(p, 'dx'), finite(p, 'dy'), finite(p, 'dz')];
        if (delta.every(v => v === 0)) throw new Error('线性阵列的位移不能全部为 0');
        const instances = [];
        try {
          for (let i = 0; i < count; i++) instances.push(shape.clone().translate(delta.map(v => v * i)));
          return cad.makeCompound(instances);
        } finally { instances.forEach(dispose); }
      }
      case 'circularPattern': {
        const shape = source(), count = instanceCount(p), angle = positive(p, 'angle', 360), axis = axisVector(p);
        if (angle > 360) throw new Error('圆周阵列角度不能大于 360°');
        const center = [finite(p, 'cx'), finite(p, 'cy'), finite(p, 'cz')];
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
      case 'fillet': case 'chamfer': {
        const shape = source(), amount = positive(p, feature.op === 'fillet' ? 'radius' : 'distance');
        if (!p.edgeIds?.length) return shape[feature.op](amount);
        const edges = chosenTopology(shape, 'edges', p.edgeIds);
        const finder = new cad.EdgeFinder().inList(edges);
        try { return shape[feature.op]({ radius: amount, filter: finder }); } finally { dispose(finder); edges.forEach(dispose); }
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
  describe(shape, feature) {
    const mesh = shape.mesh({ tolerance: 0.08, angularTolerance: 0.15 });
    const wire = shape.meshEdges({ tolerance: 0.06, angularTolerance: 0.12 });
    const faces = shape.faces, edges = shape.edges, solids = shape.solids, bbox = shape.boundingBox;
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
      return { id: feature.id, name: feature.name || feature.id, positions: new Float32Array(mesh.vertices), normals: new Float32Array(mesh.normals), indices: new Uint32Array(mesh.triangles), faceGroups: mappedFaces, edges: mappedEdges, snapPoints, bounds: { min, max }, volume: solids.length ? Math.abs(cad.measureVolume(shape)) : null, solidCount: solids.length, surfaceDiagnostics: feature.op==='sewFaces'?diagnoseSurface(shape,cad):undefined };
    } finally { [...faces, ...edges, ...solids, bbox].forEach(dispose); }
  }
  async rebuild(document) {
    if (!document || document.version !== 1 || !Array.isArray(document.features)) throw new Error('无效的 WebCAD 工程');
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
        const keepOriginal = ['copy','planeSection','faceBoundary','surfaceTrim'].includes(feature.op) || (['mirror','extractSolid'].includes(feature.op) && feature.params?.keepOriginal !== false);
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
    } catch (error) { next.forEach((shape, id) => { if (!reused.has(id)) dispose(shape); }); throw Object.assign(new Error(error?.message || `几何内核运算失败 (${String(error)})`), { featureId: current }); }
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
      const box=shape.boundingBox,solids=shape.solids;
      try{const [min,max]=box.bounds;return {bodyId,bounds:{min,max},volume:solids.length?Math.abs(cad.measureVolume(shape)):null,solidCount:solids.length};}
      finally{dispose(box);solids.forEach(dispose);}
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

