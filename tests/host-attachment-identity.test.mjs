import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const path=process.env.WEBCAD_HOST_TRANSPORT||'F:/Project/Goldenluck/Web/AI/WebCAD/workspace-transport.js';
const source=await readFile(path,'utf8');
const {attachmentIdentity,registerHostAttachments,createHostRecoveryJournal,settleIndependent}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
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
