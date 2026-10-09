import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {reliefHeights,sampleReliefHeight} from '../../relief-sculpt.js';
import {sampleReliefSurface} from '../../relief-sculpt-surface.js';

export function createReliefSculptView(canvas,preview){
 canvas.width=840;canvas.height=420;
 const ctx=canvas.getContext('2d'),background=document.createElement('canvas');background.width=840;background.height=420;const bg=background.getContext('2d');
 const textureCanvas=document.createElement('canvas');textureCanvas.width=textureCanvas.height=1024;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#202831');
 const renderer=new THREE.WebGLRenderer({canvas:preview,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(420,280,false);
 const camera=new THREE.PerspectiveCamera(35,1.5,.01,10000);camera.up.set(0,0,1);
 const orbit=new OrbitControls(camera,preview);orbit.enableDamping=false;orbit.enablePan=true;
 scene.add(new THREE.HemisphereLight(0xffffff,0x56606c,.8));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-20,-30,40);scene.add(light);
 const alpha=new THREE.CanvasTexture(textureCanvas);alpha.colorSpace=THREE.NoColorSpace;
 const material=new THREE.MeshStandardMaterial({color:0xdcb879,metalness:.35,roughness:.42,side:THREE.DoubleSide,alphaMap:alpha,alphaTest:.5});
 let mesh=null,params=null,currentSculpt=null,identity=null,r,heights=null,resize=null,closed=false;
 const render=()=>{if(!closed)renderer.render(scene,camera);};orbit.addEventListener('change',render);
 function trace(context,regions,width,height){
  context.beginPath();
  for(const region of regions||[{outer:[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]}])for(const ring of [region.outer,...(region.holes||[])]){ring.forEach(([x,y],i)=>context[i?'lineTo':'moveTo']((x+.5)*width,(.5-y)*height));context.closePath();}
 }
 function fit(){if(!params)return;const size=Math.max(params.widthMm,params.heightMm,params.depthMm*3);orbit.target.set(0,0,params.mode==='engrave'?-params.depthMm/2:params.depthMm/2);camera.position.set(size*.85,-size*1.3,size*1.1);camera.near=size/1000;camera.far=size*100;camera.updateProjectionMatrix();orbit.update();render();}
 function update(p,sculpt){
  params=p;currentSculpt=sculpt;heights=reliefHeights({...p,sculpt});
  const sampled=sampleReliefSurface(heights),{xs,ys,values}=sampled,n=xs.length;
  const key=JSON.stringify([p.widthMm,p.heightMm,p.depthMm,p.mode,p.regions]);
  if(identity!==key){
   identity=key;const tc=textureCanvas.getContext('2d');tc.fillStyle='#000';tc.fillRect(0,0,1024,1024);trace(tc,p.regions,1024,1024);tc.fillStyle='#fff';tc.fill('evenodd');alpha.needsUpdate=true;
   mesh?.geometry.dispose();if(mesh)scene.remove(mesh);
   const geometry=new THREE.PlaneGeometry(p.widthMm,p.heightMm,n-1,n-1);mesh=new THREE.Mesh(geometry,material);scene.add(mesh);fit();
  }
  const position=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const k=(n-1-j)*n+i;position.setXYZ(k,xs[i]*p.widthMm,ys[j]*p.heightMm,values[j][i]*(p.mode==='engrave'?-1:1));uv.setXY(k,xs[i]+.5,ys[j]+.5);}
  position.needsUpdate=true;uv.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();render();
  // Draw a smoothly interpolated height map, clipped to the actual silhouette.
  const scale=Math.min(780/p.widthMm,360/p.heightMm);r={x:(840-p.widthMm*scale)/2,y:(420-p.heightMm*scale)/2,w:p.widthMm*scale,h:p.heightMm*scale};
  bg.fillStyle='#202831';bg.fillRect(0,0,840,420);bg.save();bg.translate(r.x,r.y);trace(bg,p.regions,r.w,r.h);bg.clip('evenodd');
  const imageCanvas=document.createElement('canvas');imageCanvas.width=imageCanvas.height=n;const ic=imageCanvas.getContext('2d'),pixels=ic.createImageData(n,n),max=Math.max(p.depthMm,.01);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
   const v=Math.min(1,values[j][i]/max),mi=Math.round((xs[i]+.5)*(heights[0].length-1)),mj=Math.round((ys[j]+.5)*(heights.length-1)),m=sculpt?.mask?.[mj]?.[mi]||0,k=((n-1-j)*n+i)*4;
   pixels.data.set([Math.round((50+190*v)*(1-m*.55)),Math.round(45+160*v),Math.round(30+105*v+m*100),255],k);
  }
  ic.putImageData(pixels,0,0);bg.imageSmoothingEnabled=true;bg.imageSmoothingQuality='high';bg.drawImage(imageCanvas,0,0,r.w,r.h);bg.restore();
  bg.save();bg.translate(r.x,r.y);trace(bg,p.regions,r.w,r.h);bg.strokeStyle='#ead3a0';bg.lineWidth=1.5;bg.stroke();bg.restore();cursor();
 }
 function cursor(point,radius=0,symmetry='none',hardness=0){
  ctx.drawImage(background,0,0);if(!point||!params)return;
  const mirrors=[[1,1],...(['x','xy'].includes(symmetry)?[[-1,1]]:[]),...(['y','xy'].includes(symmetry)?[[1,-1]]:[]),...(symmetry==='xy'?[[-1,-1]]:[])];
  for(const [sx,sy]of mirrors){const x=r.x+(point[0]*sx+.5)*r.w,y=r.y+(.5-point[1]*sy)*r.h,size=radius/params.widthMm*r.w;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.stroke();if(hardness>0){ctx.strokeStyle='#ffffff80';ctx.beginPath();ctx.arc(x,y,size*hardness,0,Math.PI*2);ctx.stroke();}}
 }
 function point(event){const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*840/rect.width,y=(event.clientY-rect.top)*420/rect.height;return [(x-r.x)/r.w-.5,.5-(y-r.y)/r.h];}
 function sample(point){return sampleReliefHeight({...params,sculpt:currentSculpt},point).targetMm;}
 resize=new ResizeObserver(()=>{const w=preview.clientWidth,h=preview.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();}});resize.observe(preview);
 return {update,cursor,point,sample,fit,dispose(){closed=true;resize.disconnect();orbit.dispose();mesh?.geometry.dispose();material.dispose();alpha.dispose();renderer.dispose();}};
}

