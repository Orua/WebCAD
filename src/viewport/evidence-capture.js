import * as THREE from 'three';

export function evidenceCamera(bounds,viewId){
 const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
 // One world scale for all orthographic directions makes the views comparable.
 const span=Math.max(size.length(),1)*1.15,camera=new THREE.OrthographicCamera(-span/2,span/2,span/2,-span/2,.001,Math.max(10000,span*100));
 const directions={iso:[1,-1,.85],front:[0,-1,0],top:[0,0,1],right:[1,0,0]};
 camera.up.set(...(viewId==='top'?[0,1,0]:[0,0,1]));camera.position.copy(center).addScaledVector(new THREE.Vector3(...directions[viewId]).normalize(),span*2);
 camera.lookAt(center);camera.updateProjectionMatrix();camera.updateMatrixWorld();return camera;
}

export function evidenceDisplaySignature(viewport){
 viewport.scene.updateMatrixWorld();
 const patches=new Map();
 for(const entry of viewport.objects.values()){
  for(const patch of entry.displayPatches||[])patches.set(patch.piece,patch.full);
  for(const patch of entry.exactDisplay?.patches||[])patches.set(patch.piece,patch.fine||patch.base);
 }
 const stamp=[viewport.modelContext,viewport.mode,viewport.hidden,viewport.temporaryDisplay,viewport.selected,viewport.topology,viewport.clipPlanes.map(p=>[p.normal.toArray(),p.constant]),viewport.displayPreferences,viewport.finishKey,viewport.partFinishes,viewport.partColors,viewport.scene.environment?.id,viewport.scene.background?.getHex(),viewport.renderer.toneMappingExposure];
 // Ignore user camera/gizmos and camera-dependent LOD/frustum culling. Evidence
 // renders every installed surface of the visible body roots at its retained detail.
 viewport.modelRoot.traverse(o=>{if(o.geometry)stamp.push([o.id,patches.has(o)?true:o.visible,o.matrixWorld.elements,(patches.get(o)||o.geometry).id,o.material?.version,o.material?.color?.getHex(),o.material?.emissive?.getHex(),o.material?.opacity,o.material?.wireframe,o.material?.map?.id]);});
 viewport.scene.traverse(o=>{if(o.isLight)stamp.push([o.id,o.visible,o.matrixWorld.elements,o.intensity]);});
 return JSON.stringify(stamp);
}

export function captureEvidence(viewport,opts){
 const {renderer,scene}=viewport;
 if(renderer.getContext().isContextLost())throw Object.assign(Error('WebGL context is lost.'),{code:'EVIDENCE_RENDER_FAILED'});
 const size=opts.maxWidth,bounds=new THREE.Box3();
 for(const entry of viewport.objects.values())if(entry.root.visible)bounds.union(new THREE.Box3().setFromObject(entry.root));
 if(bounds.isEmpty())bounds.set(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5));
 const camera=evidenceCamera(bounds,opts.viewId),target=new THREE.WebGLRenderTarget(size,size,{depthBuffer:true});
 target.texture.colorSpace=renderer.outputColorSpace;
 const saved={target:renderer.getRenderTarget(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear};
 const occlusion=viewport.metals.getOcclusionUniforms().webcadOcclusionEnabled,occlusionValue=occlusion.value;
 const hidden=[viewport.gizmo?.getHelper(),viewport.anchorGizmoHelper,viewport.anchorVisual,viewport.guideRoot,viewport.errorRoot,viewport.progressRoot].filter(Boolean).map(object=>[object,object.visible]);
 const surfaces=[];
 for(const entry of viewport.objects.values()){
  for(const patch of [...(entry.displayPatches||[]),...(entry.exactDisplay?.patches||[])])surfaces.push([patch.piece,patch.piece.geometry,patch.piece.visible,patch.full||patch.fine||patch.base]);
 }
 try{
  // No await and no setView: user camera, controls, selection and document are untouched.
  for(const [object]of hidden)object.visible=false;
  for(const [piece,,,geometry]of surfaces){piece.geometry=geometry;piece.visible=true;}
  occlusion.value=0;renderer.autoClear=true;renderer.setRenderTarget(target);renderer.setViewport(0,0,size,size);renderer.setScissorTest(false);renderer.clear();renderer.render(scene,camera);
  const pixels=new Uint8Array(size*size*4);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const context=canvas.getContext('2d'),image=context.createImageData(size,size);
  for(let y=0;y<size;y++)image.data.set(pixels.subarray((size-1-y)*size*4,(size-y)*size*4),y*size*4);
  context.putImageData(image,0,0);context.font='600 13px system-ui';context.fillStyle='#fff';context.fillRect(8,8,80,24);context.fillStyle='#233044';context.fillText(opts.viewId.toUpperCase(),16,25);
  return {mime:'image/'+opts.format,dataUrl:canvas.toDataURL('image/'+opts.format,opts.quality),width:size,height:size,
   display:{detail:{...viewport.displayDetail,source:'retained-display-surfaces',cameraCulling:false,screenSpaceOcclusion:false},camera:{projection:'orthographic',position:camera.position.toArray(),target:bounds.getCenter(new THREE.Vector3()).toArray(),up:camera.up.toArray()},section:viewport.clipPlanes.map(p=>[p.normal.toArray(),p.constant])}};
 }finally{
  for(const [piece,geometry,visible]of surfaces){piece.geometry=geometry;piece.visible=visible;}
  for(const [object,visible]of hidden)object.visible=visible;occlusion.value=occlusionValue;renderer.autoClear=saved.autoClear;
  renderer.setRenderTarget(saved.target);renderer.setViewport(saved.viewport);renderer.setScissor(saved.scissor);renderer.setScissorTest(saved.scissorTest);target.dispose();
 }
}
