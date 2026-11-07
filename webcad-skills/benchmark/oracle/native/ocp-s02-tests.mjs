// Coordinator-only S02 reference and targeted frame/shape negatives.
import {parseArgs} from 'node:util';
import {createOcpStepReader} from './python-reader.mjs';
const {values}=parseArgs({options:{python:{type:'string'},output:{type:'string'}}});
try{
 const reader=await createOcpStepReader({python:values.python,directory:values.output}),runs=[];
 for(const variant of ['reference','wrong-middle','twisted-middle','wrong-end','wrong-center']){
  const result=await reader.createReference({caseId:'S02',variant});
  const failed=result.judgment.checks.filter(row=>row.status==='FAIL').map(row=>row.id);
  const targetedFailure=failed.some(id=>id.startsWith('section:')||id==='endCircle');
  runs.push({caseId:'S02',variant,status:variant==='reference'?result.geometryStatus:result.judgment.status==='FAIL'&&targetedFailure?'EXPECTED_REJECTION':'FAIL',referenceSha256:result.referenceSha256,measuredVolume:result.geometry.volume,failedAssertions:failed,continuousMaximumErrorCertified:false});
 }
 const passed=runs.every(row=>row.status==='PASS'||row.status==='EXPECTED_REJECTION');
 console.log(JSON.stringify({recordType:'REAL_OCP_S02_REFERENCE_TEST_NOT_PRODUCT_BASELINE',status:passed?'PASS':'FAIL',runs},null,2));process.exitCode=passed?0:1;
}catch(error){console.error(error.code??error.message);process.exitCode=2;}
