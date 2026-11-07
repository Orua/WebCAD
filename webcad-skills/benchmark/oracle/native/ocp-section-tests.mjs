// Coordinator-only actual S03 reference/negative STEP write/readback.
import {parseArgs} from 'node:util';
import {createOcpStepReader} from './python-reader.mjs';
const {values}=parseArgs({options:{python:{type:'string'},output:{type:'string'}}});
try{
 const reader=await createOcpStepReader({python:values.python,directory:values.output}),runs=[];
 for(const variant of ['reference','wrong-normal','wrong-center','ends-only']){
  const result=await reader.createReference({caseId:'S03',variant});
  runs.push({caseId:'S03',variant,status:variant==='reference'?result.geometryStatus:result.judgment.status==='FAIL'?'EXPECTED_REJECTION':'FAIL',referenceSha256:result.referenceSha256,measuredVolume:result.geometry.volume,failedAssertions:result.judgment.checks.filter(c=>c.status==='FAIL').map(c=>c.id),continuousMaximumErrorCertified:false});
 }
 const passed=runs.every(row=>row.status==='PASS'||row.status==='EXPECTED_REJECTION');
 console.log(JSON.stringify({recordType:'REAL_OCP_S03_REFERENCE_TEST_NOT_PRODUCT_BASELINE',status:passed?'PASS':'FAIL',runs},null,2));process.exitCode=passed?0:1;
}catch(error){console.error(error.code??error.message);process.exitCode=2;}
