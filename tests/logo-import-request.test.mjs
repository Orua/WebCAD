import test from 'node:test';
import assert from 'node:assert/strict';
import {validateImportRequest} from '../scripts/logo-import.mjs';
const valid={action:'inspect',name:'test.svg',data:Buffer.from('<svg/>').toString('base64')};
test('upload accepts supported formats and retains only safe request fields',()=>{
 const parsed=validateImportRequest({...valid,name:'../../test.svg',filePath:'C:/private.txt'});
 assert.equal(parsed.name,'test.svg');assert.equal(parsed.filePath,undefined);assert.equal(parsed.bytes.toString(),'<svg/>');
 assert.equal(validateImportRequest({...valid,name:'C:\\temp\\logo.ai'}).name,'logo.ai');
});
test('rejects unsupported files, corrupt base64 and invalid page indices',()=>{
 for(const change of [{name:'x.exe'},{data:'abc!'},{data:'QQ==='},{page:0},{page:1.5},{action:'exec'}])assert.throws(()=>validateImportRequest({...valid,...change}));
});
test('extraction requires a finite nonempty selection and explicit physical scale',()=>{
 const extraction={...valid,action:'extract',bounds:[0,0,10,5],mmPerUnit:.25};
 assert.deepEqual(validateImportRequest(extraction).bounds,[0,0,10,5]);
 for(const change of [{bounds:undefined},{bounds:[1,1,0,5]},{bounds:[0,0,Infinity,2]},{mmPerUnit:0},{mmPerUnit:NaN},{mmPerUnit:undefined}])assert.throws(()=>validateImportRequest({...extraction,...change}));
});
