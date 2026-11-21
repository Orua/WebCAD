import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {appendProject,isFinalProject} from '../src/project-insertion.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
import {encodeMesh} from '../src/mesh/mesh-codec.js';
import {finalStateProject} from '../src/project-final-state.js';
import {decodeProject,encodeProjectV4} from '../src/project-container.js';
import {installSnapshotDelta,snapshotDelta,snapshotLeafSources} from '../src/geometry-snapshot.js';

test('mixed project insertion preserves ordered members, display properties, placements and shared geometry on reopen',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
  const sourceKernel=new CadKernel(oc),targetKernel=new CadKernel(oc),cold=new CadKernel(oc);
  const mesh=encodeMesh({positions:new Float64Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2])});
  const hash=binaryHash(mesh).slice(7);
  const source={version:4,documentId:'source',name:'Mixed',features:[
    {id:'base',op:'box',params:{width:4,depth:2,height:3},refs:[]},
    {id:'moved',op:'transform',name:'Solid',params:{x:6,y:7,z:8},refs:['base']},
    {id:'mesh',op:'import',name:'Mesh',params:{key:'mesh'},refs:[]}
  ],imports:{mesh:{format:'mesh',assetHash:hash,units:'mm'}},binaryAssets:{[hash]:mesh},hidden:[],
    appearance:{moved:'design'},surface:{moved:{opacity:.45,roughness:.2}},colors:{moved:'#617283'}};
  const before={version:2,documentId:'target',name:'Target',features:[
    {id:'existing',op:'box',params:{width:1,depth:1,height:1},refs:[]}
  ],imports:{},hidden:[]};
  const ord=Array.from({length:40},(_,i)=>'n'+i);
  const frame={sourcePoint:[0,0,0],sourceAnchor:{kind:'model-origin'},frameSnapshot:{origin:[100,0,0],quaternion:[0,0,Math.SQRT1_2,Math.SQRT1_2]}};
  try{
    await sourceKernel.rebuild(source,{deferMassProperties:true});
    const final=finalStateProject(source,sourceKernel.finalShapeSources());
    assert(isFinalProject(final));
    await targetKernel.rebuild(before);
    const candidate=structuredClone(before);
    const first=appendProject(candidate,final,{placement:frame,name:'Assembly',newId:()=>ord.shift()});
    const next=appendProject(candidate,final,{placement:frame,name:'Second assembly',newId:()=>ord.shift()});
    assert(first.addedAssetBytes>0);
    assert.equal(next.addedAssetBytes,0);
    const [group]=first.created;
    candidate.features.push({id:'copied',op:'copy',name:'Copy',params:{x:55,y:0,z:2,rz:45},refs:[group]});
    const render=await targetKernel.rebuild(candidate,{deferMassProperties:true});
    assert.deepEqual(render.bodies.map(body=>body.id),['existing',group,next.created[0],'copied']);
    const body=render.bodies.find(body=>body.id===group);
    assert.equal(body.geometryType,'assembly');
    assert.deepEqual(body.parts.map(p=>p.name),['Solid','Mesh']);
    assert.equal(body.parts[0].member.color,'#617283');
    assert.equal(body.parts[0].member.surface.opacity,.45);
    assert.equal(body.assembly.meshTriangles,1);
    const bounds=targetKernel.exactBodyBounds(targetKernel.activeShape(group));
    assert.ok(Math.abs(bounds.min[0]-91)<1e-5);
    assert.ok(Math.abs(bounds.max[2]-11)<1e-5);
    const sources=targetKernel.finalShapeSources();
    const frameContext={requestId:1,revision:0};
    const reconstructed=installSnapshotDelta(snapshotDelta(sources,[],frameContext),[],frameContext);
    const ids=snapshotLeafSources(reconstructed).filter(item=>item.format==='brep').map(item=>item.sourceHash);
    assert.equal(new Set(ids).size,2);
    const reopened=await decodeProject(encodeProjectV4(finalStateProject(candidate,reconstructed)));
    const after=await cold.rebuild(reopened,{deferMassProperties:true});
    assert.deepEqual(after.bodies.map(body=>body.id),render.bodies.map(body=>body.id));
    assert.equal(after.bodies.find(body=>body.id==='copied').parts[0].member.surface.opacity,.45);
    const baked=cold.bakeProject(reopened,{thresholdMs:0,recordHistory:false});
    assert.deepEqual(baked.baked,['existing']);
    assert.deepEqual(baked.document.imports,reopened.imports);
    const copy=structuredClone(before);
    const pieces=appendProject(copy,final,{projectMode:'parts',placement:frame,scale:2,name:'Parts',newId:()=>ord.shift()});
    const parts=await targetKernel.rebuild(copy,{deferMassProperties:true});
    assert.equal(parts.bodies.length,3);
    assert.equal(copy.surface[pieces.created[0]].opacity,.45);
    assert.ok(Math.abs(targetKernel.exactBodyBounds(targetKernel.activeShape(pieces.created[0])).max[2]-22)<1e-5);
  }finally{sourceKernel.dispose();targetKernel.dispose();cold.dispose();}
});
