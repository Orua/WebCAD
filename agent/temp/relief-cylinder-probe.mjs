// Experimental only: exact rational cylindrical base, deformed height poles.
// Not a product operation, no selected-face placement or finite-face guards.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=x=>{try{x?.delete?.();}catch{}};
const radius=20,z0=6,height=28,halfAngle=.7,depth=2,embed=.001;
function array(values,kind){const a=new oc[kind](1,values.length);values.forEach((v,i)=>a.SetValue(i+1,v));return a;}
function surfaceFace(surface){const m=new oc.BRepBuilderAPI_MakeFace(surface,1e-7);try{if(!m.IsDone())throw Error('face failed');return cad.cast(m.Face());}finally{dispose(m);}}
function cylinderPatch(){
 const owned=[],hold=x=>(owned.push(x),x),p=hold(new oc.NCollection_Array2_gp_Pnt(1,3,1,4)),w=hold(new oc.NCollection_Array2_double(1,3,1,4));
 try{
  for(let i=0;i<3;i++)for(let j=0;j<4;j++){
   const a=(i-1)*halfAngle,r=i===1?radius/Math.cos(halfAngle):radius,pt=new oc.gp_Pnt(r*Math.cos(a),r*Math.sin(a),z0+height*j/3);
   p.SetValue(i+1,j+1,pt);dispose(pt);w.SetValue(i+1,j+1,i===1?Math.cos(halfAngle):1);
  }
  const knots=hold(array([0,1],'NCollection_Array1_double')),u=hold(array([3,3],'NCollection_Array1_int')),v=hold(array([4,4],'NCollection_Array1_int'));
  const s=new oc.Geom_BSplineSurface(p,w,knots,knots,u,v,2,3,false,false);s.IncreaseDegree(3,3);
  for(let i=1;i<25;i++){s.InsertUKnot(i/25,1,1e-12,false);s.InsertVKnot(i/25,1,1e-12,false);}
  return s;
 }finally{owned.reverse().forEach(dispose);}
}
function sample(values,x,y){
 x=Math.max(0,Math.min(1,x))*(values[0].length-1);y=Math.max(0,Math.min(1,y))*(values.length-1);
 const i=Math.min(values[0].length-2,Math.floor(x)),j=Math.min(values.length-2,Math.floor(y)),u=x-i,v=y-j;
 return (1-v)*((1-u)*values[j][i]+u*values[j][i+1])+v*((1-u)*values[j+1][i]+u*values[j+1][i+1]);
}
function sideFace(top,bottom,alongU,index){
 const count=alongU?top.NbUPoles():top.NbVPoles(),nk=alongU?top.NbUKnots():top.NbVKnots(),owned=[],hold=x=>(owned.push(x),x);
 try{
  const poles=hold(new oc.NCollection_Array2_gp_Pnt(1,count,1,2)),weights=hold(new oc.NCollection_Array2_double(1,count,1,2));
  for(let k=1;k<=count;k++)for(let j=1;j<=2;j++){
   const u=alongU?k:index,v=alongU?index:k,source=j===1?top:bottom,p=source.Pole(u,v);poles.SetValue(k,j,p);dispose(p);weights.SetValue(k,j,source.Weight(u,v));
  }
  const knots=hold(array(Array.from({length:nk},(_,i)=>alongU?top.UKnot(i+1):top.VKnot(i+1)),'NCollection_Array1_double'));
  const mults=hold(array(Array.from({length:nk},(_,i)=>alongU?top.UMultiplicity(i+1):top.VMultiplicity(i+1)),'NCollection_Array1_int'));
  const linearKnots=hold(array([0,1],'NCollection_Array1_double')),linearMults=hold(array([2,2],'NCollection_Array1_int'));
  const surface=hold(new oc.Geom_BSplineSurface(poles,weights,knots,linearKnots,mults,linearMults,alongU?top.UDegree():top.VDegree(),1,false,false));
  return surfaceFace(surface);
 }finally{owned.reverse().forEach(dispose);}
}
function volume(shape){const props=new oc.GProp_GProps();try{oc.BRepGProp.VolumePropertiesGK(shape.wrapped,props,1e-9,true,true,false,false,false);return Math.abs(props.Mass());}finally{dispose(props);}}
function inspect(shape){const c=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false),solids=shape.solids;try{return {valid:c.IsValid(),solids:solids.length,volume:volume(shape)};}finally{dispose(c);solids.forEach(dispose);}}
function run(name,values,mode,{source:providedSource,frame,theta=0,baseMm=0}={}){
 const owned=[],hold=x=>(owned.push(x),x),start=performance.now(),sign=mode==='engrave'?-1:1,clearance=-baseMm;
 try{
  const source=providedSource??hold(cad.makeCylinder(radius,40)),before=source.serialize(),base=hold(cylinderPatch()),top=hold(new oc.Geom_BSplineSurface(base)),bottom=hold(new oc.Geom_BSplineSurface(base));
  for(let i=1;i<=base.NbUPoles();i++)for(let j=1;j<=base.NbVPoles();j++){
   const p=base.Pole(i,j),x=p.X(),y=p.Y(),z=p.Z(),h=sample(values,(Math.atan2(y,x)+halfAngle)/(2*halfAngle),(z-z0)/height)*depth-clearance;
   const t=new oc.gp_Pnt(x*(1+sign*h/radius),y*(1+sign*h/radius),z),b=new oc.gp_Pnt(x*(1-sign*embed/radius),y*(1-sign*embed/radius),z);
   top.SetPole(i,j,t);bottom.SetPole(i,j,b);[p,t,b].forEach(dispose);
  }
  let minimum=Infinity,maximum=-Infinity,baselineDeviation=0;
  for(let i=0;i<=50;i++)for(let j=0;j<=50;j++){
   const p=top.Value(i/50,j/50),b=base.Value(i/50,j/50),h=sign*(Math.hypot(p.X(),p.Y())-radius);
   minimum=Math.min(minimum,h);maximum=Math.max(maximum,h);baselineDeviation=Math.max(baselineDeviation,Math.abs(Math.hypot(b.X(),b.Y())-radius));[p,b].forEach(dispose);
  }
  const faces=[hold(surfaceFace(top)),hold(surfaceFace(bottom)),hold(sideFace(top,bottom,true,1)),hold(sideFace(top,bottom,true,top.NbVPoles())),hold(sideFace(top,bottom,false,1)),hold(sideFace(top,bottom,false,top.NbUPoles()))];
  let tool=hold(cad.makeSolid(faces));
  if(frame){
   if(Math.abs(frame.radius-radius)>1e-8)throw Error('Experimental fixture requires actual radius 20');
   const rotate=hold(new cad.Transformation().rotate(theta*180/Math.PI,[0,0,0],[0,0,1]));
   tool=hold(cad.cast(rotate.transform(tool.wrapped)));
   const mapping=hold(new cad.Transformation().coordSystemChange({origin:frame.origin,xDir:frame.x,zDir:frame.z},'reference'));
   tool=hold(cad.cast(mapping.transform(tool.wrapped)));
  }
  if(tool instanceof cad.Solid&&!oc.BRepLib.OrientClosedSolid(tool.wrapped))throw Error('tool orientation failed');const toolCheck=inspect(tool);if(!toolCheck.valid||toolCheck.solids!==1)throw Error('tool not a single valid solid');
  const sourceCopy=hold(cad.deserializeShape(before)),builder=hold(mode==='engrave'?new oc.BRepAlgoAPI_Cut(sourceCopy.wrapped,tool.wrapped):new oc.BRepAlgoAPI_Fuse(sourceCopy.wrapped,tool.wrapped));
  builder.SetFuzzyValue(1e-7);builder.Build();if(builder.HasErrors())throw Error('Boolean builder reports errors');
  const result=hold(cad.cast(builder.Shape())),after=inspect(result),delta=(after.volume-volume(source))*sign;
  const record={name,mode,elapsedMs:performance.now()-start,...after,changedMm3:delta,sourceUnchanged:source.serialize()===before,controlGrid:[top.NbUPoles(),top.NbVPoles()],sampledNormalHeightRange:[minimum,maximum],sampledBaseRadiusDeviation:baselineDeviation};
  record.baseLayerMm=baseMm;
  if(!record.valid||record.solids!==1||!record.sourceUnchanged||minimum< -clearance-1e-7||maximum>depth-clearance+1e-4||baselineDeviation>1e-7)throw Object.assign(Error('quality gate failed'),{record});
  if(name==='zero'){if(Math.abs(delta)>1e-5)throw Object.assign(Error('zero height changed cylinder'),{record});}
  else if(!(delta>1e-5))throw Object.assign(Error('no material change'),{record});
  return record;
 }finally{owned.reverse().forEach(dispose);}
}
export {oc,cylinderPatch,surfaceFace,run};
if(fileURLToPath(import.meta.url)===resolve(process.argv[1]??'')){
const inputs=JSON.parse(fs.readFileSync(new URL('relief-inputs.json',import.meta.url),'utf8'));
const cases=Array.isArray(inputs)?inputs:Object.entries(inputs).map(([name,value])=>({name,...(Array.isArray(value)?{values:value}:value)}));
const report={experimental:true,notIntegrated:true,scope:'Z-axis cylinder only; no selected-face or boundary handling',started:new Date().toISOString(),cases:[]};
try{
 for(const c of cases){const values=c.values??c.grid;for(const mode of ['emboss','engrave']){const r=run(c.name??c.file,values,mode);report.cases.push(r);console.log(JSON.stringify(r));}}
 report.cases.push(run('zero',Array.from({length:9},()=>Array(9).fill(0)),'emboss'));
 report.status='passed';
}catch(error){report.status='failed';report.error={message:error.message,record:error.record};console.error(error);process.exitCode=1;}
finally{report.finished=new Date().toISOString();fs.writeFileSync(new URL('../output/relief-cylinder-probe.json',import.meta.url),JSON.stringify(report,null,2));}
}
