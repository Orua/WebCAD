import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {validateProfile} from '../src/profile-model.js';

const rectangle=(width=40,height=30)=>({profileVersion:1,entities:[
  {id:'bottom',type:'line',startMm:[0,0],endMm:[width,0]},
  {id:'right',type:'line',startMm:[width,0],endMm:[width,height]},
  {id:'top',type:'line',startMm:[width,height],endMm:[0,height]},
  {id:'left',type:'line',startMm:[0,height],endMm:[0,0]},
],loops:[{id:'outer',edges:['bottom','right','top','left'].map(entityId=>({entityId,reversed:false}))}],regions:[{id:'region',outerLoopId:'outer',holeLoopIds:[]}],output:'face'});

test('profile validation identifies an invalid analytic entity without changing geometry',()=>{
  const bad=rectangle();bad.entities[1].endMm=[40,0];
  assert.throws(()=>validateProfile(bad),error=>error.code==='PROFILE_INVALID'&&error.path==='params.entities[1]');
  const arc=rectangle();arc.entities[1]={id:'right',type:'arc3',startMm:[40,0],midMm:[40,15],endMm:[40,30]};
  assert.throws(()=>validateProfile(arc),error=>error.path==='params.entities[1]');
});

test('exact profile face and wire remain selectable zero-solid history objects',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  try{
    const face=await kernel.rebuild({version:2,features:[{id:'p',op:'sketchProfile',params:rectangle(),refs:[]}],imports:{}});
    assert.equal(face.bodies[0].solidCount,0);
    assert.equal(face.bodies[0].faceGroups.length,1);
    assert.equal(face.bodies[0].edges.length,4);
    const wire=rectangle();wire.output='wire';
    const result=await kernel.rebuild({version:2,features:[{id:'p',op:'sketchProfile',params:wire,refs:[]}],imports:{}});
    assert.equal(result.bodies[0].solidCount,0);
    assert.equal(result.bodies[0].edges.length,4);
  }finally{kernel.dispose();}
});

test('J1 exact 40 x 30 rectangle offsets inward by 2 to a 264 mm² band',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  try{
    const result=await kernel.rebuild({version:2,features:[
      {id:'p',op:'sketchProfile',params:rectangle(),refs:[]},
      {id:'band',op:'profileOffset',params:{distanceMm:2,side:'inside',join:'intersection',output:'band'},refs:['p']},
    ],imports:{}});
    assert.equal(result.bodies.length,2);
    assert.equal(result.bodies[1].solidCount,0);
    assert.equal(result.bodies[1].faceGroups.length,1);
    const shape=kernel.activeShape('band');
    const cad=await import('replicad');
    assert.ok(Math.abs(cad.measureArea(shape)-264)<1e-5);
  }finally{kernel.dispose();}
});

test('J1 band extrudes to exact 792 mm³ and edits to 1056 mm³',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const features=[
    {id:'p',op:'sketchProfile',params:rectangle(),refs:[]},
    {id:'band',op:'profileOffset',params:{distanceMm:2,side:'inside',join:'intersection',output:'band'},refs:['p']},
    {id:'solid',op:'profileExtrude',params:{operation:'newBody',extent:'distance',distanceMm:3,direction:1},refs:['band']},
  ];
  try{
    let result=await kernel.rebuild({version:2,features,imports:{}});
    assert.equal(result.bodies.length,3);
    assert.ok(Math.abs(result.bodies.find(body=>body.id==='solid').volume-792)<1e-5);
    features[2]={...features[2],params:{...features[2].params,distanceMm:4}};
    result=await kernel.rebuild({version:2,features,imports:{}});
    assert.ok(Math.abs(result.bodies.find(body=>body.id==='solid').volume-1056)<1e-5);
  }finally{kernel.dispose();}
});

test('toPlane extrude uses a fixed world plane and explicit signed allowance',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const params={operation:'newBody',extent:'toPlane',direction:1,planePoint:[0,0,5],planeNormal:[0,0,1],allowanceMm:-1};
  try{
    let result=await kernel.rebuild({version:2,features:[{id:'p',op:'sketchProfile',params:rectangle(),refs:[]},{id:'solid',op:'profileExtrude',params,refs:['p']}],imports:{}});
    assert.ok(Math.abs(result.bodies.find(body=>body.id==='solid').volume-4800)<1e-5);
    await assert.rejects(kernel.rebuild({version:2,features:[{id:'p',op:'sketchProfile',params:rectangle(),refs:[]},{id:'solid',op:'profileExtrude',params:{...params,planeNormal:[1,0,0]},refs:['p']}],imports:{}}),/平行/);
  }finally{kernel.dispose();}
});

test('J3 concentric analytic circles keep the hole through face and solid',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const profile={profileVersion:1,entities:[{id:'outer',type:'circle',centerMm:[0,0],diameterMm:20},{id:'inner',type:'circle',centerMm:[0,0],diameterMm:12}],loops:[{id:'outer-loop',edges:[{entityId:'outer',reversed:false}]},{id:'inner-loop',edges:[{entityId:'inner',reversed:false}]}],regions:[{id:'ring',outerLoopId:'outer-loop',holeLoopIds:['inner-loop']}],output:'face'};
  try{
    const result=await kernel.rebuild({version:2,features:[{id:'ring',op:'sketchProfile',params:profile,refs:[]},{id:'solid',op:'profileExtrude',params:{operation:'newBody',extent:'distance',distanceMm:3,direction:1},refs:['ring']}],imports:{}});
    const cad=await import('replicad');
    assert.ok(Math.abs(cad.measureArea(kernel.activeShape('ring'))-64*Math.PI)<1e-5);
    assert.ok(Math.abs(result.bodies.find(body=>body.id==='solid').volume-192*Math.PI)<1e-5);
    assert.ok(Math.abs(result.bodies.find(body=>body.id==='solid').bounds.min[2])<1e-6);
    assert.ok(Math.abs(result.bodies.find(body=>body.id==='solid').bounds.max[2]-3)<1e-6,'positive means saved sketch +Z, independent of OCCT face orientation');
  }finally{kernel.dispose();}
});

test('J2 two analytic circles cut a plate through in one operation without tool bodies',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const profile={profileVersion:1,entities:[
    {id:'a',type:'circle',centerMm:[10,10],diameterMm:4},
    {id:'b',type:'circle',centerMm:[30,10],diameterMm:4},
  ],loops:[{id:'outer',edges:[{entityId:'a',reversed:false}]},{id:'outer-2',edges:[{entityId:'b',reversed:false}]}],regions:[{id:'r1',outerLoopId:'outer',holeLoopIds:[]},{id:'r2',outerLoopId:'outer-2',holeLoopIds:[]}],output:'face'};
  try{
    const result=await kernel.rebuild({version:2,features:[
      {id:'plate',op:'box',params:{width:40,depth:30,height:6},refs:[]},
      {id:'profile',op:'sketchProfile',params:profile,refs:[]},
      {id:'cut',op:'profileExtrude',params:{operation:'cut',extent:'throughSelected',direction:1},refs:['profile','plate']},
    ],imports:{}});
    assert.equal(result.bodies.length,2);
    assert.equal(result.bodies.find(body=>body.id==='cut').solidCount,1);
    assert.ok(Math.abs(result.bodies.find(body=>body.id==='cut').volume-(7200-48*Math.PI))<1e-5);
  }finally{kernel.dispose();}
});

test('J4 repaired derived face preserves the original open wire and builds a solid',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const source={profileVersion:1,output:'wire',entities:[
    {id:'a',type:'line',startMm:[0,0],endMm:[20,0]},
    {id:'b',type:'line',startMm:[20,0],endMm:[20,10]},
    {id:'c',type:'line',startMm:[20,10],endMm:[0,10]},
    {id:'d',type:'line',startMm:[0,10],endMm:[0,0.02]},
  ],loops:[],chains:[{id:'outline',edges:['a','b','c','d'].map(entityId=>({entityId,reversed:false}))}],regions:[]};
  try{
    const result=await kernel.rebuild({version:2,features:[
      {id:'wire',op:'sketchProfile',params:source,refs:[]},
      {id:'fixed',op:'profileRepair',params:{issueId:'closure:outline',maxEndpointMoveMm:0.03},refs:['wire']},
      {id:'solid',op:'profileExtrude',params:{operation:'newBody',extent:'distance',distanceMm:3,direction:1},refs:['fixed']},
    ],imports:{}});
    assert.equal(result.bodies.length,3);
    assert.equal(result.bodies.find(body=>body.id==='wire').solidCount,0);
    assert.equal(result.bodies.find(body=>body.id==='fixed').repairReport.actualMoveMm,0.02);
    assert.ok(Math.abs(result.bodies.find(body=>body.id==='solid').volume-600)<1e-5);
  }finally{kernel.dispose();}
});
