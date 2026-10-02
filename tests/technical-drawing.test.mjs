import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {createTechnicalDrawing,layoutDrawing} from '../src/drawing/technical-drawing.js';
import {drawingSVG,drawingPDF,drawingDXF} from '../src/drawing/drawing-export.js';
import {parseDxf} from '../src/vector-import.js';
cad.setOC(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
test('true HLR views and section retain source and identify dimensions on a plate with two holes',()=>{
 const box=cad.makeBox([0,0,0],[30,20,5]),h1=cad.makeCylinder(3,10,[8,10,-2]),h2=cad.makeCylinder(2,10,[22,10,-2]),s1=box.cut(h1),shape=s1.cut(h2),before=shape.serialize();
 try{const result=createTechnicalDrawing([shape],{sections:[{plane:'XZ',offset:10}]});assert(shape.serialize()===before,'source BREP changed');assert.equal(result.views.length,4);assert(result.views[0].curves.some(c=>c.hidden));assert(result.dimensions.some(d=>d.kind==='diameter'&&Math.abs(d.valueMm-6)<1e-5));assert(result.dimensions.some(d=>Math.abs(d.valueMm-30)<1e-5));
  const scene=layoutDrawing(result,{title:'双孔板 / Plate'}),dxf=drawingDXF(scene),entities=parseDxf(dxf);assert(entities.length>30);assert(entities.some(e=>e.type==='CIRCLE'&&e.radius===3));assert(entities.some(e=>e.type==='CIRCLE'&&e.radius===2));assert(drawingPDF(scene).slice(0,8).toString().length>0);
  fs.mkdirSync('agent/output/quick-workbench-20261002',{recursive:true});for(const [ext,data]of [['svg',drawingSVG(scene)],['pdf',drawingPDF(scene)],['dxf',dxf],['json',JSON.stringify(result,null,2)]])fs.writeFileSync(`agent/output/quick-workbench-20261002/two-hole-plate.${ext}`,data);
 }finally{[shape,s1,h1,h2,box].forEach(s=>s.delete());}
});
