import * as THREE from 'three';

const NS='http://www.w3.org/2000/svg';
const CENTER=60;
const CUBE_SCALE=16;
const AXIS_HIT_WIDTH=15;
const AXES=[
  {name:'X',index:0,color:'#df4a4a',positive:'right',negative:'left'},
  {name:'Y',index:1,color:'#249b67',positive:'back',negative:'front'},
  {name:'Z',index:2,color:'#3973d4',positive:'top',negative:'bottom'},
];
const FACES=[
  {axis:0,sign:1,direction:'right',label:'右'},
  {axis:0,sign:-1,direction:'left',label:'左'},
  {axis:1,sign:1,direction:'back',label:'后'},
  {axis:1,sign:-1,direction:'front',label:'前'},
  {axis:2,sign:1,direction:'top',label:'顶'},
  {axis:2,sign:-1,direction:'bottom',label:'底'},
];

function svgElement(name,attributes={}){
  const node=document.createElementNS(NS,name);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  return node;
}

function faceCorners({axis,sign}){
  const free=[0,1,2].filter(index=>index!==axis);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>{
    const point=[0,0,0];point[axis]=sign;point[free[0]]=u;point[free[1]]=v;return point;
  });
}

function viewPoint(point,inverse){
  const local=new THREE.Vector3(...point).applyQuaternion(inverse);
  const perspective=12/(12-local.z);
  return {x:CENTER+local.x*CUBE_SCALE*perspective,y:CENTER-local.y*CUBE_SCALE*perspective,depth:local.z};
}

function isVisible(element){
  if(!element?.isConnected||element.hidden)return false;
  const style=getComputedStyle(element);
  if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
  const rect=element.getBoundingClientRect();
  return rect.width>0&&rect.height>0;
}

export function createViewCube(host,{getCamera,onSelect}){
  const root=document.createElement('div');root.className='view-cube-control';root.dataset.corner='bottom-left';root.setAttribute('role','group');root.setAttribute('aria-label','坐标视角选择');
  const svg=svgElement('svg',{class:'view-cube-svg',viewBox:'0 0 120 120',role:'group','aria-label':'可随相机转动的坐标视角方块'});
  const defs=svgElement('defs');
  for(const axis of AXES){
    const marker=svgElement('marker',{id:`webcad-view-arrow-${axis.name}`,markerWidth:6,markerHeight:6,refX:10,refY:6,orient:'auto',markerUnits:'userSpaceOnUse',viewBox:'0 0 12 12'});
    marker.append(svgElement('path',{d:'M0 0 L12 6 L0 12 Z',fill:axis.color}));defs.append(marker);
  }
  svg.append(defs);
  const faceLayer=svgElement('g',{class:'view-cube-faces'}),faces=[];
  for(const face of FACES){
    const group=svgElement('g',{class:'view-cube-face',tabindex:0,role:'button','aria-label':`${face.label}视图`,'aria-pressed':'false','data-direction':face.direction,'data-axis':AXES[face.axis].name});
    const polygon=svgElement('polygon');
    const label=svgElement('text',{x:0,y:0,'text-anchor':'middle','dominant-baseline':'central','aria-hidden':'true'});
    label.textContent=face.label;
    group.append(polygon,label);
    const activate=event=>{if(event){event.preventDefault();event.stopPropagation();}onSelect(face.direction);};
    group.addEventListener('click',activate);
    group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '||event.key==='Spacebar')activate(event);});
    faces.push({definition:face,group,polygon,label});
  }
  svg.append(faceLayer);
  // Draw each of the twelve edges once, including edges behind the cube.
  const edgeLayer=svgElement('g',{class:'view-cube-edges'}),edges=[];
  for(let axis=0;axis<3;axis++){
    const free=[0,1,2].filter(index=>index!==axis);
    for(const u of [-1,1])for(const v of [-1,1]){
      const start=[0,0,0];start[axis]=-1;start[free[0]]=u;start[free[1]]=v;
      const end=[...start];end[axis]=1;
      const line=svgElement('line',{class:'view-cube-edge'});
      edges.push({start,end,free,signs:[u,v],line});edgeLayer.append(line);
    }
  }
  svg.append(edgeLayer);
  const axisLayer=svgElement('g',{class:'view-cube-axes'}),axes=[];
  for(const axis of AXES){
    const group=svgElement('g',{class:'view-cube-axis',tabindex:0,role:'button','aria-label':`${axis.name} 轴方向视图`,'aria-pressed':'false','data-axis':axis.name});
    const hit=svgElement('line',{class:'view-cube-axis-hit','stroke-width':AXIS_HIT_WIDTH});
    const target=svgElement('circle',{class:'view-cube-axis-target',r:7});
    const line=svgElement('line',{class:'view-cube-axis-line',stroke:axis.color,'marker-end':`url(#webcad-view-arrow-${axis.name})`});
    const label=svgElement('text',{class:'view-cube-axis-label',fill:axis.color,'text-anchor':'middle','dominant-baseline':'central','aria-hidden':'true'});
    group.append(hit,target,line,label);
    const item={definition:axis,group,hit,target,line,label,direction:axis.positive};
    const activate=event=>{if(event){event.preventDefault();event.stopPropagation();}onSelect(item.direction);};
    group.addEventListener('click',activate);
    group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '||event.key==='Spacebar')activate(event);});
    axes.push(item);axisLayer.append(group);
  }
  // Fixed world-space guides start at the same negative corner as the reference cube.
  // Like the reference triad, rear guides stay legible at reduced opacity.
  svg.append(axisLayer);root.append(svg);host.append(root);

  let placementFrame=0;
  function updatePlacement(){
    placementFrame=0;
    if(!root.isConnected)return;
    const rect=host.getBoundingClientRect();let bottom=Math.min(rect.bottom,window.visualViewport?.height||window.innerHeight);
    const clipByPanel=(panel,offset=0)=>{
      if(!isVisible(panel))return;
      const other=panel.getBoundingClientRect();
      // Only a bottom overlay intersecting the left navigation corner lifts it.
      if(other.left<=rect.left+96&&other.right>rect.left&&other.top-offset>rect.top&&other.top-offset<bottom)bottom=other.top-offset;
    };
    clipByPanel(document.querySelector('.agent-assistant-panel'));
    try{
      if(window.parent!==window){
        const frame=window.frameElement,frameRect=frame.getBoundingClientRect();
        bottom=Math.min(bottom,(window.parent.visualViewport?.height||window.parent.innerHeight)-frameRect.top);
        clipByPanel(window.parent.document.getElementById('assistant-panel'),frameRect.top);
      }
    }catch{/* Cross-origin hosts retain the local visible canvas bounds. */}
    root.dataset.corner='bottom-left';root.style.left='8px';root.style.top='auto';root.style.right='auto';
    root.style.bottom=Math.max(8,rect.bottom-bottom+8)+'px';
    root.style.visibility='visible';root.inert=false;root.setAttribute('aria-hidden','false');
  }
  const schedulePlacement=()=>{if(!placementFrame)placementFrame=requestAnimationFrame(updatePlacement);};
  const resizeObserver=new ResizeObserver(schedulePlacement);resizeObserver.observe(host);
  window.addEventListener('resize',schedulePlacement,{passive:true});
  window.visualViewport?.addEventListener('resize',schedulePlacement,{passive:true});
  window.addEventListener('webcad:viewport-occlusion',schedulePlacement);
  const relevantSelector='body,.agent-assistant-panel,.webcad-app,.right-panel,.frame-task,.viewport-task,.viewport-topbar';
  const mutationObserver=new MutationObserver(records=>{
    if(records.some(record=>{
      const target=record.target.nodeType===Node.ELEMENT_NODE?record.target:record.target.parentElement;
      if(!target||target===root||root.contains(target))return false;
      if(target.matches?.(relevantSelector)||target.closest?.(relevantSelector))return true;
      return [...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===Node.ELEMENT_NODE&&(node.matches?.(relevantSelector)||node.querySelector?.(relevantSelector)));
    }))schedulePlacement();
  });
  mutationObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','open','style','role']});
  updatePlacement();

  function update(){
    const camera=getCamera();if(!camera)return;
    camera.updateMatrixWorld();
    const inverse=camera.quaternion.clone().invert();
    const towardCamera=new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion).normalize();
    for(const edge of edges){
      const from=viewPoint(edge.start,inverse),to=viewPoint(edge.end,inverse);
      edge.line.setAttribute('x1',from.x);edge.line.setAttribute('y1',from.y);
      edge.line.setAttribute('x2',to.x);edge.line.setAttribute('y2',to.y);
      edge.line.dataset.hidden=String(edge.free.every((axis,index)=>towardCamera.getComponent(axis)*edge.signs[index]<=0.015));
    }
    const visible=[];
    for(const item of faces){
      const {definition,group,polygon,label}=item;
      const normal=[0,0,0];normal[definition.axis]=definition.sign;
      const localNormal=new THREE.Vector3(...normal).applyQuaternion(inverse);
      const points=faceCorners(definition).map(point=>viewPoint(point,inverse));
      const depth=points.reduce((total,point)=>total+point.depth,0)/points.length;
      const shown=localNormal.z>0.015;
      group.style.display=shown?'':'none';
      if(shown){
        polygon.setAttribute('points',points.map(point=>`${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '));
        label.setAttribute('x',String(points.reduce((total,point)=>total+point.x,0)/points.length));
        label.setAttribute('y',String(points.reduce((total,point)=>total+point.y,0)/points.length));
        group.setAttribute('aria-pressed',String(new THREE.Vector3(...normal).dot(towardCamera)>0.995));
        visible.push({group,depth});
      }
    }
    visible.sort((a,b)=>a.depth-b.depth);
    for(const item of visible)faceLayer.append(item.group);
    for(const item of axes){
      const {definition,group,hit,target,line,label}=item;
      item.direction=definition.positive;
      group.setAttribute('aria-label',`${definition.name}+ 轴方向视图`);
      group.setAttribute('aria-pressed',String(towardCamera.getComponent(definition.index)>0.995));
      const start=[-1,-1,-1],end=[-1,-1,-1];
      end[definition.index]=3.2;
      group.style.opacity=[0,1,2].some(index=>index!==definition.index&&towardCamera.getComponent(index)<0)?'1':'0.45';
      const from=viewPoint(start,inverse),to=viewPoint(end,inverse);
      const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
      if(length<2){group.style.display='none';continue;}
      group.style.display='';
      const unit={x:dx/length,y:dy/length},middle={x:(from.x+to.x)/2,y:(from.y+to.y)/2};
      const labelPoint={x:Math.max(7,Math.min(113,to.x+unit.x*9)),y:Math.max(7,Math.min(113,to.y+unit.y*9))};
      hit.setAttribute('x1',String(to.x-unit.x*6));hit.setAttribute('y1',String(to.y-unit.y*6));hit.setAttribute('x2',String(to.x));hit.setAttribute('y2',String(to.y));
      target.setAttribute('cx',String(to.x));target.setAttribute('cy',String(to.y));
      line.setAttribute('x1',String(from.x));line.setAttribute('y1',String(from.y));line.setAttribute('x2',String(to.x));line.setAttribute('y2',String(to.y));
      label.setAttribute('x',String(labelPoint.x));label.setAttribute('y',String(labelPoint.y));label.textContent=definition.name;
    }
  }
  update();
  return {element:root,update,destroy(){
    if(placementFrame)cancelAnimationFrame(placementFrame);
    resizeObserver.disconnect();mutationObserver.disconnect();window.removeEventListener('resize',schedulePlacement);window.visualViewport?.removeEventListener('resize',schedulePlacement);window.removeEventListener('webcad:viewport-occlusion',schedulePlacement);root.remove();
  }};
}
