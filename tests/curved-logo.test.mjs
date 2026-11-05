import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildCurvedLogo} from '../src/curved-logo.js';
import {queryShapeGeometry} from '../src/geometry-query.js';
import {buildAdvancedLoft} from '../src/advanced-loft.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=o=>{try{o?.delete();}catch{}};
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const count=s=>{const a=s.solids;try{return a.length;}finally{a.forEach(dispose);}};
function faceId(shape,predicate){const faces=shape.faces;try{return faces.findIndex(predicate);}finally{faces.forEach(dispose);}}
const logo={outer:[[-2,-2],[2,-2],[2,2],[-2,2]],holes:[]};
const params=(source,point,regions=[logo])=>({faceId:faceId(source,f=>f.geomType!=='PLANE'),point,depth:.3,regions});
function radii(shape,type){
 const faces=shape.faces,values=[];
 try{for(const f of faces){const a=new oc.BRepAdaptor_Surface(f.wrapped,true);try{
  if(a.GetType()===oc.GeomAbs_SurfaceType[type==='cylinder'?'GeomAbs_Cylinder':'GeomAbs_Sphere']){const surface=type==='cylinder'?a.Cylinder():a.Sphere();try{values.push(surface.Radius());}finally{dispose(surface);}}
 }finally{dispose(a);}}return values;}finally{faces.forEach(dispose);}
}
function distanceToBoundary(shape,point){const faces=shape.faces,v=cad.makeVertex(point);try{return Math.min(...faces.map(f=>cad.measureDistanceBetween(f,v)));}finally{faces.forEach(dispose);dispose(v);}}
const cylinder=cad.makeCylinder(10,20),p=params(cylinder,[0,10,10]);
const engraved=buildCurvedLogo(cylinder,p,cad);
const picked=buildCurvedLogo(cylinder,{...p,point:[0,9.95,10]},cad);
near(cad.measureVolume(picked),cad.measureVolume(engraved));dispose(picked);
assert.equal(count(engraved),1);
assert.ok(radii(engraved,'cylinder').some(r=>Math.abs(r-9.7)<1e-6),'true concentric 9.7 mm bottom, not a planar pocket');
const expectedRemoved=4*Math.asin(2/10)*(10**2-9.7**2);
near(cad.measureVolume(cylinder)-cad.measureVolume(engraved),expectedRemoved);
near(distanceToBoundary(engraved,[0,-10,10]),0);
near(distanceToBoundary(engraved,[0,9.7,10]),0);
const holeLogo={...logo,holes:[[[-.5,-.5],[-.5,.5],[.5,.5],[.5,-.5]]]};
const island=buildCurvedLogo(cylinder,{...p,regions:[holeLogo]},cad);
near(distanceToBoundary(island,[0,10,10]),0);
assert.ok(cad.measureVolume(island)>cad.measureVolume(engraved),'letter island remains material');
const sphere=cad.makeSphere(10),sphereEngraved=buildCurvedLogo(sphere,params(sphere,[0,10,0]),cad);
assert.ok(radii(sphereEngraved,'sphere').some(r=>Math.abs(r-9.7)<1e-6),'sphere bottom has correct normal depth');
const bore=cad.makeCylinder(9.8,20),thin=cylinder.cut(bore);
assert.throws(()=>buildCurvedLogo(thin,params(thin,[0,10,10]),cad),/薄壁|超出/);
assert.throws(()=>buildCurvedLogo(cylinder,{...p,point:[0,10,19.5]},cad),/边界|接缝/);
assert.throws(()=>buildCurvedLogo(cylinder,{...p,point:[0,0,10]},cad),/中心不在/);
const acrossSeam=buildCurvedLogo(cylinder,{...p,point:[10,0,10]},cad);
near(cad.measureVolume(cylinder)-cad.measureVolume(acrossSeam),cad.measureVolume(cylinder)-cad.measureVolume(engraved));
assert.equal(count(acrossSeam),1);
const tinyLogo={outer:[[-.05,-.05],[.05,-.05],[.05,.05],[-.05,.05]],holes:[]};
const tiny=buildCurvedLogo(cylinder,{...p,regions:[tinyLogo],point:[10,0,10],depth:.2},cad);
assert.ok(cad.measureVolume(cylinder)-cad.measureVolume(tiny)>1e-6,'seam-centered 0.05 mm logo removes material');
const blob=cad.exportSTEP([{shape:engraved}]),read=await cad.importSTEP(blob);
assert.equal(count(read),1);near(cad.measureVolume(read),cad.measureVolume(engraved));
assert.ok(radii(read,'cylinder').some(r=>Math.abs(r-9.7)<1e-6));
const sections=[{z:0,points:[[-10,-10],[10,-10],[10,10],[-10,10]]},{z:10,points:[[-12,-12],[12,-12],[12,12],[-12,12]]},{z:20,points:[[-10,-10],[10,-10],[10,10],[-10,10]]}];
const curved=buildAdvancedLoft({sections,ruled:false},cad),faces=curved.faces;
const index=faces.findIndex(f=>f.geomType!=='PLANE');
const v=faces[index].pointOnSurface(.5,.5),point=v.toTuple();dispose(v);faces.forEach(dispose);
const freeform=buildCurvedLogo(curved,{faceId:index,point,depth:.3,regions:[logo]},cad);
assert.equal(count(freeform),1);assert.ok(cad.measureVolume(freeform)<cad.measureVolume(curved));
const sourceFaces=curved.faces,outputFaces=freeform.faces;let checkedBottom=false;
for(const f of outputFaces){const middle=f.pointOnSurface(.5,.5),vertex=cad.makeVertex(middle);const d=cad.measureDistanceBetween(sourceFaces[index],vertex);dispose(vertex);dispose(middle);
 if(Math.abs(d-.3)<1e-5){for(const u of [.25,.5,.75])for(const w of [.25,.5,.75]){const v=f.pointOnSurface(u,w),p=cad.makeVertex(v);near(cad.measureDistanceBetween(sourceFaces[index],p),.3,1e-4);dispose(p);dispose(v);}checkedBottom=true;break;}}
sourceFaces.forEach(dispose);outputFaces.forEach(dispose);assert.ok(checkedBottom,'freeform offset bottom independently measured at nine points');
const side=queryShapeGeometry(cylinder,oc,'face',{}).items.find(item=>item.geomType==='CYLINDRE');
assert.equal(side.periodicSeamAvoided,true);
assert.ok(Math.hypot(side.pointOnFace[0]-10,side.pointOnFace[1])>1,'pointOnFace leaves the +X seam');
const seamEdge=queryShapeGeometry(cylinder,oc,'edge',{}).items.find(item=>item.periodicSeam===true);
assert.ok(seamEdge,'cylinder generator is marked periodicSeam');
console.log('PASS cylinder/sphere true 0.3 depth, letter island, no rear cut, thin wall/boundary rejection, seam engrave, STEP readback, smooth loft face');
[tiny,acrossSeam,freeform,curved,read,thin,bore,sphereEngraved,sphere,island,engraved,cylinder].forEach(dispose);
