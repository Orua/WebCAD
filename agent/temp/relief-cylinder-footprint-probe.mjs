import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import * as cad from 'replicad';
import {oc,cylinderPatch,surfaceFace} from './relief-cylinder-probe.mjs';
const dispose=x=>{try{x?.delete?.();}catch{}};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),tuple=p=>{try{return [p.X(),p.Y(),p.Z()];}finally{dispose(p);}};
function cylinderFrame(face){
 const a=new oc.BRepAdaptor_Surface(face.wrapped,true);let c,p;
 try{c=a.Cylinder();p=c.Position();return {radius:c.Radius(),origin:tuple(p.Location()),x:tuple(p.XDirection()),y:tuple(p.YDirection()),z:tuple(p.Direction())};}
 finally{[p,c,a].forEach(dispose);}
}
function testFootprint(source,{name,theta=Math.PI,zShift=0,expected}){
 const before=source.serialize(),owned=[],hold=x=>(owned.push(x),x),faces=source.faces;owned.push(...faces);
 try{
  const faceId=faces.findIndex(f=>['CYLINDRE','CYLINDER'].includes(f.geomType)&&Math.abs(cylinderFrame(f).radius-20)<1e-8);if(faceId<0)throw Error('No actual radius-20 cylinder face');
  const face=faces[faceId],frame=cylinderFrame(face),s=hold(cylinderPatch());
  const world=(x,y,z)=>frame.origin.map((v,i)=>v+x*frame.x[i]+y*frame.y[i]+z*frame.z[i]);
  for(let i=1;i<=s.NbUPoles();i++)for(let j=1;j<=s.NbVPoles();j++){
   const p=s.Pole(i,j),x=p.X(),y=p.Y(),q=new oc.gp_Pnt(...world(x*Math.cos(theta)-y*Math.sin(theta),x*Math.sin(theta)+y*Math.cos(theta),p.Z()+zShift));s.SetPole(i,j,q);[p,q].forEach(dispose);
  }
  const footprint=hold(surfaceFace(s)),anchorPoint=world(20*Math.cos(theta),20*Math.sin(theta),20+zShift),anchor=hold(cad.makeVertex(anchorPoint));
  const anchorDistance=cad.measureDistanceBetween(face,anchor),normal=hold(face.normalAt(anchorPoint)).toTuple(),radial=frame.x.map((v,i)=>v*Math.cos(theta)+frame.y[i]*Math.sin(theta));
  const edges=face.edges;owned.push(...edges);const edgeDistances=edges.map(edge=>cad.measureDistanceBetween(footprint,edge)),minimumEdgeDistance=Math.min(...edgeDistances),outward=dot(normal,radial)/Math.hypot(...normal);
  const accepted=anchorDistance<=.1&&minimumEdgeDistance>1e-5&&outward>.999;
  const record={name,expected,accepted,faceId,surfaceType:face.geomType,frame,anchorDistance,minimumEdgeDistance,outward,sourceUnchanged:source.serialize()===before};
  if(accepted!==expected||!record.sourceUnchanged)throw Object.assign(Error('footprint gate failed'),{record});return record;
 }finally{owned.reverse().forEach(dispose);}
}
export {cylinderFrame,testFootprint};
if(fileURLToPath(import.meta.url)===resolve(process.argv[1]??'')){
const owned=[],hold=x=>(owned.push(x),x),report={experimental:true,notIntegrated:true,cases:[],started:new Date().toISOString()};
try{
 const cylinder=hold(cad.makeCylinder(20,40));
 for(const c of [{name:'inside finite outer cylindrical face',expected:true},{name:'crosses seam',theta:0,expected:false},{name:'crosses axial end',zShift:15,expected:false},{name:'outside finite face',zShift:50,expected:false}])report.cases.push(testFootprint(cylinder,c));
 const rotated=hold(cad.deserializeShape(cylinder.serialize()).rotate(31,[0,0,0],[1,2,0])),moved=hold(rotated.translate([23,-17,12]));report.cases.push(testFootprint(moved,{name:'actual translated and rotated cylinder axes',expected:true}));
 const hole=hold(cad.makeCylinder(2,10,[0,15,25],[0,1,0])),pierced=hold(cad.deserializeShape(cylinder.serialize()).cut(hole));report.cases.push(testFootprint(pierced,{name:'hole entirely inside footprint away from anchor',theta:Math.PI/2,expected:false}));
 const outer=hold(cad.makeCylinder(24,40)),inner=hold(cad.makeCylinder(20,40)),tube=hold(outer.cut(inner));report.cases.push(testFootprint(tube,{name:'inner concave cylinder',expected:false}));
 report.status='passed';
}catch(error){report.status='failed';report.error={message:error.message,record:error.record};process.exitCode=1;}
finally{owned.reverse().forEach(dispose);report.finished=new Date().toISOString();fs.writeFileSync(new URL('../output/relief-cylinder-footprint-probe.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
}
