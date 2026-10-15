import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MetalMaterials} from '../src/metal-materials.js';
import {CADViewport} from '../src/viewport.js';

function fixture(){
  const metals=Object.create(MetalMaterials.prototype);
  Object.assign(metals,{disposed:false,materials:new Map(),atlas:null,fallback:new THREE.Texture(),environment:new THREE.Texture(),studioTarget:{texture:new THREE.Texture()}});
  return metals;
}
test('selection tint survives material refresh and clears without changing finish or color',()=>{
  const metals=fixture();
  for(const finish of ['design','light-gold','gunmetal']){
    const material=new THREE.MeshStandardMaterial();metals.apply(material,finish,{baseColor:'#b17245'});
    const color=material.color.clone(),roughness=material.roughness;
    const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <colorspace_fragment>'};
    material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader,/uniform float webcadSelection/);
    assert.match(shader.fragmentShader,/gl_FragColor.rgb=mix/);
    metals.setSelected(material,true);assert.equal(shader.uniforms.webcadSelection.value,1);
    metals.apply(material,finish,{baseColor:'#b17245'});assert.equal(shader.uniforms.webcadSelection.value,1);
    metals.setSelected(material,false);assert.equal(shader.uniforms.webcadSelection.value,0);
    assert.ok(material.color.equals(color));assert.equal(material.roughness,roughness);
    material.dispose();
  }
});
test('body, face and edge selection share feedback and clear fully',()=>{
  const metals=fixture(),viewport=Object.create(CADViewport.prototype);
  const material=new THREE.MeshStandardMaterial();metals.apply(material,'light-gold');
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  const root=new THREE.Group();root.position.set(10,20,30);
  const mesh=new THREE.Mesh(geometry,material),edges=new THREE.Group(),line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial());line.userData.edgeId=4;edges.add(line);root.add(mesh,edges);
  Object.assign(viewport,{metals,objects:new Map([['a',{root,mesh,edges,body:{indices:[0,1,2],faceGroups:[{faceId:2,start:0,count:3}]}}]]),hidden:[],displayPreferences:{themeColor:'#3a6eba'},modelRoot:new THREE.Group(),mode:'edges',temporaryDisplay:'normal',updateHud(){},applyClipping(){},syncGizmo(){}});
  viewport.setSelection(['a']);assert.equal(metals.materials.get(material).uniforms.webcadSelection.value,1);
  viewport.setSelection(['a'],{bodyId:'a',type:'face',ids:[2]});assert.deepEqual(viewport.faceOverlay.position.toArray(),[10,20,30]);
  viewport.setSelection(['a'],{bodyId:'a',type:'edge',ids:[4]});assert.equal(viewport.faceOverlay,null);assert.equal(line.material.opacity,1);assert.equal(line.material.depthTest,false);
  viewport.setSelection([]);assert.equal(line.material.depthTest,true);assert.equal(line.material.opacity,.18);assert.equal(metals.materials.get(material).uniforms.webcadSelection.value,0);
});
