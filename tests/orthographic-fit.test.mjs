import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3,OrthographicCamera} from 'three';
import {orthographicFitExtent} from '../src/viewport/fit-bounds.js';

function fixture(min,max,direction,aspect){
 const box=new Box3(new Vector3(...min),new Vector3(...max)),center=box.getCenter(new Vector3());
 const camera=new OrthographicCamera(-1,1,1,-1,.001,10000);camera.up.set(...(direction[0]===0&&direction[1]===0?[0,1,0]:[0,0,1]));
 camera.position.copy(center).addScaledVector(new Vector3(...direction).normalize(),100);camera.lookAt(center);camera.updateMatrixWorld();
 const size=box.getSize(new Vector3()),legacy=Math.max(size.x,size.y,size.z,5)*Math.max(1,1/aspect)*1.55;
 const project=extent=>{camera.top=extent/2;camera.bottom=-extent/2;camera.left=-extent*aspect/2;camera.right=extent*aspect/2;camera.updateProjectionMatrix();return [min[0],max[0]].flatMap(x=>[min[1],max[1]].flatMap(y=>[min[2],max[2]].map(z=>new Vector3(x,y,z).project(camera))));};
 return {box,camera,legacy,project};
}
test('isometric cube corners exceed the old frame and fit with screen-space margin',()=>{
 const f=fixture([0,0,0],[20,20,20],[1,-1,.85],920/672);
 assert.ok(f.project(f.legacy).some(p=>Math.abs(p.y)>1),'original crop must be reproduced');
 const extent=orthographicFitExtent(f.box,f.camera,920/672,f.legacy);
 for(const p of f.project(extent))assert.ok(Math.abs(p.x)<=1/1.15+1e-12&&Math.abs(p.y)<=1/1.15+1e-12);
});
for(const [name,min,max]of [['ring',[135,-15,-1.5],[165,15,1.5]],['D-buckle',[185,-10,-1.5],[215,15,1.5]]])test(name+' top view preserves the already sufficient scale',()=>{
 const f=fixture(min,max,[0,0,1],920/672);assert.equal(orthographicFitExtent(f.box,f.camera,920/672,f.legacy),f.legacy);
 for(const p of f.project(f.legacy))assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1);
});
test('portrait orthographic fit contains both horizontal and vertical projected extents',()=>{
 const f=fixture([-15,-10,-4],[15,10,20],[1,-1,.85],.6);
 const extent=orthographicFitExtent(f.box,f.camera,.6,f.legacy);for(const p of f.project(extent))assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1);
});
