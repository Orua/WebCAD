import {cross,curveReader,dot,fail,scale,scope,sub,tuple,unit} from './exact-input.js';

function curvatureComb(shape,input,cad,oc,hold) {
  const edges=shape.edges.map(hold), edge=edges[input.edgeId];
  if (!edge) fail('FREEFORM_REFERENCE','请选择当前对象的一条精确边。');
  const {curve,first,last}=curveReader(edge,oc,hold), point=hold(new oc.gp_Pnt());
  const d=hold(new oc.gp_Vec()), dd=hold(new oc.gp_Vec()), density=input.samples??32;
  const samples=[];
  for(let i=0;i<density;i++) {
    const t=(i+.5)/density;
    curve.D2(first+(last-first)*t,point,d,dd);
    const a=tuple(d), b=tuple(dd), speedSquared=dot(a,a);
    if (!(speedSquared>1e-16)) continue;
    const curvatureVector=scale(sub(b,scale(a,dot(a,b)/speedSquared)),1/speedSquared);
    samples.push({pointMm:tuple(point),curvaturePerMm:Math.hypot(...curvatureVector),curvatureVector});
  }
  if(!samples.length)fail('FREEFORM_INSPECTION','这条边无法取到稳定的曲率采样。');
  return {edgeId:input.edgeId,samples,maxCurvaturePerMm:Math.max(...samples.map(row=>row.curvaturePerMm))};
}

function thicknessMap(shape,input,cad,oc,hold,measure) {
  const solids=shape.solids.map(hold), faces=shape.faces.map(hold);
  if(solids.length!==1)fail('FREEFORM_INSPECTION','壁厚色图需要一个封闭实体。');
  const grid=input.grid??5;
  if(grid*grid*input.faceIds.length>100)fail('FREEFORM_INSPECTION','请缩小测量范围，单次最多布置 100 个候选测点。');
  const supplied=input.direction?unit(input.direction):null;
  if(input.direction&&!supplied)fail('FREEFORM_INSPECTION','测厚方向须为非零向量。');
  const point=hold(new oc.gp_Pnt()), dU=hold(new oc.gp_Vec()), dV=hold(new oc.gp_Vec());
  const samples=[];
  let outside=0, unresolved=0;
  for(const faceId of input.faceIds) {
    const face=faces[faceId];
    if(!face)fail('FREEFORM_REFERENCE','请选择当前实体上的面。');
    const surface=hold(new oc.BRepAdaptor_Surface(face.wrapped,true));
    const u0=surface.FirstUParameter(), v0=surface.FirstVParameter();
    const uSpan=surface.LastUParameter()-u0, vSpan=surface.LastVParameter()-v0;
    const probe=hold(new cad.DistanceQuery(face));
    const sign=face.wrapped.Orientation()===oc.TopAbs_Orientation.TopAbs_REVERSED?1:-1;
    for(let i=0;i<grid;i++) for(let j=0;j<grid;j++) {
      surface.D1(u0+uSpan*(i+.5)/grid,v0+vSpan*(j+.5)/grid,point,dU,dV);
      const pointMm=tuple(point), vertex=cad.makeVertex(pointMm);
      try{
        if(probe.distanceTo(vertex)>1e-5){outside++;continue;}
      }finally{vertex.delete();}
      const normal=unit(cross(tuple(dU),tuple(dV)));
      const direction=supplied??(normal&&scale(normal,sign));
      if(!direction){unresolved++;continue;}
      let result;
      try{result=measure(pointMm,direction);}
      catch(error){if(error instanceof WebAssembly.RuntimeError)throw error;unresolved++;continue;}
      if(!(result.thicknessMm>0)){unresolved++;continue;}
      samples.push({faceId,pointMm,thicknessMm:result.thicknessMm,exitPointMm:result.exitPoint,
        outwardNormal:normal&&scale(normal,-sign)});
    }
  }
  if(!samples.length)fail('FREEFORM_INSPECTION','所选面上没有测到有效壁厚，请检查选面与测量方向。');
  const thinnest=samples.reduce((a,b)=>a.thicknessMm<=b.thicknessMm?a:b);
  return {samples,thinnest,maxThicknessMm:Math.max(...samples.map(s=>s.thicknessMm)),
    outside,unresolved,thresholdMm:input.thresholdMm??null,belowThreshold:input.thresholdMm===undefined?null:
      samples.filter(sample=>sample.thicknessMm<input.thresholdMm).length,sampleBasis:'first-contiguous-material'};
}

export function calculateSurfaceAnalysis(shape,input,cad,measure) {
  const {hold,close}=scope(), oc=cad.getOC();
  try {
    const mode=input.mode;
    let details={};
    if(mode==='zebra'){
      if(!shape.faces.map(hold).length)fail('FREEFORM_INSPECTION','斑马纹需要带曲面或平面的对象。');
      details={direction:input.zebraDirection??'vertical',density:input.stripes??18};
    }
    if(mode==='comb')details=curvatureComb(shape,input,cad,oc,hold);
    if(mode==='thickness')details=thicknessMap(shape,input,cad,oc,hold,measure);
    return {bodyId:input.bodyId,mode,...details};
  } finally {close();}
}
