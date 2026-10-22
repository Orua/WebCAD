// Page-owned versioning includes selection/readiness without changing geometry.
export function createStateObserver({key,context,subscribe,setTimer=setTimeout,clearTimer=clearTimeout}){
  let last,sequence=0;
  const version=()=>{const next=key();if(next!==last){last=next;sequence++;}return sequence;};
  function watch(callback,{debounceMs=150,intervalMs=50}={}){
    if(typeof callback!=='function')throw Object.assign(Error('watchRevision needs a callback'),{code:'PARAM_SCHEMA_INVALID'});
    if(!Number.isInteger(debounceMs)||debounceMs<0||debounceMs>5000||!Number.isInteger(intervalMs)||intervalMs<10||intervalMs>1000)throw Object.assign(Error('Invalid state observation interval'),{code:'PARAM_RANGE_INVALID'});
    let observed=version(),timer=null,stopped=false;
    const emit=()=>{timer=null;if(!stopped)try{Promise.resolve(callback({stateSeq:version(),context:structuredClone(context())})).catch(()=>{});}catch{}};
    const changed=()=>{const next=version();if(next===observed)return;observed=next;clearTimer(timer);timer=setTimer(emit,debounceMs);};
    const unsubscribe=subscribe?subscribe(changed):(()=>{const interval=setInterval(changed,intervalMs);return ()=>clearInterval(interval);})();
    const stop=()=>{if(stopped)return;stopped=true;clearTimer(timer);unsubscribe();};
    stop.ready=Promise.resolve({status:'subscribed',protocol:'goldenluck.webcad.state/1',stateSeq:version(),context:structuredClone(context())});
    return stop;
  }
  return Object.freeze({version,watch});
}
