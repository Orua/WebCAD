# WebCAD 页面 API 索引

API 1.0.0 · 操作目录 sha256:da782e473d52e89e4076d222b45c073d454eceacc7c41c9a22756107bfaafe79

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
- `faceBoundary` · advisory · 先选中一张面，提取包括内孔在内的全部边界。保留原模型，生成精确线框；尚不提供轮廓节点编辑或自动拉伸。
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
- `files.register` · browser-file-adapter · File, Blob, ArrayBuffer or Uint8Array; optional safe file name and MIME.
- `files.new` · browser-file-adapter · Complete current context; unsaved replacement needs genuine user confirmation.
- `files.open` · browser-file-adapter · Complete current context and registered native .webcad bytes.
- `files.import` · browser-file-adapter · Complete current context and registered STEP/BREP bytes.
- `files.save` · browser-file-adapter · Complete current context.
- `files.export` · browser-file-adapter · Complete current context, format step/stl/brep/png; optional body IDs.
- `files.read` · browser-file-adapter · Current page resource ID.
- `files.download` · browser-file-adapter · Current generated resource ID.
- `files.write` · browser-file-adapter · Current generated resource and previously authorized File System Access handle.
- `files.release` · browser-file-adapter · Current page resource ID.
- `import.iges` · unavailable · 当前静态版不含原本的本机 IGES 转换。可先在现有 CAD 工具中离线转 STEP。
- `import.vector-server` · unavailable · 当前静态版不含原本的本机矢量转换服务；浏览器已有的直接输入能力以运行时界面为准。
