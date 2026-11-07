// Coordinator-only native STEP qualification. Never a product/model baseline.
import {parseArgs} from 'node:util';
import {createOcpStepReader} from './python-reader.mjs';
const {values}=parseArgs({options:{python:{type:'string'},output:{type:'string'}}});
try{
 const reader=await createOcpStepReader({python:values.python,directory:values.output}),runs=[];
 for(const variant of ['reference','wrong-wall','wrong-path','plugged-end','rotated-sector']){
  const result=await reader.createReference({caseId:'M03',variant});
  const failed=result.judgment.checks.filter(row=>row.status==='FAIL').map(row=>row.id);
  const requiredFailure={'wrong-wall':'wall','wrong-path':'diameters','plugged-end':'through','rotated-sector':'endNormals'}[variant];
  runs.push({caseId:'M03',variant,status:variant==='reference'?result.geometryStatus:result.judgment.status==='FAIL'&&failed.includes(requiredFailure)?'EXPECTED_REJECTION':'FAIL',
   referenceSha256:result.referenceSha256,measuredVolume:result.geometry.volume,failedAssertions:failed,requiredFailure,continuousMaximumErrorCertified:false});
 }
 const passed=runs.every(row=>row.status==='PASS'||row.status==='EXPECTED_REJECTION');
 console.log(JSON.stringify({recordType:'REAL_OCP_M03_REFERENCE_TEST_NOT_PRODUCT_BASELINE',status:passed?'PASS':'FAIL',runs},null,2));process.exitCode=passed?0:1;
}catch(error){console.error(error.code??error.message);process.exitCode=2;}
