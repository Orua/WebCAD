import { convertIges } from './iges-import.mjs';
export async function handleIgesImport(req,res){
 const send=(status,payload)=>{if(!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(payload));}};
 if(req.method!=='POST')return send(405,{error:'POST required'});
 try{let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>28*1024*1024)throw Object.assign(new Error('请求超过 28 MiB'),{status:413});chunks.push(chunk);}const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));send(200,await convertIges(input));}
 catch(error){send(error.status||422,{error:error.status?error.message:'IGES 本机转换失败'});}
}
