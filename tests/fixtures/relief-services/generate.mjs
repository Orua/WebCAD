// Regenerates the native golden fixtures (needs a built occt-worker; see services/WebCADServices/native/occt-worker).
// WEBCAD_SERVICES_OCCT_WORKER=/path/WebCADOcctWorker RELIEF_SOURCE_DIR=/dir/with/box.brep,disc.brep node tests/fixtures/relief-services/generate.mjs
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {designCase} from './cases.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),worker=process.env.WEBCAD_SERVICES_OCCT_WORKER,src=process.env.RELIEF_SOURCE_DIR;
if(!worker||!src)throw new Error('set WEBCAD_SERVICES_OCCT_WORKER and RELIEF_SOURCE_DIR');
export function runWorker(request,dir){fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'request.json');fs.writeFileSync(file,JSON.stringify(request));try{execFileSync(worker,[file]);}catch{}return JSON.parse(fs.readFileSync(request.reportPath,'utf8'));}
const out=[];
for(const name of ['box','disc','boxc']){
 const c=designCase(name),dir=fs.mkdtempSync('/tmp/relief-golden-');
 const rep=runWorker({operation:'reliefDesign',semanticVersion:'relief.design-fit-brep-1',strategy:'masked-bspline-face-replacement',params:{...c.params,faceIntent:c.params.faceIntent},sourcePath:path.join(src,c.source),outputPath:dir+'/g.brep',reportPath:dir+'/r.json',inputFingerprint:'golden-'+name,featureId:'f',expectedRevision:1},dir);
 if(!rep.ok)throw new Error(name+': '+rep.code+' '+rep.message);
 const r=rep.reliefDesign;out.push({name,source:c.source,controlDeltasMm:r.fit.controlDeltasMm,controlDeltasSha256:r.fit.controlDeltasSha256,lockedControlMask:r.fit.lockedControlMask,iterations:r.fit.report.iterations,trim:r.trim,boundaryEdgeKinds:r.boundaryEdgeKinds,boundaryDeviationMm:r.boundaryDeviationMm,quality:r.quality,beforeMm3:rep.before.volumeMm3,validation:{valid:rep.validation.valid,solidCount:rep.validation.solidCount}});
}
fs.writeFileSync(path.join(here,'golden-design-33.json'),JSON.stringify({generatedBy:'occt-worker relief.design-fit-brep-1',kernel:'OCCT 7.8.1',cases:out}));
console.log('wrote',out.length,'cases');
