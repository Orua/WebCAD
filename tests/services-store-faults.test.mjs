import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
test('actual net48 storage handles interruption and untrusted checkpoint faults without geometry claims',async()=>{
 const host=process.env.WEBCAD_SERVICES_TEST_HOST,root=process.env.WEBCAD_SERVICES_TEST_ROOT;assert(host&&root,'Actual net48 binaries and an explicit test root are required');await fs.mkdir(root,{recursive:true});const data=await fs.mkdtemp(path.join(root,'faults-'));
 const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',new URL('./services-store-faults.ps1',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),'-RuntimeDirectory',path.dirname(host),'-DataRoot',data],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output=(output+b).slice(-8192);});const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0,output);assert.match(output,/passed:/);await fs.writeFile(path.join(data,'acceptance.txt'),output);
});
