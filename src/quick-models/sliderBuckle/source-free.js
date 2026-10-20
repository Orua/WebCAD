import {gunzipSync,strFromU8} from 'three/examples/jsm/libs/fflate.module.js';
import {binaryHash} from '../../contracts/operation-schema.js';
import source from './source-junctions.js';
import fixedSource from './source-fixed-junctions.js';

const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=(message,code='GEOMETRY_INVALID')=>{throw Object.assign(new Error(message),{code});};
// Cache immutable source bytes only. Never retain OCCT handles or document topology.
const texts=new Map();
function sourceText(cell,source){
 const key=source.sourceSha256+':'+cell.side;
 if(!texts.has(key)){
  const bytes=gunzipSync(Uint8Array.from(atob(cell.brepGzipBase64),c=>c.charCodeAt(0)));
  if(bytes.length!==cell.bytes||binaryHash(bytes)!=='sha256:'+cell.sha256)fail('源型接头的来源数据校验失败。');
  texts.set(key,strFromU8(bytes));
 }
 return texts.get(key);
}

// The supplied source's eight trimmed NURBS blends are retained exactly in two
// junction cells. Only the straight circular runs and frame corners are rebuilt.
// This is a source-shaped parametric recipe, not a general free-form fillet.
export function buildSourceFreeJunction(p,cad){
 return buildSourceJunction(p,cad,source,false);
}
export function buildSourceFixedJunction(p,cad){
 return buildSourceJunction(p,cad,fixedSource,true);
}
function buildSourceJunction(p,cad,source,fixedRadius){
 const d=Number(p.sectionSize),bar=Number(p.barDiameter),iw=Number(p.innerWidth),ih=Number(p.innerHeight),r=Number(p.innerRadius),offset=Number(p.barOffset??0);
 if(p.section!=='round'||bar!==d||![d,iw,ih,r,offset].every(Number.isFinite)||d<=0||d>100||iw<=0||ih<=0||iw>500||ih>500||r<0||Number(p.gapWidth??0)!==0)fail('源型接头需要圆线、框线与横杆等径、不开缝，且宽高不超过 500 mm。请将横杆直径设为框线直径。','PARAM_RANGE_INVALID');
 const s=d/source.sourceWireDiameterMm,a=(iw+d)/2,b=(ih+d)/2,q=r+d/2,frameY=source.sourceFrameCenterYmm*s,cutX=source.junctionCut.barAbsX*s,cutY=source.junctionCut.legAbsY*s,nodeReachX=23*s-cutX;
 if(a<=nodeReachX||a<=q||b-q-cutY<=Math.abs(offset-frameY))fail('当前尺寸容纳不下完整源型接头。请增大内宽/内高，减小框内 R 或横杆偏移；不会压扁接头。','PARAM_RANGE_INVALID');
 const oc=cad.getOC(),held=[],hold=value=>(held.push(value),value),members=[];let result;
 const member=value=>(members.push(hold(value)),value);
 try{
  for(const cell of source.cells){
   const raw=hold(cad.deserializeShape(sourceText(cell,source))),scaled=hold(raw.scale(s));
   member(scaled.translate([cell.side*(a-23*s),offset,0]));
  }
  const cylinder=(p1,p2)=>{const delta=p2.map((v,i)=>v-p1[i]),length=Math.hypot(...delta);return member(cad.makeCylinder(d/2,length,p1,delta.map(v=>v/length)));};
  cylinder([-a+nodeReachX,offset,0],[a-nodeReachX,offset,0]);
  for(const sx of [-1,1]){
   cylinder([sx*a,frameY-b+q,0],[sx*a,offset-cutY,0]);
   cylinder([sx*a,offset+cutY,0],[sx*a,frameY+b-q,0]);
  }
  for(const sy of [-1,1]){
   cylinder([-a+q,frameY+sy*b,0],[a-q,frameY+sy*b,0]);
   for(const sx of [-1,1]){
    const center=[sx*(a-q),frameY+sy*(b-q),0],start=[sx*a,center[1],0],middle=[center[0]+sx*q/Math.SQRT2,center[1]+sy*q/Math.SQRT2,0],end=[center[0],frameY+sy*b,0];
    const arc=hold(cad.makeThreePointArc(start,middle,end)),path=hold(cad.assembleWire([arc])),profile=hold(cad.assembleWire([hold(cad.makeCircle(d/2,start,[0,sy,0]))]));
    member(cad.genericSweep(profile,path,{frenet:false,transitionMode:'right'}));
   }
  }
  const sewing=hold(new oc.BRepBuilderAPI_Sewing(1e-7*Math.max(1,s),true,false,true,false));
  // Closed circular boundaries have different seam vertices. Enable edge cutting
  // so they can be matched without changing the source blend surfaces or radius.
  for(const part of members)for(const face of part.faces){hold(face);if(face.geomType!=='PLANE')sewing.Add(face.wrapped);}
  sewing.Perform();
  if(sewing.NbFreeEdges()||sewing.NbMultipleEdges())fail('源型接头边界未闭合，原工程保留。');
  const shells=Array.from(cad.iterTopo(sewing.SewedShape(),'shell'),shape=>hold(cad.cast(shape)));
  if(shells.length!==1)fail('源型接头未形成单一封闭壳，原工程保留。');
  const maker=hold(new oc.BRepBuilderAPI_MakeSolid(shells[0].wrapped));
  if(!maker.IsDone())fail('源型接头无法形成实体。');
  result=cad.cast(maker.Shape());
  const checker=hold(new oc.BRepCheck_Analyzer(result.wrapped,true,false,false));
  if(!oc.BRepLib.OrientClosedSolid(result.wrapped)||!checker.IsValid()||cad.measureVolume(result)<=0)fail('源型接头实体校验失败，原工程保留。');
  result.sourceJunctionReport={method:'preserved-source-nurbs-junctions',style:fixedRadius?'sourceFixedR':'sourceFree',sourceFile:source.sourceFile,sourceSha256:source.sourceSha256,sourceBlendFaceCount:8,uniformWireScale:s,nominalWireDiameterMm:d,sourceFrameOffsetYmm:frameY,barOffsetRelativeToFrameCenterMm:offset-frameY,localThicknessMm:(fixedRadius?4:4.147562449632122)*s,changedDimensions:'straight-runs-and-frame-corners',fixedRadius,...(fixedRadius?{radiusMm:s,sourceRadiusMm:1,radiusRule:'wireDiameter/4'}:{})};
  if(!fixedRadius)result.sourceFreeJunctionReport=result.sourceJunctionReport;
  const complete=result;result=null;return complete;
 }finally{dispose(result);held.reverse().forEach(dispose);}
}
