// Real OCP construction + actual STEP write/readback. Not application/model scores.
import {parseArgs} from 'node:util';
import {createOcpStepReader} from './python-reader.mjs';
const {values}=parseArgs({options:{python:{type:'string'},output:{type:'string'}}});
try{
 const reader=await createOcpStepReader({python:values.python,directory:values.output}),runs=[];
 for(const [caseId,variant]of [['B01','reference'],['B02','reference'],['B03','reference'],['B01','wrong-size'],['B01','wrong-hole'],['B01','blind-hole'],['B02','wrong-size'],['B02','wrong-hole'],['B03','wrong-radius']]){
  const result=await reader.createReference({caseId,variant});
  const status=variant==='reference'?result.geometryStatus:result.judgment.status==='FAIL'?'EXPECTED_REJECTION':'FAIL';
  runs.push({caseId,variant,status,sha256:result.referenceSha256,failedAssertions:result.judgment.checks.filter(c=>c.status==='FAIL').map(c=>c.id),remainingLiveAssertions:caseId==='B03'?['undo']:[]});
 }
 const pass=runs.every(r=>r.status==='PASS'||r.status==='EXPECTED_REJECTION');
 console.log(JSON.stringify({recordType:'REAL_OCP_ORACLE_SELFTEST_NOT_APPLICATION_BASELINE',status:pass?'PASS':'FAIL',runs},null,2));process.exitCode=pass?0:1;
}catch(error){console.error(error.message);process.exitCode=2;}
