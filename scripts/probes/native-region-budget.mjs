import fs from 'node:fs';import init from 'replicad-opencascadejs';import *as cad from 'replicad';import {decodeProject}from '../../src/project-container.js';
if(!process.argv[4])throw new Error("Usage: node scripts/probes/native-region-budget.mjs <mode> <count> <model.webcad>");
const mode=process.argv[2]||'delete-only',n=Number(process.argv[3]||12),oc=await init({wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});cad.setOC(oc);
const doc=await decodeProject(fs.readFileSync(process.argv[4])),brep=new TextDecoder().decode(Object.values(doc.compiledArtifacts)[0]),min=[-90.73141311211296,-9.091509585311666,17.01998677177573],max=[-90.62741311211295,-8.987509585311667,17.12398677177573];
const log=i=>console.log(JSON.stringify({mode,iteration:i,heapBytes:oc.wasmMemory.buffer.byteLength,rss:process.memoryUsage().rss}));log(0);
for(let i=0;i<n;i++){
 let work,workRaw,probe,builder,raw,result,args,tools,solids=[];
 try{
  if(mode==='owned-input'){workRaw=oc.BRepToolsWrapper.Read(brep);work=cad.cast(workRaw);}else work=cad.deserializeShape(brep);
  probe=cad.makeBox(min,max);
  if(mode==='one-build'){builder=new oc.BRepAlgoAPI_Common();args=new oc.NCollection_List_TopoDS_Shape();tools=new oc.NCollection_List_TopoDS_Shape();args.Append(work.wrapped);tools.Append(probe.wrapped);builder.SetArguments(args);builder.SetTools(tools);builder.Build();}
  else{builder=new oc.BRepAlgoAPI_Common(work.wrapped,probe.wrapped);if(mode==='no-history')builder.SetToFillHistory(false);builder.Build();}
  if(!builder.IsDone())throw Error('not done');raw=builder.Shape();if(raw.IsNull())continue;raw.delete();raw=null;
  if(mode!=='no-simplify')builder.SimplifyResult(true,true,.001);raw=builder.Shape();result=cad.cast(raw);if(mode!=='owned-result')raw=null;
  solids=result.solids;if(solids.length)throw Error('expected actual empty groove witness');
 }finally{if(mode==='explicit-clear')builder?.Clear();for(const x of [...solids,result,raw,builder,probe,work,workRaw,args,tools])x?.delete();}
 log(i+1);
}
