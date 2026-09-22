import assert from 'node:assert/strict';
import {toolDisabledReason as reason} from '../src/tool-state.js';
const state={kernelReady:true,busy:false,bodies:[{id:'a',solidCount:1},{id:'b',solidCount:3}],selectedIds:[],selectedTopology:null};
for(const action of ['hole','slot','transform','copy','gizmoTranslate']){
 assert(reason(action,state));assert.equal(reason(action,{...state,selectedIds:['a']}),'');assert(reason(action,{...state,selectedIds:['a','b']}));
}
for(const action of ['union','cut','intersect']){
 assert(reason(action,{...state,selectedIds:['a']}));assert.equal(reason(action,{...state,selectedIds:['a','b']}),'');
}
const faces=n=>({...state,selectedIds:['a'],selectedTopology:{bodyId:'a',type:'face',ids:Array.from({length:n},(_,i)=>i)}});
assert(reason('shell',faces(0)));assert.equal(reason('shell',faces(2)),'');
for(const op of ['faceHole','faceExtrude']){assert(reason(op,faces(0)));assert.equal(reason(op,faces(1)),'');assert(reason(op,faces(2)));assert(reason(op,{...faces(1),selectedIds:['b']}));}
assert.equal(reason('remove',{...state,selectedIds:['a','b']}),'');
assert(reason('extractSolid',{...state,selectedIds:['a']}));assert.equal(reason('extractSolid',{...state,selectedIds:['b']}),'');
assert(reason('box',{...state,busy:true}));assert(reason('quickModel',{...state,kernelReady:false}));
assert.equal(reason('box',state),'');assert(reason('measure',{...state,bodies:[]}));
console.log('PASS selection cardinality, face ownership/count, shell openings, compound extraction, readiness');
assert(reason('planeSection',state));assert.equal(reason('planeSection',{...state,selectedIds:['a']}),'');
assert(reason('faceBoundary',faces(0)));assert.equal(reason('faceBoundary',faces(1)),'');
assert(reason('sewFaces',state));assert.equal(reason('sewFaces',{...state,selectedIds:['a']}),'');
assert(reason('surfaceTrim',{...state,selectedIds:['a']}));assert.equal(reason('surfaceTrim',{...state,selectedIds:['a','b']}),'');
console.log('PASS reference tool selection gates');
