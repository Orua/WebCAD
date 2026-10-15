import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MetalMaterials,METAL_FINISHES,CADVIEWER_METAL_REFERENCE,prepareReferenceHdr} from '../src/metal-materials.js';
import {DISPLAY_DEFAULTS,loadDisplayPreferences} from '../src/display-preferences.js';

function fixture(){
  const metals=Object.create(MetalMaterials.prototype);
  Object.assign(metals,{disposed:false,materials:new Map(),atlas:null,fallback:new THREE.Texture(),environment:new THREE.Texture(),studioTarget:{texture:new THREE.Texture()}});
  return {metals,material:new THREE.MeshStandardMaterial()};
}
test('reference light gold uses linear RGB, HDR, true roughness, reflectance and body tint',()=>{
  const {metals,material}=fixture();metals.apply(material,'light-gold',{displayPreferences:{environmentMode:'hdr'}});
  assert.deepEqual(material.color.toArray(),METAL_FINISHES['light-gold'].color);
  assert.equal(material.roughness,0.105);assert.equal(material.metalness,1);
  assert.equal(material.envMap,metals.environment);assert.equal(material.envMapIntensity,1.28);
  assert.equal(material.envMapRotation.z,54*Math.PI/180);
  // Three negates envMapRotation before constructing its sampling matrix.
  // Z-up world X must sample the source's equirectangular u=0.65 meridian.
  const e=material.envMapRotation.clone();e.x*=-1;e.y*=-1;e.z*=-1;
  const direction=new THREE.Vector3(1,0,0).applyEuler(e);
  assert.ok(Math.abs(Math.atan2(direction.z,direction.x)/(2*Math.PI)+0.5-0.65)<1e-10);
  assert.equal(metals.materials.get(material).uniforms.webcadMetalBodyTint.value,0.055);
  assert.equal(metals.materials.get(material).uniforms.webcadExposure.value,1);
  assert.equal(metals.materials.get(material).uniforms.webcadSuppressDirect.value,1);
});
test('HDR upload preserves linear radiance and source scanline orientation',()=>{
  const data=new Float32Array([0.1,0.2,4.0,1.0]);
  const texture=new THREE.DataTexture(data,1,1,THREE.RGBAFormat,THREE.FloatType);texture.flipY=true;
  assert.equal(prepareReferenceHdr(texture),texture);assert.equal(texture.flipY,false);
  assert.equal(texture.colorSpace,THREE.LinearSRGBColorSpace);assert.equal(texture.image.data,data);
  assert.deepEqual(Array.from(data),Array.from(new Float32Array([0.1,0.2,4.0,1.0])));
});
test('real Three shader receives reference tone/gamma and design colours retain host conversion',()=>{
  const {metals,material}=fixture();metals.apply(material,'24k-gold',{displayPreferences:{environmentMode:'hdr'}});
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.webcadMetalBodyTint.value,0.13);
  assert.match(shader.fragmentShader,/outgoingLight\+=diffuseColor\.rgb\*webcadMetalBodyTint/);
  assert.match(shader.fragmentShader,/outgoingLight-=reflectedLight\.directSpecular\*webcadSuppressDirect/);
  assert.match(shader.fragmentShader,/webcadReferenceToneMap\(gl_FragColor\.rgb\*webcadExposure\)/);
  assert.match(shader.fragmentShader,/gl_FragColor=sRGBTransferOETF\(gl_FragColor\)/);
  assert.match(shader.fragmentShader,/else\{\n#include <tonemapping_fragment>/);
  assert.match(shader.fragmentShader,/else\{\n#include <colorspace_fragment>/);
  metals.apply(material,'design',{baseColor:'#aac4d9'});
  assert.equal(shader.uniforms.webcadFinishMetal.value,0);assert.equal(shader.uniforms.webcadMetalBodyTint.value,0);
  assert.equal(shader.uniforms.webcadSuppressDirect.value,0);
  assert.deepEqual(material.color.toArray(),new THREE.Color('#aac4d9').toArray());assert.equal(material.envMap,null);
});
test('personal exposure, studio choice, rotation and roughness remain effective',()=>{
  const {metals,material}=fixture();
  metals.apply(material,'light-gold',{displayPreferences:{environmentMode:'studio',exposure:1.7,environmentIntensity:0.6,roughnessOffset:0.2,environmentRotation:20}});
  assert.equal(material.envMap,metals.studioTarget.texture);assert.equal(material.envMapIntensity,1.28*0.6);
  assert.equal(material.roughness,0.105+0.2);assert.equal(material.envMapRotation.z,20*Math.PI/180);
  assert.equal(metals.materials.get(material).uniforms.webcadExposure.value,1.7);
  assert.equal(metals.materials.get(material).uniforms.webcadSuppressDirect.value,0);
});
test('custom lighting and missing HDR keep direct highlights; repeated apply keeps longitude stable',()=>{
  const {metals,material}=fixture();
  metals.apply(material,'light-gold',{displayPreferences:{keyIntensity:2.1}});
  assert.equal(metals.materials.get(material).uniforms.webcadSuppressDirect.value,0);
  metals.apply(material,'light-gold',{displayPreferences:{lightAzimuth:20}});
  assert.equal(metals.materials.get(material).uniforms.webcadSuppressDirect.value,0);
  const rotation=material.envMapRotation.z;
  metals.apply(material,'light-gold');assert.equal(material.envMapRotation.z,rotation);
  metals.environment=null;metals.apply(material,'light-gold');
  assert.equal(material.envMap,metals.studioTarget.texture);
  assert.equal(metals.materials.get(material).uniforms.webcadSuppressDirect.value,0);
});
test('new product studio defaults leave previously saved display cookies unchanged',()=>{
  for(const key of ['environmentMode','exposure','environmentIntensity','roughnessOffset'])assert.equal(DISPLAY_DEFAULTS[key],CADVIEWER_METAL_REFERENCE[key]);
  const original=globalThis.document;
  try{
    globalThis.document={cookie:'webcad.display.v1='+encodeURIComponent(JSON.stringify({environmentMode:'studio',roughnessOffset:0.12,environmentIntensity:0.65,exposure:1.4}))};
    const preferences=loadDisplayPreferences();assert.equal(preferences.environmentMode,'studio');assert.equal(preferences.roughnessOffset,0.12);
    assert.equal(preferences.environmentIntensity,0.65);assert.equal(preferences.exposure,1.4);
  }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});

test('product studio puts its key light to the side and migrates only untouched old defaults',()=>{
  const {metals,material}=fixture();metals.apply(material,'nickel');
  const u=metals.materials.get(material).uniforms;
  assert.equal(u.webcadProductStudio.value,1);
  assert.ok(u.webcadStudioKey.value.x < -0.75);
  assert.ok(u.webcadStudioKey.value.z < 0.5);
  assert.equal(u.webcadMetalBodyTint.value,0.012);
  const original=globalThis.document;
  try{
    const old={environmentMode:'hdr',exposure:1,environmentIntensity:1,environmentRotation:0,roughnessOffset:0,lightAzimuth:-60,lightElevation:55,keyIntensity:1.3,fillIntensity:0.6,ambientIntensity:0.7,defaultColor:'#123456'};
    globalThis.document={cookie:'webcad.display.v1='+encodeURIComponent(JSON.stringify(old))};
    assert.equal(loadDisplayPreferences().environmentMode,'studio');
    assert.equal(loadDisplayPreferences().defaultColor,'#123456');
    old.exposure=0.8;globalThis.document.cookie='webcad.display.v1='+encodeURIComponent(JSON.stringify(old));
    assert.equal(loadDisplayPreferences().environmentMode,'hdr');
    assert.equal(loadDisplayPreferences().exposure,0.8);
  }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});

test('studio v2: lacquer coat on polished plating, brushed anisotropy on matt finishes, HDR keeps reference',()=>{
  const {metals,material}=fixture();
  metals.apply(material,'24k-gold');let u=metals.materials.get(material).uniforms;
  assert.equal(u.webcadProductStudio.value,1);assert.equal(u.webcadCoat.value,0.45);assert.equal(u.webcadAnisotropy.value,0);
  metals.apply(material,'matt-nickel');assert.equal(u.webcadAnisotropy.value,0.35);assert.equal(u.webcadCoat.value,0);
  metals.apply(material,'nickel',{displayPreferences:{environmentMode:'hdr'}});assert.equal(u.webcadCoat.value,0);assert.equal(u.webcadAnisotropy.value,0);
  metals.apply(material,'antique-brass');assert.equal(u.webcadCoat.value,0);assert.equal(u.webcadAnisotropy.value,0);
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader,/productStudioCoat\(/);
  assert.match(shader.fragmentShader,/roughnessFactor,webcadAnisotropy,webcadStudioKey/);
  assert.match(shader.fragmentShader,/float productSoftbox\(vec3 ray,vec3 center,vec2 size,vec2 blur\)/);
  assert.equal(material.customProgramCacheKey(),'webcad-metal-product-studio-v8-softbox-coat-aniso');
});
