import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {millComplementaryFillet,millComplementaryFilletEdge} from '../src/modeling/rounding/mill-fillet-fallback.js';
import {buildEdgeBlend} from '../src/edge-blend.js';
import {topologyDetails} from '../src/smooth-transition.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);

test('multi-edge mill constructs all cutters on the original topology',()=>{
 const source=cad.makeBox([0,0,0],[12,10,8]),before=source.serialize();let output;
 try{
  const edgeIds=topologyDetails(source).filter(r=>r.sharp).slice(0,3).map(r=>r.edgeId);
  output=millComplementaryFillet(source,{edgeIds,radiusMm:.5});
  assert.equal(output.reports.length,3);assert.ok(output.reports.every(r=>r.sourceBinding==='original-shape'));
  const check=new oc.BRepCheck_Analyzer(output.shape.wrapped,true,false,false);try{assert.ok(check.IsValid());}finally{check.delete();}
  assert.ok(cad.measureVolume(output.shape)<cad.measureVolume(source));assert.equal(source.serialize(),before);
 }finally{output?.shape.delete();source.delete();}
});

test('mill complementary-R on a box sharp edge yields one solid with reduced volume (convex remove)',()=>{
  const s=cad.makeBox([0,0,0],[20,15,10]);
  let out;
  try{
    const sharp=topologyDetails(s).filter(r=>r.sharp);
    assert.ok(sharp.length>=1);
    const edgeId=sharp[0].edgeId;
    const one=millComplementaryFilletEdge(s,{edgeId,radiusMm:.8});
    out=one.shape;
    assert.match(one.strategy,/mill-complementary-r/);
    assert.equal(one.material,'remove');
    const v0=cad.measureVolume(s),v1=cad.measureVolume(out);
    assert.ok(v1<v0-1e-6,`expected material removed: ${v0} -> ${v1}`);
    assert.ok(v1>1e-6);
  }finally{out?.delete?.();s.delete();}
});

test('mill complementary-R multi-edge sequence keeps a single solid',()=>{
  const s=cad.makeBox([0,0,0],[12,10,8]);
  let out;
  try{
    const ids=topologyDetails(s).filter(r=>r.sharp).slice(0,3).map(r=>r.edgeId);
    assert.ok(ids.length>=2);
    const mill=millComplementaryFillet(s,{edgeIds:ids,radiusMm:.5});
    out=mill.shape;
    assert.equal(mill.strategy,'mill-complementary-r-fallback-v1');
    assert.equal(mill.reports.length,ids.length);
    assert.ok(cad.measureVolume(out)>1e-6);
  }finally{out?.delete?.();s.delete();}
});

test('native fillet preferred when it succeeds; blendReport strategy native',()=>{
  const s=cad.makeBox([0,0,0],[10,8,4]);
  let r;
  try{
    r=buildEdgeBlend(s,'fillet',{radius:.3,edgeIds:[0]});
    assert.equal(r.blendReport.strategy,'native');
    assert.ok(cad.measureVolume(r)<320);
  }finally{r?.delete?.();s.delete();}
});
