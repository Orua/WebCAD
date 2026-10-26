import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchema,assertJsonValue} from '../src/contracts/operation-schema.js';
import {humanError,withErrorRecovery} from '../src/error-recovery.js';

const capture=fn=>{try{fn();assert.fail('expected invalid input');}catch(error){return error;}};
test('the actual ring limit identifies region, contour, maximum and actual count in UI and API',()=>{
 const error=capture(()=>validateSchema({type:'array',maxItems:2000},Array(2001).fill([1,2]),'params.regions.2.outer'));
 assert.equal(error.code,'PARAM_RANGE_INVALID');assert.equal(error.details.validation.actualCount,2001);
 const message=humanError(error);assert.match(message,/第 3 个图案区域的外轮廓/);assert.match(message,/最多允许 2000 项，当前为 2001 项/);
 const receipt=withErrorRecovery({status:'failed',commitState:'not_committed',error});
 assert.ok(receipt.error.userMessage.includes(message));assert.match(receipt.error.userMessage,/未提交/);
});
test('undefined source metadata is identified as program data rather than blaming user settings',()=>{
 const error=capture(()=>assertJsonValue({source:{servicesEvidence:{inspectionJobId:undefined}}}));
 const message=humanError(error);assert.match(message,/params.source.servicesEvidence.inspectionJobId/);assert.match(message,/程序提交数据的问题/);
 assert.doesNotMatch(message,/不符合当前工具契约/);
});
test('coordinates, numeric range, type and unexpected fields have concrete explanations',()=>{
 for(const [schema,value,path,expected]of [
  [{type:'number'},NaN,'params.point.0',/放置点坐标 X.*有限数值/],
  [{type:'number',exclusiveMinimum:0},0,'params.depth',/雕刻深度.*必须大于 0/],
  [{type:'array'},{width:35,height:20},'params.sizeMm',/图案尺寸.*必须是数组/],
  [{type:'object',additionalProperties:false},{type:'webcad-logo'},'params',/params.type.*不接受这个字段/],
 ])assert.match(humanError(capture(()=>validateSchema(schema,value,path))),expected);
});
test('unknown diagnostic text, credentials and malicious field paths are never rendered',()=>{
 for(const path of ['params.source.token','params.source.password','F:/private/file','params.\nsecret','params.<img>']){
  const message=humanError({code:'PARAM_SCHEMA_INVALID',path,message:'Unknown field.'});
  assert.ok(!message.includes(path));
 }
 const message=humanError({code:'PARAM_SCHEMA_INVALID',path:'params.depth',message:'Minimum is 1. token=secret'});
 assert.doesNotMatch(message,/secret|token=/);
});
