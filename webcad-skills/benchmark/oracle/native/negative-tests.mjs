// Real native geometry/reference tests. No fake process or fabricated STEP bytes.
import {parseArgs} from 'node:util';
import {createNativeStepReader} from './reader.mjs';
const {values}=parseArgs({options:{executable:{type:'string'},output:{type:'string'}}});
try{
 const reader=await createNativeStepReader({executable:values.executable,directory:values.output});
 const runs=[];
 for(const caseId of ['B01','B02','B03']){
  const result=await reader.createReference({caseId});
  runs.push({caseId,variant:'reference',status:result.geometryStatus,sha256:result.referenceSha256,liveUndo:caseId==='B03'?'NOT_RUN':null});
 }
 for(const [caseId,variant]of [['B01','wrong-size'],['B01','wrong-hole'],['B01','blind-hole'],['B02','wrong-size'],['B02','wrong-hole'],['B03','wrong-radius']]){
  const result=await reader.createReference({caseId,variant});
  runs.push({caseId,variant,status:result.judgment.status==='FAIL'?'EXPECTED_REJECTION':'FAIL',sha256:result.referenceSha256,failedAssertions:result.judgment.checks.filter(c=>c.status==='FAIL').map(c=>c.id)});
 }
 const pass=runs.every(r=>r.status==='PASS'||r.status==='EXPECTED_REJECTION');
 console.log(JSON.stringify({recordType:'REAL_NATIVE_ORACLE_SELFTEST_NOT_APPLICATION_BASELINE',status:pass?'PASS':'FAIL',runs},null,2));process.exitCode=pass?0:1;
}catch(error){console.error(error.message);process.exitCode=2;}
