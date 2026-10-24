import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MetalOcclusionPass,createMetalOcclusionUniforms,isOcclusionSurface,metalEdgeOpacity,fitOcclusionCamera} from '../src/viewport/metal-occlusion.js';
import {MetalMaterials} from '../src/metal-materials.js';

function surface(type='body',finish='nickel'){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(8,5,2),new THREE.MeshStandardMaterial());
  mesh.userData.type=type;mesh.material.userData.metalFinish=finish;return mesh;
}
function renderer(render){
  return {autoClear:false,target:null,getDrawingBufferSize(out){return out.set(320,180);},getRenderTarget(){return this.target;},setRenderTarget(target){this.target=target;},render};
}
test('depth pass includes exact display patches and opaque bodies, excludes helpers/hidden/transparent, then restores state',()=>{
  const scene=new THREE.Scene(),body=surface(),patch=surface('display-only'),helper=surface('gizmo'),transparent=surface(),hidden=surface(),line=new THREE.Line();
  transparent.material.transparent=true;transparent.material.opacity=.2;hidden.visible=false;
  scene.add(body,patch,helper,transparent,hidden,line);scene.background=new THREE.Color('#abcdef');scene.updateMatrixWorld();
  const camera=new THREE.PerspectiveCamera(35,16/9,.001,10000);camera.position.z=40;camera.updateMatrixWorld();
  const beforeBackground=scene.background,oldOverride=new THREE.MeshBasicMaterial();scene.overrideMaterial=oldOverride;
  const clippingPlanes=[new THREE.Plane(new THREE.Vector3(1,0,0),0)];let renders=0;
  const mock=renderer((activeScene,depthCamera)=>{
    renders++;assert.equal(activeScene,scene);assert.equal(body.visible,true);assert.equal(patch.visible,true);
    for(const object of [helper,transparent,hidden,line])assert.equal(object.visible,false);
    assert.equal(scene.overrideMaterial.clippingPlanes,clippingPlanes);assert.equal(scene.background,null);
    assert.ok(depthCamera.near>1);assert.ok(depthCamera.far<100);assert.equal(camera.near,.001);
  });
  const uniforms=createMetalOcclusionUniforms(),pass=new MetalOcclusionPass(mock,uniforms);
  pass.render(scene,camera,{clippingPlanes});assert.equal(renders,1);assert.equal(uniforms.webcadOcclusionEnabled.value,1);
  assert.deepEqual(uniforms.webcadOcclusionResolution.value.toArray(),[320,180]);assert.equal(pass.state.surfaceCount,2);
  for(const object of [body,patch,helper,transparent,line])assert.equal(object.visible,true);
  assert.equal(hidden.visible,false);assert.equal(scene.background,beforeBackground);assert.equal(scene.overrideMaterial,oldOverride);assert.equal(mock.autoClear,false);assert.equal(mock.target,null);
  pass.render(scene,camera,{enabled:false});assert.equal(renders,1);assert.equal(uniforms.webcadOcclusionEnabled.value,0);
  let targetDisposed=0,materialDisposed=0;pass.target.addEventListener('dispose',()=>targetDisposed++);pass.material.addEventListener('dispose',()=>materialDisposed++);
  pass.dispose();assert.equal(targetDisposed,1);assert.equal(materialDisposed,1);assert.equal(uniforms.webcadOcclusionDepth.value,null);
});
test('depth rendering failure restores the scene and leaves occlusion disabled',()=>{
  const scene=new THREE.Scene(),body=surface(),helper=surface('helper');scene.add(body,helper);scene.updateMatrixWorld();
  const camera=new THREE.PerspectiveCamera();camera.position.z=40;camera.updateMatrixWorld();
  const mock=renderer(()=>{throw new Error('draw failed');}),pass=new MetalOcclusionPass(mock,createMetalOcclusionUniforms());
  assert.throws(()=>pass.render(scene,camera),/draw failed/);assert.equal(helper.visible,true);assert.equal(scene.overrideMaterial,null);assert.equal(mock.target,null);assert.equal(pass.uniforms.webcadOcclusionEnabled.value,0);pass.dispose();
});
test('tight depth projection preserves projected XY and view positions for perspective and orthographic cameras',()=>{
  const body=surface();body.updateMatrixWorld();
  for(const camera of [new THREE.PerspectiveCamera(35,1.8,.001,10000),new THREE.OrthographicCamera(-20,20,12,-12,.001,10000)]){
    camera.position.set(10,-15,40);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const fitted=fitOcclusionCamera(camera,[body]);assert.ok(fitted.near>1);assert.ok(fitted.far<100);
    for(const point of [new THREE.Vector3(0,0,0),new THREE.Vector3(2,1,.5)]){
      const original=point.clone().project(camera),projected=point.clone().project(fitted);
      assert.ok(Math.abs(original.x-projected.x)<1e-12);assert.ok(Math.abs(original.y-projected.y)<1e-12);
      const restored=projected.clone().applyMatrix4(fitted.projectionMatrixInverse),expected=point.clone().applyMatrix4(camera.matrixWorldInverse);
      assert.ok(restored.distanceTo(expected)<1e-10);
    }
  }
});
test('metal soft edges retain strong selection and technical views',()=>{
  assert.equal(metalEdgeOpacity({finish:'nickel'}),.38);assert.equal(metalEdgeOpacity({finish:'design'}),.72);
  assert.equal(metalEdgeOpacity({finish:'nickel',selected:true}),.72);assert.equal(metalEdgeOpacity({finish:'nickel',selectedEdge:true}),1);
  for(const mode of ['wire','transparentEdges'])assert.equal(metalEdgeOpacity({finish:'nickel',mode}),.72);
  const mesh=surface('display-only');assert.equal(isOcclusionSurface(mesh),true);mesh.material.wireframe=true;assert.equal(isOcclusionSurface(mesh),false);
});
test('shared cavity factor shades metal before tone mapping, retains bright-cavity contrast before gamma, and preserves final selection tint',()=>{
  const metals=Object.create(MetalMaterials.prototype);Object.assign(metals,{disposed:false,materials:new Map(),atlas:null,fallback:new THREE.Texture(),environment:new THREE.Texture(),studioTarget:{texture:new THREE.Texture()}});
  const material=new THREE.MeshStandardMaterial();metals.apply(material,'nickel',{bounds:{min:[-4,-4,-1],max:[4,4,1]}});metals.setSelected(material,true);
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.webcadOcclusionEnabled,metals.getOcclusionUniforms().webcadOcclusionEnabled);
  assert.equal(shader.uniforms.webcadSelection.value,1);
  assert.equal(shader.fragmentShader.match(/webcadCavityLight\(-vViewPosition/g)?.length,1);
  const tone=shader.fragmentShader.indexOf('gl_FragColor.rgb=webcadReferenceToneMap'),contrast=shader.fragmentShader.indexOf('gl_FragColor.rgb*=mix(1.0,webcadCavityFactor,0.65)'),gamma=shader.fragmentShader.indexOf('gl_FragColor=sRGBTransferOETF(gl_FragColor)');
  assert.ok(shader.fragmentShader.indexOf('outgoingLight*=webcadCavityFactor')<tone);
  assert.ok(contrast>tone&&contrast<gamma);
  assert.ok(shader.fragmentShader.indexOf('gl_FragColor.rgb=mix')>shader.fragmentShader.indexOf('gl_FragColor.rgb=webcadReferenceToneMap'));
  metals.apply(material,'design');assert.equal(shader.uniforms.webcadFinishMetal.value,0);assert.equal(shader.uniforms.webcadSelection.value,1);
});
