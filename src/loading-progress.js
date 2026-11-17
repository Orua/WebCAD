export const LOADING_TEXT='准备模型';
const LABELS={prepare:'准备模型',feature:'计算实体',validation:'校验几何','surface-mesh':'生成显示','edge-mesh':'生成显示','display-budget':'生成显示','display-bounds':'生成显示','edge-polylines':'生成显示','snap-points':'校验几何','mass-properties':'精确量测','source-snapshot':'保留精确源','save-snapshot':'准备保存','snapshot-ready':'应用模型',complete:'准备保存',apply:'应用模型',rendered:'显示完成',recovery:'恢复已提交工程'};
export function progressFraction(progress){
  if(!progress||!['feature','surface-mesh','rendered'].includes(progress.phase))return null;
  if(progress.phase==='rendered')return 1;
  const total=Number(progress.total),completed=Number(progress.completed);
  if(!Number.isFinite(total)||!Number.isFinite(completed)||total<=0)return null;
  const reused=progress.phase==='feature'&&progress.pendingOnly!==true?Number(progress.reused)||0:0;
  return Math.min(1,Math.max(0,(completed-reused)/(total-reused)));
}
export function createLoadingTracker(){
  let state=null,value=null,lastAdvanceAt=0,lastSignature=null;
  return {
    reset(){state=null;value=null;lastSignature=null;return null;},
    get value(){return value;},
    get state(){return state;},
    update(progress){
      if(!progress||progress.kind!=='rebuild')return value;
      const signature=JSON.stringify([progress.phase,progress.featureId,progress.completed,progress.total]);if(signature!==lastSignature){lastAdvanceAt=Date.now();lastSignature=signature;}
      const fraction=progressFraction(progress);
      value=progress.phase==='rendered'?1:fraction!==null&&fraction<1?fraction:null;
      const label=LABELS[progress.phase]||progress.label||LOADING_TEXT;
      state={...progress,phaseId:progress.phaseId||progress.phase,label:progress.recovery&&progress.phase!=='recovery'?`恢复已提交工程 · ${label}`:label,fraction,indeterminate:value===null,lastAdvanceAt,updatedAt:Date.now()};return value;
    }
  };
}
