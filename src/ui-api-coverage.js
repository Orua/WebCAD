import { listOperations } from './operation-registry.js';

// This is the UI-to-public-API inventory, also used by the UI and build gate.
export const UI_API_ROUTES = Object.freeze({
  ...Object.fromEntries(listOperations().map(c=>[c.id,{tools:[c.id],method:'execute',usage:'feature.add；按工具卡传显式 params/refs，或 run 的 add。'}])),
  multiPocket:{tools:['multiPocket'],method:'execute',usage:'getTool({id:"multiPocket"}) 读取 strict v2 卡；feature.add 或 run add 传 depth/axis/direction/pockets、真实 refs；feature.edit 修改历史凹槽列表。'},
  multiBoss:{tools:['multiBoss'],method:'execute',usage:'getTool({id:"multiBoss"}) 读取 strict v2 卡；feature.add 或 run add 传 radius/height/axis/direction/points 与真实 refs；feature.edit 修改历史凸台。'},
    displayPreferences:{tools:['setDisplayPreferences','getLogoConverter','setLogoConverter'],method:'setDisplayPreferences',usage:'显示设置用 setDisplayPreferences；LOGO 转换配置用 getLogoConverter/setLogoConverter，URL/Key 保存在当前浏览器。'},
  remove:{tools:['feature.remove'],method:'execute',usage:'args:{bodyIds}；删除当前实体。'},
  import:{tools:['files.import'],method:'files.import',usage:'先 files.register 登记真实字节；不模拟文件选择器。'},
  new:{tools:['files.new'],method:'files.new'},open:{tools:['files.open','files.import'],method:'files.open'},
  save:{tools:['files.save','files.download','files.write'],method:'files.save'},export:{tools:['files.export'],method:'files.export'},
  rename:{tools:['document.rename'],method:'execute'},editFeature:{tools:['feature.edit','feature.rename'],method:'execute'},
  visibility:{tools:['body.visibility'],method:'execute'},explode:{tools:['body.explode'],method:'execute'},
  perPartMetal:{tools:['body.appearance'],method:'execute'},bodyColor:{tools:['body.appearance'],method:'execute'},metalFinish:{tools:['document.appearance'],method:'execute'},
  parameters:{tools:['document.parameters'],method:'execute'},undo:{tools:['history.undo'],method:'execute'},redo:{tools:['history.redo'],method:'execute'},
  preview:{tools:['preview.start','convertLogoPdf'],method:'execute',usage:'PDF 字节可用 convertLogoPdf 取得待复核 regions，再用 preview.start 放置。'},commitPreview:{tools:['preview.commit'],method:'execute'},cancelPreview:{tools:['preview.cancel'],method:'execute'},
  sketch:{tools:['extrude'],method:'execute',usage:'传 profile/points/plane 等显式轮廓参数；不需要模拟逐点点击。'},
  measure:{tools:['measure','queryGeometry'],method:'measure',usage:'实体/面/边精确测量；两点距离用 points:[XYZ,XYZ]，来源标为输入坐标。'},
  inspectPrintability:{tools:['inspectPrintability'],method:'inspectPrintability',usage:'选定当前 bodyId 与 angleLimitDeg；返回网格悬垂事实和六个摆放方向，不判定工艺合格。'},
  textCommand:{tools:['executeText'],method:'executeText',usage:'仅解析白名单文本命令，编译为当前页面 run 事务；dryRun 可先读回实际步骤。'},
  fitProfile:{tools:['fitProfile'],method:'fitProfile',usage:'输入有序的二维截面点，返回圆或直线的数值拟合参数及残差；不修改工程。'},
  screenshot:{tools:['capture','files.export'],method:'capture'},
  ...Object.fromEntries(['fit','view','display','projection','grid','snap','section','selectMode','selection','selectTool','gizmo','gizmoTranslate','gizmoRotate','gizmoOff','camera','language'].map(id=>[id,{tools:['setView'],method:'setView',usage:'通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。'}])),
  help:{tools:['readDocs'],method:'readDocs'},mcp:{tools:['run'],method:'run',usage:'JSON 面板只是同一 api.run 的界面入口。'},
});
export function requireUIRoute(action){
  if(!Object.hasOwn(UI_API_ROUTES,action))throw new Error(`UI action ${action} requires a public AI interface and documentation before release`);
  return UI_API_ROUTES[action];
}
