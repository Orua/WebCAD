import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVisualEvidence,EVIDENCE_POLICY} from '../src/visual-evidence.js';
import {evidenceCamera,captureEvidence,evidenceDisplaySignature} from '../src/viewport/evidence-capture.js';
import {createPageAPI} from '../src/page-api.js';
import {getTool,readDocs} from '../src/page-api-docs.js';
import {AGENT_CONTRACT} from '../src/agent/protocol.js';

const context={sessionId:'p',documentId:'d',documentInstanceId:'i',revision:3};
const request=()=>({context:{sessionId:'p',documentId:'d',documentInstanceId:'i',expectedRevision:3}});
const shot=()=>({dataUrl:'data:image/png;base64,iVBORw0KGgo=',width:64,height:64,display:{detail:{approximate:true}}});
const fileHost={files:async()=>({}),confirmSaved:async()=>({saved:true})};
function fixture(options={}){
 let calls=0,signature='appearance-a',current={...context};
 const cache=createVisualEvidence({state:()=>({context:current}),signature:()=>signature,capture:()=>{calls++;return shot();},...options});
 return {cache,get calls(){return calls;},set signature(value){signature=value;},set context(value){current=value;}};
}
test('same query and concurrent readers reuse one render and exact image/hash; different view renders once',async()=>{
 const f=fixture(),[a,b]=await Promise.all([f.cache.read(request()),f.cache.read(request())]);
 assert.equal(f.calls,1);assert.equal(a.evidenceId,b.evidenceId);assert.equal(a.hash,b.hash);assert.equal(a.projection,'orthographic');
 const cached=await f.cache.read(request());assert.equal(cached.cache.reused,true);assert.equal(cached.dataUrl,a.dataUrl);assert.equal(f.calls,1);
 await assert.rejects(f.cache.read({...request(),evidenceId:a.evidenceId,viewId:'right'}),e=>e.code==='EVIDENCE_UNAVAILABLE');
 cached.context.revision=100;assert.equal((await f.cache.read(request())).context.revision,3);
 const top=await f.cache.read({...request(),viewId:'top'});assert.equal(f.calls,2);assert.equal(top.displaySignature,a.displaySignature);
 assert.equal(EVIDENCE_POLICY.automatic,'off');
});
test('historical images require their retained evidence ID, never render the current revision under an old label',async()=>{
 const f=fixture(),a=await f.cache.read(request());f.context={...context,revision:4};
 await assert.rejects(f.cache.read({...request(),viewId:'right'}),e=>e.code==='EVIDENCE_UNAVAILABLE');assert.equal(f.calls,1);
 const cached=await f.cache.read({...request(),evidenceId:a.evidenceId});assert.equal(cached.context.revision,3);assert.equal(f.calls,1);
 f.context={...context,documentInstanceId:'reopened'};
 await assert.rejects(f.cache.read(request()),e=>e.code==='INSTANCE_MISMATCH');
 const next={context:{...request().context,documentInstanceId:'reopened'}};
 await assert.rejects(f.cache.read({...next,evidenceId:a.evidenceId}),e=>e.code==='EVIDENCE_UNAVAILABLE');
});
test('display changes while encoding supersede the whole image, and retained entries are bounded',async()=>{
 let unblock;const f=fixture({hash:()=>new Promise(r=>unblock=r)}),pending=f.cache.read(request());
 await new Promise(setImmediate);f.signature='appearance-b';unblock('a'.repeat(64));
 await new Promise(setImmediate);unblock('b'.repeat(64));
 await assert.rejects(pending,e=>e.code==='EVIDENCE_SUPERSEDED');
 const g=fixture(),first=await g.cache.read(request());
 for(let i=0;i<13;i++)await g.cache.read({...request(),maxWidth:65+i});
 await assert.rejects(g.cache.read({...request(),evidenceId:first.evidenceId}),e=>e.code==='EVIDENCE_UNAVAILABLE');
});
test('queue is bounded and renderer failure never changes source geometry state',async()=>{
 let unblock;const f=fixture({hash:()=>new Promise(r=>unblock=r)}),one=f.cache.read(request());await new Promise(setImmediate);
 const two=f.cache.read({...request(),viewId:'top'});
 await assert.rejects(f.cache.read({...request(),viewId:'right'}),e=>e.code==='EVIDENCE_QUEUE_FULL');
 unblock('a'.repeat(64));await new Promise(setImmediate);unblock('b'.repeat(64));await one;await new Promise(setImmediate);unblock('a'.repeat(64));await new Promise(setImmediate);unblock('b'.repeat(64));await two;
 const document={context:{...context},summary:{busy:false,kernelReady:true},preview:{active:false,computing:false},bodies:[{id:'original'}]};
 const api=createPageAPI({...fileHost,state:()=>document,evidenceSignature:()=>'',evidenceCapture:()=>{throw Error('GPU lost');}}),original=structuredClone(document);
 assert.equal((await api.getEvidenceImage(request())).status,'failed');assert.deepEqual(document,original);
});
test('orthographic front/top/right use a common scale and the established world directions',()=>{
 const bounds=new THREE.Box3(new THREE.Vector3(-10,-4,2),new THREE.Vector3(10,4,6)),center=bounds.getCenter(new THREE.Vector3());
 const front=evidenceCamera(bounds,'front'),top=evidenceCamera(bounds,'top'),right=evidenceCamera(bounds,'right');
 assert.equal(front.isOrthographicCamera,true);assert.equal(front.top,top.top);assert.equal(top.top,right.top);
 assert.deepEqual(front.up.toArray(),[0,0,1]);assert.deepEqual(top.up.toArray(),[0,1,0]);assert.ok(front.position.y<center.y);assert.ok(top.position.z>center.z);assert.ok(right.position.x>center.x);
});
test('offscreen render restores camera/renderer/helpers and retained patch visibility when encoding fails',()=>{
 const scene=new THREE.Scene(),modelRoot=new THREE.Group();scene.add(modelRoot);const geometry=new THREE.BoxGeometry(2,3,4),piece=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()),root=new THREE.Group();root.add(piece);modelRoot.add(root);piece.visible=false;
 let target='user-target',viewport=new THREE.Vector4(1,2,3,4),scissor=new THREE.Vector4(4,3,2,1),testScissor=true;const occlusion={value:1},helper=new THREE.Group();helper.visible=true;
 const renderer={autoClear:false,outputColorSpace:THREE.SRGBColorSpace,toneMappingExposure:1,getContext:()=>({isContextLost:()=>false}),getRenderTarget:()=>target,setRenderTarget:v=>target=v,getViewport:v=>v.copy(viewport),setViewport:(...v)=>viewport=v.length===1?v[0].clone():new THREE.Vector4(...v),getScissor:v=>v.copy(scissor),setScissor:v=>scissor=v.clone(),getScissorTest:()=>testScissor,setScissorTest:v=>testScissor=v,clear(){},render(){},readRenderTargetPixels(){throw Error('readback failed');}};
 const v={scene,modelRoot,renderer,objects:new Map([['body',{root,displayPatches:[{piece,full:geometry}]}]]),metals:{getOcclusionUniforms:()=>({webcadOcclusionEnabled:occlusion})},clipPlanes:[],gizmo:{getHelper:()=>helper},camera:new THREE.PerspectiveCamera()};const camera=v.camera;
 assert.throws(()=>captureEvidence(v,{maxWidth:64,viewId:'top',format:'png'}),/readback/);
 assert.equal(target,'user-target');assert.deepEqual(viewport.toArray(),[1,2,3,4]);assert.deepEqual(scissor.toArray(),[4,3,2,1]);assert.equal(testScissor,true);assert.equal(renderer.autoClear,false);assert.equal(helper.visible,true);assert.equal(occlusion.value,1);assert.equal(piece.visible,false);assert.equal(v.camera,camera);
 // Camera movement and display-patch culling do not alter a fixed-view evidence key.
 v.modelContext=context;v.hidden=[];v.selected=[];v.clipPlanes=[];const first=evidenceDisplaySignature(v);v.camera.position.set(30,20,10);piece.visible=true;assert.equal(evidenceDisplaySignature(v),first);
});
test('DPR 1.25 keeps render-target viewport in physical pixels and restores the user viewport',()=>{
 const originalDocument=globalThis.document,scene=new THREE.Scene(),modelRoot=new THREE.Group(),root=new THREE.Group(),geometry=new THREE.BoxGeometry(2,3,4),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
 scene.add(modelRoot);modelRoot.add(root);root.add(mesh);
 const dpr=1.25,userCamera=new THREE.PerspectiveCamera(),cameraPosition=userCamera.position.clone(),userViewport=new THREE.Vector4(8,12,400,300),userScissor=new THREE.Vector4(4,8,200,100);
 let target=null,logicalViewport=userViewport.clone(),physicalViewport=userViewport.clone().multiplyScalar(dpr),logicalScissor=userScissor.clone(),testScissor=true,renderCount=0;
 const renderer={autoClear:false,outputColorSpace:THREE.SRGBColorSpace,getContext:()=>({isContextLost:()=>false}),getRenderTarget:()=>target,
  setRenderTarget:value=>{target=value;physicalViewport=value?value.viewport.clone():logicalViewport.clone().multiplyScalar(dpr).floor();},
  getViewport:value=>value.copy(logicalViewport),setViewport:(...values)=>{logicalViewport=values.length===1?values[0].clone():new THREE.Vector4(...values);physicalViewport=logicalViewport.clone().multiplyScalar(dpr).round();},
  getScissor:value=>value.copy(logicalScissor),setScissor:value=>logicalScissor=value.clone(),getScissorTest:()=>testScissor,setScissorTest:value=>testScissor=value,clear(){},
  render(actualScene,camera){assert.equal(actualScene,scene);assert.notEqual(camera,userCamera);assert.equal(camera.isOrthographicCamera,true);assert.deepEqual(physicalViewport.toArray(),[0,0,64,64]);renderCount++;},
  readRenderTargetPixels(renderTarget,x,y,width,height,pixels){assert.equal(renderTarget,target);assert.deepEqual([x,y,width,height],[0,0,64,64]);assert.deepEqual(physicalViewport.toArray(),[0,0,width,height]);pixels.fill(255);}};
 const viewport={scene,modelRoot,renderer,camera:userCamera,objects:new Map([['body',{root}]]),metals:{getOcclusionUniforms:()=>({webcadOcclusionEnabled:{value:1}})},clipPlanes:[]};
 globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},fillRect(){},fillText(){}}),toDataURL:()=>shot().dataUrl})};
 try{
  for(const viewId of ['front','top']){const result=captureEvidence(viewport,{maxWidth:64,viewId,format:'png'});assert.equal(result.width,64);assert.equal(result.height,64);assert.equal(target,null);assert.deepEqual(logicalViewport.toArray(),userViewport.toArray());assert.deepEqual(physicalViewport.toArray(),userViewport.clone().multiplyScalar(dpr).toArray());assert.deepEqual(logicalScissor.toArray(),userScissor.toArray());assert.equal(testScissor,true);assert.equal(renderer.autoClear,false);assert.equal(mesh.geometry,geometry);assert.equal(viewport.camera,userCamera);assert.deepEqual(userCamera.position.toArray(),cameraPosition.toArray());}
  assert.equal(renderCount,2);
 }finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;geometry.dispose();mesh.material.dispose();}
});
test('Page API preserves explicitly requested revision and publishes matching view-tool schema',async()=>{
 let calls=0;const state={context:{...context},summary:{busy:false,kernelReady:true},preview:{active:false,computing:false},bodies:[]};
 const api=createPageAPI({...fileHost,state:()=>state,evidenceSignature:()=>'',evidenceCapture:()=>{calls++;return shot();}});
 assert.equal((await api.getEvidenceImage({...request(),context:{...request().context,expectedRevision:2}})).error.code,'EVIDENCE_UNAVAILABLE');assert.equal(calls,0);
 assert.equal((await api.getEvidenceImage({...request(),surprise:true})).error.code,'PARAM_SCHEMA_INVALID');
 const a=await api.invoke({method:'getEvidenceImage',args:{...request(),viewId:'front'}});assert.equal(a.context.revision,3);assert.equal(calls,1);
 const card=getTool({id:'getEvidenceImage'});assert.equal(card.mcpCall.tool,'webcad_view');assert.equal(card.contextPolicy,'revision');assert.ok(AGENT_CONTRACT.viewMethods.includes('getEvidenceImage'));assert.equal(card.inputSchema.required[0],'context');assert.match(readDocs({docId:'api.evidence'}).text,/EVIDENCE_UNAVAILABLE/);
});
test('same revision only means unchanged geometry; current selection/work frame/busy remain visible',()=>{
 let selected='old',busy=false,origin=0;
 const api=createPageAPI({...fileHost,state:()=>({context:{...context},summary:{busy,kernelReady:true},selection:{bodyIds:[selected]},preview:{active:false,computing:busy},referenceSystem:{workFrame:{origin:[origin,0,0]}},hostControl:{locked:busy},bodies:[]}),display:()=>({})});
 api.getState();selected='new';busy=true;origin=5;
 const current=api.getState({sinceRevision:3,compact:true});assert.equal(current.unchangedScope,'geometry');assert.deepEqual(current.selection.bodyIds,['new']);assert.equal(current.summary.busy,true);assert.equal(current.referenceSystem.workFrame.origin[0],5);assert.equal(current.hostControl.locked,true);
});
