import {planarFace, checkShape} from '../../reference-profile-wires.js';
import {buildReferenceExtrude} from '../../reference-profile-extrude.js';
import {buildEdgeBlend} from '../../edge-blend.js';

const dispose = value => { try { value?.delete?.(); } catch {} };
const fail = message => { throw Object.assign(new Error(`牌仔工具：${message}`), {code:'BADGE_INVALID'}); };

// One exact prism and one fillet attempt. Source geometry is borrowed and unchanged.
export function buildBadge(source, params, cad) {
  const {faceId, thicknessMm, side='single', direction=1, radiusMm=0} = params;
  if (!Number.isInteger(faceId) || faceId < 0) fail('请选择当前来源上的一个平面');
  if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) fail('总厚度必须大于 0 mm');
  if (!['single','double'].includes(side) || ![1,-1].includes(direction)) fail('增厚方向无效');
  if (!Number.isFinite(radiusMm) || radiusMm < 0) fail('R 角须为非负毫米数；0 表示自动');
  const faces=source.faces;
  let normal, profile, prism, result;
  try {
    const face=faces[faceId];
    if (!face || !planarFace(face,cad)) fail('只支持有闭合边界的平面；曲面不能作为牌仔基面');
    normal=face.normalAt();
    const axis=normal.toTuple().map(v=>v*direction);
    const shift=side==='double' ? -thicknessMm/2 : 0;
    profile=face.clone().translate(axis.map(v=>v*shift));
    prism=buildReferenceExtrude(profile,{direction:axis,distance:thicknessMm},cad);
    const radius=radiusMm || Math.min(0.2,thicknessMm*0.05);
    if (radius >= thicknessMm/2) fail('R 角必须小于总厚度的一半');
    try { result=buildEdgeBlend(prism,'fillet',{radius,allEdges:true},{suggestRadius:false}); }
    catch(error) { fail(`R${radius} mm 圆角未完成，未生成牌仔。请减小 R 或检查轮廓。${error.message}`); }
    checkShape(result,cad,'牌仔');
    const solids=result.solids;
    try { if(solids.length!==1 || !(cad.measureVolume(result)>0)) fail('结果不是有效的单一实体'); }
    finally { solids.forEach(dispose); }
    result.badgeReport={version:1,sourceFaceId:faceId,thicknessMm,side,direction,
      radiusMode:radiusMm===0?'auto':'manual',radiusMm:radius,
      normal:axis,startOffsetMm:shift,endOffsetMm:shift+thicknessMm,
      edgeScope:'all-sharp-edges-including-holes',roundedEdgeCount:result.blendReport.processedEdgeIds.length};
    const output=result; result=null; return output;
  } finally { [normal,profile,prism,result,...faces].forEach(dispose); }
}
