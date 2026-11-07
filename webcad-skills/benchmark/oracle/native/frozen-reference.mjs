import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {judgeGeometry} from '../judge.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Reuses already-passed reference STEP/readback receipts; never regenerates geometry.
// entries are frozen by the coordinator with fixture hashes and exact evidence paths.
export function createFrozenReferenceValidator({entries}={}){
 if(!Array.isArray(entries))throw Error('FROZEN_REFERENCE_ENTRIES_REQUIRED');
 const pinned=new Map();
 for(const entry of entries){
  if(!['B01','B02','B03','M01','M02','M03','M04','M05','S01','S02','S03','S06'].includes(entry.caseId)||pinned.has(entry.caseId)||!isAbsolute(entry.receiptPath??'')||!isAbsolute(entry.stepPath??'')||!entry.sourceHash||!entry.oracleHash||!entry.oracleVersion)throw Error('FROZEN_REFERENCE_ENTRY_INVALID');
  pinned.set(entry.caseId,Object.freeze({...entry}));
 }
 return async({fixture})=>{
  const entry=pinned.get(fixture.caseId);
  if(!entry)return {status:'UNVERIFIED',reason:'NO_FROZEN_REFERENCE_FOR_CASE'};
  if(['sourceHash','oracleHash','oracleVersion'].some(key=>entry[key]!==fixture[key]))return {status:'UNVERIFIED',reason:'FROZEN_REFERENCE_FIXTURE_VERSION_MISMATCH'};
  if(fixture.caseId==='S01'||fixture.caseId==='S06'||fixture.caseId==='S02'||fixture.caseId==='M03'||fixture.caseId==='M05'||fixture.caseId==='M02'){
   const [raw,bytes]=await Promise.all([readFile(entry.receiptPath,'utf8'),readFile(entry.stepPath)]);
   const receipt=JSON.parse(raw),referenceSha256=hash(bytes),sourceHashes={};
   const surface=fixture.caseId==='S06';
   for(const name of fixture.caseId==='S01'?['ocp_s01_reader.py','s01_math.py','ocp_reader.py']:surface?['ocp_s06_reader.py','s06_math.py','ocp_reader.py']:fixture.caseId==='M02'?['ocp_m02_reader.py','m02_math.py','ocp_reader.py']:fixture.caseId==='M05'?['ocp_m05_reader.py','m05_math.py','ocp_reader.py']:fixture.caseId==='M03'?['ocp_m03_reader.py','m03_math.py','ocp_reader.py']:['ocp_s02_reader.py','s02_math.py','ocp_reader.py'])sourceHashes[name]=hash(await readFile(new URL('./'+name,import.meta.url)));
   if(receipt.caseId!==fixture.caseId||receipt.variant!=='reference'||receipt.geometryStatus!=='PASS'||receipt.referenceSha256!==referenceSha256||Object.entries(sourceHashes).some(([name,sha256])=>receipt.sourceHashes?.[name]!==sha256||receipt.geometry?.reader?.sourceHashes?.[name]!==sha256))return {status:'UNVERIFIED',reason:'FROZEN_SAMPLED_REFERENCE_RECEIPT_OR_DEPENDENCIES_MISMATCH'};
   const judgment=judgeGeometry(fixture.caseId,receipt.geometry);
   const complete=judgment.checks.filter(c=>!(fixture.caseId==='M05'&&c.id==='cutScope')).every(c=>c.status==='PASS');
   if(receipt.geometry.solidCount!==(surface?0:1)||receipt.geometry.targetType!==(surface?'surface':'solid')||!complete)return {status:'UNVERIFIED',reason:'FROZEN_SAMPLED_REFERENCE_INCOMPLETE'};
   if(fixture.caseId==='M05'&&receipt.geometry.checks?.cutScope?.pass!==null)return {status:'UNVERIFIED',reason:'FINAL_STEP_MUST_NOT_ASSERT_M05_PROCESS_SCOPE'};
   return {status:'PASS',sourceHash:entry.sourceHash,oracleHash:entry.oracleHash,oracleVersion:entry.oracleVersion,referenceSha256,sourceHashes,readerVersion:receipt.geometry.reader.version,sharedKernelFamily:true,algorithmIndependence:false,geometryOnly:true,referenceReuse:'verified-existing-STEP-and-readback-receipt',continuousMaximumErrorCertified:false,remainingLiveAssertions:fixture.caseId==='M05'?['cutScope']:[]};
  }
  const composite=fixture.caseId==='M01'||fixture.caseId==='M04';
  const section=fixture.caseId==='S03';
  const [raw,bytes,baseScript,script]=await Promise.all([readFile(entry.receiptPath,'utf8'),readFile(entry.stepPath),readFile(new URL('./ocp_reader.py',import.meta.url)),readFile(new URL(section?'./ocp_section_reader.py':composite?'./ocp_composite_reader.py':'./ocp_reader.py',import.meta.url))]);
  const receipt=JSON.parse(raw),scriptSha256=hash(script),referenceSha256=hash(bytes),baseScriptSha256=hash(baseScript);
  if(receipt.caseId!==fixture.caseId||receipt.variant!=='reference'||receipt.geometryStatus!=='PASS'||receipt.referenceSha256!==referenceSha256||receipt.scriptSha256!==scriptSha256)return {status:'UNVERIFIED',reason:'FROZEN_REFERENCE_RECEIPT_OR_BYTES_MISMATCH'};
  if((composite||section)&&receipt.baseScriptSha256!==baseScriptSha256)return {status:'UNVERIFIED',reason:'FROZEN_EXTENSION_REFERENCE_DEPENDENCY_MISMATCH'};
  const judgment=judgeGeometry(fixture.caseId,receipt.geometry);
  if(judgment.checks.filter(c=>c.id!=='undo').some(c=>c.status!=='PASS'))return {status:'UNVERIFIED',reason:'FROZEN_REFERENCE_GEOMETRY_CHECKS_INCOMPLETE'};
  return {status:'PASS',sourceHash:entry.sourceHash,oracleHash:entry.oracleHash,oracleVersion:entry.oracleVersion,referenceSha256,scriptSha256,...(composite||section?{baseScriptSha256}:{}),readerVersion:receipt.geometry.reader.version,sharedKernelFamily:true,algorithmIndependence:false,referenceReuse:'verified-existing-STEP-and-readback-receipt',geometryOnly:true,remainingLiveAssertions:fixture.caseId==='B03'?['undo']:[]};
 };
}
