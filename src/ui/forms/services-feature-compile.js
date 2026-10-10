import {getServicesConfig} from '../../services/settings.js';
import {servicesClient} from '../../services/client.js';
import {assertCompilableFeature,compiledSemanticVersion} from '../../services/geometry-exchange.js';
export function showServicesFeatureCompile({feature,getState,openDialog,element,button,onCompile,prepareUpgrade,applyUpgrade,close}){
 const dialog=openDialog('Services 精确计算'),status=element('p',{class:'property-footnote'}),consent=element('input',{type:'checkbox','aria-label':'允许上传此特征来源与精确刀具'}),state=getState(),snapshot=JSON.stringify(state.document.features.find(f=>f.id===feature.id));let allowed=false;
 const row=element('label',{class:'form-field'},'允许将此特征的来源和精确刀具上传到已配置的 Services');row.append(consent);
 dialog.append(element('p',{class:'property-footnote'},'计算结果安装到原历史特征，保留参数和依赖。未知任务先核对，不会自动重复计算。'),row,status);
 if(feature.op==='relief'&&prepareUpgrade&&applyUpgrade){
  const strategy=element('select',{'aria-label':'升级后的遮罩策略'}),diff=element('pre',{class:'property-footnote'});let candidate=null;
  strategy.append(element('option',{value:''},'明确选择遮罩策略'),element('option',{value:'faceWithHolesExtrude'},'带孔面挤出'),element('option',{value:'cutHoleSolids'},'孔实体切除'));strategy.value=feature.params.maskStrategy??'';
  const upgrade=button('应用轮廓保护升级',async()=>{if(!candidate?.canCommit)return;upgrade.disabled=true;try{await applyUpgrade(candidate);close();}catch(error){diff.textContent=error.message;}},'secondary');upgrade.disabled=true;
  const preview=button('预览轮廓保护升级',async()=>{candidate=null;upgrade.disabled=true;try{candidate=await prepareUpgrade(feature.id,strategy.value||undefined);if(candidate.status!=='prepared')throw new Error(candidate.error?.message??'升级预览失败');diff.textContent=JSON.stringify({changes:candidate.receipt.changes,before:candidate.receipt.before,after:candidate.receipt.after,toleranceMm:candidate.receipt.toleranceMm,sourceSplineDeviation:'unknown',designPreserved:candidate.receipt.designPreserved,geometryComputed:false,commitState:'notCommitted',blockers:candidate.blockers},null,2);upgrade.disabled=!candidate.canCommit||!candidate.receipt.requiresExplicitApply;}catch(error){diff.textContent=error.message;}},'secondary');
  strategy.addEventListener('change',()=>{candidate=null;upgrade.disabled=true;diff.textContent='策略已改变，请重新预览。';});
  dialog.append(element('p',{class:'property-footnote'},'轮廓保护升级只改拟合保护和明确的遮罩策略；尺寸、公差、孔与层高保持。旧参数在本地默认孔实体切除，在 Services 默认带孔面挤出。应用会按当前计算设置重建；这项升级不保证旧布尔失败已解决。'),strategy,preview,diff,upgrade);
 }
 const apply=button('计算并应用',async()=>{if(!allowed||!consent.checked)return;apply.disabled=true;try{if(snapshot!==JSON.stringify(getState().document.features.find(f=>f.id===feature.id)))throw Object.assign(new Error('特征已改变，请重新打开计算确认'),{code:'REVISION_CONFLICT'});await onCompile(feature.id);close();}catch(error){status.textContent=error.message;}finally{apply.disabled=!allowed||!consent.checked;}},'primary');apply.disabled=true;consent.addEventListener('change',()=>{apply.disabled=!allowed||!consent.checked;});dialog.append(apply,button('关闭',close,'secondary'));
 void (async()=>{try{assertCompilableFeature(feature);const config=getServicesConfig();if(!config.configured||!config.hasCredential)throw new Error('请先在唯一 Services 设置中配置服务地址和本会话授权');status.textContent='正在读取已配置服务能力…';const caps=await servicesClient.capabilities(),semantic=compiledSemanticVersion(feature);if(!caps.operations.some(c=>c.operation===feature.op&&c.semanticVersion===semantic&&c.enabled&&['passed','bridge-passed-project-gates-pending'].includes(c.acceptanceStatus)))throw new Error('当前服务不支持此特征的精确语义版本');allowed=true;status.textContent='能力匹配；请确认上传后计算。连续肩部及未支持的复杂构造不会被当成已完成。';apply.disabled=!consent.checked;}catch(error){status.textContent=error.message;}})();
 return dialog;
}
