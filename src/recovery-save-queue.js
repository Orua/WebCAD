// Coalesce committed checkpoints outside geometry acknowledgements and display batches.
export function createRecoverySaveQueue({capture,write,blocked=()=>false,delayMs=200,schedule=setTimeout,cancel=clearTimeout,onError=()=>{}}){
 let timer=null,pending=false,running=null;
 function resume(){if(pending&&timer===null&&!running&&!blocked())timer=schedule(()=>{timer=null;void drain();},delayMs);}
 async function drain(force=false){
  if(timer!==null){cancel(timer);timer=null;}
  if(running){await running;if(pending&&force)return drain(true);return;}
  if(!pending||(!force&&blocked()))return;
  pending=false;
  // Capture the latest committed object only once; IndexedDB performs the one required clone.
  const snapshot=capture();
  running=Promise.resolve().then(()=>write(snapshot)).catch(onError);
  try{await running;}finally{running=null;resume();}
 }
 return {request(){pending=true;resume();},resume,flush:()=>drain(true)};
}
