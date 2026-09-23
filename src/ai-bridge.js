/** Local-only browser adapter. All geometry commands go through the existing app API. */
export function connectAI(api,{onStatus=()=>{}}={}) {
 let socket=null,stopped=false,retry=null,sessionId=null,tail=Promise.resolve(),serverInfo={};
 const active=new Map();
 const report=(state,message)=>onStatus({state,message,sessionId});
 const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));};
 async function publish(ws=socket){if(ws?.readyState!==WebSocket.OPEN)return;try{send(ws,{type:'state',state:await api.getState()});}catch(e){report('error',`无法读取模型状态：${e.message}`);}}
 function open(){
  if(stopped)return;
  const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ai-bridge`);socket=ws;report('connecting','正在连接本机 MCP 服务');
  ws.onmessage=event=>{let msg;try{msg=JSON.parse(event.data);}catch{report('error','MCP 桥收到无效消息');return;}
   if(msg.type==='welcome'){sessionId=msg.sessionId;serverInfo={serverInstanceId:msg.serverInstanceId,buildId:msg.buildId};report('connected','MCP 已连接');publish(ws);return;}
   if(msg.type==='cancel'){active.get(msg.requestId)?.abort();return;}
   if(msg.type!=='command')return;
   const controller=new AbortController();active.set(msg.requestId,controller);
   const run=async()=>{
    let timer;
    try{
     if(controller.signal.aborted||ws.readyState!==WebSocket.OPEN)throw new Error('Browser disconnected or command cancelled');
     const remaining=msg.deadline-Date.now();if(remaining<=0)throw new Error('Command deadline expired');
     timer=setTimeout(()=>controller.abort(),remaining);
     const state=await api.getState();const expectedRevision=msg.args?.expectedRevision;
     if(expectedRevision!==undefined&&state.revision!==expectedRevision)throw new Error(`Revision conflict: expected ${expectedRevision}, current ${state.revision}`);
     report('working',`AI：${msg.command}`);
     const result=msg.command==='get_state'?state:await api.execute(msg.command,msg.args||{},{signal:controller.signal,expectedRevision,requestId:msg.requestId});
     // The app checks cancellation before committing. A later abort is not rollback.
     send(ws,{type:'result',requestId:msg.requestId,ok:true,result,state:await api.getState()});report('connected','MCP 操作完成');
    }catch(e){send(ws,{type:'result',requestId:msg.requestId,ok:false,error:e.message,state:await Promise.resolve().then(()=>api.getState()).catch(()=>null)});report('error',`AI 操作失败：${e.message}`);}
    finally{clearTimeout(timer);active.delete(msg.requestId);publish(ws);}
   };
   tail=tail.then(run,run);
  };
  ws.onclose=()=>{for(const controller of active.values())controller.abort();sessionId=null;report('disconnected','MCP 已断开；已请求取消，重连后检查提交结果');if(!stopped)retry=setTimeout(open,2000);};
  ws.onerror=()=>report('error','本机 MCP 服务连接失败');
 }
 const heartbeat=setInterval(()=>publish(),3000);open();
 return {publish,get sessionId(){return sessionId;},get serverInfo(){return serverInfo;},disconnect(){stopped=true;clearTimeout(retry);clearInterval(heartbeat);for(const c of active.values())c.abort();socket?.close();}};
}

