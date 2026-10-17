import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {createPageAPI} from '../src/page-api.js';
import {getTool} from '../src/page-api-docs.js';
import {normalizeOperationParams} from '../src/operation-registry.js';
test('public probe is read-only and bounded; a range records the actually used radius',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc),doc={version:2,imports:{},features:[{id:'body',op:'box',params:{width:20,depth:10,height:6},refs:[]}]};
  try{
    const result=await kernel.rebuild(doc),before=kernel.serializeFeatureShape('body').data.slice(),history=[...kernel.historySignature],context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:7};
    const state=()=>({context,summary:{kernelReady:true,busy:false},bodies:result.bodies,features:doc.features,selection:{bodyIds:[]},preview:{active:false}});
    const api=createPageAPI({state,fileCommand:async()=>{},confirmSaved:()=>{},probeBlendRadius:input=>kernel.probeBlendRadius(input)}),request={context:{...context,expectedRevision:7},bodyId:'body',selector:{edgesNear:{pointMm:[0,0,3],radiusMm:.1}},maxMm:10,minMm:5,stepRatio:.5};
    const receipt=await api.probeBlendRadius(request);assert.equal(receipt.status,'read',JSON.stringify(receipt));assert.equal(receipt.feasibility,'feasible');assert.equal(receipt.feasibleMaxMm,5);assert(receipt.elapsedMs<3000);assert.equal(context.revision,7);assert.deepEqual(kernel.historySignature,history);assert.deepEqual(kernel.serializeFeatureShape('body').data,before);assert(getTool({id:'probeBlendRadius'}).inputSchema);
    const params={radius:{maxMm:1,minMm:.5},selector:request.selector};normalizeOperationParams('fillet',params);
    const edited=await kernel.rebuild({...doc,features:[...doc.features,{id:'rounded',op:'fillet',params,refs:['body']}]});assert.equal(edited.bodies[0].radiusSearchReport.radiusUsedMm,1);assert(edited.bodies[0].radiusSearchReport.tried.length<=6);
    const variable=await kernel.rebuild({...doc,features:[...doc.features,{id:'variable',op:'fillet',params:{radius:.6,edgeIds:[0],blendLaw:{startRadiusMm:.6,endRadiusMm:.2}},refs:['body']}]});
    assert.equal(variable.bodies[0].blendRadiusReport.mode,'variable');
  }finally{kernel.dispose();}
});
