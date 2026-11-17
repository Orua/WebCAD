// Ordinary committed rebuilds (fillet, chamfer, shell, boolean, loft …) get a
// terminating deadline. The soft reminder at localTimeoutMs stays; the hard
// deadline terminates the Worker, rejects with KERNEL_TIMEOUT/not_committed and
// rebuild() restores the last committed document. Rounding postconditions
// (validateRoundingResult) are untouched: a timed-out candidate never commits.
export const REBUILD_HARD_TIMEOUT = Object.freeze({ minimumMs: 180000, multiplier: 3, maximumMs: 900000 });

export function rebuildHardTimeoutMs(localTimeoutMs = 60000) {
  const local = Number.isFinite(localTimeoutMs) && localTimeoutMs > 0 ? localTimeoutMs : 60000;
  return Math.min(REBUILD_HARD_TIMEOUT.maximumMs, Math.max(REBUILD_HARD_TIMEOUT.minimumMs, local * REBUILD_HARD_TIMEOUT.multiplier, local));
}

// Timer plan for one kernel request: soft reminder (never terminates) and an
// optional hard stop that is never extended by progress messages.
export function kernelRequestTimers(type, { localTimeoutMs = 60000, hardTimeoutMs } = {}) {
  if (type === 'ready') return { softMs: null, startMs: 45000, hardMs: null };
  const hardMs = Number.isFinite(hardTimeoutMs) && hardTimeoutMs > 0 ? hardTimeoutMs : null;
  return { softMs: hardMs !== null && hardMs <= localTimeoutMs ? null : localTimeoutMs, startMs: null, hardMs };
}

// Queue waiting, startup and actual execution have separate finite clocks.
// Progress is deliberately absent: no heartbeat can extend a hard deadline.
export function createKernelRequestClock(type,{now=Date.now,schedule=setTimeout,cancel=clearTimeout,queueTimeoutMs=180000,onSoft=()=>{},onStop=()=>{},...options}={}){
  const plan=kernelRequestTimers(type,options),enqueuedAt=now(),timers=new Set();let startedAt=null,finished=false;
  const add=(ms,fn)=>{if(ms!==null&&ms>0){const id=schedule(()=>{timers.delete(id);if(!finished)fn();},ms);timers.add(id);return id;}return null;};
  const finish=()=>{finished=true;for(const id of timers)cancel(id);timers.clear();};
  const stop=(reason,timeoutMs)=>{finish();onStop({reason,timeoutMs,queueMs:(startedAt??now())-enqueuedAt,executionMs:startedAt===null?0:now()-startedAt});};
  const queueTimer=add(plan.startMs??queueTimeoutMs,()=>stop(type==='ready'?'startup':'queue',plan.startMs??queueTimeoutMs));
  return {finish,get state(){return {enqueuedAt,startedAt,queueMs:(startedAt??now())-enqueuedAt,executionMs:startedAt===null?0:now()-startedAt};},started(){
    if(startedAt!==null||finished)return;startedAt=now();
    if(type==='ready')return;cancel(queueTimer);timers.delete(queueTimer);
    add(plan.softMs,()=>onSoft(plan.softMs));add(plan.hardMs,()=>stop('execution',plan.hardMs));
  }};
}
