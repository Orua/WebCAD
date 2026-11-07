import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {judgeGeometry} from '../judge.mjs';
const execute=promisify(execFile);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const supported=new Set(['B01','B02','B03']);
export async function createNativeStepReader({executable,directory,timeoutMs=60000}={}){
 if(!isAbsolute(executable??'')||!isAbsolute(directory??'')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>600000)throw Error('EXPLICIT_NATIVE_READER_PATHS_AND_BUDGET_REQUIRED');
 const root=resolve(directory),repository=await realpath(fileURLToPath(new URL('../../../..',import.meta.url)));
 const within=(parent,path)=>{const r=relative(parent,path);return !isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep);};
 if(within(repository,root))throw Error('ORACLE_EVIDENCE_MUST_BE_EXTERNAL');
 await mkdir(root,{recursive:true});
 if(within(repository,await realpath(root)))throw Error('ORACLE_EVIDENCE_LINK_IS_REPOSITORY');
 const executableSha256=hash(await readFile(executable));
 async function invoke(args){
  if(hash(await readFile(executable))!==executableSha256)throw Error('NATIVE_READER_BINARY_CHANGED');
  const {stdout}=await execute(executable,args,{windowsHide:true,timeout:timeoutMs,maxBuffer:4*1024*1024,encoding:'utf8'});
  const result=JSON.parse(stdout.trim());
  if(result.status==='ERROR'||!result.geometry)throw Error(result.error??'NATIVE_READER_NO_GEOMETRY');
  return result;
 }
 const reader=async({bytes,caseId,stage='observation'})=>{
  if(!supported.has(caseId)||!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>128*1024*1024||typeof stage!=='string'||!/^[a-z0-9-]{1,50}$/i.test(stage))throw Error('NATIVE_STEP_INPUT_INVALID');
  const runDirectory=await mkdtemp(join(root,caseId+'-'+stage+'-'));
  const input=join(runDirectory,'input.step'),inputSha256=hash(bytes);
  await writeFile(input,bytes,{flag:'wx'});
  const report=await invoke(['--case',caseId,'--input',input]);
  if(hash(await readFile(input))!==inputSha256)throw Error('NATIVE_READER_INPUT_CHANGED');
  report.inputSha256=inputSha256;report.executableSha256=executableSha256;
  await writeFile(join(runDirectory,'observation.json'),JSON.stringify(report,null,2),{flag:'wx'});
  const geometry=report.geometry;
  geometry.reader={...geometry.reader,executableSha256,inputSha256,sourceLengthUnits:report.sourceLengthUnits,normalizedLengthUnit:report.normalizedLengthUnit};
  return geometry;
 };
 reader.createReference=async({caseId,variant='reference'})=>{
  if(!supported.has(caseId)||!['reference','wrong-size','wrong-hole','blind-hole','wrong-radius'].includes(variant))throw Error('NATIVE_REFERENCE_INPUT_INVALID');
  const runDirectory=await mkdtemp(join(root,caseId+'-'+variant+'-')),path=join(runDirectory,'reference.step');
  const construction=await invoke(['--case',caseId,'--variant',variant,'--write-reference',path]);
  const bytes=new Uint8Array(await readFile(path)),geometry=await reader({bytes,caseId,stage:'reference-readback'});
  const judgment=judgeGeometry(caseId,geometry);
  // STEP cannot establish undo. All other mandatory geometry checks must pass.
  const geometryComplete=judgment.checks.filter(c=>c.id!=='undo').every(c=>c.status==='PASS');
  const result={recordType:'INDEPENDENT_REFERENCE_VALIDATION',caseId,variant,referenceSha256:hash(bytes),construction,geometry,judgment,geometryStatus:geometryComplete?'PASS':judgment.status==='FAIL'?'FAIL':'UNVERIFIED',executableSha256};
  await writeFile(join(runDirectory,'reference-validation.json'),JSON.stringify(result,null,2),{flag:'wx'});
  return result;
 };
 reader.validateReference=async({fixture})=>{
  if(!supported.has(fixture.caseId))return {status:'UNVERIFIED',reason:'NATIVE_REFERENCE_CASE_NOT_IMPLEMENTED'};
  const result=await reader.createReference({caseId:fixture.caseId});
  return {status:result.geometryStatus,sourceHash:fixture.sourceHash,oracleVersion:fixture.oracleVersion,oracleHash:fixture.oracleHash,referenceSha256:result.referenceSha256,nativeReaderSha256:executableSha256,sharedKernelFamily:true,algorithmIndependence:false,geometryOnly:true,remainingLiveAssertions:fixture.caseId==='B03'?['undo']:[]};
 };
 return reader;
}
