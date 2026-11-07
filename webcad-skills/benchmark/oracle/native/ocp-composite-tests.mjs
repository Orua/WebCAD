// Coordinator-run real reference/negative STEP write/readback, M01/M04 only.
// Never repeats B01-B03 or dispatches product/browser/model operations.
import {parseArgs} from 'node:util';
import {createOcpStepReader} from './python-reader.mjs';
const {values}=parseArgs({options:{python:{type:'string'},output:{type:'string'}}});
try{
 const reader=await createOcpStepReader({python:values.python,directory:values.output}),runs=[];
 for(const [caseId,variant]of [['M01','reference'],['M04','reference'],['M01','wrong-shoulder'],['M01','wrong-hole'],['M04','wrong-depth'],['M04','wrong-hole']]){
  const result=await reader.createReference({caseId,variant});
  runs.push({caseId,variant,status:variant==='reference'?result.geometryStatus:result.judgment.status==='FAIL'?'EXPECTED_REJECTION':'FAIL',referenceSha256:result.referenceSha256,failedAssertions:result.judgment.checks.filter(c=>c.status==='FAIL').map(c=>c.id)});
 }
 const passed=runs.every(row=>row.status==='PASS'||row.status==='EXPECTED_REJECTION');
 console.log(JSON.stringify({recordType:'REAL_OCP_COMPOSITE_REFERENCE_TEST_NOT_PRODUCT_BASELINE',status:passed?'PASS':'FAIL',runs},null,2));process.exitCode=passed?0:1;
}catch(error){console.error(error.code??error.message);process.exitCode=2;}
