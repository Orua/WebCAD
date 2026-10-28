/** Machine-readable body size for Services HTTP errors. Agents should read bodyClass, not guess from bytes. */
export function servicesBodyClass(bytes){
 const n=Math.max(0,Number(bytes)||0);
 if(n>=4*1024*1024)return 'xl';
 if(n>=1024*1024)return 'large';
 if(n>=64*1024)return 'medium';
 return 'small';
}
const BODY_LABEL={small:'小',medium:'中',large:'大（≥1 MiB）',xl:'超大（≥4 MiB）'};
const PHASE_LABEL={submit:'提交作业',poll:'查询作业',upload:'上传',capabilities:'读取能力',result:'下载结果',artifact:'下载产物',cancel:'停止作业',recover:'恢复作业',request:'请求'};

/**
 * One Chinese sentence an agent can act on. Built only from structured fields
 * (code, operation, idempotency key, elapsed/timeout, body class). The raw
 * transport message is not copied, so paths and credentials never leak in.
 * Includes the underlying SERVICES_* code and tells the caller to query
 * getServicesRequest before any retry.
 */
export function formatServicesTransportFailure(error={}){
 const code=String(error.code||'SERVICES_CONNECTION_UNKNOWN');
 const details=error.details&&typeof error.details==='object'?error.details:{};
 const phase=error.phase||details.phase||'request';
 const operation=error.operation||details.operation;
 const key=error.idempotencyKey||error.requestKey||details.idempotencyKey||details.requestKey;
 const elapsed=Number.isFinite(error.elapsedMs)?error.elapsedMs:details.elapsedMs;
 const timeout=Number.isFinite(error.timeoutMs)?error.timeoutMs:details.timeoutMs;
 const bodyClass=error.bodyClass||details.bodyClass;
 const bytes=Number.isFinite(error.bodyBytes)?error.bodyBytes:details.bodyBytes;
 const parts=[`原任务的执行或提交结果尚未确认（${code}）。${PHASE_LABEL[phase]||'请求'}超时或连接中断。`];
 if(operation)parts.push(`操作：${operation}。`);
 if(key)parts.push(`请求键：${key}。`);
 if(Number.isFinite(elapsed)||Number.isFinite(timeout))parts.push(`已等待 ${Number.isFinite(elapsed)?Math.round(elapsed):'未知'} ms，时限 ${Number.isFinite(timeout)?Math.round(timeout):'未知'} ms。`);
 if(bodyClass)parts.push(`请求体${BODY_LABEL[bodyClass]||bodyClass}${Number.isFinite(bytes)?`，${Math.round(bytes)} 字节`:''}。`);
 parts.push(key?'请先用 getServicesRequest 查询该请求键，确认原任务是否已受理；勿盲目重算，勿更换幂等键。':'请先用 getServicesRequest 查询原请求键，确认原任务是否已受理；勿盲目重算，勿更换幂等键。');
 return parts.join('');
}
