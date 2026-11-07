// Coordinator-only real native STEP qualification, including the process ambiguity.
import {parseArgs} from 'node:util';
import {createOcpStepReader} from './python-reader.mjs';
const {values}=parseArgs({options:{python:{type:'string'},output:{type:'string'}}});
try{
 const reader=await createOcpStepReader({python:values.python,directory:values.output}),runs=[];
 for(const variant of ['reference','missing-hole','wrong-hole','wrong-axis','extra-hole','first-hole','through-first','ambiguous-final']){
  const result=await reader.createReference({caseId:'M05',variant});
  const failed=result.judgment.checks.filter(row=>row.status==='FAIL').map(row=>row.id);
  const finalGeometryQualified=result.judgment.checks.filter(row=>row.id!=='cutScope').every(row=>row.status==='PASS');
  const scope=result.geometry.checks.cutScope?.pass;
  const common=result.judgment.checks.filter(row=>['independentReader','brepValid','targetType','solidCount','units'].includes(row.id)).every(row=>row.status==='PASS');
  const requiredFailure={'missing-hole':'holeCount','wrong-hole':'radialAxes','wrong-axis':'radialAxes','extra-hole':'holeCount'}[variant];
  let status;
  if(variant==='reference')status=finalGeometryQualified&&scope===null&&result.geometryStatus==='PASS'?'GEOMETRY_QUALIFIED_PROCESS_PENDING':'FAIL';
  else if(variant==='first-hole')status=common&&scope===true?'FIRST_HOLE_CHECK_QUALIFIED':'FAIL';
  else if(variant==='through-first')status=common&&scope===false?'EXPECTED_INTERMEDIATE_REJECTION':'FAIL';
  else if(variant==='ambiguous-final')status=finalGeometryQualified&&scope===null&&result.judgment.status==='UNVERIFIED'?'FINAL_AMBIGUITY_CORRECTLY_UNVERIFIED':'FAIL';
  else status=result.judgment.status==='FAIL'&&failed.includes(requiredFailure)?'EXPECTED_REJECTION':'FAIL';
  runs.push({caseId:'M05',variant,status,referenceSha256:result.referenceSha256,measuredVolume:result.geometry.volume,
   failedAssertions:failed,requiredFailure,cutScope:scope,finalGeometryQualified});
 }
 const passed=runs.every(row=>row.status!=='FAIL');
 console.log(JSON.stringify({recordType:'REAL_OCP_M05_REFERENCE_TEST_NOT_PRODUCT_BASELINE',status:passed?'PASS':'FAIL',
  remainingProductWorkflowAssertion:'cutScope requires actual first-hole STEP, material probe and exact six-tool operation receipts',runs},null,2));process.exitCode=passed?0:1;
}catch(error){console.error(error.code??error.message);process.exitCode=2;}
