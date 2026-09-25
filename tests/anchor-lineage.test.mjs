import test from 'node:test';
import assert from 'node:assert/strict';
import {inheritedAnchorPose,synchronizeBodyAnchors} from '../src/anchor-lineage.js';
import {createReferenceSystem} from '../src/work-frame.js';

const frame={origin:[0,0,0],quaternion:[0,0,0,1]},body={id:'source',bounds:{min:[0,0,0],max:[10,20,4]}};
const original={anchorId:'a',anchorVersion:1,bodyId:'source',name:'定位点',worldPoint:[5,10,4],quaternion:[0,0,0,1],geometryFingerprint:'brep-sha256:source',status:'valid'};
const feature=(mode,params,placement={sourcePoint:null,sourceAnchor:{kind:'bounds-center'},frameSnapshot:frame})=>({id:'output',op:'transform',refs:['source'],params:{mode,...params},placement});
test('rigid translation, non-origin rotation and point-to-point preserve anchor geometry',()=>{
 assert.deepEqual(inheritedAnchorPose(original,feature('translate',{delta:[2,3,4]}),body).worldPoint,[7,13,8]);
 const rotated=inheritedAnchorPose(original,feature('rotate',{pivot:[5,10,0],axisVector:[0,1,0],angleDeg:90}),body);
 assert.ok(Math.hypot(...rotated.worldPoint.map((v,i)=>v-[9,10,0][i]))<1e-9);
 assert.deepEqual(inheritedAnchorPose(original,feature('toPoint',{targetPoint:[100,0,0],orientation:'preserve'}),body).worldPoint,[100,0,2]);
});
test('known transform inherits onto the new body; unknown geometry changes mark old anchor stale',async()=>{
 const referenceSystem=createReferenceSystem();referenceSystem.bodyAnchors=[structuredClone(original)];
 const before={features:[{id:'source',op:'box'}],referenceSystem};
 const next={features:[...before.features,feature('translate',{delta:[1,0,0]})],referenceSystem:structuredClone(referenceSystem)};
 await synchronizeBodyAnchors(before,next,[body],[{id:'output'}],async()=> 'brep-sha256:output');
 assert.equal(next.referenceSystem.bodyAnchors[0].status,'stale');
 assert.equal(next.referenceSystem.bodyAnchors[1].status,'valid');
 assert.equal(next.referenceSystem.bodyAnchors[1].bodyId,'output');
 assert.deepEqual(next.referenceSystem.bodyAnchors[1].worldPoint,[6,10,4]);
 const edited={features:next.features,referenceSystem:structuredClone(next.referenceSystem)};
 await synchronizeBodyAnchors(next,edited,[{id:'output'}],[{id:'output'}],async()=> 'brep-sha256:changed');
 assert.equal(edited.referenceSystem.bodyAnchors[1].status,'stale');
});
