import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';

test('finite shape, point-face, parallel faces and circle-axis relations are exact read-only queries',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  try{
    await kernel.rebuild({version:2,features:[{id:'a',op:'box',params:{width:10,depth:10,height:10},refs:[]},{id:'base',op:'box',params:{width:10,depth:10,height:10},refs:[]},{id:'b',op:'transform',params:{x:10.2,y:0,z:0,rx:0,ry:0,rz:0,scale:1,positionMode:'relative'},refs:['base']},{id:'c',op:'cylinder',params:{radius:2,height:5},refs:[]}],imports:{}});
    const body=id=>({bodyId:id,kind:'body'}),separation=kernel.measureRelation({mode:'shortest',first:body('a'),second:body('b')});
    assert.ok(Math.abs(separation.distanceMm-0.2)<1e-6);assert.equal(separation.witnessPoints.length,2);
    const faces=(await kernel.queryGeometry('a','face',{})).items,top=faces.find(face=>Math.abs(face.center[2]-10)<1e-7),bottom=faces.find(face=>Math.abs(face.center[2])<1e-7),face=id=>({bodyId:'a',kind:'face',topologyId:id});
    const point=kernel.measureRelation({mode:'pointFace',pointWorld:[5,5,12],face:face(top.faceId)});assert.ok(Math.abs(point.distanceMm-2)<1e-6);
    const parallel=kernel.measureRelation({mode:'parallelFaces',first:face(bottom.faceId),second:face(top.faceId)});assert.ok(Math.abs(parallel.normalDistanceMm-10)<1e-6);assert.equal(parallel.finiteOverlap,true);
    const circleEdge=(await kernel.queryGeometry('c','edge',{})).items.find(edge=>edge.geomType==='CIRCLE'),circle={bodyId:'c',kind:'edge',topologyId:circleEdge.edgeId};
    const centers=kernel.measureRelation({mode:'centerDistance',first:circle,second:circle});assert.equal(centers.centerDistanceMm,0);
    const axis=kernel.measureRelation({mode:'axisAlignment',first:circle,second:circle});assert.equal(axis.axisAngleDeg,0);assert.equal(axis.coaxialDeviationMm,0);
  }finally{kernel.dispose();}
});
