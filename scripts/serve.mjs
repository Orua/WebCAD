import http from 'node:http';

import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const host='127.0.0.1', identity='WebCAD-local-server-v1';
const portIndex=process.argv.indexOf('--port');
const portValue=portIndex<0?'667':process.argv[portIndex+1];
if(!/^\d+$/.test(portValue??'')||Number(portValue)<1||Number(portValue)>65535){
 console.error('--port requires an integer from 1 through 65535');process.exit(1);
}
const port=Number(portValue);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.hdr':'application/octet-stream','.stp':'application/step','.step':'application/step','.stl':'model/stl'};
async function probe(){return new Promise(resolve=>{let finished=false;const done=value=>{if(!finished){finished=true;resolve(value);}};const req=http.get({hostname:host,port,path:'/healthz',timeout:1500},res=>{let data='';res.on('data',chunk=>{data+=chunk;if(data.length>4096){req.destroy();done(1);}});res.on('end',()=>{try{const status=JSON.parse(data);done(status.identity===identity&&status.mcp==='/mcp'?0:1);}catch{done(1);}});});req.on('timeout',()=>{req.destroy();done(1);});req.on('error',e=>done(e.code==='ECONNREFUSED'?2:1));});}
if(process.argv.includes('--probe')){process.exit(await probe());}
const { createMCPBridge, localRequestAllowed } = await import('./mcp-bridge.mjs');
const { bootstrap, searchTools, getTool, readDocs } = await import('../src/ai-docs.js');
const { handleLogoImport } = await import('./logo-import.mjs');
const { handleLogoConverter } = await import('./logo-converter-proxy.mjs');
const { handleIgesImport } = await import('./iges-route.mjs');
const within=(base,target)=>target===base||target.startsWith(base+path.sep);
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-cache');
 const fail=(code,message)=>{res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8'});res.end(message);};
 if(!localRequestAllowed(req))return fail(403,'Local Host/Origin required');
 if(req.url?.split('?')[0]==='/mcp')return bridge.handle(req,res);
 if(req.url?.split('?')[0]==='/api/assets'||req.url?.split('?')[0]?.startsWith('/api/artifacts/')){try{return await bridge.handleFileRequest(req,res);}catch(error){return fail(500,error.message||'File transfer failed');}}
 if(req.url?.split('?')[0]==='/api/logo-import')return handleLogoImport(req,res);
 if(req.url?.split('?')[0]==='/api/logo-converter'||req.url?.split('?')[0]==='/api/logo-convert')return handleLogoConverter(req,res);
 if(req.url?.split('?')[0]==='/api/iges-import')return handleIgesImport(req,res);
 let requestUrl;try{requestUrl=new URL(req.url||'/',`http://${req.headers.host}`);}catch{return fail(400,'Invalid URL');}
 const sendJson=(status,value)=>{const body=JSON.stringify(value);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});return res.end(req.method==='HEAD'?undefined:body);};
 if(requestUrl.pathname==='/agent'){
  if(!['GET','HEAD'].includes(req.method))return fail(405,'Only GET and HEAD are supported.');
  res.writeHead(302,{Location:'/?agent=1'});return res.end();
 }
 if(requestUrl.pathname==='/api/agent'||requestUrl.pathname.startsWith('/api/agent/')){
  if(!['GET','HEAD'].includes(req.method))return fail(405,'Agent discovery is read-only.');
  try{
   if(requestUrl.pathname==='/api/agent')return sendJson(200,{...bootstrap(),launchUrl:`http://${host}:${port}/agent`,mcpUrl:`http://${host}:${port}/mcp`,cli:'npm run agent:cli --',readEndpoints:{docs:'/api/agent/docs?doc=start',search:'/api/agent/tools?query=box',tool:'/api/agent/tool?id=box'}});
   if(requestUrl.pathname==='/api/agent/docs')return sendJson(200,readDocs({docId:requestUrl.searchParams.get('doc')||'start',...(requestUrl.searchParams.has('cursor')?{cursor:requestUrl.searchParams.get('cursor')}:{}),...(requestUrl.searchParams.has('limit')?{limitChars:Number(requestUrl.searchParams.get('limit'))}:{})}));
   if(requestUrl.pathname==='/api/agent/tools')return sendJson(200,searchTools({query:requestUrl.searchParams.get('query')||'',...(requestUrl.searchParams.has('category')?{category:requestUrl.searchParams.get('category')}:{}),...(requestUrl.searchParams.has('limit')?{limit:Number(requestUrl.searchParams.get('limit'))}:{})}));
   if(requestUrl.pathname==='/api/agent/tool'){const id=requestUrl.searchParams.get('id');if(!id)return fail(400,'Missing id');return sendJson(200,getTool({id}));}
   return fail(404,'Unknown agent discovery endpoint');
  }catch(error){return sendJson(400,{error:{code:error.code||'PARAM_SCHEMA_INVALID',message:error.message}});}
 }
 if(!['GET','HEAD'].includes(req.method))return fail(405,'Only GET and HEAD are supported for static files.');
 let pathname;try{pathname=decodeURIComponent(requestUrl.pathname);}catch{return fail(400,'Invalid URL');}
 if(pathname==='/healthz')return sendJson(200,{identity,project:'WebCAD',port,mcp:'/mcp',bridge:'/ai-bridge',agent:'/agent',agentDocs:'/api/agent'});
 if(pathname.includes('\0')||pathname.includes('\\')||pathname.split('/').some(x=>x==='..'||x==='.')||pathname.includes(':'))return fail(403,'Forbidden path');
 let folder='dist',relative=pathname;
 for(const prefix of ['cad-viewer','cad-data'])if(pathname===`/${prefix}`||pathname.startsWith(`/${prefix}/`)){folder=prefix;relative=pathname.slice(prefix.length+1);break;}
 try{
  const base=await realpath(path.join(root,folder));let file=path.resolve(base,'.'+(relative||'/'));
  if(!within(base,file))return fail(403,'Forbidden path');
  let info=await stat(file);if(info.isDirectory()){if(!pathname.endsWith('/')){res.writeHead(301,{Location:pathname+'/'});return res.end();}file=path.join(file,'index.html');info=await stat(file);}
  file=await realpath(file);if(!within(base,file)||!info.isFile())return fail(403,'Forbidden file');
  res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':info.size});
  if(req.method==='HEAD')return res.end();
  const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
 }catch(e){return fail(e.code==='ENOENT'||e.code==='ENOTDIR'?404:500,'File unavailable');}
});
const bridge=createMCPBridge(server);
server.on('close',()=>bridge.close());
server.on('error',async error=>{if(error.code==='EADDRINUSE'){if(await probe()===0){console.log(`Existing WebCAD server found. Reuse http://127.0.0.1:${port}`);process.exit(0);}console.error(`Port ${port} is occupied by another service. It was not stopped.`);}else console.error(error.message);process.exit(1);});
try{await stat(path.join(root,'dist','index.html'));}catch{console.error('Missing dist. Run npm install and npm run build first.');process.exit(1);}
server.listen(port,host,()=>console.log(`WebCAD ready: http://${host}:${port} (local only)`));


