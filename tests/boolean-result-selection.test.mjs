import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {selectBooleanSolid,validSolidSelection} from '../src/modeling/boolean-result-selection.js';
import {compiledSemanticVersion} from '../src/services/geometry-exchange.js';

test('explicit interior point keeps the smaller solid and enforces discarded volume in both kernels',async()=>{
 const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
 const source=cad.makeBox([0,0,0],[20,10,10]),tool=cad.makeBox([4,-1,-1],[6,11,11]),split=source.cut(tool),p={keepSolidAt:[2,5,5],maxDiscardedVolumeMm3:1400};
 let selected;
 try{
  assert.equal(validSolidSelection(p),true);assert.equal(validSolidSelection({keepSolidAt:[2,5,5]}),false);
  assert.equal(validSolidSelection({...p,toolExecution:'sequential'}),true);assert.equal(validSolidSelection({...p,toolExecution:'automatic'}),false);
  assert.equal(compiledSemanticVersion({op:'cut',params:p}),'boolean.cut-1.1');
  assert.equal(compiledSemanticVersion({op:'cut',params:{}}),'boolean.cut-1.0');
  selected=selectBooleanSolid(split,p,cad);assert.ok(Math.abs(cad.measureVolume(selected)-400)<1e-7);assert.ok(Math.abs(selected.booleanSelectionReport.discardedVolumeMm3-1400)<1e-7);
  assert.throws(()=>selectBooleanSolid(split,{...p,maxDiscardedVolumeMm3:1399},cad),{code:'BOOLEAN_DISCARD_LIMIT'});
  for(const point of [[5,5,5],[0,5,5],[30,5,5]])assert.throws(()=>selectBooleanSolid(split,{...p,keepSolidAt:point},cad),{code:'BOOLEAN_RESULT_POINT_INVALID'});
  const worker=process.env.WEBCAD_NATIVE_WORKER,base=process.env.WEBCAD_NATIVE_TEST_ROOT;
  assert.ok(worker&&base,'Native worker and external acceptance root required');fs.mkdirSync(base,{recursive:true});const root=fs.mkdtempSync(path.join(base,'run-'));
  const execute=(name,params)=>{
   const dir=path.join(root,name);fs.mkdirSync(dir,{recursive:true});const sourcePath=path.join(dir,'source.brep'),toolPath=path.join(dir,'tool.brep'),outputPath=path.join(dir,'result.brep'),reportPath=path.join(dir,'report.json'),request=path.join(dir,'request.json');
   fs.writeFileSync(sourcePath,source.serialize());fs.writeFileSync(toolPath,tool.serialize());fs.writeFileSync(request,JSON.stringify({operation:'cut',semanticVersion:'boolean.cut-1.1',strategy:'multi-source-boolean',params:{toolPaths:[toolPath],...params},sourcePath,outputPath,reportPath,inputFingerprint:name,featureId:name,expectedRevision:1}));
   const run=spawnSync(worker,[request],{windowsHide:true,timeout:30000,encoding:'utf8'}),report=JSON.parse(fs.readFileSync(reportPath,'utf8'));return {run,report,outputPath};
  };
  const accepted=execute('selected-smaller',p);assert.equal(accepted.run.status,0,JSON.stringify(accepted.report));assert.ok(Math.abs(accepted.report.validation.volumeMm3-400)<1e-7);const imported=cad.deserializeShape(fs.readFileSync(accepted.outputPath,'utf8'));try{assert.ok(Math.abs(cad.measureVolume(imported)-400)<1e-7);}finally{imported.delete();}
  const report=accepted.report.stages.find(s=>s.stage==='boolean-result-selection');assert.equal(report.inputSolidCount,2);assert.ok(Math.abs(report.discardedVolumeMm3-1400)<1e-7);
  const sequential=execute('explicit-sequential',{...p,toolExecution:'sequential'});assert.equal(sequential.run.status,0,JSON.stringify(sequential.report));assert.ok(Math.abs(sequential.report.validation.volumeMm3-400)<1e-7);assert.equal(sequential.report.stages.find(s=>s.stage==='boolean-cut').toolExecution,'sequential');
  assert.equal(execute('discard-limit',{...p,maxDiscardedVolumeMm3:1399}).report.code,'BOOLEAN_DISCARD_LIMIT');
  assert.equal(execute('boundary-point',{...p,keepSolidAt:[0,5,5]}).report.code,'BOOLEAN_RESULT_POINT_INVALID');
  assert.equal(execute('hole-point',{...p,keepSolidAt:[5,5,5]}).report.code,'BOOLEAN_RESULT_POINT_INVALID');
  assert.equal(execute('unchanged-default',{}).report.code,'BOOLEAN_MULTIPLE_SOLIDS');
  fs.writeFileSync(path.join(root,'selection-acceptance.json'),JSON.stringify({status:'passed',semanticVersion:'boolean.cut-1.1',smallerSolidSelected:true,volumeMm3:400,discardedVolumeMm3:1400,defaultRejectsSplit:true,boundaryAndHoleRejected:true,nativeCodecImported:true},null,2));console.log(JSON.stringify({acceptance:path.join(root,'selection-acceptance.json')}));
 }finally{selected?.delete();split.delete();tool.delete();source.delete();}
});
