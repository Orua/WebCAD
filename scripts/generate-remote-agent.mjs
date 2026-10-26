import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {writeGeneratedFile} from './generated-file-write.mjs';
import {AGENT_CONTRACT} from '../src/agent/protocol.js';
export async function generateRemoteAgent({root,target,metadata}){
  const directory=resolve(target,'remote-agent');await mkdir(directory,{recursive:true});
  const bundled=await build({entryPoints:[resolve(root,'src/agent/host-adapter.js')],bundle:true,format:'esm',platform:'browser',write:false,minify:false});
  const logoPreparer=await build({entryPoints:[resolve(root,'src/agent/logo-preparer.mjs')],bundle:true,format:'esm',platform:'node',write:false,minify:false});
  const payloads={
    'host-adapter.mjs':new TextEncoder().encode(bundled.outputFiles[0].text),
    'runtime-contract.json':new TextEncoder().encode(JSON.stringify(AGENT_CONTRACT,null,2)+'\n'),
    'layout-planner.py':await readFile(resolve(root,'src/agent/layout-planner.py')),
    'logo-preparer.mjs':new TextEncoder().encode(logoPreparer.outputFiles[0].text)};
  const files=[];
  for(const [name,bytes]of Object.entries(payloads)){
    const published=name.endsWith('.mjs')?name.slice(0,-4)+'.js':name.endsWith('.py')?name+'.txt':name;
    await writeGeneratedFile(resolve(directory,published),bytes);
    files.push({name,url:'remote-agent/'+published,sizeBytes:bytes.length,sha256:'sha256:'+createHash('sha256').update(bytes).digest('hex')});
  }
  await writeGeneratedFile(resolve(target,'remote-agent.json'),JSON.stringify({schemaVersion:1,adapterVersion:2,
    buildId:metadata.buildId,catalogHash:metadata.catalogHash,docsHash:metadata.docsHash,contractHash:AGENT_CONTRACT.contractHash,
    protocol:AGENT_CONTRACT.protocol,files},null,2)+'\n');
}
