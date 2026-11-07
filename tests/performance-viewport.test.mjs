import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CADViewport} from '../src/viewport.js';
import {createPerformanceSampler} from '../src/performance/sampling.js';

test('actual renderFrame aggregates both passes, rejects cache/capture, and restores info reset policy',()=>{
  const oldDocument=globalThis.document;globalThis.document={hasFocus:()=>true,visibilityState:'visible'};
  try{
    const v=Object.create(CADViewport.prototype),info={autoReset:true,render:{triangles:0,calls:0},reset(){this.render.triangles=0;this.render.calls=0;}};
    const renderer={info,toneMappingExposure:1,render(){assert.equal(info.autoReset,false);info.render.triangles+=200;info.render.calls+=3;},getContext:()=>({isContextLost:()=>false})};
    Object.assign(v,{scene:new THREE.Scene(),objects:new Map(),camera:new THREE.PerspectiveCamera(),controls:{update(){}},renderer,mode:'edges',clipPlanes:[],
      updateDisplayDetail(){this.displayDetail={};},updateLocationMarkers(){},metalOcclusion:{render(){assert.equal(info.autoReset,false);info.render.triangles+=100;info.render.calls+=2;}},
      anchorProxy:{position:new THREE.Vector3()},anchorMarker:{style:{}},host:{clientWidth:800,clientHeight:600},frameSequence:0,
      performanceSampler:createPerformanceSampler(),performanceCounts:{uniqueTriangles:200},userViewActive:true,nextPerformanceTick:Infinity,
      callbacks:{performanceContext:()=>({documentInstanceId:'test',geometryRevision:3,kernelBusy:false,previewBusy:false,initializing:false})}});
    for(let i=0;i<=60;i++){v.camera.position.x=i;v.renderFrame(false,{timestampMs:i*100,frameSource:'animation-frame'});}
    let snapshot=v.performanceSampler.snapshot();assert.equal(snapshot.valid,true);assert.equal(snapshot.counts.submittedTriangles,300);assert.equal(snapshot.counts.drawCalls,5);
    assert.equal(snapshot.counts.uniqueTriangles,200);assert.equal(info.autoReset,true);
    v.renderFrame(false,{timestampMs:6100,frameSource:'animation-frame'});snapshot=v.performanceSampler.snapshot();assert.ok(snapshot.reasonCodes.includes('CACHED_FRAME'));assert.equal(snapshot.counts.drawCalls,0);
    v.renderFrame(true);assert.ok(v.performanceSampler.snapshot().reasonCodes.includes('CAPTURE'));
    const sequence=v.performanceSampler.snapshot().perfSeq;v.resetPerformanceSamples();v.renderFrame(false,{timestampMs:6200,frameSource:'animation-frame'});
    assert.ok(v.performanceSampler.snapshot().perfSeq>sequence,'display quality reset preserves perf sequence');
  }finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
