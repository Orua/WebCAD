import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {ensureCanvasResources} from '../host/Goldenluck.WebCADHost/site/AI/WebCAD/attachment-bytes.js';
const path=process.env.WEBCAD_HOST_TRANSPORT||'F:/Project/Goldenluck/Web/AI/WebCAD/workspace-transport.js';
const {attachmentIdentity,registerHostAttachments,createHostRecoveryJournal,settleIndependent}=await import(pathToFileURL(path).href);
test('attachment resume compares content and length as well as the original filename',()=>{
 const attachment={name:'part.step',size:5,sha256:'original'};
 assert.equal(attachmentIdentity(attachment),attachmentIdentity({originalName:'part.step',size:5,sha256:'original'}));
 assert.notEqual(attachmentIdentity(attachment),attachmentIdentity({...attachment,sha256:'replacement'}));
 assert.notEqual(attachmentIdentity(attachment),attachmentIdentity({...attachment,size:6}));
});
test('registered attachment carries the resource digest without losing its original file',async()=>{
 const file=new File(['source'],'part.step');
 const [attachment]=await registerHostAttachments([file],{register:async()=>({resourceId:'resource',sha256:'digest'})});
 assert.equal(attachment.sha256,'digest');assert.equal(attachment.file,file);
});
test('recovery journal preserves identities while excluding credentials and source bytes',()=>{
 const values=new Map(),journal=createHostRecoveryJournal({getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},'journal');
 journal.write({cadSessionId:'session',taskId:'task',lastSeq:42,token:'private',pendingSend:{key:'same-send',draftTaskId:'draft',wireMessage:'private prompt',file:new Uint8Array(50)}});
 assert.equal(journal.read().taskId,'task');assert.equal(journal.read().pendingSend.key,'same-send');
 assert(!values.get('journal').includes('private'));journal.write(null);assert.equal(journal.read(),null);
});
test('receipt failures do not skip later receipts and concurrent uploads stay bounded',async()=>{
 let active=0,peak=0,attempted=0;
 const results=await settleIndependent(Array.from({length:12},(_,index)=>async()=>{peak=Math.max(peak,++active);attempted++;await new Promise(resolve=>setTimeout(resolve,2));active--;if(index===0)throw new Error('unavailable');return index;}),3);
 assert.equal(attempted,12);assert.equal(peak,3);assert.equal(results[0].status,'rejected');assert.equal(results[11].value,11);
});

test('a STEP selected before page readiness is registered before model dispatch, once per document',async()=>{
 let context={sessionId:'s',documentId:'d',documentInstanceId:'i'},calls=0;
 const file=new File(['step'],'part.step'),item={name:file.name,file,size:4,sha256:'hash'};
 const options={snapshot:async()=>({ready:true,context:{...context}}),register:async()=>({resourceId:`resource-${++calls}`,size:4,sha256:'hash'})};
 await ensureCanvasResources([item],options);assert.equal(item.resourceId,'resource-1');assert.equal(calls,1);
 await ensureCanvasResources([item],options);assert.equal(calls,1);
 context={...context,documentInstanceId:'new'};await ensureCanvasResources([item],options);assert.equal(calls,2);
 const source=await readFile(new URL('../host/Goldenluck.WebCADHost/site/AI/WebCAD/webcad-workspace.js',import.meta.url),'utf8');const send=source.slice(source.indexOf('async function sendChat('));assert(send.indexOf('await ensureCanvasResources(')<send.indexOf("rpc('send'"));
});
test('attachment registration failure or changed document keeps original input and cannot create a stale reference',async()=>{
 const item={name:'part.stp',file:new File(['source'],'part.stp'),size:6,sha256:'hash'};let calls=0,released=0;
 await assert.rejects(ensureCanvasResources([item],{snapshot:async()=>({ready:false}),register:async()=>calls++}),e=>e.code==='ATTACHMENT_CANVAS_NOT_READY');assert.equal(calls,0);assert.equal(item.resourceId,undefined);
 let read=0;await assert.rejects(ensureCanvasResources([item],{snapshot:async()=>({ready:true,context:{sessionId:'s',documentId:'d',documentInstanceId:++read===1?'old':'new'}}),register:async()=>({resourceId:'new-resource',size:6,sha256:'hash'}),release:async()=>released++}),e=>e.code==='ATTACHMENT_BINDING_CHANGED');assert.equal(released,1);assert.equal(item.resourceId,undefined);
});
