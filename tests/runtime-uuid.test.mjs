import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash, randomBytes} from 'node:crypto';
const source=await readFile(new URL('../public/automation/runtime-uuid.js',import.meta.url),'utf8');
test('LAN HTTP gets RFC4122 UUIDs from secure random bytes',()=>{
  let calls=0;
  const crypto={getRandomValues:bytes=>{calls++;for(let i=0;i<bytes.length;i++)bytes[i]=i;return bytes;}};
  vm.runInNewContext(source,{crypto});
  assert.equal(crypto.randomUUID(),'00010203-0405-4607-8809-0a0b0c0d0e0f');assert.equal(calls,1);
});
test('native UUID remains unchanged and insecure randomness is rejected',()=>{
  const randomUUID=()=> 'native',crypto={randomUUID};vm.runInNewContext(source,{crypto});assert.equal(crypto.randomUUID,randomUUID);
  assert.throws(()=>vm.runInNewContext(source,{crypto:{}}),/Secure random/);
});

test('HTTP file digest matches SHA-256 for padding boundaries, large files and sliced views', async()=>{
  const crypto={randomUUID:()=> 'native'};
  vm.runInNewContext(source,{crypto,ArrayBuffer,Uint8Array,Uint32Array,DataView,DOMException});
  for(const length of [0,3,55,56,63,64,65,119,120,128,1024*1024+7]){
    const original=randomBytes(length+13),bytes=original.subarray(5,length+5);
    const expected=createHash('sha256').update(bytes).digest('hex');
    const actual=await crypto.subtle.digest({name:'SHA-256'},bytes);
    assert.equal(Buffer.from(actual).toString('hex'),expected,`length ${length}`);
  }
  const bytes=new TextEncoder().encode('abc');
  assert.equal(Buffer.from(await crypto.subtle.digest('sha-256',bytes.buffer)).toString('hex'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await assert.rejects(crypto.subtle.digest('SHA-1',bytes),{name:'NotSupportedError'});
});

test('HTTPS keeps its native SubtleCrypto implementation',()=>{
  const subtle={digest:()=> 'native'},crypto={subtle,randomUUID:()=> 'native'};
  vm.runInNewContext(source,{crypto});assert.equal(crypto.subtle,subtle);
});
