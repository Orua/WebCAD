import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MetalMaterials,prepareReferenceHdr} from '../src/metal-materials.js';
import {METAL_FINISHES,FINISH_KEYS,DEFAULT_METAL_CONFIG,getMetalMaterials,setMetalMaterialRegistry,validateMetalMaterials} from '../src/metal-presets.js';
import {finalStateProject} from '../src/project-final-state.js';
import {validateEditorAction} from '../src/editor-actions.js';
import {contextPolicy} from '../src/page-context-policy.js';
function fixture(){const metals=Object.create(MetalMaterials.prototype);Object.assign(metals,{disposed:false,materials:new Map(),atlas:null,fallback:new THREE.Texture(),environment:new THREE.Texture(),studioTarget:{texture:new THREE.Texture()}});return {metals,material:new THREE.MeshStandardMaterial()};}
test('approved A1/B2 and unchanged nickel/gunmetal share the identical mirror style',()=>{
 assert.deepEqual(METAL_FINISHES['light-gold'].color,[1,.66,.23]);assert.deepEqual(METAL_FINISHES['24k-gold'].color,[.9,.42,.025]);
 assert.deepEqual(METAL_FINISHES.nickel.color,[.76,.76,.76]);assert.deepEqual(METAL_FINISHES.gunmetal.color,[.18,.21,.24]);
 for(const key of ['light-gold','24k-gold','nickel','gunmetal']){const {metals,material}=fixture();metals.apply(material,key,{displayPreferences:{environmentMode:'hdr'}});const u=metals.materials.get(material).uniforms;assert.equal(material.roughness,.055);assert.equal(material.metalness,1);assert.equal(u.webcadProductStudio.value,1);assert.equal(u.webcadCoat.value,0);assert.equal(u.webcadDepth.value,0);assert.equal(u.webcadHueKeep.value,0);assert.equal(material.envMap,metals.studioTarget.texture);}
});
test('invalid configuration is rejected atomically and unknown code/NaN/range/IDs are refused',()=>{
 const before=getMetalMaterials();
 for(const mutate of [c=>c.materials[1].color=[1,NaN,0],c=>c.styles.mirror.roughness=-1,c=>c.styles.mirror.shader='alert(1)',c=>c.materials.push({...c.materials[1]}),c=>c.materials.shift(),c=>c.materials[1].style='missing']){const c=structuredClone(before);mutate(c);assert.throws(()=>setMetalMaterialRegistry(c),{code:'PARAM_SCHEMA_INVALID'});assert.deepEqual(getMetalMaterials(),before);}
});
test('a new parameter style and material drive rendering, editor validation and finish choices together',()=>{
 const before=getMetalMaterials();try{const c=getMetalMaterials();c.styles['cool-mirror']={...c.styles.mirror,reflectionStrength:.7};c.materials.push({id:'custom-blue',label:'蓝色电镀',style:'cool-mirror',color:[.1,.3,.8]});setMetalMaterialRegistry(c);assert.ok(FINISH_KEYS.includes('custom-blue'));const {metals,material}=fixture();metals.apply(material,'custom-blue');assert.deepEqual(material.color.toArray(),[.1,.3,.8]);assert.equal(material.envMapIntensity,.7);assert.doesNotThrow(()=>validateEditorAction('document.appearance',{finish:'custom-blue'},{bodies:[]}));const copy=getMetalMaterials();copy.materials[1].color[0]=0;assert.equal(METAL_FINISHES['light-gold'].color[0],1);}finally{setMetalMaterialRegistry(before);}
});
test('material override wins over its style and an explicit HDR or inherited strategy remains available',()=>{
 const before=getMetalMaterials();try{const c=getMetalMaterials();c.materials[1]={...c.materials[1],roughness:.17,environmentMode:'hdr'};setMetalMaterialRegistry(c);const {metals,material}=fixture();metals.apply(material,'light-gold',{displayPreferences:{environmentMode:'studio',roughnessOffset:.1,exposure:1.7}});const u=metals.materials.get(material).uniforms;assert.ok(Math.abs(material.roughness-.27)<1e-12);assert.equal(material.envMap,metals.environment);assert.equal(u.webcadProductStudio.value,0);assert.equal(u.webcadExposure.value,1.7);c.materials[1].environmentMode='inherit';setMetalMaterialRegistry(c);metals.apply(material,'light-gold',{displayPreferences:{environmentMode:'studio'}});assert.equal(u.webcadProductStudio.value,1);}finally{setMetalMaterialRegistry(before);}
});
test('saved final-state project preserves custom material definitions without altering geometry metadata',()=>{
 const config=getMetalMaterials();config.materials.push({id:'custom-copper',label:'铜色镜面',style:'mirror',color:[.8,.3,.1]});const doc={version:4,features:[],appearance:{},renderFinish:'custom-copper',renderMaterials:config};const saved=finalStateProject(doc,[]);assert.deepEqual(validateMetalMaterials(saved.renderMaterials),config);assert.equal(saved.renderFinish,'custom-copper');assert.deepEqual(saved.features,[]);
});
test('HDR upload retains source orientation and finite linear radiance',()=>{const data=new Float32Array([.1,.2,4,1]),t=new THREE.DataTexture(data,1,1,THREE.RGBAFormat,THREE.FloatType);prepareReferenceHdr(t);assert.equal(t.flipY,false);assert.equal(t.colorSpace,THREE.LinearSRGBColorSpace);assert.equal(t.image.data,data);});
test('design, selection tint and old shader state reset correctly on switching materials',()=>{
 const {metals,material}=fixture();metals.apply(material,'light-gold');metals.setSelected(material,true);assert.equal(metals.materials.get(material).uniforms.webcadSelection.value,1);const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};material.onBeforeCompile(shader);assert.match(shader.fragmentShader,/productStudioSpecular/);assert.match(shader.fragmentShader,/sRGBTransferOETF/);metals.apply(material,'design',{baseColor:'#aac4d9'});assert.equal(material.envMap,null);assert.equal(shader.uniforms.webcadFinishMetal.value,0);assert.equal(shader.uniforms.webcadProductStudio.value,0);assert.deepEqual(material.color.toArray(),new THREE.Color('#aac4d9').toArray());
});
test('registry keeps all existing material IDs and context requirements',()=>{for(const m of DEFAULT_METAL_CONFIG.materials)assert.ok(FINISH_KEYS.includes(m.id));assert.equal(contextPolicy('getMetalMaterials'),'none');assert.equal(contextPolicy('setMetalMaterials'),'identity');});
