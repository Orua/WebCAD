// Coordinator-only isolated reference/negative computation. Does not enter the S03 queue.
import {parseArgs} from 'node:util';
import {createS06StepReader} from './s06-reader.mjs';
const {values}=parseArgs({options:{python:{type:'string'},output:{type:'string'}}});
try{
 const reader=await createS06StepReader({python:values.python,directory:values.output}),runs=[];
 for(const variant of ['reference','wrong-interior','wrong-boundary','extra-patch']){
  const result=await reader.createReference({variant}),sampling=result.geometry.samplingEvidence;
  runs.push({caseId:'S06',variant,status:variant==='reference'?result.geometryStatus:result.judgment.status==='FAIL'?'EXPECTED_REJECTION':'FAIL',referenceSha256:result.referenceSha256,solidCount:result.geometry.solidCount,
   forwardSamplesPass:sampling?sampling.forward.every(row=>row.available&&row.distanceMm<=.05):null,
   reverseSampleFailures:sampling?sampling.reverse.filter(row=>row.verdict===false).length:null,
   boundariesPass:result.geometry.checks?.boundaries?.pass??null,
   failedAssertions:result.judgment.checks.filter(row=>row.status==='FAIL').map(row=>row.id),continuousMaximumErrorCertified:false});
 }
 const pass=runs.every(row=>row.status==='PASS'||row.status==='EXPECTED_REJECTION');
 console.log(JSON.stringify({recordType:'ISOLATED_REAL_OCP_S06_REFERENCE_TEST_NOT_PRODUCT_BASELINE',status:pass?'PASS':'FAIL',runs},null,2));process.exitCode=pass?0:1;
}catch(error){console.error(error.code??error.message);process.exitCode=2;}
