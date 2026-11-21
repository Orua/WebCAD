// Headless diagnostic only; does not substitute for public API or visual acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {robustUnion,unionSourceExtentLoss} from '../../src/modeling/robust-union.js';
import {verifyUnionMaterial} from '../../src/modeling/union-material.js';

if(process.argv.length!==3)throw new Error('Usage: node scripts/probes/union-material.mjs <new-output-directory>');
const output=path.resolve(process.argv[2]);
await fs.mkdir(output,{recursive:false});
const oc=await init({wasmBinary:await fs.readFile(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
cad.setOC(oc);
const measure=shape=>{const p=new oc.GProp_GProps();try{oc.BRepGProp.VolumePropertiesGK(shape.wrapped,p,1e-9,true,true,false,false,false);return Math.abs(p.Mass());}finally{p.delete();}};
const bounds=shape=>{const box=shape.boundingBox;try{return box.bounds;}finally{box.delete();}};
const stock=cad.makeBox([0,0,0],[10,10,10]),hole=cad.makeBox([2,2,-1],[8,8,11]);
const ring=stock.cut(hole),bridge=cad.makeBox([1,4,4],[9,6,6]);let result,reopened;
try{
  const extents=unionSourceExtentLoss([bounds(ring),bounds(bridge)],bounds(ring),1e-4);
  assert.deepEqual(extents,[]);
  let rejected;
  try{verifyUnionMaterial([ring,bridge],ring,{cad,measure,toolIds:['ring','bridge']});}
  catch(error){rejected=error.details;}
  assert.equal(rejected?.materialCoverage.status,'failed');
  result=robustUnion([ring,bridge],{measure,verifyMaterial:true,requireConnected:true,toolIds:['ring','bridge']});
  for(const [name,shape] of [['ring',ring],['bridge',bridge],['verified-union',result]])await fs.writeFile(path.join(output,name+'.brep'),shape.serialize());
  reopened=cad.deserializeShape(await fs.readFile(path.join(output,'verified-union.brep'),'utf8'));
  const analyzer=new oc.BRepCheck_Analyzer(reopened.wrapped,true,false,false),solids=reopened.solids;
  try{
    assert.ok(analyzer.IsValid());assert.equal(solids.length,1);assert.ok(Math.abs(measure(reopened)-664)<1e-6);
    const evidence={kind:'headless-kernel-probe',visualStatus:'NOT_REVIEWED',units:'mm',sourceVolumeMm3:[measure(ring),measure(bridge)],extentOnlyMissing:extents,rejectedTruncatedResult:rejected,accepted:result.booleanReport,reopened:{valid:true,solidCount:solids.length,volumeMm3:measure(reopened)}};
    await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify(evidence));
  }finally{analyzer.delete();solids.forEach(s=>s.delete());}
}finally{[reopened,result,bridge,ring,hole,stock].forEach(s=>s?.delete());}
