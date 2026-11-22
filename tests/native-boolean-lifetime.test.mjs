import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseNativeBoolean,ownNativeBoolean} from '../src/modeling/io/native-boolean-lifetime.js';
test('native Boolean working data is cleared before wrapper deletion, even when Clear fails',()=>{
 for(const fail of [false,true]){
  const calls=[],builder={Clear(){calls.push('clear');if(fail)throw Error('native Clear failed');},delete(){calls.push('delete');}};
  if(fail)assert.throws(()=>releaseNativeBoolean(builder),/native Clear failed/);else releaseNativeBoolean(builder);
  assert.deepEqual(calls,['clear','delete']);
 }
 releaseNativeBoolean(undefined);
});
test('scope ownership tracks Boolean working data without replacing or mutating the native builder',()=>{
 const owned=[],calls=[],builder={Clear(){calls.push('clear');},delete(){calls.push('delete');}},oldDelete=builder.delete;
 assert.equal(ownNativeBoolean(builder,value=>owned.push(value)),builder);assert.equal(builder.delete,oldDelete);
 assert.equal(owned.length,1);owned[0].delete();assert.deepEqual(calls,['clear','delete']);
});
