// Translate bounded validator diagnostics, never arbitrary worker messages or values.
const labels={depth:'深度',depthMm:'深度',scale:'比例',angle:'旋转角度',offsetX:'水平偏移',offsetY:'垂直偏移',point:'放置点坐标',faceId:'目标面',sizeMm:'尺寸',name:'名称',source:'来源记录',regions:'图案区域',placementVersion:'定位版本',mode:'加工方式',projectionMode:'加工范围',draftAngle:'脱模斜度',mirrorX:'镜像设置'};
function fieldName(path){
 if(typeof path!=='string'||path.length>220||!/^params(?:\.(?:[A-Za-z_][A-Za-z_0-9]{0,39}|\d{1,7}))*$/.test(path)||/(?:password|secret|token|cookie|authorization|api_?key)/i.test(path))return null;
 const keys=path.split('.').slice(1);if(!keys.length)return '参数';
 let label=labels[keys[0]]||'参数字段';
 if(keys[0]==='regions'&&/^\d+$/.test(keys[1]||'')){
  label=`第 ${Number(keys[1])+1} 个图案区域`;
  if(keys[2]==='outer')label+='的外轮廓';
  if(keys[2]==='holes'&&/^\d+$/.test(keys[3]||''))label+=`的第 ${Number(keys[3])+1} 个孔洞`;
  const index=keys[2]==='outer'?3:keys[2]==='holes'?4:-1;
  if(index>=0&&/^\d+$/.test(keys[index]||'')){label+=`，第 ${Number(keys[index])+1} 个节点`;if(['0','1'].includes(keys[index+1]))label+=keys[index+1]==='0'?' X 坐标':' Y 坐标';}
 }else if(keys[0]==='point'&&['0','1','2'].includes(keys[1]))label+=` ${['X','Y','Z'][Number(keys[1])]}`;
 return `${label}（${path}）`;
}
export function parameterErrorMessage(error={}){
 if(!['PARAM_SCHEMA_INVALID','PARAM_RANGE_INVALID','TYPE_MISMATCH','INVALID_INPUT','HEIGHTFIELD_INVALID'].includes(error.code))return null;
 const field=fieldName(error.path);if(!field)return null;
 const message=String(error.message||''),types={number:'数值',integer:'整数',array:'数组',object:'对象',string:'文字',boolean:'是或否',null:'空值'};
 let reason={
  'A finite number is required.':'必须是有效的有限数值，不能是 NaN 或无穷大。',
  'A finite JSON value is required.':'含有未填写或不能提交的数据，这是程序提交数据的问题。',
  'A plain JSON object is required.':'必须是普通数据对象。',
  'Required field is missing.':'缺少必填内容。',
  'Unknown field.':'当前工具不接受这个字段，这是程序提交字段的问题。',
  'Value is not in the allowed enumeration.':'不是当前工具支持的选项。',
  'Value does not match the required constant.':'与当前工具要求的固定值不一致。',
  'String does not match the required pattern.':'格式不正确。',
  'Duplicate items are not accepted.':'存在重复项。',
  'Sparse arrays are not supported.':'存在缺失的数据项。',
  'Symbol fields are not supported.':'含有不能提交的内部字段。',
  'This value is not accepted.':'当前工具不接受此值。',
  'Value does not meet all required conditions.':'未满足此字段的组合条件。',
  'Value does not meet a required alternative.':'未匹配此字段支持的格式。',
  'Exactly one alternative is required.':'必须且只能选择一种参数格式。',
  'This combination is not accepted.':'这些参数不能同时使用。',
 }[message];
 let match;
 if((match=/^Expected (number|integer|array|object|string|boolean|null)\.$/.exec(message)))reason=`必须是${types[match[1]]}。`;
 const number='(-?\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)';
 for(const [prefix,text]of [['Minimum is ','必须大于或等于'],['Maximum is ','必须小于或等于'],['Must exceed ','必须大于'],['Must be less than ','必须小于']])if((match=new RegExp('^'+prefix+number+'\\.$','i').exec(message)))reason=`${text} ${match[1]}。`;
 for(const [pattern,text]of [[/^At most (\d+) items are accepted\.$/,'最多允许'],[/^At least (\d+) items are required\.$/,'至少需要']])if((match=pattern.exec(message))){const count=error.details?.validation?.actualCount;reason=`${text} ${match[1]} 项${Number.isSafeInteger(count)&&count>=0?`，当前为 ${count} 项`:''}。`;}
 for(const [pattern,text]of [[/^Minimum length is (\d+)\.$/,'文字长度至少为'],[/^Maximum length is (\d+)\.$/,'文字长度最多为']])if((match=pattern.exec(message)))reason=`${text} ${match[1]} 个字符。`;
 return reason?`${field}：${reason}`:null;
}
