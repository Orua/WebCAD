import fs from 'node:fs/promises';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {decodeProject} from '../src/project-container.js';
import {validateProject} from '../src/document-validation.js';
const args=process.argv.slice(2),command=args.shift(),file=args.shift(),options={};
for(let i=0;i<args.length;i++){
  if(['--json','--mesh'].includes(args[i]))options[args[i].slice(2)]=true;
  else if(['--stl','--stop-at'].includes(args[i])&&args[i+1])options[args[i].slice(2)]=args[++i];
  else throw new Error(`未知参数：${args[i]}`);
}
if(!['validate','rebuild'].includes(command)||!file){console.error('用法：npm run webcad -- validate <工程.webcad> [--json] [--mesh] [--stl 输出.stl] [--stop-at 特征ID]');process.exitCode=2;}
else{
  const report={file,features:0,checks:{},rebuild:{status:'failed',ms:0,perFeatureMs:[]},bodies:[],displayMesh:[],loftChecks:[],warnings:[]};let kernel,start;
  try{
    const document=await decodeProject(await fs.readFile(file));
    if(options['stop-at']){const at=document.features.findIndex(f=>f.id===options['stop-at']);if(at<0)throw new Error('找不到stop-at特征');document.features=document.features.slice(0,at+1);delete document.timeline;}
    report.features=document.features.length;report.checks=validateProject(document);
    const oc=await init({wasmBinary:await fs.readFile(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});kernel=new CadKernel(oc);start=performance.now();
    const result=await kernel.rebuild(document,{headless:!options.mesh});report.rebuild={status:'completed',ms:performance.now()-start,perFeatureMs:result.perFeatureMs||[]};
    report.bodies=result.bodies.map(b=>({id:b.id,name:b.name,volumeMm3:b.volume,bboxMin:b.bounds.min,bboxMax:b.bounds.max,faces:b.faceCount,solids:b.solidCount}));
    report.displayMesh=result.bodies.filter(b=>b.displayReport).map(b=>({bodyId:b.id,...b.displayReport}));
    report.loftChecks=[...kernel.shapes].filter(([,s])=>s.loftReport).map(([featureId,s])=>({featureId,...s.loftReport}));
    report.radiusChecks=[...kernel.shapes].filter(([,s])=>s.radiusSearchReport).map(([featureId,s])=>({featureId,...s.radiusSearchReport}));
    for(const row of report.displayMesh){if(row.untriangulatedFaceIds.length)report.warnings.push({code:'DISPLAY_INCOMPLETE',bodyId:row.bodyId,faceIds:row.untriangulatedFaceIds});if(row.volumeErrorRatio>.02)report.warnings.push({code:'DISPLAY_VOLUME_MISMATCH',bodyId:row.bodyId,ratio:row.volumeErrorRatio});if(!row.watertight)report.warnings.push({code:'DISPLAY_NOT_WATERTIGHT',bodyId:row.bodyId});}
    if(options.stl){const out=await kernel.export('stl');await fs.writeFile(options.stl,out.data);report.stl={file:options.stl,bytes:out.data.length,...out.report};if(!out.report?.watertight)report.warnings.push({code:'STL_NOT_WATERTIGHT'});}
    process.exitCode=report.warnings.length?1:0;
  }catch(error){report.checks=error.checks||report.checks;report.rebuild={...report.rebuild,ms:start?performance.now()-start:0,failedFeature:{id:error.featureId??null,code:error.code||'VALIDATION_FAILED',message:error.message,path:error.path}};process.exitCode=2;}
  finally{kernel?.dispose();}
  console.log(JSON.stringify(report,null,options.json?0:2));
}
