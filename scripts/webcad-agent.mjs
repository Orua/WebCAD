import path from 'node:path';
import fs from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { uploadAsset, downloadArtifact } from './file-transfer-client.mjs';

const raw=process.argv.slice(2),flags={},positionals=[];
for(let i=0;i<raw.length;i++){
  const value=raw[i];
  if(value==='--pretty'){flags.pretty=true;continue;}
  if(['--url','--session','--args','--name'].includes(value)){if(raw[i+1]===undefined)throw new Error(`${value} requires a value`);flags[value.slice(2)]=raw[++i];continue;}
  positionals.push(value);
}
const command=positionals[0]||'help';
const mcpUrl=flags.url||'http://127.0.0.1:667/mcp';
const baseUrl=new URL(mcpUrl);baseUrl.pathname='/';baseUrl.search='';baseUrl.hash='';
const print=value=>console.log(JSON.stringify(value,null,flags.pretty?2:0));
const usage=()=>({
  usage:'npm run agent:cli -- <command> [arguments] [--url URL] [--session ID] [--args JSON|@file] [--pretty]',
  commands:{bootstrap:'compact discovery',docs:'docs <docId>',search:'search <words>',tool:'tool <id>',sessions:'list live Agent tabs',state:'read one tab; auto-selects only when exactly one is ready',call:'call <webcad_tool> --args JSON|@file',upload:'upload <absolute-file>',import:'import <absolute-file>',open:'open <absolute-file>',save:'save <existing-directory> [--name file.webcad]',export:'export <step|stl|brep|png> <existing-directory> [--name file]'}
});
async function jsonArg(value){
  if(!value)return {};
  const text=value.startsWith('@')?await fs.readFile(path.resolve(value.slice(1)),'utf8'):value;
  const parsed=JSON.parse(text);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw new Error('Tool arguments must be a JSON object.');return parsed;
}
function resultValue(response){
  const text=response.content.find(x=>x.type==='text')?.text??'null';let value=response.structuredContent;
  if(value===undefined)try{value=JSON.parse(text);}catch{throw new Error(text);}
  if(response.isError||value?.status==='failed'||value?.status==='unknown')throw Object.assign(new Error(value?.error?.message||value?.error||'WebCAD tool failed'),{result:value});
  return value;
}
async function run(){
  if(command==='help'){print(usage());return;}
  const client=new Client({name:'webcad-agent-cli',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
  const call=async(name,args={})=>resultValue(await client.callTool({name:name.startsWith('webcad_')?name:`webcad_${name}`,arguments:args}));
  const session=async()=>{
    const inventory=await call('list_sessions'),ready=inventory.sessions.filter(item=>item.ready);
    const selected=flags.session?ready.find(item=>item.sessionId===flags.session):ready.length===1?ready[0]:null;
    if(!selected)throw new Error(flags.session?'Requested session is not ready.':'Pass --session because the number of ready sessions is not exactly one.');
    const state=await call('get_state_v2',{sessionId:selected.sessionId,include:['summary','features','bodies','selection','capabilities']});
    const {revision,...identity}=state.context;
    return {selected,state,context:{...identity,expectedRevision:revision}};
  };
  try{
    if(command==='bootstrap')print(await call('bootstrap'));
    else if(command==='sessions')print(await call('list_sessions'));
    else if(command==='state')print((await session()).state);
    else if(command==='search')print(await call('search_tools',{query:positionals.slice(1).join(' '),limit:50}));
    else if(command==='tool'){if(!positionals[1])throw new Error('tool requires an id');print(await call('get_tool',{id:positionals[1]}));}
    else if(command==='docs'){
      const docId=positionals[1]||'start';let cursor,first,text='',pages=0;
      do{const page=await call('read_docs',{docId,limitChars:16000,...(cursor?{cursor}:{})});first??=page;text+=page.text;cursor=page.nextCursor;pages++;}while(cursor);
      print({...first,text,nextCursor:null,pages});
    }else if(command==='call'){
      if(!positionals[1])throw new Error('call requires a tool name');print(await call(positionals[1],await jsonArg(flags.args||positionals[2])));
    }else if(command==='upload'){
      const file=path.resolve(positionals[1]||'');if(!positionals[1])throw new Error('upload requires an absolute or resolvable file path.');print(await uploadAsset(client,{filePath:path.basename(file),directory:path.dirname(file),baseUrl:baseUrl.href}));
    }else if(command==='import'||command==='open'){
      const file=path.resolve(positionals[1]||'');if(!positionals[1])throw new Error(`${command} requires a file path.`);
      const uploaded=await uploadAsset(client,{filePath:path.basename(file),directory:path.dirname(file),baseUrl:baseUrl.href});
      try{const current=await session();print(await call(command==='import'?'import_asset':'open_asset',{context:current.context,assetId:uploaded.assetId}));}
      finally{await call('release_resource',{resourceId:uploaded.assetId}).catch(()=>{});}
    }else if(command==='save'||command==='export'){
      const isExport=command==='export',format=isExport?positionals[1]:null,directory=path.resolve(positionals[isExport?2:1]||'');
      if(isExport&&!['step','stl','brep','png'].includes(format))throw new Error('export format must be step, stl, brep or png.');
      if(!positionals[isExport?2:1])throw new Error(`${command} requires an existing output directory.`);
      const current=await session(),artifact=await call(isExport?'export_artifact':'save_document',isExport?{context:current.context,format}:{context:current.context});
      const written=await downloadArtifact(client,artifact,{directory,baseUrl:baseUrl.href,...(flags.name?{name:flags.name}:{})});
      await call('release_resource',{resourceId:artifact.artifactId}).catch(()=>{});print(written);
    }else throw new Error(`Unknown command: ${command}`);
  }finally{await client.close();}
}
run().catch(error=>{console.error(JSON.stringify({status:'failed',error:{code:error.code||'AGENT_CLI_FAILED',message:error.message},result:error.result},null,flags.pretty?2:0));process.exitCode=1;});
