import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';

const wasm=fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url));
const kernel=new CadKernel(await init({wasmBinary:wasm}));
const f=(id,op,params={},refs=[])=>({id,op,params,refs,name:id});
const run=features=>kernel.rebuild({version:1,features,imports:{},hidden:[]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1e-5,Math.abs(b)*1e-7),`${a} != ${b}`);
const size=b=>b.bounds.max.map((v,i)=>v-b.bounds.min[i]);
let result;

for(const kind of ['tube','counterboreTool','thinWallTray','roundedBossTray','roundBadge']) {
  const model=QUICK_MODELS[kind];
  assert.ok(model.label&&model.labelEn&&model.description&&model.descriptionEn);
  for(const field of model.fields) assert.ok(field.label&&field.labelEn&&Object.hasOwn(model.defaults,field.key));
}

const roundedArea=(width,depth,radius)=>width*depth-(4-Math.PI)*radius**2;
{
  const p={...QUICK_MODELS.roundedBossTray.defaults};
  result=await run([f('rounded','quickModel',{kind:'roundedBossTray',...p})]);assert.equal(result.stats.solids,1);
  const innerRadius=Math.max(0,p.cornerRadius-p.wallThickness),outer=roundedArea(p.outerWidth,p.outerDepth,p.cornerRadius),inner=roundedArea(p.outerWidth-2*p.wallThickness,p.outerDepth-2*p.wallThickness,innerRadius);
  const expected=outer*p.height-inner*(p.height-p.floorThickness)+2*Math.PI*(p.bossOuterDiameter/2)**2*p.bossHeight-2*Math.PI*(p.boreDiameter/2)**2*(p.floorThickness+p.bossHeight);
  near(result.stats.volume,expected);size(result.bodies[0]).forEach((value,index)=>near(value,[p.outerWidth,p.outerDepth,p.height][index]));
  for(const bad of [{cornerRadius:-1},{cornerRadius:p.outerDepth},{wallThickness:0},{boreDiameter:p.bossOuterDiameter},{bossHeight:p.height}])await assert.rejects(run([f('bad','quickModel',{kind:'roundedBossTray',...p,...bad})]));
}
for(const bore of [0,2]){
  const p={...QUICK_MODELS.roundBadge.defaults,postBoreDiameter:bore};
  result=await run([f('badge','quickModel',{kind:'roundBadge',...p})]);assert.equal(result.stats.solids,1);
  const expected=Math.PI*(p.diameter/2)**2*p.thickness-2*Math.PI*(bore/2)**2*p.thickness+Math.PI*((p.diameter/2)**2-(p.diameter/2-p.rimWidth)**2)*p.rimHeight+2*Math.PI*((p.postDiameter/2)**2-(bore/2)**2)*p.postHeight;
  near(result.stats.volume,expected);size(result.bodies[0]).forEach((value,index)=>near(value,[p.diameter,p.diameter,p.postHeight+p.thickness+p.rimHeight][index]));
}
for(const bad of [{diameter:0},{rimWidth:20},{rimHeight:0},{postSpacing:4},{postSpacing:39},{postBoreDiameter:4},{postBoreDiameter:-1}])await assert.rejects(run([f('bad','quickModel',{kind:'roundBadge',...QUICK_MODELS.roundBadge.defaults,...bad})]));
const tube=QUICK_MODELS.tube.defaults;
result=await run([f('tube','quickModel',{kind:'tube',...tube})]);
assert.equal(result.stats.solids,1); size(result.bodies[0]).forEach((v,i)=>near(v,[tube.outerDiameter,tube.outerDiameter,tube.height][i]));
near(result.stats.volume,Math.PI*((tube.outerDiameter/2)**2-(tube.innerDiameter/2)**2)*tube.height);
for(const bad of [{innerDiameter:0},{innerDiameter:tube.outerDiameter},{outerDiameter:0},{height:0}]) await assert.rejects(run([f('bad','quickModel',{kind:'tube',...tube,...bad})]));

for(const style of ['bore','sink']) {
  const p={...QUICK_MODELS.counterboreTool.defaults,style}; result=await run([f('tool','quickModel',{kind:'counterboreTool',...p})]);
  assert.equal(result.stats.solids,1); size(result.bodies[0]).forEach((v,i)=>near(v,[p.headDiameter,p.headDiameter,p.depth][i]));
  const headExtra=style==='bore'?Math.PI*(p.headDiameter**2-p.holeDiameter**2)/4*p.headDepth:Math.PI*p.headDepth/12*(p.headDiameter**2+p.headDiameter*p.holeDiameter-2*p.holeDiameter**2);
  near(result.stats.volume,Math.PI*(p.holeDiameter/2)**2*p.depth+headExtra);
  const toolVolume=result.stats.volume;
  result=await run([f('plate','box',{width:30,depth:30,height:10}),f('tool','quickModel',{kind:'counterboreTool',...p}),f('placed','transform',{x:15,y:15},['tool']),f('drilled','cut',{},['plate','placed'])]);
  assert.equal(result.stats.solids,1);near(result.stats.volume,9000-toolVolume);
}
for(const bad of [{holeDiameter:0},{headDiameter:4},{headDepth:0},{headDepth:8},{style:'bad'}]) await assert.rejects(run([f('bad','quickModel',{kind:'counterboreTool',...QUICK_MODELS.counterboreTool.defaults,...bad})]));

const trayVolume=p=>p.outerWidth*p.outerDepth*p.height
  -(p.outerWidth-2*p.wallThickness)*(p.outerDepth-2*p.wallThickness)*(p.height-p.floorThickness)
  +2*Math.PI*(p.bossOuterDiameter/2)**2*p.bossHeight
  -2*Math.PI*(p.boreDiameter/2)**2*(p.floorThickness+p.bossHeight);
for(const variant of [{},{outerWidth:73,outerDepth:42,bossSpacing:39,bossHeight:9,floorThickness:2.5}]) {
  const p={...QUICK_MODELS.thinWallTray.defaults,...variant};
  result=await run([f('tray','quickModel',{kind:'thinWallTray',...p})]);
  assert.equal(result.bodies.length,1); assert.equal(result.stats.solids,1);
  size(result.bodies[0]).forEach((value,i)=>near(value,[p.outerWidth,p.outerDepth,p.height][i]));
  result.bodies[0].bounds.min.forEach((value,i)=>near(value,[-p.outerWidth/2,-p.outerDepth/2,0][i]));
  near(result.stats.volume,trayVolume(p));
  const upwards=await kernel.queryGeometry('tray','face',{surfaceType:'plane',normal:{direction:[0,0,1],sameDirection:true}});
  const floor=upwards.items.filter(face=>Math.abs(face.center[2]-p.floorThickness)<1e-6);
  assert.equal(floor.length,1,'one exposed planar cavity floor');
  near(floor[0].areaMm2,(p.outerWidth-2*p.wallThickness)*(p.outerDepth-2*p.wallThickness)-2*Math.PI*(p.bossOuterDiameter/2)**2);
  assert.equal(upwards.items.filter(face=>Math.abs(face.center[2]-(p.floorThickness+p.bossHeight))<1e-6).length,2,'two boss tops below the open rim');
  const holes=await kernel.queryGeometry('tray','edge',{curveType:'circle',radiusRangeMm:{min:p.boreDiameter/2-1e-6,max:p.boreDiameter/2+1e-6}});
  const holeCenters=new Set(holes.items.map(edge=>`${edge.center[0].toFixed(6)},${edge.center[2].toFixed(6)}`));
  for(const x of [-p.bossSpacing/2,p.bossSpacing/2]) for(const z of [0,p.floorThickness+p.bossHeight]) {
    assert.ok(holeCenters.has(`${x.toFixed(6)},${z.toFixed(6)}`),'each bore opens at the underside and boss top');
  }
  const savedVolume=result.stats.volume, savedShape=kernel.activeShape('tray');
  for(const bad of [{outerWidth:0},{wallThickness:p.outerDepth/2},{floorThickness:p.height},
    {bossHeight:p.height},{boreDiameter:p.bossOuterDiameter},{bossSpacing:p.bossOuterDiameter},
    {bossSpacing:p.outerWidth},{bossOuterDiameter:p.outerDepth-2*p.wallThickness}]) {
    await assert.rejects(run([f('tray','quickModel',{kind:'thinWallTray',...p,...bad})]));
    assert.equal(kernel.activeShape('tray'),savedShape,'invalid parameters keep the committed B-Rep');
    near(kernel.measure('tray').volume,savedVolume);
  }
}

for(const kind of ['tube','counterboreTool','thinWallTray','roundedBossTray','roundBadge']) {
  await run([f('q','quickModel',{kind,...QUICK_MODELS[kind].defaults})]);
  const step=await kernel.export('step'); assert.ok(step.data.byteLength||step.data.length);
  const round=await kernel.rebuild({version:1,features:[f('i','import',{key:'s'})],imports:{s:{format:'step',data:Buffer.from(step.data).toString('base64')}},hidden:[]});
  assert.equal(round.stats.solids,1); near(round.stats.volume,(await kernel.rebuild({version:1,features:[f('q','quickModel',{kind,...QUICK_MODELS[kind].defaults})],imports:{},hidden:[]})).stats.volume);
}
kernel.dispose(); console.log('hardware template checks passed');
