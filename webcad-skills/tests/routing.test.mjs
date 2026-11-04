import assert from 'node:assert/strict';
import {load,routeTask} from '../scripts/load.mjs';
const cases=[
 ['在板上打孔','cut-features','plain-hole'],['开一个直径4的通孔','cut-features','plain-hole'],['在板上钻两个贯穿圆孔','cut-features','multi-hole'],['双孔安装板','cut-features','multi-hole'],['开一个平底盲孔深1','cut-features','plain-hole'],['要沉头孔','cut-features','wizard'],['开圆槽用刀具切除','cut-features','boolean'],
 ['建立圆柱铆钉','axisymmetric','cylinder'],['铆钉带钉头台阶和盲孔','axisymmetric','revolve'],['同轴空心圆筒','axisymmetric','tube'],['只做倒角C0.5','finishing','chamfer'],['不要圆角，只做倒角C0.5','finishing','chamfer'],['不要倒角，只做圆角R0.5','finishing','fillet'],['保持孔位给板加厚','editing','edit'],
 ['方线沿中心路径扫掠','path-section','sweep'],['两个不同截面放样','transition','loft'],['引导放样','transition','guided'],['装配对齐两个独立部件','placement','align'],['合并实体为连续材料','placement','join'],['刻字LOGO保留内孔','logo','contours'],['给定轮廓拉伸','solid-section','profile'],['建立30x20x3矩形板','solid-section','box'],['导出STL网格','inspection','stl'],['导出STEP精确模型','inspection','step'],['测量孔径和孔距','inspection','measure'],['保存当前工程','inspection','save'],['撤销最后一步','editing','undo']];
let maxPlanChars=0;for(const [task,id,branch]of cases){const r=await load(task);assert.ok(r.matches.some(x=>x.id===id&&x.branch===branch),JSON.stringify({task,matches:r.matches}));assert.ok(!r.files.some(f=>f.startsWith('tools/cards/')));maxPlanChars=Math.max(maxPlanChars,r.contextChars);}
for(const task of ['AMBIGUOUS_SELECTION','REVISION_CONFLICT','孔没有出现导致失败','放样扭转失败','提交超时断线']){const r=await load(task);assert.equal(r.problem,true);assert.ok(r.files.includes('problems/diagnosis.md'));}
const unknown=await load('任意自由曲面做高级制造保证');assert.equal(unknown.needsClarification,true);
const unspecified=await load('导出文件');assert.equal(unspecified.needsClarification,true);
const stl=await load('导出STL网格');assert.ok(!stl.matches.some(x=>x.branch==='step'));
const tube=await load('',{route:'axisymmetric',branch:'tube',tools:true});assert.ok(tube.toolIds.includes('template.tube'));assert.ok(!tube.files.some(f=>f.endsWith('/quickModel.json')));
await assert.rejects(()=>load('',{route:'finishing',branch:'chamfer',tools:true,maxChars:100}),/CONTEXT_BUDGET_EXCEEDED/);
console.log(JSON.stringify({status:'passed',naturalLanguageTasks:cases.length,problemTasks:5,extraDecisions:5,maxPlanChars,tubeExecutionChars:tube.contextChars}));
