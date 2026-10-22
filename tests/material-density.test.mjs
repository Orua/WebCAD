import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultMaterialSettings,validateMaterialSettings,materialWeight,inheritBodyMaterials} from '../src/material-density.js';
import {validateEditorAction} from '../src/editor-actions.js';
import {finalStateProject} from '../src/project-final-state.js';
test('density uses cubic millimetres to grams, supports configured values and never treats missing volume as zero',()=>{
 const s=defaultMaterialSettings();assert.equal(materialWeight(1000,s,'a').massGrams,6.6);s.densities.copper=8.9;s.bodyMaterials.a='copper';assert.equal(materialWeight(2000,s,'a').massGrams,17.8);
 for(const v of [null,undefined,0,-1,NaN])assert.equal(materialWeight(v,s,'a').massGrams,null);
 assert.throws(()=>validateMaterialSettings({...s,densities:{...s.densities,iron:0}}),{code:'PARAM_SCHEMA_INVALID'});assert.throws(()=>materialWeight(10,s,'a','unknown'),{code:'PARAM_SCHEMA_INVALID'});
});
test('transforms inherit assigned material and final-state disk save retains only current assignments',()=>{
 const s=defaultMaterialSettings();s.bodyMaterials.base='copper';const features=[{id:'base',refs:[]},{id:'moved',refs:['base']}],next=inheritBodyMaterials(s,features,['moved']);assert.equal(next.bodyMaterials.moved,'copper');assert.equal(s.bodyMaterials.moved,undefined);
 const document={materialSettings:next,features,imports:{}};const saved=finalStateProject(document,[{id:'moved',format:'brep',data:new Uint8Array([1])}]);assert.deepEqual(saved.materialSettings.bodyMaterials,{moved:'copper'});
 assert.equal(validateEditorAction('document.materials',{settings:s},{features,bodies:[]}).command,'editor_action');
});
