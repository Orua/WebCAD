import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MetalMaterials,METAL_FINISHES,CADVIEWER_METAL_REFERENCE,prepareReferenceHdr} from '../src/metal-materials.js';
import {DISPLAY_DEFAULTS,loadDisplayPreferences} from '../src/display-preferences.js';
import {PRODUCT_STUDIO,PRODUCT_STUDIO_SHADER} from '../src/viewport/product-studio.js';

function fixture(){
  const metals=Object.create(MetalMaterials.prototype);
  Object.assign(metals,{disposed:false,materials:new Map(),atlas:null,fallback:new THREE.Texture(),environment:new THREE.Texture(),studioTarget:{texture:new THREE.Texture()}});
  return {metals,material:new THREE.MeshStandardMaterial()};
}
test('reference light gold uses linear RGB, HDR, true roughness, reflectance and body tint',()=>{
  const {metals,material}=fixture();metals.apply(material,'light-gold',{displayPreferences:{environmentMode:'hdr'}});
  assert.deepEqual(material.color.toArray(),METAL_FINISHES['light-gold'].color);
  assert.equal(material.roughness,METAL_FINISHES['light-gold'].roughness);assert.equal(material.metalness,1);
  assert.equal(material.envMap,metals.environment);assert.equal(material.envMapIntensity,METAL_FINISHES['light-gold'].reflectionStrength);
  assert.equal(material.envMapRotation.z,54*Math.PI/180);
  // Three negates envMapRotation before constructing its sampling matrix.
  // Z-up world X must sample the source's equirectangular u=0.65 meridian.
  const e=material.envMapRotation.clone();e.x*=-1;e.y*=-1;e.z*=-1;
  const direction=new THREE.Vector3(1,0,0).applyEuler(e);
  assert.ok(Math.abs(Math.atan2(direction.z,direction.x)/(2*Math.PI)+0.5-0.65)<1e-10);
  assert.equal(metals.materials.get(material).uniforms.webcadMetalBodyTint.value,METAL_FINISHES['light-gold'].metalBodyTint??0.055);
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
  assert.equal(material.envMap,metals.studioTarget.texture);assert.equal(material.envMapIntensity,METAL_FINISHES['light-gold'].reflectionStrength*0.6);
  assert.equal(material.roughness,METAL_FINISHES['light-gold'].roughness+0.2);assert.equal(material.envMapRotation.z,20*Math.PI/180);
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
  assert.equal(u.webcadProductStudio.value,1);assert.equal(u.webcadCoat.value,METAL_FINISHES['24k-gold'].coat);assert.ok(u.webcadCoat.value>0);assert.equal(u.webcadAnisotropy.value,0);
  metals.apply(material,'matt-nickel');assert.equal(u.webcadAnisotropy.value,0.35);assert.equal(u.webcadCoat.value,0);
  metals.apply(material,'nickel',{displayPreferences:{environmentMode:'hdr'}});assert.equal(u.webcadCoat.value,0);assert.equal(u.webcadAnisotropy.value,0);
  metals.apply(material,'antique-brass');assert.equal(u.webcadCoat.value,0);assert.equal(u.webcadAnisotropy.value,0);
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader,/productStudioCoat\(/);
  assert.match(shader.fragmentShader,/roughnessFactor,webcadAnisotropy,webcadStudioKey/);
  assert.match(shader.fragmentShader,/float productSoftbox\(vec3 ray,vec3 center,vec2 size,vec2 blur\)/);
  assert.equal(material.customProgramCacheKey(),'webcad-metal-product-studio-v10-light-tent-gold-depth');
});

test('matte nickel remains brighter than gunmetal and precious metal finishes are selectable',()=>{
  assert.ok(METAL_FINISHES['matt-nickel'].color[0]>METAL_FINISHES.gunmetal.color[0]);
  const luminance=finish=>finish.color[0]*0.2126+finish.color[1]*0.7152+finish.color[2]*0.0722;
  assert.ok(luminance(METAL_FINISHES['matt-nickel'])*METAL_FINISHES['matt-nickel'].reflectionStrength>luminance(METAL_FINISHES.gunmetal)*METAL_FINISHES.gunmetal.reflectionStrength);
  for(const key of ['rose-gold','silver-925','white-gold-18k'])assert.ok(METAL_FINISHES[key],`missing ${key}`);
  const rose=new THREE.Color().setRGB(...METAL_FINISHES['rose-gold'].color,THREE.LinearSRGBColorSpace);
  const target=new THREE.Color('#B76E79');
  assert.ok(Math.hypot(rose.r-target.r,rose.g-target.g,rose.b-target.b)<0.01,'rose gold uses the requested base hue in linear RGB');
});
test('studio v3 light tent keeps dark seams and plating colours stay physically ordered',()=>{
  assert.equal(PRODUCT_STUDIO.version,3);assert.equal(PRODUCT_STUDIO.model,'light-tent');
  for(const name of ['horizon','seamTop','seamSide','cameraOpening'])assert.match(PRODUCT_STUDIO_SHADER,new RegExp(`float ${name}=`));
  for(const name of ['24k-gold','light-gold']){const [r,g,b]=METAL_FINISHES[name].color;assert.ok(r>=g&&g>b,name);assert.ok(g/r>=0.65&&b/r>=0.22,`${name} must read yellow gold, not orange`);}
  const [nr,ng,nb]=METAL_FINISHES.nickel.color;assert.ok(Math.max(nr,ng,nb)-Math.min(nr,ng,nb)<0.02,'bright nickel is neutral');
});
test('24K gold reads deep and saturated, light gold is the bright lacquered gold, matt 24K matches deep gold; depth and hue keep only in studio',()=>{
  const sat=([r,g,b])=>(Math.max(r,g,b)-Math.min(r,g,b))/Math.max(r,g,b);
  const gold=METAL_FINISHES['24k-gold'],light=METAL_FINISHES['light-gold'];
  // 浅金 is the bright lacquered yellow gold (user-approved look); 24K reads deeper through depth/hue keep, not a paler colour.
  assert.deepEqual(light.color,[1.00,0.69,0.25]);assert.equal(light.coat,0.45);assert.equal(light.reflectionStrength,1.08);
  assert.equal(light.depth??0,0);assert.equal(light.hueKeep??0,0);
  assert.ok(gold.depth>0&&gold.hueKeep>0&&gold.coat<light.coat,'24K must be the deeper, less lacquered gold');
  const matt=METAL_FINISHES['matt-24k-gold'];assert.ok(matt.depth>0&&matt.hueKeep>0&&matt.roughness>0.5);
  const [mr,mg,mb]=matt.color;assert.ok(mg/mr>=0.65&&mb/mr>=0.22&&sat(matt.color)<=0.8,'matt 24K must stay yellow gold, not olive/orange');
  const {metals,material}=fixture();metals.apply(material,'24k-gold',{displayPreferences:{environmentMode:'studio'}});
  let u=metals.materials.get(material).uniforms;assert.equal(u.webcadDepth.value,gold.depth);assert.equal(u.webcadHueKeep.value,gold.hueKeep);
  metals.apply(material,'24k-gold',{displayPreferences:{environmentMode:'hdr'}});
  u=metals.materials.get(material).uniforms;assert.equal(u.webcadDepth.value,0);assert.equal(u.webcadHueKeep.value,0);
  metals.apply(material,'nickel',{displayPreferences:{environmentMode:'studio'}});assert.equal(u.webcadDepth.value,0);
});
