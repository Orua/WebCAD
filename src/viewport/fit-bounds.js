import {Vector3} from 'three';

// Preserve the existing fit scale unless the camera-projected bounds need more room.
export function orthographicFitExtent(box,camera,aspect,legacyExtent){
 if(box.isEmpty())return legacyExtent;
 const center=box.getCenter(new Vector3()),inverse=camera.quaternion.clone().invert();
 let halfWidth=0,halfHeight=0;
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
  const p=new Vector3(x,y,z).sub(center).applyQuaternion(inverse);
  halfWidth=Math.max(halfWidth,Math.abs(p.x));halfHeight=Math.max(halfHeight,Math.abs(p.y));
 }
 return Math.max(legacyExtent,2*Math.max(halfHeight,halfWidth/aspect)*1.15);
}
