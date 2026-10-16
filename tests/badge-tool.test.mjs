import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildBadge} from '../src/modeling/manufacturing/badge-tool.js';
import {CadKernel} from '../src/cad-kernel.js';
import {buildSketchProfile} from '../src/modeling/profiles/profile-model.js';
import {normalizeOperationParams} from '../src/operation-registry.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
cad.setOC(oc);
const dispose=x=>{try{x?.delete?.();}catch{}};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const profile={profileVersion:1,entities:[{id:'r',type:'rectangle',originMm:[0,0],widthMm:30,heightMm:20}],loops:[{id:'outer',edges:[{entityId:'r',reversed:false}]}],regions:[{id:'region',outerLoopId:'outer',holeLoopIds:[]}],output:'face'};

test('single, reversed and double sided plates keep source; auto and explicit R are real fillets',()=>{
 const source=buildSketchProfile(profile,cad),before=source.serialize();
 try{
  for(const [side,direction,radiusMm,zmin,zmax] of [['single',1,0,0,2],['single',-1,.15,-2,0],['double',1,0,-1,1]]){
   const plate=buildBadge(source,{faceId:0,thicknessMm:2,side,direction,radiusMm},cad),box=plate.boundingBox;
   try{near(box.bounds[0][2],zmin);near(box.bounds[1][2],zmax);near(plate.badgeReport.radiusMm,radiusMm||.1);assert.equal(plate.badgeReport.roundedEdgeCount,12);assert.ok(cad.measureVolume(plate)<1200);assert.ok(cad.measureVolume(plate)>1190);assert.equal(source.serialize(),before);}
   finally{dispose(box);dispose(plate);}
  }
 }finally{dispose(source);}
});

test('hole rims and an inclined planar face preserve the source geometry',()=>{
 const withHole=structuredClone(profile);
 withHole.entities.push({id:'hole',type:'circle',centerMm:[15,10],diameterMm:6});
 withHole.loops.push({id:'inner',edges:[{entityId:'hole',reversed:false}]});
 withHole.regions[0].holeLoopIds=['inner'];
 const source=buildSketchProfile(withHole,cad).rotate(35,[0,0,0],[1,0,0]);
 const plate=buildBadge(source,{faceId:0,thicknessMm:2,side:'double',radiusMm:.1},cad);
 try{assert.ok(cad.measureVolume(plate)<(600-Math.PI*9)*2);assert.ok(plate.badgeReport.roundedEdgeCount>=14);near(Math.abs(plate.badgeReport.normal[1]),Math.sin(35*Math.PI/180));const faces=plate.faces;try{assert.ok(faces.some(f=>f.geomType==='CYLINDRE'));}finally{faces.forEach(dispose);}}
 finally{dispose(plate);dispose(source);}
});

test('curved faces and excessive R fail without altering the source',()=>{
 const source=buildSketchProfile(profile,cad),before=source.serialize(),sphere=cad.makeSphere(3);
 try{assert.throws(()=>buildBadge(source,{faceId:0,thicknessMm:2,radiusMm:1},cad),/小于总厚度/);assert.throws(()=>buildBadge(sphere,{faceId:0,thicknessMm:2},cad),/平面/);assert.equal(source.serialize(),before);}
 finally{dispose(source);dispose(sphere);}
});

test('strict API, rebuild/save recipe and source preservation expose the badge receipt',async()=>{
 const input=normalizeOperationParams('badge',{faceId:0,thicknessMm:2});
 assert.equal(input.side,'single');
 assert.throws(()=>normalizeOperationParams('badge',{faceId:0,thicknessMm:-2},['profile']));
 const kernel=new CadKernel(oc),doc={version:1,imports:{},features:[{id:'profile',op:'sketchProfile',params:profile,refs:[]},{id:'badge',op:'badge',params:{faceId:0,thicknessMm:2,side:'double'},refs:['profile']}]};
 const result=await kernel.rebuild(JSON.parse(JSON.stringify(doc)));
 assert.deepEqual(result.bodies.map(b=>b.id),['profile','badge']);
 const body=result.bodies.find(b=>b.id==='badge');assert.equal(body.solidCount,1);assert.equal(body.badgeReport.radiusMm,.1);assert.ok(body.indices.length>0);
});
