// Development/acceptance harness only. The distributed product is dist/.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=await fs.realpath(process.env.WEBCAD_STATIC_ROOT||'dist');
const port=Number(process.env.WEBCAD_STATIC_PORT||17670);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.md':'text/plain','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try{
    let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(name.startsWith('/sub/'))name=name.slice(4);
    if(name.endsWith('/'))name+='index.html';
    const file=await fs.realpath(path.resolve(root,'.'+name));
    if(!file.startsWith(root+path.sep))throw new Error('outside root');
    const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Static GET/HEAD only: http://127.0.0.1:${port} and /sub/`));
