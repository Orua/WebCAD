import * as THREE from 'three';

export function worldUnitsPerPixel(camera,point,height) {
  if(camera.isOrthographicCamera)return (camera.top-camera.bottom)/(camera.zoom*height);
  const depth=Math.max(camera.near,-point.clone().applyMatrix4(camera.matrixWorldInverse).z);
  return 2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/(camera.zoom*height);
}

// Raycaster sorts by camera depth. A CAD edge pick must first follow the cursor.
export function rankEdgeHits(hits,camera,pointer,width,height,radiusPx=8) {
  return hits.map(hit=>{
    const p=hit.point.clone().project(camera);
    return {hit,pixelDistance:Math.hypot((p.x-pointer.x)*width/2,(p.y-pointer.y)*height/2),z:p.z};
  }).filter(item=>item.z>=-1&&item.z<=1&&item.pixelDistance<=radiusPx)
    .sort((a,b)=>a.pixelDistance-b.pixelDistance||a.hit.distance-b.hit.distance).map(item=>item.hit);
}
