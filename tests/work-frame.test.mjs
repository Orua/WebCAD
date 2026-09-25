import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {createReferenceSystem,resolvePlacement,worldPoint,validateReferenceSystem,validateResolvedPlacement} from '../src/work-frame.js';
import {applyReferenceAction} from '../src/reference-contracts.js';
import {QUICK_MODELS} from '../src/quick-models.js';

const close=(actual,expected)=>assert(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
let referenceSystem=createReferenceSystem();
referenceSystem=applyReferenceAction(referenceSystem,'reference.setWorkFrame',{origin:[100,50,0],quaternion:[0,0,0,1]});
const positionOnly=applyReferenceAction(referenceSystem,'reference.resetWorkFrame',{scope:'position'});
assert.deepEqual(positionOnly.workFrame.origin,[0,0,0]);
assert.equal(positionOnly.workFrame.sourceLabel,'世界原点');
const orientationOnly=applyReferenceAction(applyReferenceAction(referenceSystem,'reference.setWorkFrame',{origin:[100,50,0],quaternion:[0,0,Math.SQRT1_2,Math.SQRT1_2]}),'reference.resetWorkFrame',{scope:'orientation'});
assert.deepEqual(orientationOnly.workFrame.origin,[100,50,0]);
assert.deepEqual(orientationOnly.workFrame.quaternion,[0,0,0,1]);
assert.equal(orientationOnly.workFrame.sourceLabel,'手动设置');
const savedSystem=applyReferenceAction(referenceSystem,'reference.saveFrame',{name:'安装面',frame:{origin:[100,50,6],quaternion:[0,0,0,1]}});
assert.equal(validateReferenceSystem(savedSystem).savedFrames[0].name,'安装面');
assert.throws(()=>validateReferenceSystem({...savedSystem,savedFrames:[{...savedSystem.savedFrames[0],quaternion:[0,0,0,2]}]}),{code:'FRAME_INVALID'});
assert.throws(()=>validateReferenceSystem({...savedSystem,savedFrames:[savedSystem.savedFrames[0],savedSystem.savedFrames[0]]}),{code:'FRAME_INVALID'});
const boxParams={width:40,depth:30,height:6};
const boxPlacement=resolvePlacement({version:1,frame:{kind:'work',expectedFrameVersion:referenceSystem.workFrame.frameVersion},sourceAnchor:{kind:'bottom-center'}},referenceSystem,'box',boxParams);
assert.deepEqual(boxPlacement.sourcePoint,[20,15,0]);
assert.deepEqual(validateResolvedPlacement(boxPlacement,'box'),boxPlacement);
assert.throws(()=>validateResolvedPlacement({...boxPlacement,frameSnapshot:{origin:[100,50,0],quaternion:[0,0,0,2]}},'box'),{code:'FRAME_INVALID'});
assert.throws(()=>resolvePlacement({version:1,frame:{kind:'work',expectedFrameVersion:1}},referenceSystem,'box',boxParams),{code:'STALE_REFERENCE'});
const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const box={id:'plate',name:'plate',op:'box',params:boxParams,refs:[],placement:boxPlacement};
const holePlacement=resolvePlacement({version:1,frame:{kind:'snapshot',origin:[100,50,6],quaternion:[0,0,0,1]},sourceAnchor:{kind:'model-origin'}},referenceSystem,'hole',{radius:2,depth:3});
const hole={id:'hole',name:'hole',op:'hole',params:{radius:2,depth:3,x:0,y:0,z:0,axis:'Z',direction:-1},refs:['plate'],placement:holePlacement};
const document={version:2,features:[box,hole],imports:{},hidden:[],referenceSystem};
let result=await kernel.rebuild(document);
assert.equal(result.bodies.length,1);
result.bodies[0].bounds.min.forEach((v,i)=>close(v,[80,35,0][i]));
result.bodies[0].bounds.max.forEach((v,i)=>close(v,[120,65,6][i]));
close(result.bodies[0].volume,7200-12*Math.PI);
const moved=applyReferenceAction(referenceSystem,'reference.setWorkFrame',{origin:[300,200,10],quaternion:[0,0,0,1]});
result=await kernel.rebuild({...document,referenceSystem:moved});
result.bodies[0].bounds.min.forEach((v,i)=>close(v,[80,35,0][i]));
close(result.bodies[0].volume,7200-12*Math.PI);
const q=[0,Math.sin(Math.PI/8),0,Math.cos(Math.PI/8)];
const slanted=resolvePlacement({version:1,frame:{kind:'snapshot',origin:[10,20,30],quaternion:q}},referenceSystem,'box',boxParams);
assert.deepEqual(worldPoint(slanted.frameSnapshot,[0,0,0]),[10,20,30]);
result=await kernel.rebuild({...document,features:[{...box,placement:slanted}]});
assert.equal(result.bodies.length,1);
close(result.bodies[0].volume,7200);
const tiltedHole={...hole,placement:resolvePlacement({version:1,frame:{kind:'snapshot',origin:worldPoint(slanted.frameSnapshot,[20,15,6]),quaternion:q}},referenceSystem,'hole',hole.params)};
result=await kernel.rebuild({...document,features:[{...box,placement:slanted},tiltedHole]});
close(result.bodies[0].volume,7200-12*Math.PI);
const toolFrame={version:1,frame:{kind:'snapshot',origin:worldPoint(slanted.frameSnapshot,[20,15,6]),quaternion:q}};
for(const [op,params,expected] of [
  ['multiHole',{radius:2,depth:3,axis:'Z',direction:-1,points:[[0,0,0],[10,0,0]]},7200-24*Math.PI],
  ['slot',{length:20,width:6,depth:2,x:0,y:0,z:0,axis:'Z',direction:-1,angle:0},7200-2*(84+9*Math.PI)],
  ['multiPocket',{depth:2,axis:'Z',direction:-1,pockets:[{x:0,y:0,z:0,width:6,height:4},{x:10,y:0,z:0,width:6,height:4}]},7200-96],
  ['multiBoss',{radius:2,height:3,axis:'Z',direction:1,points:[[0,0,0],[10,0,0]]},7200+24*Math.PI],
]){
  const placement=resolvePlacement(toolFrame,referenceSystem,op,params);
  result=await kernel.rebuild({...document,features:[{...box,placement:slanted},{id:op,name:op,op,params,refs:['plate'],placement}]});
  close(result.bodies.find(b=>b.id===op).volume,expected);
}
const cylinder={id:'cylinder',name:'cylinder',op:'cylinder',params:{radius:5,height:12},refs:[],placement:resolvePlacement({version:1,frame:{kind:'snapshot',origin:[25,-10,3],quaternion:[0,0,0,1]},sourceAnchor:{kind:'bottom-center'}},referenceSystem,'cylinder',{radius:5,height:12})};
result=await kernel.rebuild({...document,features:[cylinder]});
result.bodies[0].bounds.min.forEach((v,i)=>close(v,[20,-15,3][i]));
result.bodies[0].bounds.max.forEach((v,i)=>close(v,[30,-5,15][i]));
await kernel.rebuild({...document,features:[box]});let topFace=-1;for(let i=0;i<6;i++)if(kernel.faceInfo('plate',i).normal[2]>.99)topFace=i;
const faceParams={faceId:topFace,point:[0,0,0],radius:2,depth:3,through:false};
const facePlacement=resolvePlacement({version:1,frame:{kind:'snapshot',origin:[100,50,6],quaternion:[0,0,0,1]}},referenceSystem,'faceHole',faceParams);
result=await kernel.rebuild({...document,features:[box,{id:'face-hole',name:'face-hole',op:'faceHole',params:faceParams,refs:['plate'],placement:facePlacement}]});
close(result.bodies[0].volume,7200-12*Math.PI);
const wrongFacePlacement=resolvePlacement({version:1,frame:{kind:'snapshot',origin:[100,50,6],quaternion:q}},referenceSystem,'faceHole',faceParams);
await assert.rejects(kernel.rebuild({...document,features:[box,{id:'face-hole',name:'face-hole',op:'faceHole',params:faceParams,refs:['plate'],placement:wrongFacePlacement}]}),{code:'FRAME_SURFACE_MISMATCH'});
const mirrorPlacement=resolvePlacement({version:1,frame:{kind:'snapshot',origin:[130,0,0],quaternion:[0,0,0,1]}},referenceSystem,'mirror',{plane:'YZ'});
result=await kernel.rebuild({...document,features:[box,{id:'mirrored',name:'mirrored',op:'mirror',params:{plane:'YZ'},refs:['plate'],placement:mirrorPlacement}]});
const mirrored=result.bodies.find(b=>b.id==='mirrored');
mirrored.bounds.min.forEach((v,i)=>close(v,[140,35,0][i]));
mirrored.bounds.max.forEach((v,i)=>close(v,[180,65,6][i]));
const z90=[0,0,Math.SQRT1_2,Math.SQRT1_2];
const patternPlacement=resolvePlacement({version:1,frame:{kind:'snapshot',origin:[0,0,0],quaternion:z90}},referenceSystem,'linearPattern',{dx:10,dy:0,dz:0,count:2});
result=await kernel.rebuild({...document,features:[box,{id:'pattern',name:'pattern',op:'linearPattern',params:{dx:10,dy:0,dz:0,count:2},refs:['plate'],placement:patternPlacement}]});
const patterned=result.bodies.find(b=>b.id==='pattern');
patterned.bounds.min.forEach((v,i)=>close(v,[80,35,0][i]));
patterned.bounds.max.forEach((v,i)=>close(v,[120,75,6][i]));
const splitPlacement=resolvePlacement({version:1,frame:{kind:'snapshot',origin:[100,0,0],quaternion:[0,0,0,1]}},referenceSystem,'split',{plane:'YZ',offset:0});
result=await kernel.rebuild({...document,features:[box,{id:'split',name:'split',op:'split',params:{plane:'YZ',offset:0},refs:['plate'],placement:splitPlacement}]});
assert.equal(result.bodies.find(b=>b.id==='split').solidCount,2);
const sectionPlacement=resolvePlacement({version:1,frame:{kind:'snapshot',origin:[0,0,3],quaternion:[0,0,0,1]}},referenceSystem,'planeSection',{plane:'XY',offset:0});
result=await kernel.rebuild({...document,features:[box,{id:'section',name:'section',op:'planeSection',params:{plane:'XY',offset:0},refs:['plate'],placement:sectionPlacement}]});
assert(result.bodies.find(b=>b.id==='section').edges.length>0);
const movePlacement=resolvePlacement({version:1,frame:{kind:'snapshot',origin:[0,0,0],quaternion:z90}},referenceSystem,'transform',{mode:'translate',delta:[10,0,0]});
result=await kernel.rebuild({...document,features:[box,{id:'translated',name:'translated',op:'transform',params:{mode:'translate',delta:[10,0,0]},refs:['plate'],placement:movePlacement}]});
result.bodies[0].bounds.min.forEach((v,i)=>close(v,[80,45,0][i]));
const toPoint=resolvePlacement({version:1,frame:{kind:'snapshot',origin:[300,0,0],quaternion:[0,0,0,1]},sourceAnchor:{kind:'bounds-center'}},referenceSystem,'transform',{mode:'toPoint',targetPoint:[0,0,0],orientation:'preserve'});
result=await kernel.rebuild({...document,features:[box,{id:'toPoint',name:'toPoint',op:'transform',params:{mode:'toPoint',targetPoint:[0,0,0],orientation:'preserve'},refs:['plate'],placement:toPoint}]});
result.bodies[0].bounds.min.forEach((v,i)=>close(v,[280,-15,-3][i]));
const copyParams={mode:'translate',delta:[10,0,0]};
const copyPlacement=resolvePlacement({version:1,frame:{kind:'snapshot',origin:[0,0,0],quaternion:z90}},referenceSystem,'copy',copyParams);
result=await kernel.rebuild({...document,features:[box,{id:'copy',op:'copy',name:'copy',params:copyParams,refs:['plate'],placement:copyPlacement}]});
assert.equal(result.bodies.length,2);
result.bodies.find(b=>b.id==='copy').bounds.min.forEach((v,i)=>close(v,[80,45,0][i]));
const profileParams={regions:[{outer:[[-5,-5],[5,-5],[5,5],[-5,5]],holes:[]}],x:0,y:0,z:0,scale:1,angle:0,plane:'XY',output:'face'};
const profileFeature={id:'profile',op:'vectorProfile',name:'profile',params:profileParams,refs:[]};
const referenceParams={direction:[1,0,0],distance:3},referenceFrame={version:1,frame:{kind:'snapshot',origin:[0,0,0],quaternion:[0,Math.SQRT1_2,0,Math.SQRT1_2]}};
const referencePlacement=resolvePlacement(referenceFrame,referenceSystem,'referenceExtrude',referenceParams);
result=await kernel.rebuild({...document,features:[profileFeature,{id:'reference-solid',op:'referenceExtrude',name:'reference-solid',params:referenceParams,refs:['profile'],placement:referencePlacement}]});
close(result.bodies.find(b=>b.id==='reference-solid').volume,300);
result.bodies.find(b=>b.id==='reference-solid').bounds.min.forEach((v,i)=>close(v,[-5,-5,-3][i]));
await kernel.rebuild({...document,features:[box]});
let logoTop=-1;for(let i=0;i<6;i++)if(kernel.faceInfo('plate',i).normal[2]>.99)logoTop=i;
const logoTarget=await kernel.logoTarget('plate',logoTop);
const logoParams={faceId:logoTop,placementVersion:2,point:[0,0,0],mode:'engrave',depth:.3,draftAngle:0,scale:1,angle:0,offsetX:0,offsetY:0,regions:[{outer:[[-2,-1],[2,-1],[2,1],[-2,1]],holes:[]}],targetSurfaceType:logoTarget.geomType,targetFaceArea:logoTarget.areaMm2,targetFaceCenter:logoTarget.center,targetFaceSignature:logoTarget.stableFaceSignature,targetGeometryFingerprint:logoTarget.geometryFingerprint};
const logoFrame={version:1,frame:{kind:'snapshot',origin:[100,50,6],quaternion:z90}};
const logoPlacement=resolvePlacement(logoFrame,referenceSystem,'logo',logoParams);
result=await kernel.rebuild({...document,features:[box,{id:'logo',op:'logo',name:'logo',params:logoParams,refs:['plate'],placement:logoPlacement}]});
close(result.bodies.find(b=>b.id==='logo').volume,7200-2.4);
const creatorCases=[
  ['sphere',{radius:7}],
  ['cone',{radius1:8,radius2:3,height:11}],
  ['torus',{majorRadius:12,minorRadius:2}],
  ['extrude',{profile:'rectangle',plane:'XY',width:16,depth:9,height:4}],
  ['revolve',{profile:'rectangle',plane:'XY',width:3,depth:7,offset:9,angle:360}],
  ['sweep',{profile:'circle',radius:1,points:[[0,0,0],[0,0,10],[8,0,10]]}],
  ['loft',{profile:'rectangle',width:12,depth:8,endWidth:9,endDepth:6,height:10,offsetX:2,offsetY:1}],
  ['arcProfile',{outer:[{type:'line',points:[[0,0],[10,0]]},{type:'line',points:[[10,0],[10,5]]},{type:'line',points:[[10,5],[0,5]]},{type:'line',points:[[0,5],[0,0]]}],holes:[],height:3}],
  ['quickModel',{...QUICK_MODELS.ring.defaults,kind:'ring'}],
  ['vectorProfile',{regions:[{outer:[[-6,-4],[6,-4],[6,4],[-6,4]],holes:[]}],x:0,y:0,z:0,scale:1,angle:0,plane:'XY',output:'solid',height:3}],
  ['curveSweep',{pathType:'arc',points:[[10,0,0],[Math.SQRT1_2*10,Math.SQRT1_2*10,0],[0,10,0]],radius:1,section:'round'}],
  ['advancedLoft',{sections:[{z:0,points:[[0,0],[10,0],[10,8],[0,8]]},{z:10,points:[[1,1],[9,1],[9,7],[1,7]]}],output:'solid',ruled:true}],
  ['fittedSurface',{points:Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>[i*5,j*5,Math.sin(i)*Math.cos(j)])),tolerance:0.01}],
];
for(const [op,params] of creatorCases){
  const feature={id:'created',op,name:op,params,refs:[]};
  const base=(await kernel.rebuild({...document,features:[feature]})).bodies[0];
  const placement=resolvePlacement({version:1,frame:{kind:'snapshot',origin:[300,400,500],quaternion:z90}},referenceSystem,op,params);
  const placed=(await kernel.rebuild({...document,features:[{...feature,placement}]})).bodies[0];
  const expectedMin=[300-base.bounds.max[1],400+base.bounds.min[0],500+base.bounds.min[2]];
  const expectedMax=[300-base.bounds.min[1],400+base.bounds.max[0],500+base.bounds.max[2]];
  placed.bounds.min.forEach((v,i)=>close(v,expectedMin[i]));
  placed.bounds.max.forEach((v,i)=>close(v,expectedMax[i]));
  if(base.solidCount)close(placed.volume,base.volume);
}
kernel.dispose();
console.log('PASS work frame snapshots, rotated C/T creators, exact BRep volume, spatial transform, mirror/split/section planes and pattern vector');
