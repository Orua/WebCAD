import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledSemanticVersion,assertCompilableFeature,TRANSLATION_SEMANTIC_VERSION,BOOLEAN_CUT_SEMANTIC_VERSION} from '../src/services/geometry-exchange.js';
import {searchTools} from '../src/page-api-docs.js';
import {MODELING_DOCS,MODELING_ROUTES} from '../src/modeling-guidance.js';
import {MODELING_WORKFLOW} from '../src/automation-guidance.js';
import {LIMITS} from '../src/limits.js';

test('unsupported Services operations never inherit translation semantics',()=>{
 for(const op of ['union','intersect','newUnknownOperation']){
  assert.equal(compiledSemanticVersion({op,params:{}}),null);
  assert.throws(()=>assertCompilableFeature({op,params:{}}),error=>error.code==='OPERATION_UNAVAILABLE'&&error.operation===op&&error.executor==='services'&&error.missingCapability==='compiled-semantic'&&!error.message.includes('纯平移'));
 }
 assert.equal(compiledSemanticVersion({op:'transform'}),TRANSLATION_SEMANTIC_VERSION);
 assert.equal(compiledSemanticVersion({op:'cut'}),BOOLEAN_CUT_SEMANTIC_VERSION);
 assert.doesNotThrow(()=>assertCompilableFeature({op:'transform',refs:['source'],params:{x:2}}));
});

test('ready page discovery does not promise input-specific execution',()=>{
 const item=searchTools({query:'union',limit:10},{browserReady:true}).items.find(row=>row.id==='union');
 assert(item);
 assert.equal(item.runtimeAvailability,'page_ready');
 assert.equal(item.availabilityScope,'page');
 assert.equal(item.executionAvailability,'unknown');
 assert.deepEqual(item.executionCheck.methods,['getServicesCapabilities','getServicesRouting']);
});

test('staged modeling is routed from one published chapter and batch text uses the shared limit',()=>{
 const chapter=MODELING_DOCS['api.modeling.methods.staged-assembly'];
 assert(chapter.includes('规划确认前不创建'));
 assert(chapter.includes('用户已明确授权按规划连续推进'));
 assert(chapter.includes('unknown/queued/running'));
 assert(MODELING_ROUTES.find(row=>row.id==='modeling.staged-assembly').readFirst==='api.modeling.methods.staged-assembly');
 assert(MODELING_DOCS['api.modeling.guide'].includes('api.modeling.methods.staged-assembly'));
 assert(MODELING_WORKFLOW.includes(`1–${LIMITS.batch.maxSteps}步`));
});
