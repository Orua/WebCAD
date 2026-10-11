import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
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
