import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Finish values and reference atlas are carried over from the original CadViewer.
export const METAL_FINISHES = Object.freeze({
  design: { label: '设计原色', metalness: 0.15, roughness: 0.42, reflectionStrength: 0 },
  'light-gold': { label: '浅金', color: [0.82, 0.58, 0.24], roughness: 0.105, reflectionStrength: 1.28 },
  nickel: { label: '亮镍', color: [0.72, 0.74, 0.76], roughness: 0.12, reflectionStrength: 1.22 },
  '24k-gold': { label: '24K 金', color: [0.88, 0.49, 0.10], roughness: 0.14, reflectionStrength: 1.08 },
  gunmetal: { label: '枪色', color: [0.18, 0.21, 0.24], roughness: 0.15, reflectionStrength: 1.18 },
  'matt-nickel': { label: '哑镍', color: [0.62, 0.64, 0.66], roughness: 0.60, reflectionStrength: 0.48 },
  'matt-light-gold': { label: '哑浅金', color: [0.70, 0.48, 0.21], roughness: 0.59, reflectionStrength: 0.50 },
  'matt-24k-gold': { label: '哑 24K 金', color: [0.90, 0.55, 0.12], roughness: 0.58, reflectionStrength: 0.52 },
  'matt-gunmetal': { label: '哑枪色', color: [0.15, 0.17, 0.19], roughness: 0.62, reflectionStrength: 0.46 },
  'antique-brass': { label: '仿古黄铜', color: [0.46, 0.29, 0.075], roughness: 0.60, reflectionStrength: 0.36, antiqueStrength: 0.97, patinaColor: [0.055, 0.035, 0.015], antiqueAtlasOffset: 0, antiqueTextureScale: 1.35, antiquePitStrength: 0.82 },
  'antique-silver': { label: '仿古银', color: [0.88, 0.86, 0.83], roughness: 0.46, reflectionStrength: 0.72, antiqueStrength: 0.55, patinaColor: [0.014, 0.012, 0.011], antiqueAtlasOffset: 0.5, antiqueTextureScale: 2.1, antiquePitStrength: 0.72 },
});

const declarations = /* glsl */`
varying vec3 webcadObjectPosition;
varying vec3 webcadObjectNormal;
uniform sampler2D webcadAntiqueAtlas;
uniform float webcadAntiqueStrength;
uniform float webcadAtlasOffset;
uniform float webcadTextureScale;
uniform float webcadPitStrength;
uniform float webcadRadius;
uniform vec3 webcadCenter;
uniform vec3 webcadPatina;
uniform float webcadSatin;
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
  constructor(renderer, scene, { onError } = {}) {
    this.renderer=renderer; this.scene=scene; this.onError=onError;
    this.environment=null; this.environmentTarget=null; this.atlas=null; this.disposed=false;
    this.materials=new Map();
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
  apply(material,finishKey,{bounds,baseColor=0xaac4d9}={}) {
    if(this.disposed)return material;
    if(!material?.isMeshStandardMaterial)throw new Error('金属渲染需要 MeshStandardMaterial');
    const key=Object.hasOwn(METAL_FINISHES,finishKey)?finishKey:'design', finish=METAL_FINISHES[key];
    let state=this.materials.get(material);
    if(!state){
      const uniforms={
        webcadAntiqueAtlas:{value:this.atlas||this.fallback},webcadAntiqueStrength:{value:0},
        webcadAtlasOffset:{value:0},webcadTextureScale:{value:1.35},webcadPitStrength:{value:0.82},
        webcadRadius:{value:1},webcadCenter:{value:new THREE.Vector3()},webcadPatina:{value:new THREE.Color()},webcadSatin:{value:0},
      };
      state={uniforms,key,options:{bounds,baseColor}};this.materials.set(material,state);
      state.onDispose=()=>this.materials.delete(material);material.addEventListener('dispose',state.onDispose);
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 webcadObjectPosition;\nvarying vec3 webcadObjectNormal;').replace('#include <begin_vertex>','#include <begin_vertex>\nwebcadObjectPosition=position; webcadObjectNormal=normal;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${declarations}`).replace('#include <color_fragment>',`#include <color_fragment>\n${surface}`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+webcadAntiqueStrength*(webcadPits*0.20+webcadCloud*0.12)+webcadSatin*(webcadGrain-0.5)*0.06,0.06,1.0);`).replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=1.0-webcadAntiqueStrength*webcadPits*0.25;');
      };
      material.customProgramCacheKey=()=> 'webcad-metal-atlas-v1';
      material.needsUpdate=true;
    }
    state.key=key;state.options={bounds,baseColor};
    const u=state.uniforms;
    u.webcadAntiqueAtlas.value=this.atlas||this.fallback;
    u.webcadAntiqueStrength.value=this.atlas?(finish.antiqueStrength||0):0;
    u.webcadAtlasOffset.value=finish.antiqueAtlasOffset||0;
    u.webcadTextureScale.value=finish.antiqueTextureScale||1.35;
    u.webcadPitStrength.value=finish.antiquePitStrength??0.82;
    u.webcadPatina.value.setRGB(...(finish.patinaColor||[0.03,0.025,0.02]));
    u.webcadSatin.value=key.startsWith('matt-')?1:0;
    if(bounds?.min&&bounds?.max){
      u.webcadCenter.value.fromArray(bounds.min).add(new THREE.Vector3().fromArray(bounds.max)).multiplyScalar(0.5);
      u.webcadRadius.value=Math.max(0.001,new THREE.Vector3().fromArray(bounds.max).distanceTo(new THREE.Vector3().fromArray(bounds.min))*0.5);
    }
    if(key==='design')material.color.set(baseColor); else material.color.setRGB(...finish.color);
    material.metalness=finish.metalness??1;material.roughness=finish.roughness;
    material.envMapIntensity=finish.reflectionStrength;
    const map=key==='design'?null:this.environment;
    if(material.envMap!==map){material.envMap=map;material.needsUpdate=true;}
    material.userData.metalFinish=key;
    return material;
  }
  dispose() {
    this.disposed=true;
    for(const [material,state] of this.materials)material.removeEventListener('dispose',state.onDispose);
    this.materials.clear();this.environmentTarget?.dispose();this.atlas?.dispose();this.fallback.dispose();this.environment=null;
  }
}

