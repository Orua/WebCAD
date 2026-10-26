import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LogoPlacementGuide} from '../src/viewport/logo-placement-guide.js';

class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.attributes={};}
 setAttribute(k,v){this.attributes[k]=v;if(k==='value')this.value=v;}
 append(...n){this.children.push(...n);}
 addEventListener(){}
 remove(){}
 querySelectorAll(){return this.children.flatMap(n=>[...(['BUTTON','INPUT'].includes(n.tagName)?[n]:[]),...n.querySelectorAll()]);}
}
test('canvas margins and center alignment map to the same world placement without changing source geometry',()=>{
 const previous=globalThis.document;globalThis.document={activeElement:null,createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
 const source=new THREE.BoxGeometry(60,55,3),mesh=new THREE.Mesh(source),camera=new THREE.OrthographicCamera(-40,40,35,-35,.1,1000);camera.position.set(0,0,100);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const host=new Element('div');host.clientWidth=800;host.clientHeight=700;
 const v={host,camera,scene:new THREE.Scene(),objects:new Map([['plate',{mesh,body:{faceGroups:[{faceId:4,start:24,count:6}]}}]]),controls:{enabled:true},disposeObject:root=>root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();})};
 let sourceDisposed=false;source.addEventListener('dispose',()=>{sourceDisposed=true;});
 const logo={sizeMm:[10,10],regions:[{outer:[[-5,-5],[5,-5],[5,5],[-5,5]],holes:[]}]},original=JSON.stringify(logo);
 let guide;
 try{
  guide=new LogoPlacementGuide(v,{bodyId:'plate',faceId:4,point:[0,0,1.5],face:{origin:[0,0,1.5],normal:[0,0,1]},logo,params:{scale:1}});
  const moved=guide.update({leftMm:3,topMm:4});assert.equal(moved.margins.left,3);assert.equal(moved.margins.top,4);assert.deepEqual(moved.point,[-22,18.5,1.5]);
  const centered=guide.align('center');assert.equal(centered.margins.left,centered.margins.right);assert.equal(centered.margins.top,centered.margins.bottom);assert.deepEqual(centered.point,[0,0,1.5]);
  const resized=guide.update({scale:2,angleDeg:90,depthMm:.3});assert.equal(resized.margins.left,20);assert.equal(resized.margins.top,17.5);assert.equal(resized.depth,.3);
  assert.equal(JSON.stringify(logo),original);assert.equal(sourceDisposed,false);
 }finally{guide?.dispose();assert.equal(sourceDisposed,false);source.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
