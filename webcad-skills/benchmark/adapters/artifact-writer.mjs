import {mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const safe=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,149}$/.test(value)&&!value.includes('..');
// Create one fresh external evidence root. No defaults and no overwriting existing files.
export async function createArtifactWriter(directory){
 if(typeof directory!=='string'||!isAbsolute(directory))throw Error('ABSOLUTE_EXTERNAL_EVIDENCE_DIRECTORY_REQUIRED');
 const root=resolve(directory),repository=await realpath(fileURLToPath(new URL('../../..',import.meta.url)));
 const inside=path=>{const r=relative(repository,path);return !isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep);};
 if(inside(root))throw Error('EVIDENCE_MUST_BE_OUTSIDE_REPOSITORY');
 await mkdir(root,{recursive:true});
 const realRoot=await realpath(root);
 if(inside(realRoot))throw Error('EVIDENCE_LINK_TARGET_IS_REPOSITORY');
 return async({scope,name,bytes,sha256})=>{
  if(!safe(scope)||!safe(name)||!(bytes instanceof Uint8Array)||digest(bytes)!==sha256)throw Error('ARTIFACT_INPUT_INVALID');
  const folder=join(root,scope);await mkdir(folder,{recursive:true});
  const realFolder=await realpath(folder),relativeFolder=relative(realRoot,realFolder);
  if(isAbsolute(relativeFolder)||relativeFolder==='..'||relativeFolder.startsWith('..'+sep)||inside(realFolder))throw Error('EVIDENCE_SCOPE_ESCAPED_DIRECTORY');
  const path=join(folder,name);
  await writeFile(path,bytes,{flag:'wx'});
  const actual=await readFile(path),actualHash=digest(actual);
  if(actual.length!==bytes.length||actualHash!==sha256)throw Error('ARTIFACT_READBACK_MISMATCH');
  return {verified:true,sha256:actualHash,size:actual.length};
 };
}
