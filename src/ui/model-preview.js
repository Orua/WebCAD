import * as THREE from 'three';
import {QUICK_MODELS} from '../quick-models.js';
let worker,sequence=0,chain=Promise.resolve(),renderer;
const cache=new Map();
function meshFor(entry){
  const params={...entry.defaults,kind:entry.kind,...(entry.script?{modelScript:entry.script}:{})},key=JSON.stringify(params);
  if(cache.has(key))return cache.get(key);
  const result=chain.then(()=>new Promise((resolve,reject)=>{
    worker??=new Worker(new URL('./model-preview-worker.js',import.meta.url),{type:'module'});
    const id=++sequence,current=worker;
    const finish=()=>{clearTimeout(timer);current.removeEventListener('message',receive);current.removeEventListener('error',failure);};
    const receive=({data})=>{if(data.id!==id)return;finish();data.error?reject(Error(data.error)):resolve(data.bodies);};
    const failure=()=>{finish();current.terminate();if(worker===current)worker=null;reject(Error('预览内核启动失败'));};
    const timer=setTimeout(()=>{finish();current.terminate();if(worker===current)worker=null;reject(Error('预览计算超时，仍可在主画布创建'));},60000);
    current.addEventListener('message',receive);current.addEventListener('error',failure);current.postMessage({id,params});
  }));
  chain=result.catch(()=>{});cache.set(key,result);if(cache.size>200)cache.delete(cache.keys().next().value);return result;
}
function renderBodies(bodies,annotated){
  renderer??=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:true});renderer.setSize(520,330);renderer.setPixelRatio(1);
  const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
  scene.add(new THREE.HemisphereLight(0xffffff,0x75808b,2.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(30,-40,60);scene.add(light);
  const material=new THREE.MeshStandardMaterial({color:0xb4bdc6,metalness:.48,roughness:.3});
  for(const b of bodies){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(b.positions),3));geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(b.normals),3));geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(b.indices),1));group.add(new THREE.Mesh(geometry,material));}
  const bounds=new THREE.Box3().setFromObject(group),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),scale=Math.max(size.x,size.y,size.z,.1);
  const camera=new THREE.OrthographicCamera(-scale*(annotated?.72:1.05),scale*(annotated?1.6:1.05),scale*.67,-scale*.67,.001,scale*20);camera.up.set(0,0,1);camera.position.copy(center).add(new THREE.Vector3(scale*1.5,-scale*2,scale*1.8));camera.lookAt(center);camera.updateMatrixWorld();renderer.render(scene,camera);
  const url=renderer.domElement.toDataURL('image/png');for(const child of group.children)child.geometry.dispose();material.dispose();
  return {url,bounds,center,camera};
}
const SVG='http://www.w3.org/2000/svg';
function addGuides(svg,entry,view){
  const {bounds,center,camera}=view;const p=entry.defaults;
  const project=v=>{const q=new THREE.Vector3(...v).project(camera);return [(q.x+1)*260,(1-q.y)*165];};
  const line=(a,b)=>{const el=document.createElementNS(SVG,'line');el.setAttribute('x1',a[0]);el.setAttribute('y1',a[1]);el.setAttribute('x2',b[0]);el.setAttribute('y2',b[1]);svg.append(el);};
  const label=(point,text)=>{const el=document.createElementNS(SVG,'text');el.setAttribute('x',point[0]);el.setAttribute('y',point[1]);el.textContent=text;svg.append(el);};
  const numeric=QUICK_MODELS[entry.kind].fields.filter(f=>f.type==='number');
  numeric.forEach((field,i)=>{
    const key=field.key.toLowerCase(),value=Number(p[field.key]),axis=/height|thick|depth|length|pitch/.test(key)?(/depth/.test(key)&&!(/total|strip/.test(key))?1:2):/width/.test(key)?0:0;
    const a=center.toArray(),b=center.toArray();
    const diameter=/diameter/.test(key),radial=/radius|diameter/.test(key),inner=/inner|bore|hole/.test(key);
    if(radial){const span=diameter?value:value*2;a[0]=center.x-span/2;b[0]=center.x+span/2;a[1]=b[1]=center.y;a[2]=b[2]=bounds.max.z;}
    else{a[axis]=/inner/.test(key)?center.getComponent(axis)-value/2:bounds.min.getComponent(axis);b[axis]=a[axis]+value;a[2]=axis===2?a[2]:bounds.max.z;b[2]=axis===2?b[2]:bounds.max.z;if(axis===2){a[0]=b[0]=bounds.max.x;a[1]=b[1]=center.y;}}
    const from=project(a),to=project(b),row=22+i*22;
    // Numbered leaders link every visible parameter to its dimensional axis;
    // R/corner/angle/pitch are local detail callouts, never overall dimensions.
    const local=/corner|fillet|chamfer|angle|pitch|gap|inset|offset|count|turn/.test(key);
    if(!local){line(from,to);line([from[0]-3,from[1]-4],[from[0]+3,from[1]+4]);line([to[0]-3,to[1]-4],[to[0]+3,to[1]+4]);}
    const anchor=local||inner?to:[(from[0]+to[0])/2,(from[1]+to[1])/2];line(anchor,[375,row-5]);label([380,row],`${i+1} ${field.label} ${p[field.key]}`);
  });
}
export function modelPreview(entry,{annotated=false}={}){
  const figure=document.createElement('figure');figure.className='model-solid-preview'+(annotated?' annotated':'');figure.setAttribute('aria-label',entry.label+' 实体预览');
  const image=document.createElement('img');image.alt=entry.label+' 按默认参数生成的实体';const status=document.createElement('figcaption');status.textContent='生成实体预览…';figure.append(image,status);
  const load=async()=>{try{const bodies=await meshFor(entry);if(!figure.isConnected)return;const view=renderBodies(bodies,annotated);image.src=view.url;status.textContent=annotated?'参数引线示意 · mm；局部尺寸以字段定义为准':'';figure.dataset.previewReady='true';if(annotated){const svg=document.createElementNS(SVG,'svg');svg.setAttribute('viewBox','0 0 520 330');svg.classList.add('model-parameter-guides');addGuides(svg,entry,view);figure.append(svg);}}catch(error){status.textContent='预览不可用：'+error.message;figure.dataset.previewError='true';}};
  const observer=new IntersectionObserver(items=>{if(items.some(item=>item.isIntersecting)){observer.disconnect();void load();}},{rootMargin:'0px'});observer.observe(figure);return figure;
}
