import test from 'node:test';
import assert from 'node:assert/strict';
import {readBrowserLogo} from '../src/browser-logo-input.js';
test('local logo packets retain validation with no converter requests',async()=>{
  let called=0;const packet={version:1,regions:[{outer:[[0,0],[5,0],[0,5]],holes:[]}]};
  const result=await readBrowserLogo(new File([JSON.stringify(packet)],'part.logo.json'),data=>{called++;assert.deepEqual(data,packet);return data;});
  assert.deepEqual(result,packet);assert.equal(called,1);
  await assert.rejects(readBrowserLogo(new File(['<svg/>'],'part.svg'),()=>{throw new Error('must not run');}),{code:'CAPABILITY_UNAVAILABLE'});
  await assert.rejects(readBrowserLogo(new File([new Uint8Array(2*1024*1024+1)],'big.logo.json'),()=>{}),{code:'SIZE_LIMIT'});
  await assert.rejects(readBrowserLogo(new File(['{'],'bad.logo.json'),()=>{}),SyntaxError);
});
