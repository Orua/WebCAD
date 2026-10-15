// Loading indicator policy: the screen shows only "载入中" plus, when the kernel reports a
// genuine completed/total fraction, a monotonic progress bar. Step names, counts and
// triangle numbers stay in getState().kernelProgress for agents; they are never rendered.
export const LOADING_TEXT='载入中';
const PRIMARY_PHASES=new Set(['feature','surface-mesh']);
export function progressFraction(progress){
  if(!progress||!PRIMARY_PHASES.has(progress.phase))return null;
  const total=Number(progress.total),completed=Number(progress.completed);
  if(!Number.isFinite(total)||!Number.isFinite(completed)||total<=0)return null;
  return Math.min(1,Math.max(0,completed/total));
}
// Multi-feature projects advance by feature; a single imported model advances by meshed faces.
// Once the feature axis is chosen, surface-mesh batches of one feature no longer move the bar.
export function createLoadingTracker(){
  let axis=null,value=null;
  return {
    reset(){axis=null;value=null;return null;},
    get value(){return value;},
    update(progress){
      if(!progress||progress.kind!=='rebuild')return value;
      if(progress.phase==='complete'){if(value!==null)value=1;return value;}
      const fraction=progressFraction(progress);if(fraction===null)return value;
      if(progress.phase==='feature'&&Number(progress.total)>1)axis='feature';
      else if(axis===null&&progress.phase==='surface-mesh')axis='surface-mesh';
      if(progress.phase!==axis)return value;
      value=value===null?fraction:Math.max(value,fraction);
      return value;
    }
  };
}
