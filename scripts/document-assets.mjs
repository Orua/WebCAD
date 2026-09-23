import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ArtifactStore } from './artifact-store.mjs';
import { fileToolDefinitions, getFileTool } from '../src/file-contracts.js';
import { checkIgesEnvironment } from './iges-import.mjs';

const MAX_BYTES=20*1024*1024;
const fail=(code,message)=>Object.assign(new Error(message),{code});
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const tokenOf=req=>/^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(req.headers.authorization||'')?.[1];
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,...(['failed','unknown'].includes(value.status)?{isError:true}:{})});
function readBoundedBody(req){
  return new Promise((resolve,reject)=>{
    let size=0,settled=false;const chunks=[];
    req.on('data',chunk=>{if(settled)return;size+=chunk.length;if(size>MAX_BYTES){settled=true;chunks.length=0;reject(fail('SIZE_LIMIT','Upload exceeds 20 MiB.'));return;}chunks.push(chunk);});
    req.on('end',()=>{if(!settled){settled=true;resolve(Buffer.concat(chunks));}});
    req.on('error',error=>{if(!settled){settled=true;reject(error);}});
  });
}

/** Temporary local transfer boundary. The browser command service owns all documents. */
export function createDocumentAssets({command,allowed,root,ttlMs=1800000}){
  const owned=!root;
  const directory=path.resolve(root||fileURLToPath(new URL(`../agent/temp/m2a/store-${randomUUID()}`,import.meta.url)));
  const store=new ArtifactStore({root:directory,maxBytes:MAX_BYTES,ttlMs});
  const ready=store.initialize(),flows=new Map(),downloads=new Map();
  async function prune(){
    await ready;await store.pruneExpired();
    for(const [id,flow]of flows)if(flow.expiresAt<=Date.now()){flows.delete(id);downloads.delete(flow.downloadToken);}
  }
  async function runFile(context,action,args,signal){
    const value=await command(context.sessionId,'file_command',{context,action,args},signal,{v2:true});
    if(['failed','unknown'].includes(value.status))throw Object.assign(new Error(value.error.message),value.error,{unknown:value.status==='unknown'});
    return value;
  }
  async function artifact(payload,context,format){
    if(payload.encoding!=='base64'||typeof payload.data!=='string'||payload.data.length>Math.ceil(MAX_BYTES/3)*4)throw fail('SIZE_LIMIT','Generated file exceeds the 20 MiB transfer limit.');
    const bytes=Buffer.from(payload.data,'base64');
    const extension=format==='webcad'?'webcad':payload.extension;
    const record=await store.createArtifact(bytes,{name:`WebCAD-r${context.revision}.${extension}`,mime:payload.mime});
    const downloadToken=randomBytes(32).toString('base64url');
    const flow={...record,context,format,downloadToken,downloaded:false,written:false};
    flows.set(record.id,flow);downloads.set(downloadToken,record.id);
    return {status:'generated',artifactId:record.id,name:record.name,mime:record.mime,size:record.size,sha256:record.sha256,expiresAt:record.expiresAt,context,format,downloadUrl:`/api/artifacts/${record.id}`,downloadToken,generated:true,downloaded:false,written:false};
  }
  const handlers={
    async file_capabilities(){return {status:'read',maxBytes:MAX_BYTES,ttlSeconds:ttlMs/1000,imports:['step','brep','iges'],exports:['step','stl','brep','png'],native:'webcad',iges:await checkIgesEnvironment(),authorization:'local loopback session and explicitly authorized client directory'};},
    async register_asset(args){
      if(/\.(igs|iges)$/i.test(args.name)){const capability=await checkIgesEnvironment();if(!capability.available)throw fail('OCP_UNAVAILABLE',capability.reason);}
      return {status:'registered',uploadUrl:'/api/assets',...store.createUpload(args)};
    },
    async new_document({context},extra){return runFile(context,'new',{},extra.signal);},
    async open_asset({context,assetId},extra){return open(context,assetId,'open',extra.signal);},
    async import_asset({context,assetId},extra){return open(context,assetId,'import',extra.signal);},
    async save_document({context},extra){const saved=await runFile(context,'save',{},extra.signal);return artifact(saved,saved.context,'webcad');},
    async export_artifact({context,format,ids},extra){const exported=await runFile(context,'export',{format,ids},extra.signal);return artifact(exported,exported.context,format);},
    async confirm_artifact_written({artifactId,size,sha256},extra){
      store.get(artifactId);
      const flow=flows.get(artifactId);if(!flow)throw fail('RESOURCE_EXPIRED','Artifact receipt is unavailable.');
      if(!flow.downloaded)throw fail('ARTIFACT_NOT_DOWNLOADED','Retrieve the artifact bytes before confirming a disk write.');
      if(size!==flow.size||sha256.toLowerCase()!==flow.sha256)throw fail('HASH_MISMATCH','Client size/hash does not match the generated artifact.');
      flow.written=true;
      let acknowledgement={saved:false,reason:'EXCHANGE_FORMAT'};
      if(flow.format==='webcad'){
        try{acknowledgement=await command(flow.context.sessionId,'acknowledge_save',{documentId:flow.context.documentId,documentInstanceId:flow.context.documentInstanceId,savedRevision:flow.context.revision},extra.signal);}
        catch(error){acknowledgement={saved:false,reason:'ACKNOWLEDGEMENT_UNAVAILABLE',message:error.message};}
      }
      return {status:'written',artifactId,size,sha256:flow.sha256,generated:true,downloaded:true,written:true,writeConfirmation:'client_reported_verified_write',documentSaved:acknowledgement.saved===true,acknowledgement};
    },
    async release_resource({resourceId}){
      await store.delete(resourceId);const flow=flows.get(resourceId);if(flow)downloads.delete(flow.downloadToken);flows.delete(resourceId);
      return {status:'released',resourceId};
    },
  };
  async function open(context,assetId,action,signal){
    const {metadata,bytes}=await store.read(assetId);
    if(metadata.kind!=='asset')throw fail('RESOURCE_INVALID','An input asset is required.');
    const pattern=action==='open'?/\.(webcad|json)$/i:/\.(step|stp|brep|brp|igs|iges)$/i;
    if(!pattern.test(metadata.name))throw fail('FORMAT_UNSUPPORTED','File extension does not match this action.');
    return {...await runFile(context,action,{name:metadata.name,mime:metadata.mime,data:bytes.toString('base64')},signal),assetId,sha256:metadata.sha256};
  }
  function registerTools(mcp){
    for(const [name,definition]of Object.entries(fileToolDefinitions))mcp.registerTool(`webcad_${name}`,{description:definition.description,inputSchema:z.fromJSONSchema(definition.inputSchema),outputSchema:z.fromJSONSchema(getFileTool(name).outputSchema)},async(args,extra)=>{
      try{await prune();return result(await handlers[name](args,extra));}
      catch(error){return result({status:error.unknown?'unknown':'failed',commitState:error.unknown?'unknown':'not_committed',error:{code:error.code||'FILE_OPERATION_FAILED',message:error.message,retryable:false,recoveryAction:'READ_STATE_AND_REPLAN'}});}
    });
  }
  async function handle(req,res){
    if(!allowed(req)){send(res,403,{error:{code:'LOCAL_REQUEST_REQUIRED'}});return;}
    await prune();const pathname=(req.url||'').split('?')[0];
    try{
      if(pathname==='/api/assets'){
        if(req.method!=='PUT'){send(res,405,{error:{code:'METHOD_NOT_ALLOWED'}});return;}
        const token=tokenOf(req);store.verifyUpload(token);
        if(Number(req.headers['content-length'])>MAX_BYTES){req.resume();send(res,413,{error:{code:'SIZE_LIMIT'}});return;}
        const record=await store.acceptUpload(token,await readBoundedBody(req));send(res,201,{...record,assetId:record.id});return;
      }
      const match=/^\/api\/artifacts\/(art_[a-f\d]{48})$/.exec(pathname);
      if(!match){send(res,404,{error:{code:'RESOURCE_INVALID'}});return;}
      if(req.method!=='GET'){send(res,405,{error:{code:'METHOD_NOT_ALLOWED'}});return;}
      if(downloads.get(tokenOf(req))!==match[1])throw fail('RESOURCE_EXPIRED','Invalid or expired download capability.');
      const {metadata,bytes}=await store.read(match[1]);
      res.writeHead(200,{'Content-Type':metadata.mime,'Content-Length':metadata.size,'X-Content-SHA256':metadata.sha256,'Cache-Control':'no-store','Content-Disposition':`attachment; filename="WebCAD.bin"; filename*=UTF-8''${encodeURIComponent(metadata.name)}`});
      res.once('finish',()=>{const flow=flows.get(metadata.id);if(flow)flow.downloaded=true;});res.end(bytes);
    }catch(error){if(!res.headersSent)send(res,error.code==='SIZE_LIMIT'?413:error.code==='RESOURCE_EXPIRED'?410:error.code==='UPLOAD_TOKEN_INVALID'?403:422,{error:{code:error.code||'TRANSFER_FAILED',message:error.message}});else res.destroy();}
  }
  async function close(){await ready;if(owned){const base=path.resolve(fileURLToPath(new URL('../agent/temp/m2a/',import.meta.url)));if(path.dirname(directory)===base&&path.basename(directory).startsWith('store-'))await fs.rm(directory,{recursive:true,force:true});}}
  return {registerTools,handle,close};
}
