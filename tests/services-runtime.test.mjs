import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createServicesClient} from '../src/services/client.js';
import {readBrowserLogo} from '../src/browser-logo-input.js';
import {validateServiceSchema} from '../scripts/validate-service-schema.mjs';

test('real net48 Host persists Logo jobs and verifies camelCase JSON, review, idempotency and ownership',async()=>{
 const root=process.env.WEBCAD_SERVICES_TEST_ROOT,host=process.env.WEBCAD_SERVICES_TEST_HOST,worker=process.env.WEBCAD_SERVICES_TEST_LOGO_WORKER;
 assert.ok(root&&host&&worker,'Use scripts/test-services.ps1 to supply actual binaries and an explicit test data root');
 await fs.mkdir(root,{recursive:true});const data=await fs.mkdtemp(path.join(root,'runtime-'));
 const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const credential=randomBytes(32).toString('hex'),config={enabled:true,url:`http://127.0.0.1:${port}/api.ashx`,computeMode:'local'};
 let child,errors='';const start=()=>{child=spawn(host,['--console'],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,WEBCAD_SERVICES_TOKEN:credential,WEBCAD_SERVICES_DATA_ROOT:data,WEBCAD_SERVICES_LOGO_WORKER:worker,WEBCAD_SERVICES_DEV_HTTP:`http://127.0.0.1:${port}/`}});child.stderr.on('data',b=>{errors=(errors+b).slice(-4096);});};
 const client=createServicesClient({config,credential});
 async function ready(){const begin=Date.now();for(;;){try{return await client.capabilities();}catch(error){if(child.exitCode!==null)throw new Error(`Host exited ${child.exitCode}: ${errors}`);if(Date.now()-begin>15000)throw error;await new Promise(r=>setTimeout(r,100));}}}
 async function stop(){if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}}
 try{
  start();const caps=await ready();assert.equal(caps.operations.length,0);assert.equal(caps.geometryExchange.supportedFormats.length,0);
  // An interrupted authenticated upload must not leave an accepted job or
  // terminate the Host. This exercises the real HttpListener read path.
  await new Promise((resolve,reject)=>{const socket=net.connect(port,'127.0.0.1');socket.on('error',reject);socket.on('connect',()=>{socket.write(`POST /api.ashx?route=/v1/assets HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${credential}\r\nX-File-Name: interrupted.logo.json\r\nContent-Length: 10000\r\n\r\nshort`);socket.end();});socket.on('close',resolve);socket.on('data',()=>{});});
  assert.equal((await ready()).protocolVersion,'1.0');assert.deepEqual(await fs.readdir(path.join(data,'assets')),[],'Partial upload must not publish an asset');
  const bytes=await fs.readFile(new URL('../services/WebCADServices/modules/LogoVector/tests/sample-ring.logo.json',import.meta.url));
  const file=new File([bytes],'sample-ring.logo.json'),asset=await client.upload(file);
  const payload={assetId:asset.assetId,options:{sizeConfirmed:true,sizeMode:'sourceUnits',mode:'vector',pdfJoinToleranceMm:0}},key='ring-real-protocol';
  const job=await client.submit('logo/convert',payload,key),completed=await client.wait(job);assert.equal(completed.result.logoDocument.type,'webcad-logo');assert.equal(completed.result.logoDocument.units,'mm');assert.equal(completed.result.logoDocument.regions[0].holes.length,1);assert.equal(completed.result.logoDocument.source.coordinateSystem,'x-right-y-up');assert.equal(completed.manifest.commit,'notCommitted');assert.ok(completed.result.conversionReport);assert.equal('Logo' in completed.result,false);
  await validateServiceSchema(job,'contracts/services/v1/job.schema.json');await validateServiceSchema(completed.result,'contracts/services/v1/logo-result.schema.json');
  assert.equal((await client.submit('logo/convert',payload,key)).jobId,job.jobId);
  assert.equal((await client.getRequest(key)).jobId,job.jobId);
  await assert.rejects(client.submit('logo/convert',{...payload,options:{...payload.options,targetWidthMm:7}},key),{code:'IDEMPOTENCY_KEY_REUSED'});
  await assert.rejects(client.submit('compute/jobs',{},'native-not-accepted'),{code:'OPERATION_UNAVAILABLE'});
  await assert.rejects(createServicesClient({config,credential:'invalid'}).getJob(job.jobId),{code:'UNAUTHORIZED'});
  await assert.rejects(client.submit('logo/convert',{assetId:'not-owned',options:payload.options},'not-owned'),{code:'ASSET_NOT_FOUND'});
  await assert.rejects(client.submit('logo/convert',{...payload,serverPath:'C:/secret'},'path'),{code:'PARAM_SCHEMA_INVALID'});
  await assert.rejects(client.submit('logo/convert',{assetId:asset.assetId,options:{sizeConfirmed:false}},'unconfirmed'),{code:'SIZE_REQUIRED'});
  // Same persisted job/result remains usable after Host restart; no worker resubmission.
  await stop();start();await ready();assert.equal((await client.getJob(job.jobId)).execution,'succeeded');assert.deepEqual((await client.wait(job)).result.logoDocument,completed.result.logoDocument);
  const evidence={jobId:job.jobId,sourceSha256:asset.sha256,artifactSha256:completed.manifest.artifactSha256,checks:['real worker','one-hole contour','camelCase','units','review metadata','idempotency conflict','authorization','unsupported native','restart readback']};await fs.writeFile(path.join(data,'acceptance.json'),JSON.stringify(evidence,null,2));
  if(process.env.WEBCAD_REAL_LOGO_PDF){const pdfPath=process.env.WEBCAD_REAL_LOGO_PDF,pdf=new File([await fs.readFile(pdfPath)],path.basename(pdfPath));const logo=await readBrowserLogo(pdf,x=>x,{client,sizeConfirmed:true,allowUpload:true,page:Number(process.env.WEBCAD_REAL_LOGO_PAGE||1)});assert.equal(logo.source.reviewed,false);assert.ok(logo.source.conversionReport);await fs.writeFile(path.join(data,'real-pdf-result.json'),JSON.stringify(logo));}
 }finally{await stop();}
});
