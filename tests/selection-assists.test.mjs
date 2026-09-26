import test from 'node:test';
import assert from 'node:assert/strict';
import {CADViewport} from '../src/viewport.js';

test('temporary isolation and transparency never erase persistent hidden bodies',()=>{
  const viewport=Object.create(CADViewport.prototype),entry=()=>({root:{visible:true},mesh:{material:{}},edges:{children:[]}});
  Object.assign(viewport,{objects:new Map(['a','b','hidden'].map(id=>[id,entry()])),selected:['a'],hidden:['hidden'],updateHud(){}});
  viewport.setTemporaryDisplay('selectedOnly');
  assert.equal(viewport.objects.get('a').root.visible,true);assert.equal(viewport.objects.get('b').root.visible,false);
  viewport.setTemporaryDisplay('transparentOthers');assert.equal(viewport.objects.get('b').root.visible,true);assert.equal(viewport.objects.get('b').mesh.material.opacity,.2);
  viewport.setTemporaryDisplay('normal');assert.equal(viewport.objects.get('b').mesh.material.opacity,1);assert.equal(viewport.objects.get('hidden').root.visible,false);assert.deepEqual(viewport.hidden,['hidden']);
});
