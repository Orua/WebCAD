// Development-only fixture injection. Original CAD data never enters public/ or dist/.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const manifest=process.env.WEBCAD_REFERENCE_FIXTURES,cli=process.env.WEBCAD_PLAYWRIGHT_CLI;
if(!manifest||!cli)throw new Error('BLOCKED: WEBCAD_REFERENCE_FIXTURES and WEBCAD_PLAYWRIGHT_CLI are required');
const fixtures=JSON.parse(fs.readFileSync(manifest,'utf8')).map(({name,file})=>{
  if(!/^[a-z0-9_-]+$/i.test(name)||fs.statSync(file).size>20*1024*1024)throw new Error('Invalid fixture');
  return {name,base64:fs.readFileSync(file).toString('base64')};
});
if(fixtures.length!==2)throw new Error('Expected the two explicitly selected local recovery fixtures');
const temp=path.resolve('agent/temp/reference-browser');fs.mkdirSync(temp,{recursive:true});
const script=path.join(temp,'generated.js');
fs.writeFileSync(script,fs.readFileSync('tests/reference-profiles-browser.js','utf8').replace('/*FIXTURE_DATA*/[]',JSON.stringify(fixtures)));
const result=spawnSync(process.execPath,[cli,'-s=webcad-page-api','run-code','--filename',script],{encoding:'utf8',maxBuffer:40*1024*1024,windowsHide:true});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
if(result.error||result.status!==0||!result.stdout?.includes('### Result')||result.stdout?.includes('### Error'))process.exit(1);
