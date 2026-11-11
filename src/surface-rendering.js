import * as THREE from 'three';
import {loadSurfaceImage} from './surface-textures.js';
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
  entry.surfaceTexture=map;material.map=map;material.userData.surfaceTextureAlpha=texture.mime!=='image/jpeg';material.needsUpdate=true;onChange();
 }).catch(error=>{if(entry.surfaceTextureKey===texture.assetHash)onError(error);});
}
