import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sanitizeSurface,applyDesignSurface,sceneLightingState} from '../src/surface-overrides.js';
import {validateEditorAction} from '../src/editor-actions.js';
import {METAL_FINISHES} from '../src/metal-presets.js';

test('one gunmetal body switches the scene to global metal lighting and it is reported (R7-010)',()=>{
  assert.deepEqual(sceneLightingState('design',{},['a','b']),{mode:'design',designBodiesUnderMetalLighting:0});
  assert.deepEqual(sceneLightingState('design',{b:'gunmetal'},['a','b','c']),{mode:'metal-global',designBodiesUnderMetalLighting:2});
  const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/code:'METAL_LIGHTING_GLOBAL'/);
});

test('design roughness override is per body, persisted and ignored by metal finishes (R7-014)',()=>{
  assert.deepEqual(sanitizeSurface({a:{roughness:0.9},b:{roughness:2},c:null}),{a:{roughness:0.9}});
  const m={roughness:0.42};assert.equal(applyDesignSurface(m,'design',{roughness:0.9}),true);assert.equal(m.roughness,0.9);
  const metal={roughness:0.1};assert.equal(applyDesignSurface(metal,'gunmetal',{roughness:0.9}),false);assert.equal(metal.roughness,0.1);
  assert.equal(METAL_FINISHES.design.roughness,0.42,'design default unchanged');assert.equal(METAL_FINISHES.design.metalness,0.15);
  const state={bodies:[{id:'a'}],features:[]};
  assert.doesNotThrow(()=>validateEditorAction('body.appearance',{bodyIds:['a'],roughness:0.9},state));
  assert.throws(()=>validateEditorAction('body.appearance',{bodyIds:['a'],roughness:1.5},state));
});
