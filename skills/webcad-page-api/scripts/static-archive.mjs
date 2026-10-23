import {inflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const fail=message=>{throw Object.assign(new Error(message),{code:'KNOWLEDGE_HASH_MISMATCH'});};
export function unpackKnowledgeZip(bytes,descriptor){
  const digest='sha256:'+createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==descriptor.sizeBytes||digest!==descriptor.sha256)fail('Unified ZIP hash/size mismatch.');
  const expected=new Map(descriptor.files.map(f=>[f.name,f]));
  if(expected.size!==descriptor.files.length||expected.size>64)fail('Invalid finite archive.');
  let end=bytes.length-22;
  while(end>=Math.max(0,bytes.length-65557)&&bytes.readUInt32LE(end)!==0x06054b50)end--;
  if(end<0||bytes.readUInt16LE(end+10)!==expected.size)fail('Invalid ZIP directory.');
  let cursor=bytes.readUInt32LE(end+16),total=0;
  const result=new Map();
  for(let i=0;i<expected.size;i++){
    if(bytes.readUInt32LE(cursor)!==0x02014b50)fail('Invalid ZIP entry.');
    const method=bytes.readUInt16LE(cursor+10),packed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24);
    const length=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),offset=bytes.readUInt32LE(cursor+42);
    const name=bytes.subarray(cursor+46,cursor+46+length).toString('utf8'),file=expected.get(name);
    if(!file||result.has(name)||name.startsWith('/')||name.includes('..')||name.includes('\\')||size!==file.sizeBytes||size>16*1024*1024||(total+=size)>24*1024*1024)fail('Unexpected or oversized ZIP entry.');
    if(bytes.readUInt32LE(offset)!==0x04034b50||bytes.readUInt16LE(offset+6)&1)fail('Unsupported ZIP header.');
    const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28);
    if(start+packed>cursor)fail('Invalid ZIP payload bounds.');
    const data=method===0?bytes.subarray(start,start+packed):method===8?inflateRawSync(bytes.subarray(start,start+packed),{maxOutputLength:size+1}):fail('Unsupported ZIP compression.');
    if(data.length!==size||'sha256:'+createHash('sha256').update(data).digest('hex')!==file.sha256)fail('ZIP file hash mismatch.');
    result.set(name,data);cursor+=46+length+extra+comment;
  }
  return result;
}
