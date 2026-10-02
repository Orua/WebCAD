import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPageAPI} from '../src/page-api.js';
import {rectangleCandidates} from '../src/viewport/rectangle-selection.js';

test('rectangle selection uses camera, visibility and explicit crossing/window semantics',()=>{
 const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,100);camera.position.set(0,0,20);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
 const entry=(min,max,visible=true)=>({root:{visible},body:{bounds:{min,max}}});
 const viewport={camera,objects:new Map([['inside',entry([-2,-2,0],[2,2,2])],['cross',entry([4,0,0],[7,3,2])],['hidden',entry([-1,-1,0],[1,1,2],false)]])};
 assert.deepEqual(rectangleCandidates(viewport,{rect:[.25,.25,.75,.75]}),['inside']);
 assert.deepEqual(rectangleCandidates(viewport,{rect:[.25,.25,.75,.75],mode:'crossing'}),['inside','cross']);
 assert.throws(()=>rectangleCandidates(viewport,{rect:[1,0,0,1]}),/框选/);
});

test('drawing resources require current model revision and expose real export bytes',async()=>{
 let revision=1,calls=0;
 const context=()=>({sessionId:'s',documentId:'d',documentInstanceId:'i',revision});
 const drawing={projection:'first',views:['front','top','side'].map(id=>({id,label:id,bounds:{min:[0,0],max:[20,10]},curves:[{kind:'line',a:[0,0],b:[20,10]}]})),dimensions:[]};
 const host={state:()=>({context:context(),summary:{kernelReady:true,busy:false},preview:{},bodies:[{id:'b'}]}),display:()=>({status:'rendered'}),createDrawing:async()=>{calls++;return drawing;},history:()=>({entries:[]})};
 host.confirmSaved=async()=>({saved:false});
 const api=createPageAPI(host),ctx=()=>api.createRequestContext();
 assert.equal((await api.createDrawing({context:ctx(),bodyIds:['gone']})).status,'failed');assert.equal(calls,0);
 const created=await api.createDrawing({context:ctx(),bodyIds:['b']});assert.equal(created.status,'generated');
 const pdf=await api.exportDrawing({context:ctx(),drawingId:created.drawingId,format:'pdf'});assert.equal(pdf.status,'generated');assert(pdf.size>500);
 const bytes=await api.files.read({resourceId:pdf.resourceId,as:'bytes'});assert(Buffer.from(bytes).subarray(0,8).toString().startsWith('%PDF-1.4'));
 assert.equal((await api.exportDrawing({context:ctx(),drawingId:created.drawingId,format:'dwg'})).error.code,'FORMAT_UNSUPPORTED');
 revision++;assert.equal((await api.exportDrawing({context:ctx(),drawingId:created.drawingId,format:'pdf'})).error.code,'STALE_REFERENCE');
 assert.equal(api.files.generated,undefined);
});
