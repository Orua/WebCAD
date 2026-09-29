import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildEdgeBlend,blendTargets} from '../src/edge-blend.js';
import {topologyDetails} from '../src/smooth-transition.js';
import {adaptUISelection} from '../src/ui-selection-adapter.js';
import {normalizeOperationParams,normalizeOperationPatch} from '../src/operation-registry.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);

test('UI multi-face scope selects common edge; old face-boundary recipes remain explicit',()=>{
  for(const op of ['fillet','chamfer']){
    const p=op==='fillet'?{radius:.2}:{distance:.2};
    assert.deepEqual(adaptUISelection(op,p,['b'],{bodyId:'b',type:'face',ids:[0,2]}),{...p,faceIds:[0,2],sharedFaces:true});
    assert.deepEqual(normalizeOperationParams(op,{...p,faceIds:[0,2]}),{...p,faceIds:[0,2]});
    assert.throws(()=>normalizeOperationParams(op,{...p,faceIds:[0],sharedFaces:true}));
    assert.deepEqual(normalizeOperationPatch(op,{...p,faceIds:[0,2],sharedFaces:true},{edgeIds:[0]}),{...p,edgeIds:[0]});
  }
});

test('two adjacent faces produce the same fillet/chamfer as their common edge',()=>{
  const s=cad.makeBox([0,0,0],[10,8,4]);
  try{
    const row=topologyDetails(s)[0],scope={faceIds:row.adjacentFaceIds,sharedFaces:true};
    assert.deepEqual(blendTargets(s,scope).targets.map(r=>r.edgeId),[0]);
    assert(blendTargets(s,{faceIds:row.adjacentFaceIds}).targets.length>1);
    for(const op of ['fillet','chamfer']){
      const amount=op==='fillet'?{radius:.2}:{distance:.2};let a,b;
      try{a=buildEdgeBlend(s,op,{...amount,...scope});b=buildEdgeBlend(s,op,{...amount,edgeIds:[0]});
        assert(Math.abs(cad.measureVolume(a)-cad.measureVolume(b))<1e-8);
        assert(cad.measureVolume(a)<320);assert.equal(a.blendReport.scope,'shared-faces');
      }finally{a?.delete();b?.delete();}
    }
  }finally{s.delete();}
});

test('whole-cylinder fillet and chamfer skip periodic seam, retain both sharp rims',()=>{
  for(const op of ['fillet','chamfer']){
    const s=cad.makeCylinder(5,3);let r;
    try{r=buildEdgeBlend(s,op,{allEdges:true,...(op==='fillet'?{radius:.2}:{distance:.2})});
      assert.equal(r.blendReport.processedEdgeIds.length,2);assert.equal(r.blendReport.skippedTangentEdgeIds.length,1);
      assert(cad.measureVolume(r)<Math.PI*25*3);
      const seam=topologyDetails(s).find(e=>e.periodicSeam);
      assert.throws(()=>buildEdgeBlend(s,op,{edgeIds:[seam.edgeId],radius:.2,distance:.2}),/没有锐边/);
    }finally{r?.delete();s.delete();}
  }
});

test('normals use BRep p-curves even when 3D surface projection is unavailable',()=>{
  const s=cad.makeCylinder(3,4),faces=s.faces,prototype=Object.getPrototypeOf(faces[0]),original=prototype.normalAt;
  try{prototype.normalAt=()=>{throw new Error('projection failed');};
    const rows=topologyDetails(s);assert(rows.every(e=>e.sharp!==null));assert.equal(rows.filter(e=>e.sharp).length,2);
  }finally{prototype.normalAt=original;faces.forEach(face=>face.delete());s.delete();}
});

test('failed large fillet reports a sampled valid radius without changing the source',()=>{
  const s=cad.makeBox([0,0,0],[10,4,1]);
  try{
    const edge=topologyDetails(s).find(e=>Math.abs(e.startPoint[0]-e.endPoint[0])>9);
    assert(edge);
    const before=cad.measureVolume(s);
    assert.throws(()=>buildEdgeBlend(s,'fillet',{radius:2,edgeIds:[edge.edgeId]}),/较小半径 R[\d.]+ mm 已单独试算为有效单实体/);
    assert.equal(cad.measureVolume(s),before);
  }finally{s.delete();}
});
