import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageAPI} from '../src/page-api.js';
import {getTool,readDocs,searchTools} from '../src/page-api-docs.js';
import {validateDesignRequirements} from '../src/design-inspection.js';
const evidence={kind:'drawing',reference:'drawing rev B, front view 40 mm'};
const requirements=[{id:'width',bodyId:'part',kind:'bounds',sizeMm:[40,20,2],toleranceMm:0.01,evidence}];
function fixture(){
  let revision=1,calls=0;const identity={sessionId:'page',documentId:'doc',documentInstanceId:'instance'};
  const host={state:()=>({context:{...identity,revision},summary:{kernelReady:true,busy:false},preview:{active:false,computing:false},bodies:[{id:'part',solidCount:1}]}),
    display:()=>({status:'rendered',rendered:{...identity,revision}}),files:()=>{},confirmSaved:()=>{},
    inspectDesign:async()=>{calls++;return {verdict:'pass',results:[],scope:'specified-checks-only'};}};
  const api=createPageAPI(host);return {api,host,context:{...identity,expectedRevision:1},get calls(){return calls;},advance(){revision++;}};
}
test('requirements are bounded, source-labelled, and reject misspelled geometry fields',()=>{
  assert.equal(validateDesignRequirements(requirements),requirements);
  for(const input of [[],Array(65).fill(requirements[0]),[{...requirements[0],evidence:undefined}],[{...requirements[0],sizeMm:[40,NaN,2]}],[{...requirements[0],toleranceMm:10}],[{...requirements[0],width:41}],requirements.concat(requirements),[{id:'p',bodyId:'part',kind:'material',points:Array(129).fill([0,0,0]),expected:'inside',evidence}]])assert.throws(()=>validateDesignRequirements(input));
});
test('direct, invoke, batch and job share the read-only inspector',async()=>{
  const f=fixture(),args={context:f.context,requirements};
  assert.equal((await f.api.inspectDesign(args)).status,'read');
  assert.equal((await f.api.invoke({method:'inspectDesign',args})).status,'read');
  assert.equal((await f.api.run({context:f.context,idempotencyKey:'inspect',steps:[{id:'check',method:'inspectDesign',args:{requirements}}]})).status,'completed');
  const job=f.api.submit({jobId:'inspect-job',method:'inspectDesign',args});assert.equal(job.status,'queued');
  while(f.api.getJob({jobId:'inspect-job'}).status==='queued'||f.api.getJob({jobId:'inspect-job'}).status==='running')await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.getJob({jobId:'inspect-job'}).result.status,'read');assert.equal(f.calls,4);assert.equal(f.api.getState().context.revision,1);
});
test('stale references, revisions and changed revisions during reads cannot pass',async()=>{
  const f=fixture();
  assert.equal((await f.api.inspectDesign({context:f.context,requirements:[{...requirements[0],bodyId:'old'}]})).error.code,'STALE_REFERENCE');
  assert.equal(f.calls,0);
  assert.equal((await f.api.inspectDesign({context:{...f.context,expectedRevision:0},requirements})).error.code,'REVISION_CONFLICT');
  f.host.inspectDesign=async()=>{f.advance();return {verdict:'pass'};};
  assert.equal((await f.api.inspectDesign({context:f.context,requirements})).error.code,'REVISION_CONFLICT');
});
test('requirePass stops a batch before export and preserves the diagnostic report',async()=>{
  for(const verdict of ['fail','unverified']){
    const f=fixture();let exported=false;
    f.host.inspectDesign=async()=>({verdict,results:[{id:'width',verdict}],summary:{[verdict]:1}});
    f.host.files=()=>{exported=true;throw new Error('Must not export');};
    const report=await f.api.run({context:f.context,idempotencyKey:'gate-'+verdict,steps:[
      {id:'check',method:'inspectDesign',args:{requirements,requirePass:true}},
      {id:'export',method:'files.export',args:{format:'step'}},
    ]});
    assert.equal(report.status,'failed');assert.equal(exported,false);assert.equal(report.results[0].result.verdict,verdict);
    assert.deepEqual(report.progress.unattemptedStepIds,['export']);
  }
});
test('design checks are discoverable with complete source and limitation contracts',()=>{
  const card=getTool({id:'inspectDesign'});assert.equal(card.docs,'api.design-checks');
  assert.equal(card.inputSchema.properties.requirePass.default,false);assert.equal(card.crossItemLimits.maxMaterialPoints,128);
  assert(card.inputContract.includes('requirePass'));assert(card.errorCodes.includes('DESIGN_REQUIREMENTS_NOT_MET'));
  assert(searchTools({query:'材料 漏接 检查',limit:10}).items.some(item=>item.id==='inspectDesign'));
  const doc=readDocs({docId:'api.design-checks',limitChars:16000});assert(doc.text.includes('sourceEvidenceVerified'));assert(doc.text.includes('solidCount'));
});
