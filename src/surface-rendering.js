import * as THREE from 'three';
import {loadSurfaceImage} from './surface-textures.js';
export function applyCompoundColors(entry,colors,baseColor){
 const {body,mesh}=entry,material=mesh.material,geometry=mesh.geometry;
 const active=colors?.length===body.solidCount&&!!body.faceSolidIndices&&material.userData.metalFinish==='design';
 const key=active?JSON.stringify([colors,baseColor]):null;
 if(entry.solidColorsKey!==key){
  entry.solidColorsKey=key;
  if(active){
   const fallback=new THREE.Color(baseColor),palette=colors.map(color=>color?new THREE.Color(color):fallback);
   const values=new Float32Array(geometry.getAttribute('position').count*3);
   for(const {start,count,faceId} of body.faceGroups){
    const color=palette[body.faceSolidIndices[faceId]]||fallback;
    for(let k=start;k<start+count;k++)color.toArray(values,body.indices[k]*3);
   }
   geometry.setAttribute('color',new THREE.BufferAttribute(values,3));
  }else geometry.deleteAttribute('color');
  material.vertexColors=active;material.needsUpdate=true;
 }
 if(active)material.color.set(0xffffff);
}

function applyScopedProjection(entry,texture){
 const material=entry.mesh.material;
 if(!material.userData.projection){
  const uniforms={webcadDecalSide:{value:0},webcadDecalAxis:{value:2},webcadDecalOrigin:{value:new THREE.Vector3()},
   webcadDecalSize:{value:new THREE.Vector2()},webcadDecalOffset:{value:new THREE.Vector2()},webcadDecalAngles:{value:new THREE.Vector2()}};
  const compile=material.onBeforeCompile,programKey=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
   compile.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    uniform int webcadDecalSide, webcadDecalAxis;
    uniform vec3 webcadDecalOrigin;
    uniform vec2 webcadDecalSize, webcadDecalOffset, webcadDecalAngles;`)
    .replace('#include <map_fragment>',`
      if(webcadDecalSide==0){
        #include <map_fragment>
      }else{
        #ifdef USE_MAP
          vec3 p=webcadObjectPosition-webcadDecalOrigin;
          vec3 n=normalize(webcadObjectNormal);
          float w=webcadDecalAxis==0?n.x:(webcadDecalAxis==1?n.y:n.z);
          bool positive=w>0.0;
          bool permitted=webcadDecalSide==3||(positive?webcadDecalSide==1:webcadDecalSide==2);
          if(permitted&&abs(w)>0.5){
            vec2 xy=webcadDecalAxis==0?p.yz:(webcadDecalAxis==1?p.xz:p.xy);
            xy-=webcadDecalOffset+webcadDecalSize*0.5;
            if(positive==(webcadDecalAxis==1))xy.x=-xy.x;
            float angle=positive?webcadDecalAngles.x:webcadDecalAngles.y;
            float c=cos(angle),s=sin(angle);
            vec2 decalUv=mat2(c,s,-s,c)*xy/webcadDecalSize+0.5;
            if(all(greaterThanEqual(decalUv,vec2(0.0)))&&all(lessThanEqual(decalUv,vec2(1.0)))){
              vec4 decal=texture2D(map,decalUv);
              diffuseColor.rgb=mix(diffuseColor.rgb,decal.rgb,decal.a);
            }
          }
        #endif
      }`);
  };
  material.customProgramCacheKey=()=>programKey+'-projected-decal';
  material.userData.projection=uniforms;material.needsUpdate=true;
 }
 const u=material.userData.projection;
 u.webcadDecalSide.value={positive:1,negative:2,both:3}[texture?.side]||0;
 if(!texture?.side)return;
 u.webcadDecalAxis.value={yz:0,xz:1,xy:2}[texture.mapping];
 u.webcadDecalOrigin.value.fromArray(entry.body.bounds.min).sub(new THREE.Vector3(...(entry.body.previewOrigin||[0,0,0])));
 u.webcadDecalSize.value.fromArray(texture.sizeMm);
 u.webcadDecalOffset.value.fromArray(texture.offsetMm);
 u.webcadDecalAngles.value.set(THREE.MathUtils.degToRad(texture.rotationDeg),THREE.MathUtils.degToRad(texture.backRotationDeg??texture.rotationDeg));
}
export function projectedTextureUV(geometry,texture,bounds,origin=[0,0,0]){
 const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=new Float32Array(p.count*2),min=bounds?.min||[0,0,0],angle=texture.rotationDeg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 for(let i=0;i<p.count;i++){
  let axes=texture.mapping==='xy'?[0,1]:texture.mapping==='xz'?[0,2]:texture.mapping==='yz'?[1,2]:null;
  if(!axes){const normal=n?[Math.abs(n.getX(i)),Math.abs(n.getY(i)),Math.abs(n.getZ(i))]:[0,0,1],axis=normal.indexOf(Math.max(...normal));axes=axis===0?[1,2]:axis===1?[0,2]:[0,1];}
  const point=[p.getX(i)+origin[0],p.getY(i)+origin[1],p.getZ(i)+origin[2]],u=point[axes[0]]-min[axes[0]]-texture.offsetMm[0],v=point[axes[1]]-min[axes[1]]-texture.offsetMm[1];
  uv[i*2]=(u*c-v*s)/texture.sizeMm[0];uv[i*2+1]=(u*s+v*c)/texture.sizeMm[1];
 }
 geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}
export function applyBodyTexture(entry,texture,assets,{onChange=()=>{},onError=()=>{},anisotropy=1}={}){
 const material=entry.mesh.material;
 if(texture?.side||material.userData.projection)applyScopedProjection(entry,texture);
 material.userData.surfaceTextureAlpha=!!texture&&!texture.side&&texture.mime!=='image/jpeg';
 if(!material.userData.surfaceDisposalInstalled){material.userData.surfaceDisposalInstalled=true;material.addEventListener('dispose',()=>{entry.surfaceTextureKey=null;entry.surfaceTexture?.dispose();entry.surfaceTexture=null;});}
 if(!texture){if(entry.surfaceTextureKey){entry.surfaceTextureKey=null;entry.surfaceTexture?.dispose();entry.surfaceTexture=null;material.map=null;material.userData.surfaceTextureAlpha=false;material.needsUpdate=true;}return;}
 const uvKey=JSON.stringify([texture.mapping,texture.sizeMm,texture.offsetMm,texture.rotationDeg,entry.body.renderVersion]);
 if(entry.surfaceUVKey!==uvKey){entry.surfaceUVKey=uvKey;const geometries=new Set([entry.mesh.geometry,...(entry.displayPatches||[]).flatMap(p=>[p.full,...p.lods.map(l=>l.geometry)])]);for(const geometry of geometries)projectedTextureUV(geometry,texture,entry.body.bounds,entry.body.previewOrigin);material.needsUpdate=true;}
 if(entry.surfaceTextureKey===texture.assetHash)return;
 entry.surfaceTexture?.dispose();entry.surfaceTexture=null;entry.surfaceTextureKey=texture.assetHash;material.map=null;
 const bytes=assets?.[texture.assetHash];
 if(!(bytes instanceof Uint8Array)){onError(Object.assign(new Error('工程缺少贴图图片。'),{code:'TEXTURE_INVALID'}));return;}
 loadSurfaceImage(texture,bytes).then(image=>{
  if(entry.surfaceTextureKey!==texture.assetHash)return;
  const map=new THREE.Texture(image);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=anisotropy;map.needsUpdate=true;
  entry.surfaceTexture=map;material.map=map;material.needsUpdate=true;onChange();
 }).catch(error=>{if(entry.surfaceTextureKey===texture.assetHash)onError(error);});
}
