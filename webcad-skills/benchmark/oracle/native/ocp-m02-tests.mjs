// Coordinator-only actual STEP qualification. Never a browser/model baseline.
import {parseArgs} from 'node:util';
import {createOcpStepReader} from './python-reader.mjs';
const {values}=parseArgs({options:{python:{type:'string'},output:{type:'string'}}});
try{
 const reader=await createOcpStepReader({python:values.python,directory:values.output}),runs=[];
 for(const variant of ['reference','wrong-wire','wrong-corner','wrong-envelope','open-gap','shifted-center','crossbar']){
  const result=await reader.createReference({caseId:'M02',variant});
  const failed=result.judgment.checks.filter(row=>row.status==='FAIL').map(row=>row.id);
  const requiredFailure={'wrong-wire':'wireDiameter','wrong-corner':'centerline','wrong-envelope':'centerline','open-gap':'closedPath','shifted-center':'centerline','crossbar':'selfIntersection'}[variant];
  runs.push({caseId:'M02',variant,status:variant==='reference'?result.geometryStatus:result.judgment.status==='FAIL'&&failed.includes(requiredFailure)?'EXPECTED_REJECTION':'FAIL',
   referenceSha256:result.referenceSha256,measuredVolume:result.geometry.volume,failedAssertions:failed,requiredFailure,
   selfIntersectionScope:'valid closed BRep plus all analytic supports, trimmed areas/bounds, volume and measured sections; not a general self-intersection solver'});
 }
 const passed=runs.every(row=>row.status==='PASS'||row.status==='EXPECTED_REJECTION');
 console.log(JSON.stringify({recordType:'REAL_OCP_M02_REFERENCE_TEST_NOT_PRODUCT_BASELINE',status:passed?'PASS':'FAIL',runs},null,2));process.exitCode=passed?0:1;
}catch(error){console.error(error.code??error.message);process.exitCode=2;}
