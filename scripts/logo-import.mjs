import {spawn} from 'node:child_process';
import {access,mkdir,mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temporary=path.join(root,'agent','temp','logo-import');
const MAX_FILE=20*1024*1024,MAX_JSON=28*1024*1024;
let running=0;
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
async function findPython(){
 const candidates=[process.env.WEBCAD_PYTHON,path.join(root,'.venv',process.platform==='win32'?'Scripts/pythonw.exe':'bin/python'),...(process.platform==='win32'?['F:/Project/text-to-cad/.venv/Scripts/pythonw.exe']:[])].filter(Boolean);
 for(const candidate of candidates){try{await access(candidate);return candidate;}catch{}}
 throw failure('本机矢量转换环境未配置，请设置 WEBCAD_PYTHON 并安装 tools/requirements-logo.txt。 / Configure the local Python converter.',503);
}
async function readJSON(req){
 if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw failure('JSON content type required',415);
 if(Number(req.headers['content-length'])>MAX_JSON)throw failure('文件超过 20 MB / File exceeds 20 MB',413);
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>MAX_JSON)throw failure('文件超过 20 MB / File exceeds 20 MB',413);chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw failure('Invalid import request JSON');}
}
export function validateImportRequest(input){
 if(!input||!['inspect','extract'].includes(input.action))throw failure('Invalid import action');
 if(typeof input.name!=='string'||input.name.length>240)throw failure('Invalid filename');
 const name=path.basename(path.win32.basename(input.name)),extension=path.extname(name).toLowerCase();
 if(!['.dwg','.dxf','.svg','.pdf','.ai'].includes(extension))throw failure('支持 DWG / DXF / SVG / PDF / PDF-compatible AI',415);
 if(typeof input.data!=='string'||input.data.length>Math.ceil(MAX_FILE/3)*4||!input.data.length||input.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))throw failure('Invalid or oversized base64 file');
 const bytes=Buffer.from(input.data,'base64');if(!bytes.length||bytes.length>MAX_FILE||bytes.toString('base64')!==input.data)throw failure('Invalid or oversized file',413);
 const page=input.page??1;if(!Number.isInteger(page)||page<1||page>10000)throw failure('Invalid page number');
 const selected=input.bounds;
 if(input.action==='extract'&&(!Array.isArray(selected)||selected.length!==4||selected.some(n=>typeof n!=='number'||!Number.isFinite(n))||selected[0]>=selected[2]||selected[1]>=selected[3]))throw failure('请选择有效图案范围 / Select a valid logo window');
 if(input.action==='extract'&&(typeof input.mmPerUnit!=='number'||!Number.isFinite(input.mmPerUnit)||input.mmPerUnit<=0||input.mmPerUnit>1000))throw failure('请确认有效尺寸比例 / Confirm a valid mm-per-unit scale');
 if(input.ignoreCrossing!==undefined&&typeof input.ignoreCrossing!=='boolean')throw failure('ignoreCrossing must be boolean');
 return {action:input.action,name,extension,bytes,page,...(input.action==='extract'?{bounds:selected,mmPerUnit:input.mmPerUnit,ignoreCrossing:input.ignoreCrossing===true}:{})};
}
async function convert(python,requestFile,resultFile,signal){
 await new Promise((resolve,reject)=>{
  const child=spawn(python,[path.join(root,'tools','logo-vector-import.py'),'--request',requestFile,'--output',resultFile],{cwd:root,windowsHide:true,stdio:['ignore','ignore','pipe']});
  let stderr='';child.stderr.on('data',data=>{if(stderr.length<4000)stderr+=data.toString();});
  const abort=()=>child.kill();signal.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(()=>{child.kill();},90000);let timedOut=false;
  const markTimeout=setTimeout(()=>{timedOut=true;},89900);
  const clear=()=>{clearTimeout(timeout);clearTimeout(markTimeout);signal.removeEventListener('abort',abort);};
  child.once('error',error=>{clear();reject(failure('Cannot start local converter: '+error.message,503));});
  child.once('close',code=>{clear();if(signal.aborted)return reject(failure('Import cancelled',499));if(timedOut)return reject(failure('矢量转换超时，请简化图纸 / Vector conversion timed out',504));if(code!==0)return reject(failure('矢量转换失败 / Vector conversion failed: '+stderr.slice(-1500),422));resolve();});
 });
 const info=await stat(resultFile);if(info.size>32*1024*1024)throw failure('Converted geometry exceeds limit',422);
 const result=JSON.parse(await readFile(resultFile,'utf8'));
 if(result.error)throw failure(String(result.error),422);
 return result;
}
export async function handleLogoImport(req,res){
 const send=(status,payload)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(payload));}};
 if(req.method!=='POST')return send(405,{error:'POST required'});
 if(running>=1)return send(503,{error:'已有文件正在转换，请稍后重试 / Another file is being converted'});
 running++;let job;const controller=new AbortController();const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnected);
 try{
  const input=validateImportRequest(await readJSON(req)),python=await findPython();
  if(controller.signal.aborted)throw failure('Import cancelled',499);
  await mkdir(temporary,{recursive:true});job=await mkdtemp(path.join(temporary,'job-'));
  const filePath=path.join(job,'source'+input.extension),requestFile=path.join(job,'request.json'),resultFile=path.join(job,'result.json');
  await writeFile(filePath,input.bytes);
  const {bytes,extension,...params}=input;
  await writeFile(requestFile,JSON.stringify({...params,filePath}));
  send(200,await convert(python,requestFile,resultFile,controller.signal));
 }catch(error){send(error.status||500,{error:error.status?error.message:'本机转换失败，请查看转换环境 / Local conversion failed'});}
 finally{
  res.off('close',disconnected);running--;
  // Only the fresh job directory under this dedicated workspace temp root is removed.
  if(job&&path.dirname(path.resolve(job))===path.resolve(temporary))await rm(job,{recursive:true,force:true}).catch(()=>{});
 }
}
