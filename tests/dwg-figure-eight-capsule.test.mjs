import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {readDocs} from '../src/page-api-docs.js';
import {getOperation} from '../src/operation-registry.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});
const kernel=new CadKernel(oc);
const feature=(id,op,params,refs=[])=>({id,op,params,refs,name:id});
const build=(innerWidth,innerHeight,diameter,spacing)=>{
  const p={kind:'capsuleWire',innerWidth,innerHeight,sectionSize:diameter};
  return kernel.rebuild({version:1,features:[
    feature('top','quickModel',p),feature('topMove','transform',{y:spacing/2},['top']),
    feature('bottom','quickModel',p),feature('bottomMove','transform',{y:-spacing/2},['bottom']),
    feature('joined','union',{},['topMove','bottomMove']),
  ],imports:{},hidden:[]});
};

test('源图 PG2145 两条圆线长圈形成可测量的葫芦形单实体',async()=>{
  const result=await build(34.7,8.3,5.5,11.4);
  assert.equal(result.stats.solids,1);
  const b=result.bodies[0].bounds;
  const size=b.max.map((v,i)=>v-b.min[i]);
  [45.7,30.7,5.5].forEach((v,i)=>assert.ok(Math.abs(size[i]-v)<1e-5));
  assert.ok(Math.abs(result.stats.volume-4037.5727715930466)<1e-4);
  const step=await kernel.export('step');
  assert.ok(step.data.length>1000);
});

test('另一尺寸仍生成一体双孔；断开的两圈不能误判为单实体',async()=>{
  const joined=await build(27,7,4,9);
  assert.equal(joined.stats.solids,1);
  const size=joined.bodies[0].bounds.max.map((v,i)=>v-joined.bodies[0].bounds.min[i]);
  [35,24,4].forEach((v,i)=>assert.ok(Math.abs(size[i]-v)<1e-5));
  try {
    const separated=await build(27,7,4,20);
    assert.notEqual(separated.stats.solids,1);
  } catch(error) {
    assert.match(String(error),/union|实体|融合|单实体|交/);
  }
});

test('AI 可发现三张工具卡和完整分步页面配方',()=>{
  for(const op of ['quickModel','transform','union'])assert.ok(getOperation(op));
  const docs=readDocs({docId:'recipes.figure-eight-capsule'});
  assert.match(docs.text,/api\.run/);
  assert.match(docs.text,/solidCount|单实体/);
  assert.match(docs.text,/centerSpacing/);
});

test.after(()=>kernel.dispose());
