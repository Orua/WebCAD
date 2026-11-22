// Local visual-review fixture. Uses the same public files API as an external host.
// It does not exercise or replace the operating system's native file picker.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const [modelPath,portArg='17673',bodyCountArg='1']=process.argv.slice(2),port=Number(portArg),expectedBodyCount=Number(bodyCountArg);
if(!modelPath||!Number.isInteger(port)||port<1024||port>65535||!Number.isInteger(expectedBodyCount)||expectedBodyCount<1||expectedBodyCount>256)throw new Error('Usage: node scripts/probes/serve-dragon-review.mjs <model.webcad> [port] [expected-body-count]');
const bytes=await fs.readFile(path.resolve(modelPath));
const modelSHA256=createHash('sha256').update(bytes).digest('hex');
const html=`<!doctype html><meta charset="utf-8"><title>WebCAD public API dragon review</title>
<style>body{margin:0;font:14px sans-serif;background:#eef2f6}header{padding:8px;display:flex;gap:12px;align-items:center}#status{white-space:pre-wrap;overflow-wrap:anywhere;max-width:75vw}iframe{border:0;width:100%;height:calc(100vh - 80px)}</style>
<header><button id="open" disabled>通过公开 files API 打开盘龙模型</button><a href="/__dragon-model.webcad" download="dragon.webcad">下载原模型</a><span id="status">正在载入页面内核。视觉尚未验收。</span></header>
<iframe id="app" title="WebCAD"></iframe><script type="module">
const frame=document.querySelector('#app'),button=document.querySelector('#open'),status=document.querySelector('#status');
const expectedModelSHA256=${JSON.stringify(modelSHA256)},expectedBodyCount=${expectedBodyCount};
frame.src='/?document='+crypto.randomUUID();
const deadline=Date.now()+120000;
const wait=setInterval(()=>{try{const api=frame.contentWindow.webcad?.api;if(api?.getState().summary.kernelReady){clearInterval(wait);button.disabled=false;status.textContent='页面已就绪。点击按钮按公开 API 登记并打开固定模型。不是原生文件选择器验收。';}}catch{}if(Date.now()>deadline){clearInterval(wait);status.textContent='内核尚未就绪。打开内嵌页面 Debug 查看错误。';}},200);
button.addEventListener('click',async()=>{button.disabled=true;try{
 const api=frame.contentWindow.webcad.api,before=api.getState();if(before.bodies.length||before.summary.dirty)throw Error('该页面不为空。刷新本验收页再试，不丢弃现有设计。');
 const quality=await api.setRenderQuality({context:api.createRequestContext(before.context),quality:'standard'});if(quality.status==='failed')throw Error(JSON.stringify(quality.error));
 status.textContent='正在以标准质量通过公开 files.register / files.open 读取模型。请等待几何和显示完成。';
 const response=await fetch('/__dragon-model.webcad');if(!response.ok)throw Error('模型读取失败 HTTP '+response.status);
 const data=new Uint8Array(await response.arrayBuffer());
 window.reviewEvidence={method:'public-page-files-api',stage:'register',visualStatus:'NOT_REVIEWED',nativePicker:'NOT_TESTED',inputProof:{callerUint8Array:data instanceof Uint8Array,pageUint8Array:data instanceof frame.contentWindow.Uint8Array,byteLength:data.byteLength}};
 const registered=await api.files.register({name:'dragon.webcad',data});
 if(registered.status!=='registered'||registered.sha256!==expectedModelSHA256||registered.size!==data.byteLength)throw Error('公开登记回执与固定模型字节不一致：'+JSON.stringify(registered));
 window.reviewEvidence={...window.reviewEvidence,stage:'open',registered};
 status.textContent='跨realm Uint8Array已登记，SHA-256与固定模型一致。正在公开 files.open。';
 const openStarted=performance.now();const result=await api.files.open({context:api.createRequestContext(api.getState().context),resourceId:registered.resourceId,unsaved:'fail'});
 if(result.status==='failed')throw Error(JSON.stringify(result.error));
 const openElapsedMs=performance.now()-openStarted;const after=api.getState();if(after.bodies.length!==expectedBodyCount||after.bodies.some(body=>body.solidCount!==1))throw Error('打开结果不是预期的 '+expectedBodyCount+' 个单实体构件：'+JSON.stringify(after.summary));
 const view=await api.setView({context:api.createRequestContext(after.context),direction:'iso',projection:'orthographic',fit:true});if(view.status==='failed')throw Error(JSON.stringify(view.error));
 window.reviewEvidence={...window.reviewEvidence,stage:'opened',openElapsedMs,open:result,context:after.context,summary:after.summary,bodies:after.bodies};
 status.textContent='公开 files API 已打开 '+after.bodies.length+' 个对象，open回执 '+(openElapsedMs/1000).toFixed(1)+' 秒。请人工检查形状；不是完整视觉通过。字节 '+data.byteLength+'；SHA-256 '+registered.sha256;
}catch(error){window.reviewEvidence={...window.reviewEvidence,error:{name:error.name,message:error.message}};status.textContent='打开失败：'+error.message;button.disabled=false;}});
</script>`;
const server=await createServer({configFile:path.resolve('vite.config.mjs'),cacheDir:path.join(path.dirname(path.resolve(modelPath)),'.vite-review-cache-'+port),server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'local-dragon-review',configureServer(server){server.middlewares.use((req,res,next)=>{const route=req.url?.split('?')[0];if(!['/__dragon-review','/__dragon-model.webcad'].includes(route))return next();if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}const data=route==='/__dragon-review'?html:bytes;res.setHeader('Content-Type',route==='/__dragon-review'?'text/html; charset=utf-8':'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(req.method==='HEAD'?undefined:data);});}}]});
await server.listen();console.log('Review fixture: http://127.0.0.1:'+port+'/__dragon-review');
