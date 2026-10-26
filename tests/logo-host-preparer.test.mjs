import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

test('native preparer accepts omitted options encoded as null and applies exact contour width',async()=>{
 const folder=await mkdtemp('G:/CAD-Workspace/WebCAD/temp/logo-preparer-');
 try{
  const input=join(folder,'source.json'),output=join(folder,'logo.json'),preview=join(folder,'logo.svg');
  await writeFile(input,JSON.stringify({machining:null,logoDocument:{type:'webcad-logo',version:1,units:'mm',name:'outline',sizeMm:[10,6],regions:[{outer:[[0,0],[10,0],[10,6],[0,6]],holes:[]}],source:{kind:'raster'}}}));
  const receipt=JSON.parse(execFileSync(process.execPath,['src/agent/logo-preparer.mjs',input,output,preview,'35'],{encoding:'utf8'}));
  const bytes=await readFile(output),logo=JSON.parse(bytes);
  assert.equal(logo.sizeMm[0],35);assert.equal(logo.sizeMm[1],21);
  assert.equal(receipt.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(receipt.capacity.supported,true);assert.equal((await readFile(preview,'utf8')).includes('NaN'),false);
 }finally{await rm(folder,{recursive:true,force:true});}
});
