import test from 'node:test';import assert from 'node:assert/strict';
import {uploadChunked,planChunks,assertArtifactSize,sha256Hex} from '../src/transfer/chunked-upload.js';
import {LIMITS} from '../src/limits.js';
const fakeServer=({failOnce=new Set(),dropAfter=Infinity}={})=>{
  const s={parts:new Map(),puts:0,meta:null,
    async start(m){s.meta=m;return {uploadId:'u1',received:[...s.parts.keys()]};},
    async status(){return {received:[...s.parts.keys()]};},
    async putChunk(id,index,view,digest){s.puts++;if(s.puts>dropAfter){s.dropped=true;dropAfter=Infinity;throw Object.assign(new Error('network'),{code:'NETWORK'});}
      if(failOnce.has(index)){failOnce.delete(index);throw Object.assign(new Error('transient'),{code:'NETWORK'});}
      assert.equal(await sha256Hex(view),digest);s.parts.set(index,new Uint8Array(view));},
    async complete(){const all=[...s.parts.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]);const total=all.reduce((n,a)=>n+a.length,0),out=new Uint8Array(total);let o=0;for(const a of all){out.set(a,o);o+=a.length;}
      assert.equal(await sha256Hex(out),s.meta.sha256);return {status:'agent_write_verified',size:total};}};return s;};
const limits={...LIMITS.transport,chunkBytes:1024};
test('transport limits are the decided values',()=>{const t=LIMITS.transport;assert.equal(t.maxArtifactBytes,100*1024*1024);assert.equal(t.maxInputBytes,100*1024*1024);assert.equal(t.maxResultBytes,6*1024*1024);assert.equal(t.commandTimeoutMs,90000);assert.equal(t.chunkBytes,4*1024*1024);assert.ok(Object.isFrozen(t));});
test('plans 4 MiB chunks covering every byte',()=>{const c=planChunks(10*1024*1024+1);assert.equal(c.length,3);assert.equal(c.at(-1).length,2*1024*1024+1);});
test('rejects above 100 MiB with a Chinese message, accepts exactly 100 MiB',()=>{assert.doesNotThrow(()=>assertArtifactSize(LIMITS.transport.maxArtifactBytes));assert.throws(()=>assertArtifactSize(LIMITS.transport.maxArtifactBytes+1),e=>e.code==='SIZE_LIMIT'&&/超过 100\.0 MB 上限/.test(e.message));});
test('uploads all chunks with per-chunk and whole-file hashes, retrying transient failures',async()=>{const bytes=new Uint8Array(5000).map((_,i)=>i%251),s=fakeServer({failOnce:new Set([2])});const r=await uploadChunked({bytes,name:'a.stl',client:s,limits});assert.equal(r.chunkCount,5);assert.equal(r.descriptor.size,5000);assert.equal(s.parts.size,5);});
test('resumes: chunks already on the server are not resent',async()=>{const bytes=new Uint8Array(4096).fill(7),s=fakeServer();s.parts.set(0,bytes.subarray(0,1024));s.parts.set(1,bytes.subarray(1024,2048));const r=await uploadChunked({bytes,name:'a.step',client:s,limits});assert.equal(s.puts,2);assert.equal(r.descriptor.size,4096);});
test('after a dropped connection only missing chunks are resent',async()=>{const bytes=new Uint8Array(8192).fill(3),s=fakeServer({dropAfter:3});await uploadChunked({bytes,name:'a.step',client:s,limits:{...limits,chunkRetries:0,chunkConcurrency:1}});assert.ok(s.dropped);assert.equal(s.parts.size,8);assert.equal(s.puts,9);});
import {createBrokerUploadClient} from '../src/transfer/chunked-upload.js';
test('broker client maps to codexagent upload routes and surfaces Chinese 413 errors',async()=>{
  const calls=[];const fetchImpl=async(url,init)=>{calls.push([init.method,url,init.headers['X-Chunk-Sha256']]);if(url.endsWith('/uploads'))return {ok:true,json:async()=>({uploadId:'a'.repeat(32),received:[]})};if(url.includes('/complete'))return {ok:false,status:413,json:async()=>({error:{code:'RESOURCE_LIMIT',message:'导出文件超过上限'}})};return {ok:true,json:async()=>({received:[0]})};};
  const c=createBrokerUploadClient({apiBase:'https://h/x/',sessionId:'s 1',commandId:'c',fetchImpl});
  await c.start({name:'a.step',size:3,sha256:'f'.repeat(64),chunkBytes:4});await c.putChunk('a'.repeat(32),0,new Uint8Array(3),'e'.repeat(64));
  await assert.rejects(c.complete('a'.repeat(32)),e=>e.code==='RESOURCE_LIMIT'&&e.status===413);
  assert.equal(calls[0][1],'https://h/x/api/webcad/sessions/s%201/artifacts/uploads');assert.equal(calls[1][0],'PUT');assert.match(calls[1][1],/chunks\/0\?commandId=c$/);assert.equal(calls[1][2],'e'.repeat(64));});
