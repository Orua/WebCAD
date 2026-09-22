// Local-only conversion; the native project stores the returned STEP for replay.
export async function importIgesFile(file, encode, fetcher=fetch) {
  if(file.size>20*1024*1024)throw new Error('IGS 本地转换限制 20 MiB');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),100000);
  try{
    const response=await fetcher('/api/iges-import',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({name:file.name,data:encode(new Uint8Array(await file.arrayBuffer()))}),
    });
    const result=await response.json().catch(()=>{throw new Error('本地 IGS 转换服务不可用，请使用带转换服务的 WebCAD 启动入口。');});
    if(!response.ok||!result.ok)throw new Error(result.error||'IGS 转换失败');
    if(typeof result.step!=='string'||!result.step.length)throw new Error('转换服务未返回 STEP 几何');
    return {format:'step',data:result.step,source:{format:'iges',name:file.name,sha256:result.sha256,unit:result.unit,topology:result.topology,entityStatus:result.entityStatus}};
  } finally {clearTimeout(timeout);}
}
