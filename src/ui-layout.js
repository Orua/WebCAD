// Declarative workspace configuration: tab order, groups, actions and panel sizes.
// Actions route through UI_API_ROUTES; no eval or geometry logic belongs here.
const tabs = [
  {id:'create',label:'创建',groups:[['快速开始',['quickModel']],['基本实体',['box','cylinder','sphere','cone','torus']],['轮廓',['sketchProfile','sketch','vectorProfile','arcProfile']],['轮廓成型',['profileExtrude','extrude','revolve','sweep','loft']],['插入',['importAtFrame']]]},
  {id:'edit',label:'编辑',groups:[['选择',['selectTool']],['轮廓编辑',['profileOffset','profileRepair']],['变换与复制',['transform','copy','mirror']],['组合',['group','explode']],['阵列',['linearPattern','circularPattern']],['管理',['remove']]]},
  {id:'machine',label:'加工',groups:[['布尔运算',['union','cut','intersect']],['孔与槽',['holeWizard','hole','multiHole','slot','multiPocket','multiBoss']],['面加工',['faceHole','faceExtrude','logo','draftFaces']],['边与过渡',['fillet','chamfer','autoRound','smoothTransition']],['壳与拆分',['shell','split','extractSolid']]]},
  {id:'surface',label:'曲面',groups:[['曲面成型',['curveSweep','advancedLoft','fittedSurface']],['参考提取',['planeSection','faceBoundary','extractFaces','extractShell']],['参考成体',['referenceExtrude','referenceLoft','thickenFace']],['曲面处理',['sewFaces','surfaceTrim']]]},
  {id:'inspect',label:'检查',groups:[['几何检查',['measure','measureRelation','inspectFit','inspectThickness','inspectDraft','section','inspectPrintability']],['结果记录',['screenshot']]],controls:['quality']},
  {id:'view',label:'视图',groups:[],controls:['directions','display','projection','assists','quality']},
];
const controls={
  directions:{label:'标准视角',action:'view',key:'direction',items:[['等轴','iso'],['前视','front'],['后视','back'],['俯视','top'],['仰视','bottom'],['左视','left'],['右视','right']]},
  display:{label:'显示方式',action:'display',key:'mode',setting:'display',items:[['实体','solid'],['实体 + 边线','edges'],['线框','wire']]},
  projection:{label:'投影',action:'projection',key:'mode',setting:'projection',items:[['透视','perspective'],['正交','orthographic']]},
  assists:{label:'显示辅助',items:[['网格','grid'],['几何吸附','snap'],['适合窗口','fit']]},
  quality:{label:'显示精度 · 不改变精确几何',action:'renderQuality',key:'quality',setting:'quality',items:[['草稿','draft'],['标准','standard'],['精细','fine'],['高精','ultra']]},
};
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const UI_LAYOUT=freeze({version:2,defaultTab:'create',panels:{left:232,right:320},tabs,controls,
  icons:{
    new:['M14 2H5v20h14V7Z M14 2v5h5 M8 14h8 M12 10v8'],
    open:['M3 8V5h6l2 3h10l-3 12H3Z M3 10h16'],
    importAtFrame:['M4 3h10l5 5v12H4Z M14 3v5h5 M12 10v7 M9 14l3 3 3-3'],
    save:['M4 3h13l4 4v14H3V3Z M7 3v6h9V3 M7 21v-8h10v8'],
    export:['M14 3h7v7 M21 3l-10 10 M10 4H3v17h17v-8'],
    parameters:['M3 4h18v16H3Z M3 10h18 M9 4v16 M15 10v10'],
    help:['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4 M12 17h.01'],
    displayPreferences:['M4 5h16 M4 12h16 M4 19h16 M8 2v6 M16 9v6 M10 16v6'],
  },
  header:[{action:'save',label:'保存'},{action:'commandSearch',label:'搜索命令'},{action:'help',label:'帮助'},{action:'displayPreferences',label:'设置'}],
  fileMenu:[{action:'new',label:'新建工程'},{action:'open',label:'打开工程或模型'},{action:'importAtFrame',label:'插入模型'},{action:'save',label:'保存工程'},{action:'export',label:'导出模型'},{action:'parameters',label:'命名参数'}],
});
export const TOOL_CATEGORIES=Object.fromEntries(UI_LAYOUT.tabs.map(tab=>[tab.label,tab.groups]));
