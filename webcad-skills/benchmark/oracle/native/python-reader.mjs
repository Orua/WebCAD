import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,writeFile,realpath} from 'node:fs/promises';
import {isAbsolute,resolve,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {judgeGeometry} from '../judge.mjs';
const execute=promisify(execFile),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const script=fileURLToPath(new URL('./ocp_reader.py',import.meta.url));
const compositeScript=fileURLToPath(new URL('./ocp_composite_reader.py',import.meta.url));
const sectionScript=fileURLToPath(new URL('./ocp_section_reader.py',import.meta.url));
const ellipseScript=fileURLToPath(new URL('./ocp_s02_reader.py',import.meta.url));
const ellipseMath=fileURLToPath(new URL('./s02_math.py',import.meta.url));
const bendScript=fileURLToPath(new URL('./ocp_m03_reader.py',import.meta.url));
const bendMath=fileURLToPath(new URL('./m03_math.py',import.meta.url));
const radialScript=fileURLToPath(new URL('./ocp_m05_reader.py',import.meta.url));
const radialMath=fileURLToPath(new URL('./m05_math.py',import.meta.url));
const closedScript=fileURLToPath(new URL('./ocp_m02_reader.py',import.meta.url));
const closedMath=fileURLToPath(new URL('./m02_math.py',import.meta.url));
const twistScript=fileURLToPath(new URL('./ocp_s01_reader.py',import.meta.url));
const twistMath=fileURLToPath(new URL('./s01_math.py',import.meta.url));
const spatialScript=fileURLToPath(new URL('./ocp_s04_reader.py',import.meta.url));
const spatialMath=fileURLToPath(new URL('./s04_math.py',import.meta.url));
const bentSectionScript=fileURLToPath(new URL('./ocp_s05_reader.py',import.meta.url));
const bentSectionMath=fileURLToPath(new URL('./s05_math.py',import.meta.url));
const supportedCases=['B01','B02','B03','M01','M02','M03','M04','M05','S01','S02','S03','S04','S05'];
const isComposite=caseId=>caseId==='M01'||caseId==='M04';
const isExtended=caseId=>caseId==='S05'||caseId==='S04'||caseId==='S01'||isComposite(caseId)||caseId==='S03'||caseId==='S02'||caseId==='M03'||caseId==='M05'||caseId==='M02';
export async function createOcpStepReader({python,directory,environment=process.env,timeoutMs=60000}={}){
 if(!isAbsolute(python??'')||!isAbsolute(directory??'')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>600000)throw Error('EXPLICIT_OCP_INTERPRETER_STORAGE_AND_BUDGET_REQUIRED');
 const repository=await realpath(fileURLToPath(new URL('../../../..',import.meta.url))),root=resolve(directory);
 const within=(parent,path)=>{const r=relative(parent,path);return !isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep);};
 if(within(repository,root))throw Error('ORACLE_EVIDENCE_MUST_BE_EXTERNAL');
 await mkdir(root,{recursive:true});const realRoot=await realpath(root);
 if(within(repository,realRoot))throw Error('ORACLE_EVIDENCE_LINK_IS_REPOSITORY');
 const scriptSha256=hash(await readFile(script));
 const compositeScriptSha256=hash(await readFile(compositeScript));
 const sectionScriptSha256=hash(await readFile(sectionScript));
 const ellipseScriptSha256=hash(await readFile(ellipseScript)),ellipseMathSha256=hash(await readFile(ellipseMath));
 const bendScriptSha256=hash(await readFile(bendScript)),bendMathSha256=hash(await readFile(bendMath));
 const radialScriptSha256=hash(await readFile(radialScript)),radialMathSha256=hash(await readFile(radialMath));
 const closedScriptSha256=hash(await readFile(closedScript)),closedMathSha256=hash(await readFile(closedMath));
 const twistScriptSha256=hash(await readFile(twistScript)),twistMathSha256=hash(await readFile(twistMath));
 const spatialScriptSha256=hash(await readFile(spatialScript)),spatialMathSha256=hash(await readFile(spatialMath));
 const bentSectionScriptSha256=hash(await readFile(bentSectionScript)),bentSectionMathSha256=hash(await readFile(bentSectionMath));
 const selectedHash=caseId=>caseId==='S05'?bentSectionScriptSha256:caseId==='S04'?spatialScriptSha256:caseId==='S01'?twistScriptSha256:caseId==='M02'?closedScriptSha256:caseId==='M05'?radialScriptSha256:caseId==='M03'?bendScriptSha256:caseId==='S02'?ellipseScriptSha256:caseId==='S03'?sectionScriptSha256:isComposite(caseId)?compositeScriptSha256:scriptSha256;
 const sourceMetadata=caseId=>caseId==='S05'?{sourceHashes:{'ocp_s05_reader.py':bentSectionScriptSha256,'s05_math.py':bentSectionMathSha256,'ocp_s04_reader.py':spatialScriptSha256,'s04_math.py':spatialMathSha256,'m02_math.py':closedMathSha256,'ocp_reader.py':scriptSha256}}:caseId==='S04'?{sourceHashes:{'ocp_s04_reader.py':spatialScriptSha256,'s04_math.py':spatialMathSha256,'m02_math.py':closedMathSha256,'ocp_reader.py':scriptSha256}}:caseId==='S01'?{sourceHashes:{'ocp_s01_reader.py':twistScriptSha256,'s01_math.py':twistMathSha256,'ocp_reader.py':scriptSha256}}:caseId==='M02'?{sourceHashes:{'ocp_m02_reader.py':closedScriptSha256,'m02_math.py':closedMathSha256,'ocp_reader.py':scriptSha256}}:caseId==='M05'?{sourceHashes:{'ocp_m05_reader.py':radialScriptSha256,'m05_math.py':radialMathSha256,'ocp_reader.py':scriptSha256}}:caseId==='M03'?{sourceHashes:{'ocp_m03_reader.py':bendScriptSha256,'m03_math.py':bendMathSha256,'ocp_reader.py':scriptSha256}}:caseId==='S02'?{sourceHashes:{'ocp_s02_reader.py':ellipseScriptSha256,'s02_math.py':ellipseMathSha256,'ocp_reader.py':scriptSha256}}:{};
 async function folder(prefix){
  const path=await mkdtemp(join(root,prefix));
  if(!within(realRoot,await realpath(path)))throw Error('ORACLE_EVIDENCE_SCOPE_ESCAPED');
  return path;
 }
 async function invoke(args,reportPath,caseId){
  if(hash(await readFile(script))!==scriptSha256)throw Error('OCP_READER_SOURCE_CHANGED');
  const selectedScript=caseId==='S05'?bentSectionScript:caseId==='S04'?spatialScript:caseId==='S01'?twistScript:caseId==='M02'?closedScript:caseId==='M05'?radialScript:caseId==='M03'?bendScript:caseId==='S02'?ellipseScript:caseId==='S03'?sectionScript:isComposite(caseId)?compositeScript:script;
  if(isComposite(caseId)&&hash(await readFile(compositeScript))!==compositeScriptSha256)throw Error('OCP_COMPOSITE_READER_SOURCE_CHANGED');
  if(caseId==='S03'&&hash(await readFile(sectionScript))!==sectionScriptSha256)throw Error('OCP_SECTION_READER_SOURCE_CHANGED');
  if(caseId==='S02'&&(hash(await readFile(ellipseScript))!==ellipseScriptSha256||hash(await readFile(ellipseMath))!==ellipseMathSha256))throw Error('OCP_ELLIPSE_READER_SOURCE_CHANGED');
  if(caseId==='M03'&&(hash(await readFile(bendScript))!==bendScriptSha256||hash(await readFile(bendMath))!==bendMathSha256))throw Error('OCP_BEND_READER_SOURCE_CHANGED');
  if(caseId==='M05'&&(hash(await readFile(radialScript))!==radialScriptSha256||hash(await readFile(radialMath))!==radialMathSha256))throw Error('OCP_RADIAL_READER_SOURCE_CHANGED');
  if(caseId==='M02'&&(hash(await readFile(closedScript))!==closedScriptSha256||hash(await readFile(closedMath))!==closedMathSha256))throw Error('OCP_CLOSED_WIRE_READER_SOURCE_CHANGED');
  if(caseId==='S01'&&(hash(await readFile(twistScript))!==twistScriptSha256||hash(await readFile(twistMath))!==twistMathSha256))throw Error('OCP_TWIST_READER_SOURCE_CHANGED');
  if(caseId==='S04'&&(hash(await readFile(spatialScript))!==spatialScriptSha256||hash(await readFile(spatialMath))!==spatialMathSha256||hash(await readFile(closedMath))!==closedMathSha256))throw Error('OCP_SPATIAL_SWEEP_READER_SOURCE_CHANGED');
  if(caseId==='S05'&&(hash(await readFile(bentSectionScript))!==bentSectionScriptSha256||hash(await readFile(bentSectionMath))!==bentSectionMathSha256||hash(await readFile(spatialScript))!==spatialScriptSha256||hash(await readFile(spatialMath))!==spatialMathSha256||hash(await readFile(closedMath))!==closedMathSha256))throw Error('OCP_BENT_SECTION_READER_SOURCE_CHANGED');
  // Interpreter and PYTHONPATH come from the authorized host, never source defaults.
  let failure;
  try{await execute(python,['-B',selectedScript,...args,'--report',reportPath],{env:{...environment,PYTHONDONTWRITEBYTECODE:'1'},windowsHide:true,timeout:timeoutMs,maxBuffer:4*1024*1024,encoding:'utf8'});}
  catch(error){failure=error;}
  let result;
  try{result=JSON.parse(await readFile(reportPath,'utf8'));}
  catch{throw Error(failure?.killed?'OCP_READER_TIMEOUT':'OCP_READER_REPORT_UNAVAILABLE');}
  if(failure||result.status==='ERROR'||!result.geometry)throw Object.assign(Error(result.message??result.error??'OCP_READER_FAILED'),{code:result.error??'OCP_READER_FAILED'});
  return result;
 }
 const reader=async({bytes,caseId,stage='observation'})=>{
  if(!supportedCases.includes(caseId)||!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>128*1024*1024||!/^[a-z0-9-]{1,50}$/i.test(stage))throw Error('OCP_STEP_INPUT_INVALID');
  const run=await folder(caseId+'-'+stage+'-'),input=join(run,'input.step'),inputSha256=hash(bytes);
  await writeFile(input,bytes,{flag:'wx'});
  const result=await invoke(['--case',caseId,'--input',input,...(caseId==='M05'?['--mode',stage==='m05-first-hole'?'first-hole':'final']:[])],join(run,'reader.json'),caseId);
  if(hash(await readFile(input))!==inputSha256)throw Error('OCP_READER_INPUT_CHANGED');
  result.geometry.reader={...result.geometry.reader,inputSha256,scriptSha256:selectedHash(caseId),...(isExtended(caseId)?{baseScriptSha256:scriptSha256}:{}),...sourceMetadata(caseId),sourceLengthUnits:result.sourceLengthUnits,normalizedLengthUnit:result.normalizedLengthUnit};
  await writeFile(join(run,'observation.json'),JSON.stringify(result,null,2),{flag:'wx'});
  return result.geometry;
 };
 reader.createReference=async({caseId,variant='reference'})=>{
  if(!supportedCases.includes(caseId)||!['reference','wrong-size','wrong-hole','blind-hole','wrong-radius','wrong-shoulder','wrong-depth','wrong-normal','wrong-center','ends-only','wrong-middle','twisted-middle','wrong-end','wrong-middle-angle','area-preserving-size','stacked','wrong-wall','wrong-path','plugged-end','rotated-sector','missing-hole','wrong-axis','extra-hole','first-hole','through-first','ambiguous-final','wrong-wire','wrong-corner','wrong-envelope','open-gap','shifted-center','crossbar','shifted-path'].includes(variant))throw Error('OCP_REFERENCE_INPUT_INVALID');
  const run=await folder(caseId+'-'+variant+'-'),output=join(run,'reference.step');
  const construction=await invoke(['--case',caseId,'--variant',variant,'--write-reference',output],join(run,'construction.json'),caseId);
  const intermediate=caseId==='M05'&&['first-hole','through-first'].includes(variant);
  const bytes=new Uint8Array(await readFile(output)),geometry=await reader({bytes,caseId,stage:intermediate?'m05-first-hole':'reference-readback'}),judgment=judgeGeometry(caseId,geometry);
  // M05 final geometry qualification deliberately leaves the original workflow
  // assertion unknown, exactly as B03 reference geometry cannot prove undo history.
  const complete=judgment.checks.filter(c=>c.id!=='undo'&&!(caseId==='M05'&&c.id==='cutScope')).every(c=>c.status==='PASS');
  const result={recordType:'INDEPENDENT_REFERENCE_VALIDATION',caseId,variant,referenceSha256:hash(bytes),construction,geometry,judgment,geometryStatus:complete?'PASS':judgment.status==='FAIL'?'FAIL':'UNVERIFIED',scriptSha256:selectedHash(caseId),...(isExtended(caseId)?{baseScriptSha256:scriptSha256}:{}),...sourceMetadata(caseId)};
  await writeFile(join(run,'reference-validation.json'),JSON.stringify(result,null,2),{flag:'wx'});
  return result;
 };
 reader.validateReference=async({fixture})=>{
  if(!supportedCases.includes(fixture.caseId))return {status:'UNVERIFIED',reason:'OCP_REFERENCE_CASE_NOT_IMPLEMENTED'};
  const result=await reader.createReference({caseId:fixture.caseId});
  return {status:result.geometryStatus,sourceHash:fixture.sourceHash,oracleVersion:fixture.oracleVersion,oracleHash:fixture.oracleHash,referenceSha256:result.referenceSha256,scriptSha256:result.scriptSha256,...(result.baseScriptSha256?{baseScriptSha256:result.baseScriptSha256}:{}),...(result.sourceHashes?{sourceHashes:result.sourceHashes}:{}),readerVersion:result.geometry.reader.version,sharedKernelFamily:true,algorithmIndependence:false,geometryOnly:true,remainingLiveAssertions:fixture.caseId==='B03'?['undo']:fixture.caseId==='M05'?['cutScope']:[]};
 };
 return reader;
}
