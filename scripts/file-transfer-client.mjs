import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';

const MAX=20*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fault=(stage,code,message,extra={})=>Object.assign(new Error(message),{stage,code,...extra});
function urlFor(baseUrl,relative,expected){
  const base=new URL(baseUrl),url=new URL(relative,base);
  if(base.protocol!=='http:'||!['localhost','127.0.0.1'].includes(base.hostname)||base.username||base.password||url.origin!==base.origin||url.username||url.password||url.hash||url.search||url.pathname!==expected)throw fault('permission','URL_OUTSIDE_SCOPE','Only the expected same-origin loopback transfer endpoint is allowed.');
  return url;
}
async function directoryPath(directory){
  if(typeof directory!=='string'||!path.isAbsolute(directory))throw fault('permission','DIRECTORY_REQUIRED','An explicitly authorized absolute directory is required.');
  const real=await fs.realpath(directory);if(!(await fs.stat(real)).isDirectory())throw fault('permission','DIRECTORY_REQUIRED','Authorized directory must exist.');return real;
}
const inside=(base,target)=>target.startsWith(base+path.sep);
const sameFile=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
async function checkDirectory(root,identity){if(await fs.realpath(root)!==root||!sameFile(await fs.stat(root),identity))throw fault('permission','DIRECTORY_CHANGED','Authorized directory identity changed during transfer.');}
function fileName(name){
  if(typeof name!=='string'||!name||name.length>255||name!==path.basename(name)||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw fault('permission','PATH_OUTSIDE_AUTHORIZED_DIRECTORY','Artifact name must be a safe single filename.');
  return name;
}
async function call(client,name,args){
  const response=await client.callTool({name:`webcad_${name}`,arguments:args});
  const value=response.structuredContent??JSON.parse(response.content.find(x=>x.type==='text').text);
  if(response.isError||value.status==='failed'||value.status==='unknown')throw fault('mcp',value.error?.code||'MCP_FAILED',value.error?.message||String(value.error));
  return value;
}
export async function uploadAsset(client,{filePath,directory,baseUrl,signal}){
  let stage='permission';
  try{
    const root=await directoryPath(directory),directoryIdentity=await fs.stat(root),real=await fs.realpath(path.resolve(root,filePath));
    if(!inside(root,real))throw fault(stage,'PATH_OUTSIDE_AUTHORIZED_DIRECTORY','Input path or link escapes the authorized directory.');
    stage='read';const identity=await fs.lstat(real);if(identity.isSymbolicLink())throw fault(stage,'PATH_OUTSIDE_AUTHORIZED_DIRECTORY','Input changed to a link.');
    const handle=await fs.open(real,constants.O_RDONLY|(constants.O_NOFOLLOW||0));let bytes;
    try{const info=await handle.stat();await checkDirectory(root,directoryIdentity);if(!sameFile(info,identity)||await fs.realpath(real)!==real)throw fault(stage,'INPUT_CHANGED','Input identity changed before reading.');if(!info.isFile()||info.size>MAX)throw fault(stage,'SIZE_LIMIT','Input must be a regular file at most 20 MiB.');bytes=await handle.readFile();}finally{await handle.close();}
    if(bytes.length>MAX)throw fault(stage,'SIZE_LIMIT','Input grew beyond 20 MiB.');
    const size=bytes.length,sha256=digest(bytes),name=fileName(path.basename(real));
    stage='register';const grant=await call(client,'register_asset',{name,size,sha256});
    const url=urlFor(baseUrl,grant.uploadUrl,'/api/assets');
    stage='upload';const response=await fetch(url,{method:'PUT',headers:{Authorization:`Bearer ${grant.uploadToken}`,'Content-Type':'application/octet-stream'},body:bytes,redirect:'error',signal});
    const receipt=await response.json();if(!response.ok)throw fault(stage,receipt.error?.code||'UPLOAD_FAILED',receipt.error?.message||`Upload HTTP ${response.status}`);
    if(receipt.size!==size||receipt.sha256!==sha256||!/^ast_[a-f\d]{48}$/.test(receipt.assetId))throw fault(stage,'HASH_MISMATCH','Upload receipt does not identify the supplied bytes.');
    return receipt;
  }catch(error){if(!error.stage)error.stage=stage;throw error;}
}
export async function confirmArtifactWritten(client,{artifactId,size,sha256}){
  return call(client,'confirm_artifact_written',{artifactId,size,sha256});
}
/** The caller grants directory access; the server supplies bytes, never a filesystem path. */
export async function downloadArtifact(client,artifact,{directory,baseUrl,name=artifact.name,signal}={}){
  let stage='permission',temporary,handle,target,written=false,authorizedRoot,directoryIdentity,tempIdentity;
  try{
    const root=await directoryPath(directory);authorizedRoot=root;directoryIdentity=await fs.stat(root);target=path.join(root,fileName(name));
    if(!/^art_[a-f\d]{48}$/.test(artifact.artifactId)||!Number.isSafeInteger(artifact.size)||artifact.size<0||artifact.size>MAX||!/^[a-f\d]{64}$/.test(artifact.sha256))throw fault(stage,'ARTIFACT_INVALID','Invalid artifact integrity metadata or size.');
    const url=urlFor(baseUrl,artifact.downloadUrl,`/api/artifacts/${artifact.artifactId}`);
    try{await fs.lstat(target);throw fault(stage,'WRITE_CONFLICT','Destination already exists.');}catch(error){if(error.code!=='ENOENT')throw error;}
    stage='download';const response=await fetch(url,{headers:{Authorization:`Bearer ${artifact.downloadToken}`},redirect:'error',signal});
    if(!response.ok)throw fault(stage,response.status===410?'RESOURCE_EXPIRED':'DOWNLOAD_FAILED',`Download HTTP ${response.status}`);
    if(response.headers.has('content-length')&&Number(response.headers.get('content-length'))!==artifact.size)throw fault(stage,'HASH_MISMATCH','Content length differs from the artifact receipt.');
    stage='write';await checkDirectory(root,directoryIdentity);temporary=path.join(root,`.webcad-${randomUUID()}.part`);handle=await fs.open(temporary,'wx');tempIdentity=await handle.stat();await checkDirectory(root,directoryIdentity);
    const hash=createHash('sha256');let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>artifact.size||size>MAX)throw fault(stage,'SIZE_LIMIT','Downloaded body exceeds the declared bound.');hash.update(chunk);stage='write';await handle.writeFile(chunk);stage='download';}
    if(size!==artifact.size||hash.digest('hex')!==artifact.sha256)throw fault(stage,'HASH_MISMATCH','Downloaded bytes fail size or SHA-256 verification.');
    stage='write';await handle.sync();await handle.close();handle=null;
    const readback=await fs.readFile(temporary);if(readback.length!==size||digest(readback)!==artifact.sha256)throw fault(stage,'HASH_MISMATCH','Disk readback failed.');
    // Hard-link commit is atomic and fails EEXIST; rename may overwrite another file.
    await checkDirectory(root,directoryIdentity);await fs.link(temporary,target);written=true;await fs.unlink(temporary);temporary=null;
    stage='confirm';const confirmation=await confirmArtifactWritten(client,artifact);
    return {status:'written',filePath:target,size,sha256:artifact.sha256,confirmation};
  }catch(error){
    if(!error.stage)error.stage=stage;if(error.code==='EEXIST')error.code='WRITE_CONFLICT';
    if(written){error.written=true;error.filePath=target;}
    throw error;
  }finally{
    await handle?.close().catch(()=>{});
    if(temporary&&tempIdentity)try{await checkDirectory(authorizedRoot,directoryIdentity);const current=await fs.lstat(temporary);if(sameFile(current,tempIdentity)&&!current.isSymbolicLink())await fs.unlink(temporary);}catch{}
  }
}
