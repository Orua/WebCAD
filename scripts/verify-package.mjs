import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
const root=path.resolve(process.argv[2]||''),readJSON=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const list=await readJSON(path.join(root,'package-hashes.json'));
if(list.format!=='webcad-package-hashes-v1'||!Array.isArray(list.files)||list.files.length<10||list.files.length>20000)throw Error('Invalid package hash inventory');
const names=new Set();
for(const row of list.files){
 if(typeof row.path!=='string'||row.path.includes('\\')||row.path.startsWith('/')||row.path.split('/').some(p=>p==='..'||p==='.'||!p)||names.has(row.path)||!Number.isSafeInteger(row.bytes)||row.bytes<0||!/^([a-f0-9]{64})$/.test(row.sha256))throw Error('Invalid package entry');names.add(row.path);
 const file=path.resolve(root,row.path),real=await fs.realpath(file);if(!real.startsWith(root+path.sep))throw Error('Package links outside root');
 const stat=await fs.stat(real);if(stat.size!==row.bytes)throw Error('Package size mismatch: '+row.path);const hash=createHash('sha256');for await(const chunk of createReadStream(real))hash.update(chunk);if(hash.digest('hex')!==row.sha256)throw Error('Package hash mismatch: '+row.path);
}
async function inventory(directory,prefix=''){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isSymbolicLink())throw Error('Package contains a link');if(entry.isDirectory())await inventory(path.join(directory,entry.name),name+'/');else if(name!=='package-hashes.json'&&!names.has(name))throw Error('Unlisted package file: '+name);}}
await inventory(root);
const joint=await readJSON(path.join(root,'release-manifest.json')),proof=await readJSON(path.join(root,'configuration/kernel-pair.json')),index=await readJSON(path.join(root,'frontend/automation/index.json'));
if(joint.frontendBuildId!==index.metadata.buildId||joint.pageApiVersion!==index.metadata.pageApiVersion||proof.producerKernelBuildId!==`native-occt@7.8.1:sha256:${joint.binarySha256.native}`)throw Error('Joint frontend/kernel version mismatch');
if(joint.binarySha256.native!==list.files.find(row=>row.path==='workers/occt/WebCADOcctWorker.exe')?.sha256||joint.binarySha256.host!==list.files.find(row=>row.path==='host/WebCADServices.Host.exe')?.sha256||joint.binarySha256.logo!==list.files.find(row=>row.path==='workers/logo/LogoVector.Worker.exe')?.sha256)throw Error('Joint binaries mismatch');
if(joint.binarySha256.gateway!==list.files.find(row=>row.path==='gateway/bin/WebCADServices.Gateway.dll')?.sha256||joint.binarySha256.runtime!==list.files.find(row=>row.path==='host/WebCADServices.Runtime.dll')?.sha256)throw Error('Joint Gateway/Runtime binaries mismatch');
if(joint.native?.proofSha256&&joint.native.proofSha256!==list.files.find(row=>row.path==='configuration/kernel-pair.json')?.sha256)throw Error('Native proof inventory mismatch');
console.log(JSON.stringify({status:'verified',releaseId:list.releaseId,files:names.size,frontendBuildId:joint.frontendBuildId,deploymentReady:joint.deploymentReady}));
