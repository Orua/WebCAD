import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const configFile=path.join(root,'agent','config','logo-converter.json');
const limit=20*1024*1024;
const reply=(res,status,value)=>{const body=JSON.stringify(value);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});res.end(body);};
async function body(req,max){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(new Error('文件超过 20 MiB'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}
async function readConfig(){try{return JSON.parse(await readFile(configFile,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw error;}}
function validUrl(value){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||!url.searchParams.has('userid'))throw new Error('转换 URL 须为含 userid 的 HTTP(S) 地址');return url.toString();}
export async function handleLogoConverter(req,res){
 try{
  if(req.method==='GET'){const c=await readConfig();return reply(res,200,{configured:!!(c.url&&c.key),url:c.url||'',hasKey:!!c.key});}
  if(req.method==='PUT'){
   const input=JSON.parse((await body(req,8192)).toString('utf8'));
   const previous=await readConfig();const url=validUrl(input.url);
   if(input.key!==undefined&&(typeof input.key!=='string'||input.key.length>512))throw new Error('Key 格式无效');
   const key=input.key||previous.key;if(!key)throw new Error('请填写转换 Key');
   await mkdir(path.dirname(configFile),{recursive:true});await writeFile(configFile,JSON.stringify({url,key}),{mode:0o600});
   return reply(res,200,{configured:true,url,hasKey:true});
  }
  if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
  const c=await readConfig();if(!c.url||!c.key)return reply(res,503,{error:'请先在全局设置中配置 LOGO 转换 URL 和 Key'});
  const name=decodeURIComponent(req.headers['x-logo-filename']||'logo.pdf');
  if(!/^[^\\/\x00-\x1f]{1,240}\.pdf$/i.test(name))return reply(res,400,{error:'仅支持 PDF 文件名'});
  const bytes=await body(req,limit);if(!bytes.length||bytes.subarray(0,5).toString()!=='%PDF-')return reply(res,415,{error:'不是有效的 PDF 文件头'});
  const form=new FormData();form.append('file',new Blob([bytes],{type:'application/pdf'}),name);
  const upstream=await fetch(c.url,{method:'POST',headers:{'X-Key':c.key},body:form,signal:AbortSignal.timeout(90000)});
  const result=await upstream.text();if(result.length>24*1024*1024)return reply(res,502,{error:'转换结果过大'});
  if(!upstream.ok){let message=`转换服务 HTTP ${upstream.status}`;try{const data=JSON.parse(result);message=data.message||data.error||message;}catch{}return reply(res,upstream.status>=400&&upstream.status<500?upstream.status:502,{error:String(message).slice(0,500)});}
  if(!result.trimStart().startsWith('<svg')&&!result.includes('<svg '))return reply(res,502,{error:'转换服务未返回 SVG'});
  return reply(res,200,{svg:result});
 }catch(error){return reply(res,error.status||400,{error:error.message||'LOGO 转换失败'});}
}
