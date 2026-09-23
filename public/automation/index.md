# WebCAD 页面 API 索引

API 1.0.0 · 操作目录 sha256:822ba39361f64154f46c000425d0b660f9d35b481d2ed5efa32e16e51654bbd5

入口：`window.webcad.api.info()`，然后 `searchTools`、`getTool`、`readDocs`。页面 JS 执行取决于获授权的客户端能力。

长度 mm、角度 degrees、体积 mm³。严格契约：box、hole、multiHole、faceHole、fillet、chamfer、shell；其余操作为 advisory。

## 页面方法

- `info`
- `getState`
- `searchTools`
- `getTool`
- `readDocs`
- `queryGeometry`
- `execute`
- `measure`
- `setView`
- `redraw`
- `capture`

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
- `box` · migrated · Box from [0,0,0] to [width,depth,height]
- `chamfer` · migrated · Chamfer selected edges
- `circularPattern` · advisory · Rotated copies as one compound
- `cone` · advisory · Cone/frustum along +Z
- `copy` · advisory · Copy with scale, rotation and translation
- `curveSweep` · advisory · Sweep a circular section along arc or approximated spline
- `curvedLogo` · advisory · Project logo onto a face and engrave along local normals
- `cut` · advisory · Subtract other bodies from first
- `cylinder` · advisory · Cylinder on +Z from origin
- `extractSolid` · advisory · Extract one solid from a compound
- `extrude` · advisory · Extrude a closed profile normal to the chosen plane
- `faceBoundary` · advisory · 先选中一张面。all 提取包括内孔在内的全部边界；outer 明确只提取外环，不带孔。保留源模型，生成精确线框。单闭环可接参考轮廓拉伸/放样；带孔拉伸应使用完整平面面，不能把忽略内孔的外环当成原件。
- `faceExtrude` · advisory · Push/pull a planar face along its normal
- `faceHole` · migrated · Drill inward from a planar face
- `fillet` · migrated · Round selected edges
- `fittedSurface` · advisory · Fit a single B-spline face to a structured point grid
- `group` · advisory · Group bodies as a compound without fusing
- `hole` · migrated · Cylindrical cut starting at global coordinates
- `intersect` · advisory · Common volume of bodies
- `linearPattern` · advisory · Linear copies as one compound
- `loft` · advisory · Ruled loft between parallel XY profiles
- `logo` · advisory · Engrave or emboss reviewed vector logo contours on one planar face
- `mirror` · advisory · Mirror across a global origin plane
- `multiHole` · migrated · Cut cylindrical holes sequentially at multiple global start points
- `planeSection` · advisory · 选择一个源对象，提取与指定平面的真实交线，保留原对象。XY 的坐标为 Z，XZ 为 Y，YZ 为 X。结果是精确线框，不是实体。
- `quickModel` · advisory · Parameterized product model; prefer getTool({id:"quickModel"}) then execute(request)
- `referenceExtrude` · advisory · 选择一个闭合平面线框或单张平面面。直接复用精确圆弧/样条边，不离散成多边形。带孔请提供单张平面面；散边的多个闭环不会自动猜测内外关系。方向为世界 XYZ 向量，距离可正可负。保留来源；导出时选择新实体。不是自动修补或从零反求原件。
- `referenceLoft` · advisory · 按顺序选择 2–12 个平面闭合截面对象，每个对象仅一个外环，无内孔。复用精确曲线，支持不同位置/尺寸截面；由内核匹配边对应关系，结果须核对截面与外形。可选直纹。保留来源；失败不修改原工程。不保证任意原件完整重建。
- `revolve` · advisory · Revolve a closed profile
- `sewFaces` · advisory · 选择一个或多个含面的对象。公差控制边缝合，不自动补洞。勾选实体时必须闭合且有效，否则报错；未勾选可得到开放壳。
- `shell` · migrated · Hollow body removing selected faces
- `slot` · advisory · Cut an exact capsule slot (two semicircles and two straight sides)
- `sphere` · advisory · Sphere centered at origin
- `split` · advisory · Split body by an offset global plane
- `surfaceTrim` · advisory · 按顺序选两个对象：第一个为待修剪面所在对象，第二个为实体刀具。填写第一对象的面编号；intersect 保留实体内部，cut 保留外部。保留源对象；不是任意曲线修剪或自动补面。
- `sweep` · advisory · Sweep profile along a 3D polyline
- `thickenFace` · advisory · Normal offset of one face into a new solid
- `torus` · advisory · Torus around Z axis
- `transform` · advisory · Scale, rotate X/Y/Z about origin, then translate
- `union` · advisory · Fuse bodies
- `vectorProfile` · advisory · Create independent planar faces or solids from closed vector regions
- `info` · page-method · info() 无参数。
- `getState` · page-method · getState({sessionId?,include?}={}); include 可选 summary/features/bodies/selection/capabilities。
- `searchTools` · page-method · searchTools({query,category?,limit?,cursor?}); query 字符串必需，limit 1..50。
- `getTool` · page-method · getTool({id,version?}); id 为当前登记的操作、页面方法或 files.*。
- `readDocs` · page-method · readDocs({docId,version?,cursor?,limitChars?}); 只接受登记的文档 ID。
- `queryGeometry` · page-method · queryGeometry({context,bodyId,kind:"face"|"edge",filter,requireUnique?,limit?,cursor?})。
- `execute` · page-method · execute({context,idempotencyKey,action,args}); action 来自当前命令合同。
- `measure` · page-method · measure({context,bodyId,kind?:"body"|"face"|"edge",topologyId?}); 面/边需非负整数 topologyId。
- `setView` · page-method · setView({context,direction?,projection?,fit?,selectedIds?,section?}); section={axis:"X"|"Y"|"Z",position:number,enabled:boolean}。
- `redraw` · page-method · redraw({context}); 不接受额外字段。
- `capture` · page-method · capture({context}); 不接受额外字段。
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
