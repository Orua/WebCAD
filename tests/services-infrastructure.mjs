import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
test('actual net48 Gateway and Host infrastructure faults and installer syntax',async()=>{
 const build=process.env.WEBCAD_SERVICES_TEST_BUILD_ROOT,root=process.env.WEBCAD_SERVICES_TEST_ROOT;
 assert(build&&root,'Actual net48 build and explicit data root are required');await fs.mkdir(root,{recursive:true});
 const data=await fs.mkdtemp(path.join(root,'infrastructure-'));
 const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./services-infrastructure.ps1',import.meta.url)),'-BuildRoot',build,'-DataRoot',data],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const chunks=[];for(const stream of [child.stdout,child.stderr])stream.on('data',b=>chunks.push(b));
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});
 const output=Buffer.concat(chunks).toString('utf8');await fs.writeFile(path.join(data,'acceptance.txt'),output);
 assert.equal(code,0,output);assert.match(output,/passed: persistent appSettings/);assert.match(output,/passed: Host persistent config/);
});
