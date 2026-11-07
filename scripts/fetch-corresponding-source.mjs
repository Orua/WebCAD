import {readFile,mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {resolve,basename,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),directory=process.argv[2]&&resolve(process.argv[2]);
if(!directory||directory===root||directory.startsWith(root+sep))throw Error('Supply an explicit source-material directory outside the repository.');
const manifest=JSON.parse(await readFile(resolve(root,'corresponding-source/native-materials.json'),'utf8'));
await mkdir(directory,{recursive:true});const records=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const entry of manifest.archives){
 if(entry.name!==basename(entry.name)||!/^https:\/\//.test(entry.url)||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid pinned material entry');
 const path=resolve(directory,entry.name);let bytes=await readFile(path).catch(()=>null),reused=!!bytes;
 if(!bytes){const response=await fetch(entry.url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Source download failed: '+entry.name+' HTTP '+response.status);bytes=Buffer.from(await response.arrayBuffer());}
 if(bytes.length!==entry.bytes||hash(bytes)!==entry.sha256)throw Error('Source material hash or size mismatch: '+entry.name);
 if(!reused){const temporary=path+'.partial-'+randomUUID();try{await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,path);}finally{await rm(temporary,{force:true});}}
 records.push({name:entry.name,sha256:entry.sha256,bytes:bytes.length,reused});console.log('Verified '+entry.name);
}
await writeFile(resolve(directory,'verified-materials.json'),JSON.stringify({schemaVersion:1,records},null,2)+'\n');
