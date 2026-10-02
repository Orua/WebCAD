import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fingerprintBuildInputs} from '../scripts/build-identity.mjs';

test('build identity changes for source bytes and paths, stays stable for regenerated outputs',()=>{
  const root=mkdtempSync(join(tmpdir(),'webcad-build-'));
  const write=(name,text)=>{const path=join(root,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);};
  try{
    write('src/kernel.js','export const version=1;');
    write('public/web.config','source hosting policy');
    write('docs/example.md','source documentation');
    const initial=fingerprintBuildInputs(root);
    assert.deepEqual(initial.paths,['docs/example.md','public/web.config','src/kernel.js']);
    write('public/automation/index.json','generated snapshot');
    write('public/docs/USER-GUIDE.zh-CN.md','generated copy');
    write('public/llms.txt','generated entry');
    write('agent/output/report.json','test evidence');
    write('dist/assets/app.js','compiled app');
    assert.deepEqual(fingerprintBuildInputs(root),initial);
    write('src/kernel.js','export const version=2;');
    const changed=fingerprintBuildInputs(root).sourceHash;
    assert.notEqual(changed,initial.sourceHash);
    renameSync(join(root,'src/kernel.js'),join(root,'src/kernel-renamed.js'));
    assert.notEqual(fingerprintBuildInputs(root).sourceHash,changed);
    write('src/untracked.js','new runtime source');
    assert(fingerprintBuildInputs(root).paths.includes('src/untracked.js'));
  }finally{rmSync(root,{recursive:true,force:true});}
});
