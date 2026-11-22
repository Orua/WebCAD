import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
test('headless CLI validates geometry and locates invalid feature without a browser',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'webcad-cli-')),file=path.join(dir,'input.webcad'),stl=path.join(dir,'box.stl');
  const doc={version:2,imports:{},features:[{id:'box-one',op:'box',params:{width:10,depth:8,height:6},refs:[]}]};
  try{
    await fs.writeFile(file,JSON.stringify(doc));
    const run=spawnSync(process.execPath,['scripts/webcad.mjs','validate',file,'--json','--mesh','--stl',stl],{encoding:'utf8'}),report=JSON.parse(run.stdout);
    assert.equal(run.status,0,run.stderr);assert.equal(report.rebuild.status,'completed');assert.equal(report.bodies[0].faces,6);assert(Math.abs(report.bodies[0].volumeMm3-480)<1e-6);assert.equal(report.stl.watertight,true);assert.equal((await fs.stat(stl)).size,report.stl.bytes);
    doc.features[0].params.width=-10;await fs.writeFile(file,JSON.stringify(doc));
    const bad=spawnSync(process.execPath,['scripts/webcad.mjs','validate',file,'--json'],{encoding:'utf8'}),failed=JSON.parse(bad.stdout);
    assert.equal(bad.status,2);assert.equal(failed.rebuild.failedFeature.id,'box-one');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('headless validation rejects saved placed features that the browser cannot open',async()=>{
  const {validateProject}=await import('../src/document-validation.js');
  const placement={version:1,resolverVersion:1,frameSnapshot:{origin:[0,0,0],quaternion:[0,0,0,1]},sourceAnchor:{kind:'model-origin'},sourceFrameRef:{kind:'world'},sourcePoint:[0,0,0]};
  const doc={version:2,imports:{},features:[{id:'placed-box',op:'box',params:{width:10,depth:8,height:6},refs:[],placement}]};
  assert.throws(()=>validateProject(doc),error=>error.code==='DOCUMENT_VERSION_UNSUPPORTED'&&error.featureId==='placed-box');
  doc.features[0].semanticsVersion=2;assert.equal(validateProject(doc).idsRefsPlacement,true);
  doc.version=1;assert.throws(()=>validateProject(doc),error=>error.code==='DOCUMENT_VERSION_UNSUPPORTED');
});
