import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTextCommands} from '../src/text-commands.js';

test('text commands compile explicit modeling and measurement steps',()=>{
  const steps=compileTextCommands('add box width=30 depth=20 height=2.5 name="牌子"\nmeasure $last');
  assert.deepEqual({...steps[0].args.params},{width:30,depth:20,height:2.5});
  assert.equal(steps[0].args.name,'牌子');
  assert.deepEqual(steps[1].args.bodyId,{$ref:'line1.createdBodyIds.0'});
  const surface=compileTextCommands('add fittedSurface points=[[[0,0,0],[1,0,0],[2,0,0]],[[0,1,0],[1,1,0],[2,1,0]],[[0,2,0],[1,2,0],[2,2,0]]] tolerance=0.01');
  assert.equal(surface[0].args.params.points.length,3);
});

test('text command parser rejects code-like verbs and malformed values',()=>{
  assert.throws(()=>compileTextCommands('eval alert(1)'),{code:'PARAM_SCHEMA_INVALID'});
  assert.throws(()=>compileTextCommands('add box width=[1,2'),{code:'PARAM_SCHEMA_INVALID'});
  assert.throws(()=>compileTextCommands('add box width=2 width=3'),{code:'PARAM_SCHEMA_INVALID'});
});
