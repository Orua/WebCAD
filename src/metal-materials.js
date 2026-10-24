import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {createMetalOcclusionUniforms,metalOcclusionShader} from './viewport/metal-occlusion.js';
import {PRODUCT_STUDIO_SHADER} from './viewport/product-studio.js';

// CadViewer's reference uses linear RGB, unit exposure, and a +0.15 turn
// longitude offset in its HDR sampler. Keep finish data separate from sRGB UI colours.
export const CADVIEWER_METAL_REFERENCE = Object.freeze({environmentMode:'hdr',exposure:1,environmentIntensity:1,roughnessOffset:0,hdrLongitudeOffsetDeg:54,metalBodyTint:0.012,keyIntensity:1.3,fillIntensity:0.45,ambientIntensity:0.4,lightAzimuth:-65,lightElevation:25});

export function prepareReferenceHdr(texture){
  texture.colorSpace=THREE.LinearSRGBColorSpace;
  // CadViewer uploads the Radiance scanline atlas with UNPACK_FLIP_Y=false;
  // HDRLoader's default true would reverse the matching reflection bands.
  texture.flipY=false;
  return texture;
}

import {METAL_FINISHES} from './metal-presets.js';
export {METAL_FINISHES} from './metal-presets.js';

const declarations = /* glsl */`
varying vec3 webcadObjectPosition;
varying vec3 webcadObjectNormal;
varying vec3 webcadStudioPoint;
uniform sampler2D webcadAntiqueAtlas;
uniform float webcadAntiqueStrength;
uniform float webcadAtlasOffset;
uniform float webcadTextureScale;
uniform float webcadPitStrength;
uniform float webcadRadius;
uniform vec3 webcadCenter;
uniform vec3 webcadPatina;
uniform float webcadSatin;
uniform float webcadFinishMetal;
uniform float webcadMetalBodyTint;
uniform float webcadExposure;
uniform float webcadSuppressDirect;
uniform float webcadSelection;
uniform float webcadProductStudio;
uniform float webcadReflectionStrength;
uniform float webcadCoat;
uniform float webcadAnisotropy;
uniform float webcadHueKeep;
uniform float webcadDepth;
uniform vec3 webcadStudioKey;
uniform vec3 webcadStudioLevels;
${PRODUCT_STUDIO_SHADER}
${metalOcclusionShader}
vec3 webcadReferenceToneMap(vec3 color) {
  color=max(color,vec3(0.0));
  return clamp((color*(2.51*color+0.03))/(color*(2.43*color+0.59)+0.14),0.0,1.0);
}
float webcadHash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
float webcadNoise(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(webcadHash(i),webcadHash(i+vec3(1,0,0)),f.x),mix(webcadHash(i+vec3(0,1,0)),webcadHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(webcadHash(i+vec3(0,0,1)),webcadHash(i+vec3(1,0,1)),f.x),mix(webcadHash(i+vec3(0,1,1)),webcadHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec3 webcadAtlas(vec2 coords) {
  vec2 wrapped=1.0-abs(fract(coords*0.5)*2.0-1.0);
  float gutter=0.003;
  return texture2D(webcadAntiqueAtlas,vec2(mix(webcadAtlasOffset+gutter,webcadAtlasOffset+0.5-gutter,wrapped.x),mix(gutter,1.0-gutter,wrapped.y))).rgb;
}
vec3 webcadTriplanar(vec3 p, vec3 weights, vec2 offset) {
  return webcadAtlas(p.yz+offset)*weights.x+webcadAtlas(p.xz+offset)*weights.y+webcadAtlas(p.xy+offset)*weights.z;
}
`;
const surface = /* glsl */`
vec3 webcadPoint=(webcadObjectPosition-webcadCenter)/max(webcadRadius,0.001);
float webcadGrain=webcadNoise(webcadPoint*160.0);
float webcadPits=0.0;
float webcadCloud=0.0;
if(webcadAntiqueStrength>0.0) {
  vec3 weights=pow(abs(normalize(webcadObjectNormal)),vec3(3.0));
  weights/=max(weights.x+weights.y+weights.z,0.0001);
  vec3 uvPoint=webcadPoint*webcadTextureScale;
  vec3 reference=webcadTriplanar(uvPoint,weights,vec2(0.0));
  float luma=dot(reference,vec3(0.2126,0.7152,0.0722));
  vec3 nearby=(webcadTriplanar(uvPoint,weights,vec2(0.006,0.004))+webcadTriplanar(uvPoint,weights,-vec2(0.006,0.004)))*0.5;
  webcadPits=smoothstep(0.020,0.12,max(dot(nearby,vec3(0.2126,0.7152,0.0722))-luma,0.0));
  float mean=mix(0.34,0.57,step(0.25,webcadAtlasOffset));
  float variation=clamp(pow(max(luma/mean,0.05),0.62),0.48,1.38);
  webcadCloud=smoothstep(0.60,0.88,webcadNoise(webcadPoint*7.5)*0.68+webcadNoise(webcadPoint*vec3(15,48,15))*0.32)*0.22;
  vec3 aged=diffuseColor.rgb*mix(1.0,variation,0.72)*mix(0.98,0.62,webcadCloud);
  aged=mix(aged,webcadPatina,clamp(webcadCloud*0.15+webcadPits*webcadPitStrength,0.0,0.88));
  diffuseColor.rgb=mix(diffuseColor.rgb,aged,webcadAntiqueStrength);
}
diffuseColor.rgb*=1.0+webcadSatin*(webcadGrain-0.5)*0.06;
`;

/** Applies metal finish shading without modifying BRep data or scene backgrounds.
 * `ready` always resolves { environment, antique }; failures call onError(message).
 * `environment` is the owned PMREM texture (null until loaded).
 * A material may be applied repeatedly; finish changes update uniforms, not shaders.
 */
export class MetalMaterials {
  getOcclusionUniforms(){return this.occlusionUniforms??=createMetalOcclusionUniforms();}
  constructor(renderer, scene, { onError } = {}) {
    this.renderer=renderer; this.scene=scene; this.onError=onError;
    this.environment=null; this.environmentTarget=null; this.atlas=null; this.disposed=false;
    this.materials=new Map();
    const studio=new RoomEnvironment(),generator=new THREE.PMREMGenerator(renderer);
    try{this.studioTarget=generator.fromScene(studio,0.04);}finally{studio.dispose();generator.dispose();}
    this.fallback=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1);
    this.fallback.needsUpdate=true;
    this.ready=this.load();
  }
  async load() {
    const base=import.meta.env?.BASE_URL || '/';
    const results=await Promise.allSettled([
      (async()=>{
        const hdr=await new HDRLoader().loadAsync(`${base}render-assets/studio-small-09.bin`);
        if(this.disposed){hdr.dispose();return false;}
        prepareReferenceHdr(hdr);
        const generator=new THREE.PMREMGenerator(this.renderer);
        try {this.environmentTarget=generator.fromEquirectangular(hdr);this.environment=this.environmentTarget.texture;}
        finally {hdr.dispose();generator.dispose();}
        return true;
      })(),
      (async()=>{
        const texture=await new THREE.TextureLoader().loadAsync(`${base}render-assets/antique-metal-reference.jpg`);
        if(this.disposed){texture.dispose();return false;}
        // The original atlas is sampled as reference luminance in sRGB byte space.
        // Its color is never used directly as linear lighting input.
        texture.colorSpace=THREE.NoColorSpace;
        texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
        texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;
        texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
        this.atlas=texture; return true;
      })(),
    ]);
    results.forEach((result,i)=>{if(result.status==='rejected'&&!this.disposed)this.onError?.(`${i===0?'金属 HDR 环境':'古铜／古银参考纹理'}加载失败，请确认 render-assets 文件完整并刷新页面。${result.reason?.message||''}`);});
    if(!this.disposed) for(const [material,state] of this.materials)this.apply(material,state.key,state.options);
    return {environment:!!this.environment,antique:!!this.atlas};
  }
  apply(material,finishKey,{bounds,baseColor=0xaac4d9,displayPreferences={}}={}) {
    if(this.disposed)return material;
    if(!material?.isMeshStandardMaterial)throw new Error('金属渲染需要 MeshStandardMaterial');
    const key=Object.hasOwn(METAL_FINISHES,finishKey)?finishKey:'design', finish=METAL_FINISHES[key];
    let state=this.materials.get(material);
    if(!state){
      const uniforms={
        ...this.getOcclusionUniforms(),
        webcadAntiqueAtlas:{value:this.atlas||this.fallback},webcadAntiqueStrength:{value:0},
        webcadAtlasOffset:{value:0},webcadTextureScale:{value:1.35},webcadPitStrength:{value:0.82},
        webcadRadius:{value:1},webcadCenter:{value:new THREE.Vector3()},webcadPatina:{value:new THREE.Color()},webcadSatin:{value:0},
        webcadFinishMetal:{value:0},webcadMetalBodyTint:{value:0},webcadExposure:{value:1},webcadSuppressDirect:{value:0},webcadSelection:{value:0},webcadProductStudio:{value:0},webcadReflectionStrength:{value:1},webcadCoat:{value:0},webcadAnisotropy:{value:0},webcadHueKeep:{value:0},webcadDepth:{value:0},webcadStudioKey:{value:new THREE.Vector3()},webcadStudioLevels:{value:new THREE.Vector3()},
      };
      state={uniforms,key,options:{bounds,baseColor}};this.materials.set(material,state);
      state.onDispose=()=>this.materials.delete(material);material.addEventListener('dispose',state.onDispose);
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 webcadObjectPosition;\nvarying vec3 webcadObjectNormal;\nvarying vec3 webcadStudioPoint;\nuniform vec3 webcadCenter;\nuniform float webcadRadius;').replace('#include <begin_vertex>','#include <begin_vertex>\nwebcadObjectPosition=position; webcadObjectNormal=normal; webcadStudioPoint=mat3(modelViewMatrix)*(position-webcadCenter)/max(webcadRadius,0.001);');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${declarations}`).replace('#include <color_fragment>',`#include <color_fragment>\n${surface}`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+webcadAntiqueStrength*(webcadPits*0.20+webcadCloud*0.12)+webcadSatin*(webcadGrain-0.5)*0.06,0.06,1.0);`).replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=1.0-webcadAntiqueStrength*webcadPits*0.25;');
        // Metal keeps the scalar ACES approximation; output uses the exact sRGB transfer.
        // Three's ACESFilmic has AP1 matrices and a /0.6 scale; using it here
        // changes the same gold RGB. Design colours retain the host pipeline.
        shader.fragmentShader=shader.fragmentShader
          .replace('#include <opaque_fragment>','if(webcadProductStudio>0.5){outgoingLight-=reflectedLight.indirectSpecular+reflectedLight.directSpecular;vec3 webcadSpec=productStudioSpecular(normalize(normal),normalize(vViewPosition),diffuseColor.rgb,roughnessFactor,webcadAnisotropy,webcadStudioKey,webcadStudioLevels,webcadStudioPoint)*webcadReflectionStrength;float webcadSpecLum=dot(webcadSpec,vec3(0.2126,0.7152,0.0722));webcadSpec*=pow(max(diffuseColor.rgb,vec3(0.02)),vec3(webcadDepth*(1.0-smoothstep(0.35,1.8,webcadSpecLum))));outgoingLight+=webcadSpec;if(webcadCoat>0.0){float webcadCoatFresnel;vec3 webcadCoatLight=productStudioCoat(normalize(normal),normalize(vViewPosition),webcadStudioKey,webcadStudioLevels,webcadStudioPoint,webcadCoatFresnel);outgoingLight=outgoingLight*(1.0-webcadCoatFresnel*webcadCoat)+webcadCoatLight*webcadCoat;}}else{outgoingLight-=reflectedLight.directSpecular*webcadSuppressDirect;}\noutgoingLight+=diffuseColor.rgb*webcadMetalBodyTint;\nfloat webcadCavityFactor=1.0;\nif(webcadFinishMetal>0.5&&diffuseColor.a>=0.999)webcadCavityFactor=webcadCavityLight(-vViewPosition,normalize(normal));\noutgoingLight*=webcadCavityFactor;\n#include <opaque_fragment>')
          // Gold (hueKeep>0, studio only) tone-maps by the peak channel so bright
          // reflections stay gold-tinted instead of clipping to white.
          // Preserve local cavity contrast when a bright HDR reflection clips
          // to white in the reference tone curve. Unoccluded colours stay exact.
          .replace('#include <tonemapping_fragment>','if(webcadFinishMetal>0.5){vec3 webcadHdr=gl_FragColor.rgb*webcadExposure;float webcadPeak=max(max(webcadHdr.r,webcadHdr.g),max(webcadHdr.b,1e-4));vec3 webcadHueTone=webcadHdr*(webcadReferenceToneMap(vec3(webcadPeak)).r/webcadPeak);gl_FragColor.rgb=webcadReferenceToneMap(gl_FragColor.rgb*webcadExposure);gl_FragColor.rgb=mix(gl_FragColor.rgb,webcadHueTone,webcadHueKeep);gl_FragColor.rgb*=mix(1.0,webcadCavityFactor,0.65);}else{\n#include <tonemapping_fragment>\n}')
          .replace('#include <colorspace_fragment>','if(webcadFinishMetal>0.5){gl_FragColor=sRGBTransferOETF(gl_FragColor);}else{\n#include <colorspace_fragment>\n}\ngl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(0.12,0.48,0.95),webcadSelection*0.7);');
      };
      material.customProgramCacheKey=()=> 'webcad-metal-product-studio-v11-mirror-plating';
      material.needsUpdate=true;
    }
    state.key=key;state.options={bounds,baseColor,displayPreferences};
    const u=state.uniforms;
    const preferences={...CADVIEWER_METAL_REFERENCE,...displayPreferences};
    if(finish.environmentMode&&finish.environmentMode!=='inherit')preferences.environmentMode=finish.environmentMode;
    u.webcadFinishMetal.value=key==='design'?0:1;
    // HDR keeps its physical PMREM/metal BRDF. The selectable product studio
    // uses finite reflection cards, now with a mirror-capable blur floor.
    const studio=key!=='design'&&preferences.environmentMode==='studio';
    const productStudio=studio&&finish.studioReflection!=='environment';
    u.webcadProductStudio.value=productStudio?1:0;
    u.webcadReflectionStrength.value=finish.reflectionStrength*preferences.environmentIntensity;
    // Lacquer and brushing only shape the product-studio reflection; HDR mode keeps the reference look.
    u.webcadCoat.value=productStudio?(finish.coat??0):0;
    u.webcadAnisotropy.value=productStudio?Math.min(1,Math.max(0,finish.anisotropy??0)):0;
    u.webcadDepth.value=productStudio?Math.min(3,Math.max(0,finish.depth??0)):0;
    u.webcadHueKeep.value=productStudio?Math.min(1,Math.max(0,finish.hueKeep??0)):0;
    const az=(preferences.lightAzimuth+(preferences.environmentRotation??0))*Math.PI/180,el=preferences.lightElevation*Math.PI/180;
    u.webcadStudioKey.value.set(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az));
    u.webcadStudioLevels.value.set(preferences.keyIntensity/1.3,preferences.fillIntensity/0.45,preferences.ambientIntensity/0.4);
    u.webcadMetalBodyTint.value=key==='design'?0:studio?0.012:(finish.metalBodyTint??0.055);
    u.webcadExposure.value=preferences.exposure;
    // CadViewer disables its extra direct highlight once HDR is available.
    // Keep custom light controls and the RoomEnvironment/loading fallback useful.
    const defaultLights=['keyIntensity','fillIntensity','ambientIntensity','lightAzimuth','lightElevation'].every(name=>preferences[name]===CADVIEWER_METAL_REFERENCE[name]);
    u.webcadSuppressDirect.value=key!=='design'&&preferences.environmentMode==='hdr'&&this.environment&&defaultLights?1:0;
    u.webcadAntiqueAtlas.value=this.atlas||this.fallback;
    u.webcadAntiqueStrength.value=this.atlas?(finish.antiqueStrength||0):0;
    u.webcadAtlasOffset.value=finish.antiqueAtlasOffset||0;
    u.webcadTextureScale.value=finish.antiqueTextureScale||1.35;
    u.webcadPitStrength.value=finish.antiquePitStrength??0.82;
    u.webcadPatina.value.setRGB(...(finish.patinaColor||[0.03,0.025,0.02]),THREE.LinearSRGBColorSpace);
    u.webcadSatin.value=key.startsWith('matt-')?1:0;
    if(bounds?.min&&bounds?.max){
      u.webcadCenter.value.fromArray(bounds.min).add(new THREE.Vector3().fromArray(bounds.max)).multiplyScalar(0.5);
      u.webcadRadius.value=Math.max(0.001,new THREE.Vector3().fromArray(bounds.max).distanceTo(new THREE.Vector3().fromArray(bounds.min))*0.5);
    }
    if(key==='design')material.color.set(baseColor); else material.color.setRGB(...finish.color,THREE.LinearSRGBColorSpace);
    material.metalness=finish.metalness??1;material.roughness=Math.min(1,finish.roughness+(key==='design'?0:preferences.roughnessOffset));
    material.envMapIntensity=finish.reflectionStrength*preferences.environmentIntensity;
    const longitude=preferences.environmentMode==='hdr'?CADVIEWER_METAL_REFERENCE.hdrLongitudeOffsetDeg:0;
    material.envMapRotation.set(Math.PI/2,0,((preferences.environmentRotation??0)+longitude)*Math.PI/180);
    const map=key==='design'?null:(preferences.environmentMode==='hdr'?(this.environment||this.studioTarget.texture):this.studioTarget.texture);
    if(material.envMap!==map){material.envMap=map;material.needsUpdate=true;}
    material.userData.metalFinish=key;
    return material;
  }
  setSelected(material,selected) {
    const state=this.materials.get(material);
    if(state)state.uniforms.webcadSelection.value=selected?1:0;
  }
  dispose() {
    this.disposed=true;
    for(const [material,state] of this.materials)material.removeEventListener('dispose',state.onDispose);
    this.materials.clear();this.environmentTarget?.dispose();this.studioTarget?.dispose();this.atlas?.dispose();this.fallback.dispose();this.environment=null;
  }
}

