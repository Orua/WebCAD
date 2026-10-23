import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {releaseFiles, changedFiles, mergeManifest, publishOrder,localBaseline} from '../scripts/deploy-plan.mjs';

test('incremental release uploads zero unchanged files and detects new/changed bytes',()=>{
  const files=[{path:'webcad/index.html',sha256:'a'},{path:'webcad/assets/new.js',sha256:'b'}];
  assert.deepEqual(changedFiles(files,{files}),[]);
  assert.deepEqual(changedFiles(files,{files:[{path:'webcad/index.html',sha256:'A'}]}),[files[1]]);
  assert.deepEqual(changedFiles(files,{files:[{path:'webcad/index.html',sha256:'old'}]}),files);
});
test('assets publish before discovery manifest and HTML entry',()=>{
  const files=['webcad/index.html','webcad/automation/manifest.json','webcad/assets/new.js'].map(path=>({path}));
  assert.deepEqual(publishOrder(files).map(f=>f.path),[files[2].path,files[1].path,files[0].path]);
  assert.equal(files[0].path,'webcad/index.html');
});
test('shared deployment manifest preserves unrelated application and old asset entries',()=>{
  const retained={path:'bin/Other.dll',sha256:'keep'};
  const merged=mergeManifest({schema:'existing',files:[retained,{path:'webcad/old.js',sha256:'old'}]},[{path:'webcad/index.html',size:12,sha256:'new',local:'private-path'}]);
  assert.equal(merged.schema,'existing');
  assert.deepEqual(merged.files.find(f=>f.path===retained.path),retained);
  assert.equal(merged.files.length,3);
  assert.equal(merged.files.find(f=>f.sha256==='new').local,undefined);
});
test('frontend package excludes site configuration and user data; incomplete packages reject',()=>{
  const root=mkdtempSync(join(tmpdir(),'webcad-deploy-'));
  const put=(path,content='data')=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),content);};
  try{
    put('index.html');assert.throws(()=>releaseFiles(root),/complete WebCAD/);
    for(const path of ['automation/manifest.json','assets/index-test.js','web.config','jobs/result.json','projects/customer.webcad','App_Data/settings.json','uploads/photo.png','.deploy-manifest.json'])put(path);
    assert.deepEqual(releaseFiles(root).map(f=>f.path),['webcad/assets/index-test.js','webcad/automation/manifest.json','webcad/index.html']);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('local-only planning uses actual localhost bytes without a production manifest',()=>{
  const root=mkdtempSync(join(tmpdir(),'webcad-local-deploy-'));
  try {
    mkdirSync(join(root,'automation'),{recursive:true});
    writeFileSync(join(root,'index.html'),'old');writeFileSync(join(root,'automation/manifest.json'),'{}');
    const files=releaseFiles(root);
    assert.equal(changedFiles(files,localBaseline(files,root)).length,0);
    writeFileSync(join(root,'index.html'),'new');
    assert.deepEqual(changedFiles(releaseFiles(root),{files}).map(f=>f.path),['webcad/index.html']);
    rmSync(join(root,'index.html'));
    assert.deepEqual(changedFiles(files,localBaseline(files,root)).map(f=>f.path),['webcad/index.html']);
  }finally{rmSync(root,{recursive:true,force:true});}
});
