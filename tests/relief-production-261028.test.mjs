import test from 'node:test';
import assert from 'node:assert/strict';
import {servicesRequestTimeoutMs} from '../src/services/client.js';
import {formatServicesTransportFailure,servicesBodyClass} from '../src/services/transport-error.js';
import {errorRecovery,humanError} from '../src/error-recovery.js';
import {encodeHeightGrid,downsampleEncodedGrid} from '../src/relief-source/convert.js';
import {packQualitySource} from '../src/services/relief-pipeline.js';

const PRODUCTION_BODY=3057103;

test('large relief fit submit follows serverWaitMs instead of a 30s abort',()=>{
 assert.equal(servicesBodyClass(PRODUCTION_BODY),'large');
 const timeout=servicesRequestTimeoutMs('submit',{bytes:PRODUCTION_BODY,serverWaitMs:180000});
 assert.ok(timeout>=180000,String(timeout));
 assert.ok(timeout>30000);
 assert.equal(servicesRequestTimeoutMs('submit',{bytes:1024,serverWaitMs:180000}),60000);
 assert.equal(servicesRequestTimeoutMs('poll',{serverWaitMs:180000}),60000);
 assert.equal(servicesRequestTimeoutMs('capabilities',{serverWaitMs:180000}),60000);
 const huge=servicesRequestTimeoutMs('submit',{bytes:8*1024*1024,serverWaitMs:180000});
 assert.ok(huge>180000&&huge<=900000);
});

test('timeout toast keeps SERVICES_CONNECTION_UNKNOWN and the query instruction',()=>{
 const error={code:'SERVICES_CONNECTION_UNKNOWN',operation:'relief.design-fit-brep-1',idempotencyKey:'956d0b86-8f97-4e90-95a6-5724f992aa2e',elapsedMs:30001,timeoutMs:30000,bodyBytes:PRODUCTION_BODY,bodyClass:'large',phase:'submit',message:'后台计算连接中断或请求超时；请查询原任务后再操作（用 getServicesRequest 查询请求键 956d0b86-8f97-4e90-95a6-5724f992aa2e，勿重算）'};
 const text=formatServicesTransportFailure(error);
 for(const part of ['SERVICES_CONNECTION_UNKNOWN','relief.design-fit-brep-1','956d0b86-8f97-4e90-95a6-5724f992aa2e','30001','30000','大（≥1 MiB）','getServicesRequest','勿盲目重算','尚未确认'])assert.match(text,new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.equal(humanError(error),text);
 const recovery=errorRecovery(error,{commitState:'unknown'});
 assert.equal(recovery.classification,'reconcile');
 assert.equal(recovery.code,'SERVICES_CONNECTION_UNKNOWN');
 assert.equal(recovery.userMessage,text);
 assert.equal(recovery.automaticRetry,false);
 assert.match(recovery.userMessage,/getServicesRequest/);
 assert.doesNotMatch(recovery.userMessage,/^原任务的执行或提交结果尚未确认。$/);
});

test('quality source packed to the control budget shrinks a 1025 grid',()=>{
 const side=1025,values=new Float32Array(side*side);
 for(let i=0;i<values.length;i++)values[i]=(i%17)/16;
 const grid=encodeHeightGrid({columns:side,rows:side,values});
 assert.ok(grid.data.length>2_000_000);
 const packed=downsampleEncodedGrid(grid,513);
 assert.equal(packed.packed,true);
 assert.equal(Math.max(packed.grid.columns,packed.grid.rows),513);
 assert.ok(packed.grid.data.length<800_000);
 const shipped=packQualitySource({version:1,machiningPrecisionMm:.05,maxControlSide:513,source:grid,depthMm:1});
 assert.equal(shipped.packed,true);
 assert.deepEqual(shipped.from,[1025,1025]);
 assert.equal(Math.max(shipped.quality.source.columns,shipped.quality.source.rows),513);
 const same=packQualitySource({...shipped.quality,maxControlSide:513});
 assert.equal(same.packed,false);
});
