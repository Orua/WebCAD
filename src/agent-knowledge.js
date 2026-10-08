// Static task routes complement the generated exact UI-action routes.
// No current document, selection or topology belongs in this library.
export const AGENT_KNOWLEDGE = Object.freeze({
  version:1,manifestUrl:'automation/agent-knowledge.json',routingUrl:'automation/agent-routing.json',
  policy:'required-on-first-handshake',cache:'source-base-url + catalogHash + docsHash',
  contextPolicy:'download-to-host-storage; load only selected routes, docs and complete cards',
  unavailableHostAction:'report-storage-or-download-limitation; never claim a local cache was created',
  bootstrapDocIds:['api.knowledge-cache','api.connection','api.workflow','api.run','api.reconstruction'],
});
export const KNOWLEDGE_ROUTES = [
  {id:'product-understanding',title:'陌生产品结构与配件识别',keywords:['陌生图','结构特点','配件特点','品类','奶嘴钉','撞钉','鸡眼','狗扣','弹弓圈','拉心扣','针扣','拱桥','磁钮','急钮','车缝钮','拧制','拍锁','插锁','匙圈','手挽扣','介子','索绳扣','尾夹','拉头','梯扣','梯形扣','吊钟','哑铃','牌仔','拉牌','链'],docs:['api.product-source','api.reconstruction'],tools:['inspectProfile','planeSection','inspectFit'],note:'Use host planSource with evidence; type names do not establish section, dimensions or a complete product.'},
  {id:'source-reconstruction',title:'源图理解与重建',keywords:['DWG','DXF','三视图','图纸','复刻','重建','source drawing','reconstruction'],docs:['api.reconstruction','api.feature-plan','api.vector-import','api.design-checks'],tools:['readVector','connectVector','curveSweep','advancedLoft','inspectDesign','feature.addMany']},
  {id:'templates',title:'常用参数形状',keywords:['快捷模型','模板','D扣','方扣','圆环','template','quick model'],docs:['api.workflow'],tools:['template.dBuckle','template.rectBuckle','template.ring','template.sliderBuckle','template.flatFrame'],toolLookup:'Select the exact template.* card matching the requested section/path; use live search for other templates. Do not load the quickModel master catalog to inspect one template.'},
  {id:'profiles',title:'轮廓与截面',keywords:['轮廓','截面','扫掠','放样','约束','profile','section','sweep','loft'],docs:['api.vector-import','api.mechanical','api.references','api.feature-plan'],tools:['sketchProfile','profileSweep','profileLoft','curveSweep','inspectProfile','inspectConstraints','planeSection']},
  {id:'machining',title:'孔槽与实体加工',keywords:['孔','槽','螺纹','加工','钻孔','hole','slot','thread'],docs:['api.mechanical'],tools:['holeWizard','multiHole','multiPocket','thread']},
  {id:'rounding',title:'圆角及端部圆润',keywords:['圆角','圆润','倒角','R角','相邻边','fillet','chamfer','rounding'],docs:['api.smooth-transition','api.workflow'],tools:['round','fillet','rounding','roundEnd','chamfer'],note:'Distinguish outline/section radii from a 3D blend and end reconstruction. Re-query current topology. A requested radius must not be silently reduced.'},
  {id:'logo-relief',title:'Logo与浮雕',keywords:['LOGO','凹字','凸字','刻字','浮雕','图案','engrave','relief'],docs:['api.logo','api.relief','api.vector-import'],tools:['logo','curvedLogo','relief','readRelief'],note:'Machined engraving and stamped back-side protrusion are different geometry. Use original closed glyph regions and retained holes; photographs are not measured height maps.'},
  {id:'inspection',title:'尺寸、材料与配合',keywords:['核对','验收','材料','漏接','镂空','干涉','壁厚','间隙','测量','inspect','verify','measure'],docs:['api.design-checks','api.reconstruction'],tools:['inspectDesign','measure','inspectThickness','inspectFit','measureRelation','planeSection']},
  {id:'editing',title:'定位与历史编辑',keywords:['移动','旋转','位置','定位','历史','撤销','对齐','move','rotate','history','align'],docs:['api.editor','api.references'],tools:['transform','body.align','getHistory','feature.edit','history.undo']},
  {id:'files',title:'工程和文件交付',keywords:['保存','导出','打开','STP','STEP','文件','save','export','open'],docs:['recipe.file-workflow','api.file-errors'],tools:['files.capabilities','files.register','files.open','files.save','files.export','files.read','files.write']},
];

export const KNOWLEDGE_GUIDANCE = `首次握手本地知识库与路由
connect().onboarding.knowledge.policy=required-on-first-handshake。Agent首次连接当前WebCAD来源后，下载automation/agent-knowledge.json，再下载清单内index.json、agent-routing.json、routes.json到宿主存储；逐文件验证SHA-256和字节数。只把轻量路由及命中的完整文档/工具卡送进模型上下文，不打印1–2MiB全库。没有宿主下载或存储能力时报告具体限制，不假称已下载，也不为此安装后台服务。
缓存按当前页面base URL、catalogHash、docsHash隔离。重连时哈希匹配且本地文件验证成功就复用；变更、缺文件或损坏时更新完整包。调用仍读新鲜context，静态库不包含活文档、当前实体编号或拓扑快照。静态库里的示例编号不是当前ID。
两级路由：agent-routing.json按任务命中源图重建、模板、轮廓、加工、圆角、Logo/浮雕、检查、编辑、文件；routes.json按精确UI动作找公共接口。任务先读工作流→选工具→取完整卡→按需专题。template.*单模板优先，避免读取quickModel总目录。未命中用实时searchTools；当前页面哈希与工具契约优先。
可选Node宿主helper（不是网页运行依赖）：createPageClient({send:宿主授权CDP适配器,knowledge:{baseUrl:目标页URL,directory:宿主缓存目录}})。connect自动下载/验证，返回knowledgeStatus:{status:ready,cacheHit,directory,downloadedFiles}；已有匹配缓存不发下载请求。未配置knowledge时返回download_required，helper.run在知识包准备前拒绝执行。其他宿主按相同清单实现存储适配。页面不能证明远端Agent已经写盘，不能把handshake描述符当成下载回执。
await client.route('DWG图纸重建')返回匹配路由和需要的doc/tool IDs；await client.readLocal({docIds:['api.reconstruction'],toolIds:['inspectDesign']})仅取这两项。默认字符预算32000，不能容纳的整项返回omitted/CHAR_BUDGET，不截断schema；调用方缩小本次读取范围。下载不自动安装技能；安装包仍由宿主选择并执行。`;
