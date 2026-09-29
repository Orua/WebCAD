// Declarative workspace configuration: tab order, groups, actions and panel sizes.
// Actions route through UI_API_ROUTES; no eval or geometry logic belongs here.
import {ACTION_ICONS} from './action-icons.js';
const tabs = [
  {id:'edit',label:'编辑',unfolded:true,groups:[['选择',['selectTool']],['复制粘贴',['copySelection','pasteSelection']],['变换',['moveTool','rotateTool','copy','mirror']],['组合与拆分',['group','explode','extractSolid']],['管理',['remove']]]},
  {id:'path',label:'路径',unfolded:true,groups:[['导入与绘制',['vectorImport','sketchProfile','vectorProfile','helix']],['编辑曲线',['pathEdit','pathFillet','pathTrim','pathExtend','pathTrimCircle']],['闭合与尺寸',['profileRepair','profileConstraints','profileOffset']],['提取路径',['faceBoundary','planeSection']]]},
  {id:'create',label:'创建',groups:[['路径成型',['profileExtrude','sweep','revolve','loft'],{unfolded:true}],['直接成型',['sketch','arcProfile','extrude','coil']],['高级成型',['referenceExtrude','curveSweep','referenceLoft','advancedLoft']]]},
  {id:'model',label:'模型库',unfolded:true,groups:[['基本实体',['box','cylinder','cone','sphere','torus']],['常用模型',['quickModelFavorites']],['参数模型',['quickModel']],['导入模型',['importAtFrame']]]},
  {id:'machine',label:'加工',groups:[['布尔与切分',['union','cut','intersect','split'],{unfolded:true}],['孔与螺纹',['hole','holeWizard','multiHole','thread']],['槽与凸台',['slot','faceGroove','faceHole','faceExtrude','multiPocket','multiBoss'],{overflowActions:['multiPocket','multiBoss']}],['车削',['outerTurn','innerTurn']],['标记',['logo']]]},
  {id:'surface',label:'曲面',groups:[['提取面与壳',['extractFaces','extractShell']],['曲面生成',['fittedSurface']],['曲面处理',['surfaceTrim','offsetSurface','sewFaces']],['增厚成体',['thickenFace']]]},
  {id:'finish',label:'修饰',groups:[['圆角与过渡',['rounding','fillet','chamfer','autoRound','smoothTransition'],{unfolded:true}],['壳与偏置',['shell','offsetSolid']],['拔模',['draftFaces','draftByPlane']]]},
  {id:'inspect',label:'检查',groups:[['测量',['measure','measureRelation']],['几何检查',['inspectThickness','inspectFit','inspectDraft','inspectPrintability']],['结果记录',['screenshot']]]},
  {id:'view',label:'视图',groups:[['剖切查看',['section']]],controls:['directions','projection','display','assists','quality']},
  {id:'settings',label:'设置',groups:[['交互',['precisionSettings','snapSettings']],['外观',['themeSettings','displayPreferences','languageSettings']],['工程',['parameters']],['导入设置',['logoConverterSettings']],['AGENT',['agentGuide']]]},
];
const controls={
  directions:{label:'标准视角',action:'view',key:'direction',items:[['等轴','iso'],['前视','front'],['后视','back'],['俯视','top'],['仰视','bottom'],['左视','left'],['右视','right']]},
  display:{label:'显示方式',action:'display',key:'mode',setting:'display',items:[['实体','solid'],['实体 + 边线','edges'],['透视 + 边线','transparentEdges'],['线框','wire']]},
  projection:{label:'投影',action:'projection',key:'mode',setting:'projection',items:[['透视','perspective'],['正交','orthographic']]},
  assists:{label:'显示辅助',items:[['网格','grid'],['几何吸附','snap'],['适合窗口','fit']]},
  quality:{label:'显示精度 · 不改变精确几何',action:'renderQuality',key:'quality',setting:'quality',items:[['草稿','draft'],['标准','standard'],['精细','fine'],['高精','ultra']]},
};
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const UI_LAYOUT=freeze({version:4,defaultTab:'create',panels:{left:232,right:320},shortLabels:{pathEdit:'编辑路径',pathTrim:'修剪',pathExtend:'延伸',pathFillet:'二维圆角',pathTrimCircle:'整圆裁剪',vectorImport:'矢量取线成面',themeSettings:'风格',precisionSettings:'精度',snapSettings:'吸附',displayPreferences:'渲染设置',logoConverterSettings:'LOGO转化',languageSettings:'语言',parameters:'参数',agentGuide:'AGENT',revolve:'旋转成型',sketchProfile:'轮廓',sketch:'草图拉伸',arcProfile:'线弧拉伸',profileOffset:'等距偏移',profileRepair:'轮廓修复',profileExtrude:'轮廓加工',multiHole:'多点打孔',multiPocket:'批量凹槽',multiBoss:'批量凸台',smoothTransition:'平滑过渡',autoRound:'整件圆边',draftFaces:'拔模',measureRelation:'关系测量',inspectFit:'干涉间隙',inspectThickness:'壁厚',inspectDraft:'拔模检查',inspectPrintability:'成型检查',planeSection:'提取截面',faceBoundary:'提取边界',referenceExtrude:'轮廓拉伸',referenceLoft:'截面放样',advancedLoft:'高级放样',fittedSurface:'拟合曲面',extractFaces:'提取面',surfaceTrim:'曲面修剪',transparentEdges:'透视边线',edges:'实体边线'},ribbon:{visibleActions:3,minOverflow:2,overflowLabel:'更多 ▾',overflowMenuWidth:210},tabs,controls,
  viewportActions:[{action:'gizmoRotate',label:'鼠标旋转'},{action:'gizmoTranslate',label:'鼠标移动'}],
  icons:{
    ...ACTION_ICONS,rounding:ACTION_ICONS.fillet,logoConverterSettings:ACTION_ICONS.logo,precisionSettings:ACTION_ICONS.measure,
    helix:ACTION_ICONS.curveSweep,coil:ACTION_ICONS.curveSweep,thread:ACTION_ICONS.holeWizard,offsetSolid:ACTION_ICONS.box,offsetSurface:ACTION_ICONS.thickenFace,draftByPlane:ACTION_ICONS.draftFaces,profileConstraints:ACTION_ICONS.measure,
    moveTool:ACTION_ICONS.gizmoTranslate,rotateTool:ACTION_ICONS.gizmoRotate,
    copySelection:ACTION_ICONS.copy,pasteSelection:['M9 4H5v18h14V4h-4 M9 2h6v5H9Z M8 11h8 M8 15h8'],
    themeSettings:['M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c-1-4-5-6-9-6 M7 8h.1 M12 6h.1 M17 8h.1 M6 13h.1'],
    snapSettings:['M5 3v10a7 7 0 0 0 14 0V3h-4v10a3 3 0 0 1-6 0V3Z M5 7h4 M15 7h4'],
    languageSettings:['M3 5h12 M9 2v3 M5 5c0 6 7 10 7 10 M13 5c0 6-7 10-10 10 M13 21l4-10 4 10 M15 17h4'],
    agentGuide:['M5 7h14v12H5Z M12 2v5 M9 11h.1 M15 11h.1 M8 15h8 M2 10v6 M22 10v6'],
    new:['M14 2H5v20h14V7Z M14 2v5h5 M8 14h8 M12 10v8'],
    open:['M3 8V5h6l2 3h10l-3 12H3Z M3 10h16'],
    importAtFrame:['M4 3h10l5 5v12H4Z M14 3v5h5 M12 10v7 M9 14l3 3 3-3'],
    save:['M4 3h13l4 4v14H3V3Z M7 3v6h9V3 M7 21v-8h10v8'],
    export:['M14 3h7v7 M21 3l-10 10 M10 4H3v17h17v-8'],
    parameters:['M3 4h18v16H3Z M3 10h18 M9 4v16 M15 10v10'],
    help:['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4 M12 17h.01'],
    displayPreferences:['M4 5h16 M4 12h16 M4 19h16 M8 2v6 M16 9v6 M10 16v6'],
  },
  header:[{action:'save',label:'保存'},{action:'commandSearch',label:'搜索命令'},{action:'help',label:'帮助'}],
  fileMenu:[{action:'new',label:'新建工程'},{action:'open',label:'打开工程或模型'},{action:'importAtFrame',label:'插入模型'},{action:'save',label:'保存工程'},{action:'export',label:'导出模型'}],
});
export const TOOL_CATEGORIES=Object.fromEntries(UI_LAYOUT.tabs.map(tab=>[tab.label,tab.groups]));
