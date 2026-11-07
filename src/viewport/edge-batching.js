import * as THREE from 'three';

// Rendering only. Original objects, geometry and edge IDs remain the raycast
// targets; merged objects are siblings, never members of the picking group.
export function createTechnicalEdgeBatch(edges,{bodyId,eligible=true}={}){
  const lines=edges.children;
  if(!eligible||lines.length<2||lines.some(line=>!line.isLineSegments||line.material?.type!=='LineBasicMaterial'||line.material.vertexColors||line.material.map||line.geometry.index||
    line.geometry.getAttribute('position')?.itemSize!==3||line.position.lengthSq()!==0||line.quaternion.x!==0||line.quaternion.y!==0||line.quaternion.z!==0||line.quaternion.w!==1||!line.scale.equals(new THREE.Vector3(1,1,1))))return null;
  const root=new THREE.Group();root.userData={type:'technical-edge-render-batches',bodyId};
  let dirty=true;
  function key(line){
    const definition=line.material.toJSON();delete definition.uuid;delete definition.metadata;
    const planes=line.material.clippingPlanes?.map(p=>[p.normal.x,p.normal.y,p.normal.z,p.constant])??null;
    return JSON.stringify([definition,planes,line.material.clipIntersection,line.material.clipShadows,line.renderOrder,line.layers.mask,line.frustumCulled]);
  }
  function sync(){
    root.visible=edges.visible;
    if(!dirty)return;
    dirty=false;
    for(const old of [...root.children]){root.remove(old);old.geometry.dispose();old.material.dispose();}
    const groups=new Map();
    for(const line of lines){
      line.visible=false;
      const style=key(line),group=groups.get(style)??{example:line,lines:[],length:0};
      group.lines.push(line);group.length+=line.geometry.getAttribute('position').count*3;groups.set(style,group);
    }
    for(const group of groups.values()){
      const positions=new Float32Array(group.length);let offset=0;
      for(const line of group.lines){
        const attribute=line.geometry.getAttribute('position');
        for(let index=0;index<attribute.count;index++){positions[offset++]=attribute.getX(index);positions[offset++]=attribute.getY(index);positions[offset++]=attribute.getZ(index);}
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.computeBoundingSphere();
      const batch=new THREE.LineSegments(geometry,group.example.material.clone());batch.layers.mask=group.example.layers.mask;
      batch.renderOrder=group.example.renderOrder;batch.frustumCulled=group.example.frustumCulled;batch.userData={type:'technical-edge-render-batch',bodyId};root.add(batch);
    }
  }
  sync();
  return {root,sync,invalidate(){dirty=true;}};
}
