// Isolated S06 bridge. Not registered in the frozen shared reader or browser host.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createArtifactWriter} from '../../adapters/artifact-writer.mjs';
import {judgeGeometry} from '../judge.mjs';
const execute=promisify(execFile),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceNames=['ocp_s06_reader.py','s06_math.py','ocp_reader.py'];
const script=fileURLToPath(new URL('./ocp_s06_reader.py',import.meta.url));
export async function createS06StepReader({python,directory,environment=process.env,timeoutMs=180000}={}){
 if(!isAbsolute(python??'')||!isAbsolute(directory??'')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>600000)throw Error('EXPLICIT_S06_READER_RUNTIME_AND_BUDGET_REQUIRED');
 const root=resolve(directory),persist=await createArtifactWriter(root),sourceHashes={};
 for(const name of sourceNames)sourceHashes[name]=hash(await readFile(new URL('./'+name,import.meta.url)));
 async function save(scope,name,value){
  const bytes=value instanceof Uint8Array?value:Buffer.from(JSON.stringify(value,null,2));
  return persist({scope,name,bytes,sha256:hash(bytes)});
 }
 async function invoke(args,scope){
  for(const name of sourceNames)if(hash(await readFile(new URL('./'+name,import.meta.url)))!==sourceHashes[name])throw Error('S06_ORACLE_SOURCE_CHANGED');
  const reportPath=join(root,scope,'native.json');
  await save(scope,'request.json',{caseId:'S06',args,sourceHashes,timeoutMs});
  let failure;
  try{await execute(python,['-B',script,'--case','S06',...args,'--report',reportPath],{env:{...environment,PYTHONDONTWRITEBYTECODE:'1'},windowsHide:true,timeout:timeoutMs,maxBuffer:4*1024*1024,encoding:'utf8'});}
  catch(error){failure=error;}
  let report;
  try{report=JSON.parse(await readFile(reportPath,'utf8'));}catch{throw Error(failure?.killed?'S06_READER_TIMEOUT':'S06_READER_REPORT_UNAVAILABLE');}
  if(failure||report.status==='ERROR'||!report.geometry)throw Object.assign(Error(report.message??report.error??'S06_READER_FAILED'),{code:report.error??'S06_READER_FAILED'});
  return report;
 }
 const reader=async({bytes,caseId='S06',stage='observation'})=>{
  if(caseId!=='S06'||!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>128*1024*1024||!/^[a-z0-9-]{1,50}$/i.test(stage))throw Error('S06_STEP_INPUT_INVALID');
  const scope='S06-'+stage+'-'+randomUUID(),path=join(root,scope,'input.step'),inputSha256=hash(bytes);
  await save(scope,'input.step',bytes);
  const report=await invoke(['--input',path],scope);
  if(hash(await readFile(path))!==inputSha256)throw Error('S06_READER_INPUT_CHANGED');
  report.geometry.reader={...report.geometry.reader,inputSha256,sourceHashes:{...sourceHashes}};
  await save(scope,'observation.json',report);
  return report.geometry;
 };
 reader.createReference=async({variant='reference'}={})=>{
  if(!['reference','wrong-interior','wrong-boundary','extra-patch'].includes(variant))throw Error('S06_REFERENCE_VARIANT_INVALID');
  const scope='S06-'+variant+'-'+randomUUID(),path=join(root,scope,'reference.step');
  const construction=await invoke(['--variant',variant,'--write-reference',path],scope);
  const bytes=new Uint8Array(await readFile(path)),geometry=await reader({bytes,stage:'reference-readback'}),judgment=judgeGeometry('S06',geometry);
  const result={recordType:'ISOLATED_S06_REFERENCE_VALIDATION',caseId:'S06',variant,referenceSha256:hash(bytes),sourceHashes:{...sourceHashes},construction,geometry,judgment,geometryStatus:judgment.status,continuousMaximumErrorCertified:false};
  await save(scope,'reference-validation.json',result);return result;
 };
 reader.validateReference=async({fixture})=>{
  if(fixture.caseId!=='S06')return {status:'UNVERIFIED',reason:'ISOLATED_S06_READER_ONLY'};
  const result=await reader.createReference();
  return {status:result.geometryStatus,sourceHash:fixture.sourceHash,oracleHash:fixture.oracleHash,oracleVersion:fixture.oracleVersion,referenceSha256:result.referenceSha256,sourceHashes:{...sourceHashes},readerVersion:result.geometry.reader.version,sharedKernelFamily:true,algorithmIndependence:false,geometryOnly:true,continuousMaximumErrorCertified:false};
 };
 return reader;
}
