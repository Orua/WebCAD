# WebCAD 页面 API 索引

API 1.3.1 · 操作目录 sha256:85e1d03e3fda76a41901ccabf0f9c05a250d5aa326cc6243449e4a91b82aecce

入口：`window.webcad.api.connect({queries:[能力关键词]})`，再批量 `getTools`。完整目录供按需查阅，页面 JS 执行取决于获授权的客户端能力。

长度 mm、角度 degrees、体积 mm³。严格契约：box、hole、multiHole、multiPocket、multiBoss、faceHole、fillet、chamfer、shell、smoothTransition、autoRound、extractFaces、extractShell；其余操作为 advisory。

## 页面方法

- `connect`
- `info`
- `getState`
- `searchTools`
- `getTools`
- `getTool`
- `readDocs`
- `queryGeometry`
- `execute`
- `measure`
- `inspectPrintability`
- `fitProfile`
- `traceTwinWindow`
- `executeText`
- `setDisplayPreferences`
- `getLogoConverter`
- `setLogoConverter`
- `convertLogoPdf`
- `setView`
- `redraw`
- `capture`
- `run`

## 文件方法

- `files.capabilities`
- `files.register`
- `files.new`
- `files.open`
- `files.import`
- `files.save`
- `files.export`
- `files.read`
- `files.download`
- `files.write`
- `files.release`

## 工具目录

- `advancedLoft` · advisory · Solid or open shell through hand-defined XY sections
- `arcProfile` · advisory · Extrude exact closed XY LINE/ARC boundaries with optional holes
- `autoRound` · migrated · 整件圆边 / Round every sharp edge of one solid
- `box` · migrated · Box from [0,0,0] to [width,depth,height]
- `chamfer` · migrated · Chamfer selected edges, face boundaries, or all body edges
- `circularPattern` · advisory · Rotated copies as one compound
- `cone` · advisory · Cone/frustum along +Z
- `copy` · advisory · Copy with scale, rotation and translation
- `curveSweep` · advisory · Sweep a round, chamfered-square or elliptical section along an arc, approximated spline or connected line/arc segments
- `curvedLogo` · advisory · Legacy curved LOGO operation retained for historical project compatibility; use unified logo placementVersion 2 for new work
- `cut` · advisory · Subtract other bodies from first
- `cylinder` · advisory · Cylinder on +Z from origin
- `extractFaces` · migrated · 先在一个实体上选择一个或多个面。faceIds 是该实体当前拓扑快照中的零起始面编号，必须非空、整数、互不重复且在范围内。单面返回保留孔环的面副本；多面返回由面副本组成的复合体。保留原对象，不缝合、不补洞、不生成实体。
- `extractShell` · migrated · 先选中包含多个壳的对象。shellIndex 是当前对象壳拓扑顺序中的零起始索引，必须是范围内整数。提取选中壳的副本并保留原对象，不自动填成实体；闭壳可单独交给曲面缝合并要求生成实体。
- `extractSolid` · advisory · Extract one solid from a compound
- `extrude` · advisory · Extrude a closed profile normal to the chosen plane
- `faceBoundary` · advisory · 先选中一张面。all 提取包括内孔在内的全部边界；outer 明确只提取外环，不带孔。保留源模型，生成精确线框。单闭环可接参考轮廓拉伸/放样；带孔拉伸应使用完整平面面，不能把忽略内孔的外环当成原件。
- `faceExtrude` · advisory · Push/pull a planar face along its normal
- `faceHole` · migrated · Drill inward from a planar face
- `fillet` · migrated · Round selected edges, all boundary edges of selected faces, or all body edges
- `fittedSurface` · advisory · Fit a single B-spline face to a structured point grid
- `group` · advisory · Group bodies as a compound without fusing
- `hole` · migrated · Cylindrical cut starting at global coordinates
- `intersect` · advisory · Common volume of bodies
- `linearPattern` · advisory · Linear copies as one compound
- `loft` · advisory · Ruled loft between parallel XY profiles
- `logo` · advisory · Unified reviewed LOGO on one exact face; legacy entries remain planar
- `mirror` · advisory · Mirror across a global origin plane
- `multiBoss` · migrated · Fuse multiple exact solid cylindrical bosses onto one body
- `multiHole` · migrated · Cut cylindrical holes sequentially at multiple global start points
- `multiPocket` · migrated · Cut multiple exact rectangular or rounded rectangular pockets
- `planeSection` · advisory · 选择一个源对象，提取与指定平面的真实交线，保留原对象。XY 的坐标为 Z，XZ 为 Y，YZ 为 X。结果是精确线框，不是实体。
- `quickModel` · advisory · Parameterized product model; prefer getTool({id:"quickModel"}) then execute(request)
- `referenceExtrude` · advisory · 选择一个闭合平面线框或单张平面面。直接复用精确圆弧/样条边，不离散成多边形。带孔请提供单张平面面；散边的多个闭环不会自动猜测内外关系。方向为世界 XYZ 向量，距离可正可负。保留来源；导出时选择新实体。不是自动修补或从零反求原件。
- `referenceLoft` · advisory · 按顺序选择 2–12 个平面闭合截面对象，每个对象仅一个外环，无内孔。复用精确曲线，支持不同位置/尺寸截面；由内核匹配边对应关系，结果须核对截面与外形。可选直纹。保留来源；失败不修改原工程。不保证任意原件完整重建。
- `revolve` · advisory · Revolve a closed profile
- `sewFaces` · advisory · 选择一个或多个含面的对象。公差控制边缝合，不自动补洞。勾选实体时必须闭合且有效，否则报错；未勾选可得到开放壳。
- `shell` · migrated · Hollow body removing selected faces
- `slot` · advisory · Cut an exact capsule slot (two semicircles and two straight sides)
- `smoothTransition` · migrated · 平滑过渡 / Smooth shared seams of adjacent faces together
- `sphere` · advisory · Sphere centered at origin
- `split` · advisory · Split body by an offset global plane
- `surfaceTrim` · advisory · 按顺序选两个对象：第一个为待修剪面所在对象，第二个为实体刀具。填写第一对象的面编号；intersect 保留实体内部，cut 保留外部。保留源对象；不是任意曲线修剪或自动补面。
- `sweep` · advisory · Sweep profile along a 3D polyline
- `thickenFace` · advisory · Normal offset of one face into a new solid
- `torus` · advisory · Torus around Z axis
- `transform` · advisory · Scale, rotate X/Y/Z about origin, then translate
- `union` · advisory · Fuse bodies
- `vectorProfile` · advisory · Create independent planar faces or solids from closed vector regions
- `connect` · page-method · connect({queries?:string[],limit?:1..10,includeContracts?:boolean,knownCatalogHash?,knownDocsHash?,knownHashes?}={}); up to 4 queries. Read-only; works while the kernel starts.
- `info` · page-method · info() 无参数。
- `getState` · page-method · getState({sessionId?,include?}={}); include 可选 summary/features/bodies/selection/capabilities。
- `searchTools` · page-method · searchTools({query,category?,limit?,cursor?}); query 字符串必需，limit 1..50；中英文按相关度排序，空查询分页列出目录。
- `getTools` · page-method · getTools({ids:string[],knownHashes?:{[id]:docsHash},expectedCatalogHash?}); 1..20 unique IDs. Only pass knownHashes for complete cards actually cached by the caller.
- `getTool` · page-method · getTool({id,version?}); id 为当前登记的操作、页面方法或 files.*。
- `readDocs` · page-method · readDocs({docId,version?,cursor?,limitChars?,knownHash?}); 只接受登记的文档 ID。knownHash 仅用于已完整缓存的文档。
- `queryGeometry` · page-method · queryGeometry({context,bodyId,kind:"face"|"edge",filter,requireUnique?,limit?,cursor?})。
- `execute` · page-method · execute({context,idempotencyKey,action,args}); action 来自当前命令合同。
- `measure` · page-method · measure({context,bodyId,kind?:"body"|"face"|"edge",topologyId?}) 或 measure({context,points:[[x,y,z],[x,y,z]]}); 面/边需非负整数 topologyId。
- `inspectPrintability` · page-method · inspectPrintability({context,bodyId,angleLimitDeg?:45}); angleLimitDeg 在 0 与 90 度之间。
- `fitProfile` · page-method · fitProfile({context,kind:"circle"|"line",plane?:"XY"|"XZ"|"YZ",points:[[u,v],...],maxResidualMm?}); 3–1000 点。
- `traceTwinWindow` · page-method · traceTwinWindow({context,outerLeft,outerRight,innerLeft,innerRight,barTopY,barBottomY,simplifyToleranceMm?:0..0.2}); 四条上到下 XY 采样曲线，每条3–2000点。
- `executeText` · page-method · executeText({context,idempotencyKey,text,dryRun?}); 每行 add <op> key=value 或 measure <bodyId|$last>。
- `setDisplayPreferences` · page-method · setDisplayPreferences({context,values}); values 为部分配置，字段及范围见 api.display-preferences。
- `getLogoConverter` · page-method · getLogoConverter()；读取当前浏览器 localStorage 的配置。
- `setLogoConverter` · page-method · setLogoConverter({context,url,key?})；URL 必须含 userid，空 key 保留原值。
- `convertLogoPdf` · page-method · convertLogoPdf({context,name,data,targetWidthMm?})；data 为 PDF Uint8Array/ArrayBuffer/Blob，最多 20 MiB。
- `setView` · page-method · setView({context,direction?,projection?,fit?,selectedIds?,section?,display?,grid?,snap?,gizmo?,selectionMode?,camera?,language?}); 详见 api.views；section={axis:"X"|"Y"|"Z",position:number,enabled:boolean}。
- `redraw` · page-method · redraw({context}); 不接受额外字段。
- `capture` · page-method · capture({context}); 不接受额外字段。
- `run` · page-method · run({context,idempotencyKey,steps}); see readDocs({docId:"api.run"}).
- `document.rename` · page-command · 修改工程名称，保留几何。
- `feature.rename` · page-command · 修改历史步骤及同 ID 实体名称，导入件也可使用。
- `body.visibility` · page-command · 显隐指定当前实体，不删除几何。
- `body.appearance` · page-command · color 为 #RRGGBB 或 null 恢复默认；finish 为材质键或 null 跟随工程。仅改 color 不改变金属设置；需显示原色时同时设 finish:design。
- `document.appearance` · page-command · 设置当前工程材质覆盖，null 跟随全局默认，仅影响未单独指定材质的实体。
- `body.explode` · page-command · 将含 2–500 个封闭体的组合拆成独立实体；一个撤销步骤。
- `feature.add` · page-command · args:{op,opVersion,schemaHash,params,refs,name?}；先 getTool 读取操作卡。
- `feature.edit` · page-command · args:{featureId,opVersion,schemaHash,params,name?}；params 为补丁。
- `feature.remove` · page-command · args:{bodyIds}，不可使用历史已替换 ID。
- `history.undo` · page-command · args:{}；撤销一个已提交步骤。
- `history.redo` · page-command · args:{}；重做一个步骤。
- `document.refresh` · page-command · args:{}；重建当前历史。
- `preview.start` · page-command · args 同 feature.add；显式 refs，不使用 UI 选择。已存在预览先取消。
- `preview.commit` · page-command · args:{}；提交当前预览，一个撤销步骤。
- `preview.cancel` · page-command · args:{}；恢复已提交模型。开始/取消不增加 revision，回执 preview.active 表示实际预览状态。
- `document.parameters` · page-command · 通过 execute 的 document.parameters 动作合并命名定义和特征数值路径绑定，原子重建并形成一个撤销步骤。
- `files.capabilities` · browser-file-adapter · capabilities(); no arguments.
- `files.register` · browser-file-adapter · register({name,data,mime?}); data is File, Blob, ArrayBuffer or Uint8Array; name is a safe basename.
- `files.new` · browser-file-adapter · new({context}); complete current context; dirty replacement is always rejected by page API.
- `files.open` · browser-file-adapter · open({context,resourceId}); registered .webcad/.json resource; dirty replacement is rejected.
- `files.import` · browser-file-adapter · import({context,resourceId}); registered STEP/STP/BREP/BRP resource.
- `files.save` · browser-file-adapter · save({context,name?}); complete current context.
- `files.export` · browser-file-adapter · export({context,format,ids?,name?}); format step/stl/brep/png.
- `files.read` · browser-file-adapter · read({resourceId,as?}); as is blob (default) or bytes.
- `files.download` · browser-file-adapter · download({resourceId}); generated output only.
- `files.write` · browser-file-adapter · write({resourceId,handle}); previously authorized FileSystemFileHandle.
- `files.release` · browser-file-adapter · release({resourceId}); current page resource ID.
- `import.iges` · unavailable · 当前静态版不含原本的本机 IGES 转换。可先在现有 CAD 工具中离线转 STEP。
- `import.vector-server` · unavailable · 当前静态版不含原本的本机矢量转换服务；浏览器已有的直接输入能力以运行时界面为准。
