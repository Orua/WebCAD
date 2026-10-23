import * as THREE from 'three';

const NS='http://www.w3.org/2000/svg';
const CENTER=60;
const CUBE_SCALE=27;
const AXIS_SCALE=42;
const AXES=[
  {name:'X',index:0,color:'#df4a4a',direction:'right'},
  {name:'Y',index:1,color:'#249b67',direction:'back'},
  {name:'Z',index:2,color:'#3973d4',direction:'top'},
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
  return {x:CENTER+local.x*CUBE_SCALE,y:CENTER-local.y*CUBE_SCALE,depth:local.z};
}

export function createViewCube(host,{getCamera,onSelect}){
  const root=document.createElement('div');root.className='view-cube-control';root.setAttribute('role','group');root.setAttribute('aria-label','坐标视角选择');
  const svg=svgElement('svg',{class:'view-cube-svg',viewBox:'0 0 120 120',role:'group','aria-label':'可随相机转动的坐标视角方块'});
  const defs=svgElement('defs');
  for(const axis of AXES){
    const marker=svgElement('marker',{id:`webcad-view-arrow-${axis.name}`,markerWidth:7,markerHeight:7,refX:6,refY:3.5,orient:'auto',markerUnits:'userSpaceOnUse',viewBox:'0 0 7 7'});
    marker.append(svgElement('path',{d:'M0 0 L7 3.5 L0 7 Z',fill:axis.color}));defs.append(marker);
  }
  svg.append(defs);
  const faceLayer=svgElement('g',{class:'view-cube-faces'}),faces=[];
  for(const face of FACES){
    const group=svgElement('g',{class:'view-cube-face',tabindex:0,role:'button','aria-label':`${face.label}视图`,'aria-pressed':'false','data-direction':face.direction,'data-axis':AXES[face.axis].name});
    const polygon=svgElement('polygon');
    const label=svgElement('text',{x:0,y:0,'text-anchor':'middle','dominant-baseline':'central','aria-hidden':'true'});
    group.append(polygon,label);
    const activate=event=>{if(event){event.preventDefault();event.stopPropagation();}onSelect(face.direction);};
    group.addEventListener('click',activate);
    group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '||event.key==='Spacebar')activate(event);});
    faces.push({definition:face,group,polygon,label});
  }
  svg.append(faceLayer);
  const axisLayer=svgElement('g',{class:'view-cube-axes'}),axes=[];
  for(const axis of AXES){
    const group=svgElement('g',{class:'view-cube-axis',tabindex:0,role:'button','aria-label':`${axis.name} 轴正方向视图`});
    const hit=svgElement('line',{class:'view-cube-axis-hit'});
    const line=svgElement('line',{class:'view-cube-axis-line',stroke:axis.color,markerEnd:`url(#webcad-view-arrow-${axis.name})`});
    const label=svgElement('text',{class:'view-cube-axis-label',fill:axis.color,'text-anchor':'middle','dominant-baseline':'central','aria-hidden':'true'});
    group.append(hit,line,label);
    const activate=event=>{if(event){event.preventDefault();event.stopPropagation();}onSelect(axis.direction);};
    group.addEventListener('click',activate);
    group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '||event.key==='Spacebar')activate(event);});
    axes.push({definition:axis,group,hit,line,label});axisLayer.append(group);
  }
  svg.append(axisLayer);root.append(svg);host.append(root);

  function update(){
    const camera=getCamera();if(!camera)return;
    camera.updateMatrixWorld();
    const inverse=camera.quaternion.clone().invert();
    const towardCamera=new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion).normalize();
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
      const direction=[0,0,0];direction[item.definition.index]=1;
      const local=new THREE.Vector3(...direction).applyQuaternion(inverse);
      const length=Math.hypot(local.x,local.y);
      if(length<0.08){item.group.style.display='none';continue;}
      item.group.style.display='';
      const unit={x:local.x/length,y:-local.y/length};
      const tip={x:CENTER+unit.x*AXIS_SCALE,y:CENTER+unit.y*AXIS_SCALE};
      item.hit.setAttribute('x1',String(CENTER));item.hit.setAttribute('y1',String(CENTER));item.hit.setAttribute('x2',String(tip.x));item.hit.setAttribute('y2',String(tip.y));
      item.line.setAttribute('x1',String(CENTER));item.line.setAttribute('y1',String(CENTER));item.line.setAttribute('x2',String(tip.x));item.line.setAttribute('y2',String(tip.y));
      item.label.setAttribute('x',String(tip.x+unit.x*6));item.label.setAttribute('y',String(tip.y+unit.y*6));item.label.textContent=item.definition.name;
    }
  }
  update();
  return {element:root,update,destroy(){root.remove();}};
}
