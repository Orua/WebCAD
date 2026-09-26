import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import * as cad from 'replicad';

test('J7 four planar sides draft inward around fixed bottom with exact BRep and reject invalid scope',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const box={id:'box',op:'box',params:{width:20,depth:10,height:6},refs:[]};
  try{
    await kernel.rebuild({version:2,features:[box],imports:{}});
    const source=kernel.measure('box'),faces=(await kernel.queryGeometry('box','face',{})).items;
    const bottom=faces.find(face=>Math.abs(face.center[2])<1e-8),sides=faces.filter(face=>face.center[2]>1e-8&&face.center[2]<6-1e-8);
    assert.equal(sides.length,4);
    const read=kernel.inspectDraft({bodyId:'box',pullDirection:[0,0,1],thresholdDeg:2});
    assert.equal(read.faces.filter(face=>face.classification==='cap').length,2);
    assert.equal(read.faces.filter(face=>face.classification==='belowThreshold').length,4);
    const params={faceIds:sides.map(face=>face.faceId),neutralFaceId:bottom.faceId,pullDirection:[0,0,1],angleDeg:2};
    const result=await kernel.rebuild({version:2,features:[box,{id:'draft',op:'draftFaces',params,refs:['box']}],imports:{}});
    assert.equal(result.bodies.find(body=>body.id==='draft').solidCount,1);
    assert.ok(Math.abs(source.volume-1200)<1e-8);
    assert.ok(Math.abs(cad.measureVolume(kernel.shapes.get('box'))-1200)<1e-8,'draft never changes the cached source');
    assert.ok(kernel.measure('draft').volume<source.volume);
    const bounds=kernel.measure('draft').bounds;
    assert.ok(Math.abs(bounds.min[2])<1e-6&&Math.abs(bounds.max[2]-6)<1e-6);
    const draftedFaces=kernel.activeShape('draft').faces;
    try{const top=draftedFaces.find(face=>{const center=face.center;try{return Math.abs(center.toTuple()[2]-6)<1e-6;}finally{center.delete();}}),topBox=top.boundingBox;try{const [min,max]=topBox.bounds,shrink=12*Math.tan(2*Math.PI/180);assert.ok(Math.abs((max[0]-min[0])-(20-shrink))<1e-5);assert.ok(Math.abs((max[1]-min[1])-(10-shrink))<1e-5);}finally{topBox.delete();}}finally{draftedFaces.forEach(face=>face.delete());}
    await assert.rejects(kernel.rebuild({version:2,features:[box,{id:'draft',op:'draftFaces',params:{...params,faceIds:params.faceIds.slice(0,3)},refs:['box']}],imports:{}}),/四个侧面/);
    await assert.rejects(kernel.rebuild({version:2,features:[box,{id:'draft',op:'draftFaces',params:{...params,angleDeg:50},refs:['box']}],imports:{}}),/角度/);
    await assert.rejects(kernel.rebuild({version:2,features:[box,{id:'draft',op:'draftFaces',params:{...params,angleDeg:40},refs:['box']}],imports:{}}));
  }finally{kernel.dispose();}
});
