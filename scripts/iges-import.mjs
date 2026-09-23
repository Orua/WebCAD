import {access,mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MAX_FILE=20*1024*1024, TIMEOUT=90000; let running=0;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function python(){for(const p of [process.env.WEBCAD_PYTHON,path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),'F:/Project/text-to-cad/.venv/Scripts/pythonw.exe'].filter(Boolean)){try{await access(p);return p;}catch{}}throw fail('本机 OCP 转换环境未配置',503);}
let environmentCheck=null;
export async function checkIgesEnvironment(){
 if(!environmentCheck)environmentCheck=(async()=>{try{const runtime=await python();await run(runtime,['-c','from OCP.IGESControl import IGESControl_Reader; from OCP.STEPControl import STEPControl_Writer']);return {available:true};}catch(error){return {available:false,reason:error.message,code:'OCP_UNAVAILABLE'};}})();
 return environmentCheck;
}
export function validateIgesRequest(input){if(!input||typeof input.name!=='string'||path.extname(path.basename(input.name)).toLowerCase()!=='.igs'&&path.extname(path.basename(input.name)).toLowerCase()!=='.iges')throw fail('仅支持 .igs/.iges');if(typeof input.data!=='string'||!input.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)||input.data.length%4)throw fail('IGES 字节必须是有效 base64');const bytes=Buffer.from(input.data,'base64');if(!bytes.length||bytes.length>MAX_FILE)throw fail('IGES 文件超过 20 MiB');return {name:path.basename(path.win32.basename(input.name)),bytes};}
async function run(p,args){return await new Promise((resolve,reject)=>{const c=spawn(p,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let err='';let timedOut=false;c.stderr.on('data',d=>{err=(err+d.toString()).slice(-4000);});const timer=setTimeout(()=>{timedOut=true;c.kill();},TIMEOUT);c.on('error',e=>{clearTimeout(timer);reject(fail('无法启动 OCP 转换: '+e.message,503));});c.on('close',(code,signal)=>{clearTimeout(timer);if(timedOut)return reject(fail('IGES 转换超时',504));if(code===null)return reject(fail('IGES 转换被终止: '+(signal||'unknown'),422));if(code!==0)reject(fail('IGES 转换失败: '+err.slice(-1200),422));else resolve();});});}
export async function convertIges(input){if(running)throw fail('已有 IGES 正在转换，请稍后重试',503);running++;let job;try{const request=validateIgesRequest(input),dir=path.join(root,'agent','temp','iges-import');await mkdir(dir,{recursive:true});job=await mkdtemp(path.join(dir,'job-'));const src=path.join(job,request.name),brep=path.join(job,'model.brep'),step=path.join(job,'model.step'),result=path.join(job,'result.json');await writeFile(src,request.bytes);await run(await python(),[path.join(root,'tools','iges-import.py'),'--input',src,'--brep',brep,'--step',step,'--result',result]);const meta=JSON.parse(await readFile(result,'utf8'));return {...meta,brep:Buffer.from(await readFile(brep)).toString('base64'),step:Buffer.from(await readFile(step)).toString('base64')};}finally{running--;if(job)await rm(job,{recursive:true,force:true}).catch(()=>{});}}
