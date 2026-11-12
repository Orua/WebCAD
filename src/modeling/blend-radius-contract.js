// Shared authorisation boundary for exact radii versus explicit bounded search.
export function validBlendRadius(value){
 if(Number.isFinite(value))return value>0&&value<=10000;
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['maxMm','minMm','stepRatio','maxAttempts'].includes(k))&&Number.isFinite(value.maxMm)&&Number.isFinite(value.minMm)&&value.minMm>0&&value.maxMm>=value.minMm&&value.maxMm<=10000&&(value.stepRatio===undefined||Number.isFinite(value.stepRatio)&&value.stepRatio>0&&value.stepRatio<1)&&(value.maxAttempts===undefined||Number.isInteger(value.maxAttempts)&&value.maxAttempts>=1&&value.maxAttempts<=6);
}
export function validBlendExecution(report,requested){
 if(report?.status!=='applied'||!Number.isFinite(report.radiusUsedMm)||!Number.isInteger(report.attemptCount))return false;
 if(Number.isFinite(requested))return report.radiusUsedMm===requested&&report.requestedRadiusMm===requested&&report.attemptCount===1;
 if(!validBlendRadius(requested)||report.radiusUsedMm<requested.minMm||report.radiusUsedMm>requested.maxMm||report.attemptCount<1||report.attemptCount>(requested.maxAttempts??6)||!Array.isArray(report.tried)||report.tried.length!==report.attemptCount)return false;
 if(JSON.stringify(Object.keys(report.requestedRadiusMm??{}).sort().map(k=>[k,report.requestedRadiusMm[k]]))!==JSON.stringify(Object.keys(requested).sort().map(k=>[k,requested[k]])))return false;
 return report.tried.every((r,i)=>Number.isFinite(r.radiusMm)&&r.radiusMm>=requested.minMm&&r.radiusMm<=requested.maxMm&&(i===0?r.radiusMm===requested.maxMm:r.radiusMm<report.tried[i-1].radiusMm)&&r.ok===(i===report.tried.length-1))&&report.tried.at(-1).radiusMm===report.radiusUsedMm;
}
