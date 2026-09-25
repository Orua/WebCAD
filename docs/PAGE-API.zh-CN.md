# WebCAD 页面 API

首次调用优先使用 `window.webcad.api.connect({queries:[能力关键词]})`，再用 `getTools({ids})` 批量读卡。按需说明、离线工具库和缓存失效规则见 [AI 工具发现](AI-DISCOVERY.zh-CN.md)。本页后续为详细配方和接口参考，不需要首次连接全文读取。

## 从 DXF 正视与侧视校验圆线圈

对有效产品正视的内外 `CIRCLE` 和侧视圆截面 `CIRCLE` 已确定 handle 时，可用 `text-to-cad/agent/tools/cad-learning/export_dxf_round_ring.py` 导出 `quickModel.ring` 参数。脚本检验前视同心、前视材料宽等于侧视圆截面直径；不自动判定产品视图、接头和制造细节。Windows 在 text-to-cad 项目根目录下执行：

```powershell
$argsList=@('--dxf','models/jindafu-learning/real-products-survey-20260909/PG3784/PG3784.dxf',
  '--output','agent/temp/pg3784-ring.json',
  '--inner','AE2','--outer','AE3','--side','AE8')
& agent/tools/cad-learning/run-silent.ps1 -Script agent/tools/cad-learning/export_dxf_round_ring.py -ScriptArguments $argsList -LogName export-pg3784-ring
```

JSON 中 `params` 可直接传给页面 `quickModel`；页面工具卡来自 `getTool({id:'quickModel'})`，历史参数可 `feature.edit`：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[
  {id:'ring',method:'add',args:{op:'quickModel',refs:[],params:exported.params}},
  {id:'size',method:'measure',args:{bodyId:{$ref:'ring.createdBodyIds.0'}}}
]});
```

检查 `result.status`、单实体、体积、尺寸和显示 revision。PG3784 的源前视内 R12.5、外 R19.5、侧截面 R3.5；实测模型约 39×39×7 mm、3868.884925 mm³。第二份独立图 PG4768 用内/外 `F7/F8`、侧视 `FB` 复跑，导出内径34.9、圆线径6.4；页面实测单实体约47.7×47.7×6.4 mm、4173.974136 mm³，模型/渲染 revision 均为2。若前视有开缝、侧视截面不是圆或尺寸不一致，此脚本拒绝或不适用，不能把平垫圈 `washer` 混作圆线圈。

## 双孔葫芦形圆线组合

对两个同尺寸、上下并列、材料在中腰相交的长圆孔，复用 `quickModel.capsuleWire`、`transform` 和 `union`。AI 先读这三张 `getTool` 参数卡及 `readDocs({docId:'recipes.figure-eight-capsule'})`。输入每孔内宽 `innerWidth`、内高 `innerHoleHeight`、圆线直径 `wireDiameter` 和两孔中心距 `centerSpacing`；需 `innerWidth>innerHoleHeight>0`、`wireDiameter>0` 且 `innerHoleHeight<centerSpacing<innerHoleHeight+2*wireDiameter`。最后一个条件使两孔不交叉、两圈材料实际相交。通用页面调用（此例使用 PG2145 源线中心距）：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const p={kind:'capsuleWire',innerWidth:34.7,innerHeight:8.3,sectionSize:5.5};
const centerSpacing=11.4;
const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[
  {id:'top',method:'add',args:{op:'quickModel',refs:[],params:p}},
  {id:'topMove',method:'add',args:{op:'transform',refs:[{$ref:'top.createdBodyIds.0'}],params:{y:centerSpacing/2}}},
  {id:'bottom',method:'add',args:{op:'quickModel',refs:[],params:p}},
  {id:'bottomMove',method:'add',args:{op:'transform',refs:[{$ref:'bottom.createdBodyIds.0'}],params:{y:-centerSpacing/2}}},
  {id:'joined',method:'add',args:{op:'union',refs:[{$ref:'topMove.createdBodyIds.0'},{$ref:'bottomMove.createdBodyIds.0'}],params:{}}},
  {id:'size',method:'measure',args:{bodyId:{$ref:'joined.createdBodyIds.0'}}}
]});
```

核对每步回执、`size.result.solidCount===1`、精确体积、包围及 `getState().display.rendered.revision`。包围名义宽=`innerWidth+2×wireDiameter`，高=`innerHoleHeight+2×wireDiameter+centerSpacing`，厚=`wireDiameter`。PG2145 源图内/外端 R4.15/R9.65、中心距11.4；此组合在页面形成可辨认的双孔圆线单实体 **45.7×30.7×5.5 mm、4037.572771 mm³**。源图标注外高30.6，比源弧推得及模型高少0.1 mm；源中腰 R0.6 圆滑连接也尚未复刻。本配方留下两圈、两次位移、一次合并共五个可编辑历史特征，修改尺寸时须同步更新两圈和对称位移；若多款产品复用并确认相同接头规则，再考虑合并为一个快捷模型。

## 从 DXF 解析线弧生成精确实体

`arcProfile` 将有序、闭合的二维 `LINE`/`ARC` 轮廓直接做成面并沿 Z 拉伸，圆弧侧面保持解析曲面。AI 先读 `getTool({id:'arcProfile'})` 和 `readDocs({docId:'recipes.analytic-arc-profile'})`。`outer` 和 `holes` 中的每段是 `{type:'line',points:[[x,y],[x,y]]}` 或 `{type:'arc',points:[[起点],[弧中],[终点]]}`；相邻端点及闭环误差须小于 0.000001 mm。`height` 是有符号等深厚度（mm）。历史可用 `feature.edit` 修改轮廓或厚度。脚本不自动判断源图哪条线属于产品，不支持样条、变深截面或曲面投影。

DXF 导出器也接受单个 `CIRCLE` 作为一个完整外轮廓或孔，并将其拆成两条精确半圆弧。PG8091 改模版可指定外 `F6,FE,FF,F8,F7,FB,F9,FA,FD,FC`、圆孔 `F5`、弧槽孔 `100,102,103,101,105,104`，厚度5 mm；见 `readDocs({docId:'recipes.pg8091-analytic-profile'})`。图面标外宽40.6 mm，与解析源线约41.208906 mm有约0.608906 mm差，暂不强制缩放。

同一导出器还接受单个**闭合 `LWPOLYLINE`** 作为一个轮廓，把正负 bulge 精确转为三点圆弧；源实体必须处于 XY 平面，非零 Z 或非默认挤出方向会拒绝，避免错误投影。PG7440 外 `BCA1`、孔 `BCA0` 的正视外包围 33×23 mm 可作交叉核验：

```powershell
$argsList=@('--dxf','agent/temp/cad-learning/pg7440-round53/pg7440.dxf',
  '--output','agent/temp/cad-learning/pg7440-round53/analytic.json',
  '--outer','BCA1','--hole','BCA0','--height','4')
& agent/tools/cad-learning/run-silent.ps1 -Script agent/tools/cad-learning/export_dxf_arc_profile.py -ScriptArguments $argsList -LogName pg7440-arc-profile
```

`arcProfile` 生成等深平板，PG7440 侧视却给出 Ø4 圆线，故该正视校验**不能**代替该件已有的 `quickModel.rectBuckle` 圆截面模型。适用判断与页面脚本见 `readDocs({docId:'recipes.dxf-bulge-analytic-profile'})`；实物建模必须继续对照侧视。

PG6217 是适合解析轮廓加圆边的平板双窗实例。先核对有效正视：外四线 `97E2,97E3,97E7,97EB` 加四弧 `9A99,9AA3,9AB6,9AC0`；上孔四线 `97F0,97F1,97F2,97F8` 加四弧 `97F4,97F5,97FE,97FF`；下孔四线 `97F9,97FA,97FB,97F3` 加四弧 `97FC,97FD,97F6,97F7`。侧厚3.5、前后边 R0.5。Windows 在 text-to-cad 项目根目录下：

```powershell
$argsList=@('--dxf','models/jindafu-learning/real-products-survey-20260909/PG6217/pg6217.dxf',
  '--output','agent/temp/cad-learning/pg6217-profile.json',
  '--outer','97E2,97E3,97E7,97EB,9A99,9AA3,9AB6,9AC0',
  '--hole','97F0,97F1,97F2,97F8,97F4,97F5,97FE,97FF',
  '--hole','97F9,97FA,97FB,97F3,97FC,97FD,97F6,97F7',
  '--height','3.5','--join','0.01')
& agent/tools/cad-learning/run-silent.ps1 -Script agent/tools/cad-learning/export_dxf_arc_profile.py -ScriptArguments $argsList -LogName pg6217-source-profile
```

将已核对 JSON 作为页面变量 `data`，读取两张工具卡 `getTool({id:'arcProfile'})`、`getTool({id:'autoRound'})`，再执行：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[
  {id:'profile',method:'add',args:{op:'arcProfile',refs:[],params:data.params}},
  {id:'rounded',method:'add',args:{op:'autoRound',refs:[{$ref:'profile.createdBodyIds.0'}],params:{radius:0.5}}},
  {id:'size',method:'measure',args:{bodyId:{$ref:'rounded.createdBodyIds.0'}}}
]});
```

检查逐步回执、单实体和渲染修订。源画线高度 26.646181 mm，比名义标注26.6高约0.046181 mm，不强改源线；浏览器试件为44.8×26.646181×3.5 mm、1995.497578 mm³。圆边失败时复核局部空间，不能无声减小源 R。完整 AI 配方见 `readDocs({docId:'recipes.source-analytic-round'})`。

PG5752 B 件弧形带板展示原 DXF **小缺口**的处理：外弧 `52E` R20、内弧 `532` R15、端线 `52F/530`，通孔圆 `579/57A` R1.15，侧厚5 mm。内弧与两条端线约有0.040002 mm 接缝；默认 `--join 0.01` 会拒绝。经核对图面后可明确使用 `--join 0.05`，导出器保持 ARC 三点与半径，只吸附相接 LINE 端点，并在 JSON 及模型 `params.source` 记录修缝量和方法。Windows 在 text-to-cad 项目根目录下：

```powershell
$argsList=@('--dxf','models/jindafu-learning/real-products-survey-20260909/PG5752/pg5752.dxf',
  '--output','agent/temp/cad-learning/pg5752-b-profile.json',
  '--outer','52E,532,52F,530','--hole','579','--hole','57A',
  '--height','5','--join','0.05')
& agent/tools/cad-learning/run-silent.ps1 -Script agent/tools/cad-learning/export_dxf_arc_profile.py -ScriptArguments $argsList -LogName pg5752-b-profile
```

把 JSON 放进页面变量 `data` 后，用本节 `arcProfile` 的 `api.run(add + measure)` 调用。读 `readDocs({docId:'recipes.source-arc-band-profile'})` 获取完整护栏。两只 R1.65 同心大圆的沉孔深度未标，不能从正视圆环自动生成沉孔；A 件也不包含在 B 件中。

PG5752 A 件可用同一导出器与 DXF，传 `--outer 3D2,3D6,3D8,3D9 --hole 3DD --hole 3E1 --height 5 --join 0.01`，指定独立的 `--output`。源图的两个小圆 R0.85 标为 2-M2；解析圆孔模型不表示螺纹。页面分别载入 A/B JSON 为 `dataA`、`dataB`，先查 `arcProfile`、`transform` 工具卡，再逐步建模与测量：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[
  {id:'a',method:'add',args:{op:'arcProfile',refs:[],params:dataA.params}},
  {id:'b',method:'add',args:{op:'arcProfile',refs:[],params:dataB.params}},
  {id:'bDisplay',method:'add',args:{op:'transform',refs:[{$ref:'b.createdBodyIds.0'}],params:{x:60}}},
  {id:'aSize',method:'measure',args:{bodyId:{$ref:'a.createdBodyIds.0'}}},
  {id:'bSize',method:'measure',args:{bodyId:{$ref:'bDisplay.createdBodyIds.0'}}}
]});
```

检查每步回执、两个实体及渲染修订。实测 A 为 40×35.725769605×5 mm、2156.407441 mm³；B 为 33.020453×11.534217×5 mm、808.171586 mm³。`x:60` 只用于同屏看外形，未表示装配关系或配合位置。完整源件使用说明见 `readDocs({docId:'recipes.pg5752-two-source-parts'})`。

对已核定 handle 的 DXF，可在 text-to-cad 项目根目录下通过静默 Python 导出直接可用的 `params`。PG11419 的 DXF 是对源 DWG 作只读转换后放在 `agent/temp/` 的临时文件；每次先核对原图与句柄：

```powershell
$argsList=@('--dxf','agent/temp/cad-learning/pg11419-round51/pg11419.dxf',
  '--output','agent/temp/cad-learning/pg11419-round51/analytic.json',
  '--outer','62BF,62CC,62D0,62C3,62C5,62C8,62C9,62BB',
  '--hole','62F5,676A,6774,62F2','--height','3.5','--join','0.01')
& agent/tools/cad-learning/run-silent.ps1 -Script agent/tools/cad-learning/export_dxf_arc_profile.py -ScriptArguments $argsList -LogName pg11419-arc-profile
```

输出记录 `source_bounds`、`origin_xy`、`max_join_gap_mm`、handle 和 `params`。`--height 3.5` 仅为侧视 3.4/3.7 mm 之间的等深候选。把已复核 JSON 传入页面变量 `data`：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[
  {id:'part',method:'add',args:{op:'arcProfile',refs:[],params:data.params}},
  {id:'size',method:'measure',args:{bodyId:{$ref:'part.createdBodyIds.0'}}}
]});
```

检查 `result.status`、单实体、尺寸、体积和 `getState().display.rendered.revision`。完整实图说明见 `readDocs({docId:'recipes.pg11419-analytic-profile'})`。

## 从 DXF 直线、圆弧和样条导出闭合轮廓

有效产品视图的实体 handle 经人工核对后，可在 `text-to-cad` 工作区调用可复用 `agent/tools/cad-learning/export_dxf_profile.py`。Windows 按该项目规定经 `run-silent.ps1` 运行。例如 PG8091 有效改模版：

```powershell
$argsList=@('--dxf','models/jindafu-learning/real-products-survey-20260909/PG8091/pg8091.dxf',
  '--output','agent/temp/pg8091-profile.json',
  '--outer','F6,FE,FF,F8,F7,FB,F9,FA,FD,FC',
  '--hole','F5','--hole','100,102,103,101,105,104',
  '--distance','0.01','--join','0.01')
& agent/tools/cad-learning/run-silent.ps1 -Script agent/tools/cad-learning/export_dxf_profile.py -ScriptArguments $argsList -LogName export-pg8091-profile
```

`--outer` 给出外轮廓的 LINE/ARC handle；每个 `--hole` 是一个独立孔的 handle 列表，单个 CIRCLE 也可作为一孔。工具按端点连接并必要时反向边，拒绝断链、分叉、非闭合或重复 handle；`--distance` 是圆弧折线的最大弦高，`--join` 是原端点接合容差。JSON 输出已居中的 `regions`、源坐标包围、handle、点数和实际最大接缝。脚本不能判断哪一组实体才是产品，不直接读取 DWG，不代表原样条、截面或利角处理。

AI 将复核后的 JSON 数据作为 `sampled` 传到页面脚本，经已有的 `vectorProfile` 工具生成实体：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[
  {id:'profile',method:'add',args:{op:'vectorProfile',refs:[],params:{
    regions:sampled.regions,output:'solid',height:5,
    source:{kind:'dxf-arc-profile',outerHandles:sampled.outer_handles,
      holeHandles:sampled.hole_handles,distanceMm:sampled.distance_mm}
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'profile.createdBodyIds.0'}}}
]});
```

PG8091 的外轮廓与两孔得到 112/87/60 个折线点，端点最大接缝约 0.000001 mm。以侧视 5 mm 拉伸得到单实体约 41.202×52.181×5 mm、4146.667412 mm³；图面外宽标 40.6、高标 52.2 mm，宽度比采样外形少约 0.602 mm。差值来源未确认前，只作为源线外观候选。完整调用及限制见 `readDocs({docId:'recipes.dxf-arc-profile'})`。

同一导出器也接受 SPLINE：PG4307 以 `--outer 7F45,7F47,7F46,7F48` 连接两条直线和两条源样条，采样 146 点，得到 24.006007×21 mm 外轮廓，最大接缝约 0.0000000023 mm。`--distance` 对圆弧是弦高，对样条是 ezdxf 展平距离。PG4307 的内轮廓样条端点与图中邻近直线并不直接重合，不能用放大 `--join` 强制闭合；双窗内孔继续用 `traceTwinWindow` 的图纸专用拼接流程。开放圆线中心路径也不属于本闭合轮廓导出器的适用范围。

## 连续线弧圆线扫掠

成对的 DXF 内外 LINE/ARC 可先用 `text-to-cad/agent/tools/cad-learning/export_dxf_midline.py` 生成页面参数。AI 须先确认产品有效视图、按路径顺序选内外实体 handle，并从侧视确认圆截面直径；脚本不会自动选择产品或推断截面。Windows 在 text-to-cad 项目根目录下运行：

```powershell
$argsList=@('--dxf','models/jindafu-learning/real-products-survey-20260909/PG8061/pg8061.dxf',
  '--output','agent/temp/pg8061-midline.json','--diameter','5','--join','0.05',
  '--segment','line:E380:E36C:forward',
  '--segment','arc:E37F:E36B:reverse',
  '--segment','arc:E37E:E36A:reverse',
  '--segment','arc:E37D:E369:reverse',
  '--segment','arc:E37C:E368:reverse',
  '--segment','arc:E383:E371:reverse',
  '--segment','arc:E382:E370:reverse',
  '--segment','line:E381:E36E:reverse')
& agent/tools/cad-learning/run-silent.ps1 -Script agent/tools/cad-learning/export_dxf_midline.py -ScriptArguments $argsList -LogName export-pg8061-midline
```

导出器验证每对同类、同向、恒定 5 mm 间隔的线或同心等角弧，拒绝重复 handle、断链、闭链及超出 `--join` 的接缝；输出的 `params` 已居中并把接缝端点取平均至完全相合。默认线/半径差容差 0.02 mm、弧圆心容差 0.01 mm，可用 `--offset-tolerance`、`--center-tolerance` 调整（上限 0.1 mm）。结果保留源 handle、原点和原始最大接缝供核查。PG8061 最大接缝约 0.017787 mm；内核生成有效单实体约 28.029784×23.373244×5 mm、1187.871376 mm³。该提取只适用于可验证的平面等宽圆线，不能复原局部端头或三维折弯。

AI 读取 `getTool({id:'curveSweep'})` 和 `readDocs({docId:'recipes.segmented-curve-sweep'})`。`pathType:'segments'` 允许 2–64 个连续段，默认开放；显式 `closed:true` 时首尾也须相接。直线用起终两点，圆弧用起点、弧中点、终点，坐标均为 XYZ 毫米。相邻端点必须在 0.000001 mm 内重合，圆截面半径独立指定。页面调用：

```js
const api=window.webcad.api;
const segments=[
  {type:'line',points:[[0,0,0],[1,0,0]]},
  {type:'arc',points:[[1,0,0],[2,1,0],[1,2,0]]},
  {type:'line',points:[[1,2,0],[0,2,0]]}
];
const {revision,...identity}=api.getState().context;
const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[
  {id:'wire',method:'add',args:{op:'curveSweep',refs:[],params:{pathType:'segments',segments,radius:0.2}}},
  {id:'size',method:'measure',args:{bodyId:{$ref:'wire.createdBodyIds.0'}}}
]});
```

实际 DXF 数据可先读取导出 JSON 为 `exported`，把上例的 `params:{pathType:'segments',segments,radius:0.2}` 换成 `params:exported.params`。检查 `result.status`、`size.result.solidCount`、体积及 `getState().display.rendered.revision`。分段模式使用内核的 transformed 过渡并检查拓扑；`right` 模式在 PG8061 的近相切复合弧上生成了无效实体，不能仅凭 `solidCount:1` 放行。源 PG8061 同心内外弧可计算开口圆线中心路径，圆截面扫掠已形成有效实体；端部 R0.8 的平面收口和侧视细节仍需另验，不能把此脚本直接视作完整产品复刻。参数可经 `feature.edit` 修改整段路径或半径。

## DWG 样条双窗扣闭合轮廓

`traceTwinWindow` 是只读计算端口。输入可靠 CAD 解析器采样出的四条侧边曲线，每条按 Y 从上到下排列；同时明确横条的上下 Y 坐标。工具用源侧曲线和直线闭合一个外轮廓、两个窗孔，返回以外轮廓中心为原点的 `vectorProfile.regions`。先读取 `getTool({id:'traceTwinWindow'})` 和 `readDocs({docId:'api.dwg-spline-twin-window'})`：

在当前本机的 `text-to-cad` 工作区，可先由已有 LibreDWG 路线取得 DXF，再调用可复用采样脚本（`--handles` 由源 DWG 实体核对后填写；输出放在 `agent/temp/`）：

```powershell
& 'agent/tools/cad-learning/run-silent.ps1' `
  -Script 'agent/tools/cad-learning/export_spline_samples.py' `
  -ScriptArguments @('--dxf','models/jindafu-learning/real-products-survey-20260909/PG4307/pg4307.dxf',
    '--output','agent/temp/pg4307-spline-samples.json',
    '--handles','7F47','7F48','7F49','7F4A')
```

JSON 的 `splines` 数组提供 `handle` 和 `points`；AI 按已核对的四个 handle 分配 `outerLeft`、`outerRight`、`innerLeft`、`innerRight`，并将来源、原 DWG 哈希、采样距离写入下步 `source`。这个本机采样脚本是输入准备工具，WebCAD 页面计算端口也可接受其他可信 DXF 解析器提供的同格式数组。

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const traced=await api.traceTwinWindow({context:{...identity,expectedRevision:revision},
  outerLeft,outerRight,innerLeft,innerRight,barTopY,barBottomY,
  simplifyToleranceMm:0.01});
if(traced.status!=='read')throw new Error(traced.error?.message);
const built=await api.run({context:{...identity,expectedRevision:revision},
  idempotencyKey:crypto.randomUUID(),steps:[
    {id:'source',method:'add',args:{op:'vectorProfile',refs:[],params:{
      regions:traced.regions,output:'solid',height:3.5,
      source:{kind:'dwg-spline-samples',product:'PG4307',distanceMm:0.01}}}},
    {id:'size',method:'measure',args:{bodyId:{$ref:'source.createdBodyIds.0'}}}
  ]});
```

PG4307 的原 DWG 经过 LibreDWG 转 DXF，再由 `ezdxf` 对四条样条以 `flattening(distance=0.01,segments=8)` 采样；源图横条上下边为 Y=980.692393162788/977.692393162788 mm。完整采样路径得到正面约 24.006×21 mm、厚 3.5 mm、983.047 mm³ 的单实体。可选 `simplifyToleranceMm:0.01` 把四条侧曲线总点数从 628 降至 162，实测相对**采样折线**最大偏差 0.00963 mm，实体体积约 983.074 mm³；外尺寸保持不变。相比固定圆角矩形候选的 1025.376 mm³，这两种源线近似更有依据。采样参数和简化偏差都不能证明对原始连续样条的总误差上界；应回读源图、检查曲线闭合与 STEP。四条曲线每条 3–2000 点，必须严格递减 Y、左右端高差≤0.01 mm、内外和横条边界有真实间隔。简化容差限 0..0.2 mm，省略或设0表示保留全部采样点。工具不会自己打开 DWG，也不会猜截面或倒边；失败不提交。

## 小双窗扣外观候选

PG4307 用现有“快捷模型 → 平板双窗扣”建立可编辑的名义外观。AI 先读取 `getTool({id:'quickModel'})`，再调用：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({context:{...identity,expectedRevision:revision},
  idempotencyKey:crypto.randomUUID(),steps:[
    {id:'plate',method:'add',args:{op:'quickModel',refs:[],params:{
      kind:'twinWindowPlate',outerWidth:24,outerHeight:21,outerRadius:6,
      windowWidth:17,totalInnerHeight:14,windowRadius:2,barWidth:3,
      thickness:3.5,edgeRadius:0}}},
    {id:'size',method:'measure',args:{bodyId:{$ref:'plate.createdBodyIds.0'}}}
  ]});
```

源图标外廓 24×21、横条 3、侧厚 3.5 mm；产品栏的 17×14 用作名义内孔总范围。外 R6 和窗 R2 是外观拟合参数。源 DWG 含 `SPLINE` 轮廓，圆角矩形不能证明与它逐线重合；提高保真度需要源样条闭合轮廓及偏差校验。未见明确边缘倒圆时，`edgeRadius:0`。结果应为 24×21×3.5 mm 单实体；查 `status`、`measure`、渲染修订，历史可用 `feature.edit` 调参。完整脚本卡：`readDocs({docId:'recipes.small-twin-window'})`。

## 圆弧拱弯平板双窗扣

“快捷模型 → 圆弧拱弯平板双窗扣”使用 `quickModel` 的 `archedTwinWindowPlate`。AI 从 `getTool({id:'quickModel'})` 读取当前参数卡；下面是 PG5821 薄条双窗的**外观试建**：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'arch',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'archedTwinWindowPlate',outerWidth:32.9,outerHeight:25.5,outerRadius:3,
    windowWidth:25.4,totalInnerHeight:18.5,windowRadius:0.5,barWidth:3.5,
    bendRadius:43.90964782342324,radialThickness:2.3
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'arch.createdBodyIds.0'}}}]
});
```

正视圆角双窗轮廓裁切同轴圆筒薄壁，外弧半径 `bendRadius`，径向厚度 `radialThickness`；弯曲沿 Y，圆筒轴沿 X。PG5821 的模型约 **32.9×25.5×4.302 mm**，图面侧深 **4.2 mm**，尚未通过源截面及未知边缘过渡验收。输入要求内弧半径大于外高一半，双孔完全在外轮廓内；失败整步回滚。读 `status`、`measure`、渲染修订，历史可用 `feature.edit` 调参。本工具只适用于薄条一体双窗。PG7219 侧视有两端 Ø5 圆截面和中部 Ø4 圆杆，属于弯曲圆线框加横杆，不能套平板工具。详见 `readDocs({docId:'recipes.arched-twin-window'})`。

## 鼓侧边平板双窗扣

“快捷模型 → 鼓侧边平板双窗扣”使用 `quickModel` 的 `bowedTwinWindowPlate`。先读 `getTool({id:'quickModel'})` 的当前参数卡，再执行：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'plate',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'bowedTwinWindowPlate',outerHeight:24.5,topStraightWidth:30.2527,
    sideRadius:35.688467,cornerRadius:6,windowWidth:32,windowHeight:6.55,
    windowSpacing:10.35,thickness:3.7,edgeRadius:0.8
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'plate.createdBodyIds.0'}}}]
});
```

上下直段、四角小 R 与两侧大 R 相切；两孔各有两个半圆端，`windowSpacing` 是孔中心距，`edgeRadius` 是实体前后边的三维倒 R。名义参数得到约 **43.58336×24.5×3.7 mm、2204.792137 mm³**；PG3781 已核源圆弧 STEP 为 **43.597847×24.5×3.7 mm、2206.094501 mm³**。源外圆弧及四角存在微小非对称；此工具是可编辑的镜像对称近似，不能称为源弧完全重合。参数要求侧 R 大于角 R 且可相切、两孔分离并完全位于板内、边 R 小于板厚和最窄壁厚的一半。检查批次状态、`measure` 和渲染修订；失败整步回滚，历史可用 `feature.edit` 改参数。详见 `readDocs({docId:'recipes.bowed-twin-window'})`。

## 平垫圈

“快捷模型 → 平垫圈”使用 `quickModel` 的 `washer`。AI 先读 `getTool({id:'quickModel'})` 的参数卡，再用页面脚本创建并测量：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'washer',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'washer',innerDiameter:36.2,sectionSize:7,innerHeight:3.2
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'washer.createdBodyIds.0'}}}]
});
```

`sectionSize` 在此是**径向壁宽**，`innerHeight` 是**轴向厚度**；外径=内径+2×径向壁宽。PG1797 得外 Ø50.2、内 Ø36.2、厚 3.2 mm，体积约 3040.056379 mm³；PG0203 改为内 Ø25、壁宽 4.4、厚 3.8，得外 Ø33.8、体积约 1544.306418 mm³。三项必须大于 0。原图均未标边 R/C，因此名义模型保持锐边；如有倒边标注，须再依据标注建特征。检查批次状态、`measure`、渲染修订；失败整步回滚，历史参数可用 `feature.edit` 改。详见 `readDocs({docId:'recipes.flat-washer'})`。

## 圆周重复孔位

沿圆周排列的孔位直接组合 `quickModel` 的 `washer` 与 `multiHole`，AI 先分别读取两张工具卡。PG3389 的主视源图给出内 R10、外 R14.5、16 个 R1.5 圆位，圆位中心半径 12.25，首孔在 90°，侧厚 3.6 mm。计算孔心后在同一批次建模：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const points=Array.from({length:16},(_,i)=>{
  const angle=(90+i*360/16)*Math.PI/180;
  return [12.25*Math.cos(angle),12.25*Math.sin(angle),1.8];
});
const result=await api.run({context:{...identity,expectedRevision:revision},
  idempotencyKey:crypto.randomUUID(),steps:[
    {id:'ring',method:'add',args:{op:'quickModel',refs:[],params:{
      kind:'washer',innerDiameter:20,sectionSize:4.5,innerHeight:3.6}}},
    {id:'holes',method:'add',args:{op:'multiHole',refs:[{$ref:'ring.createdBodyIds.0'}],params:{
      radius:1.5,depth:0.5,axis:'Z',direction:-1,points}}},
    {id:'size',method:'measure',args:{bodyId:{$ref:'holes.createdBodyIds.0'}}}
  ]});
```

名义实体为 29×29×3.6 mm，浅圆座试建的体积为 `π(14.5²−10²)×3.6−16π1.5²×0.5`。原图注为镶钻；圆位只证明平面位置，**没有给出石座深度或宝石形状**；0.5 mm 浅圆座仅是可编辑试拟。这个模型用于正面可见轮廓试建。复用时调整孔数、角度、中心半径和孔半径，保持圆位完全落在环带内并互不相交。读回批次状态、尺寸和渲染修订；历史用 `feature.edit` 修改完整 `points` 数组。页面脚本卡：`readDocs({docId:'recipes.polar-hole-ring'})`。

## 椭圆截面圆角方框

“快捷模型 → 椭圆截面圆角方框”对应 `quickModel` 的 `ellipseSectionRectFrame`。AI 先 `getTool({id:'quickModel'})` 读参数卡，再按当前工程身份调用：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'frame',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'ellipseSectionRectFrame',innerWidth:25,innerHeight:19,innerRadius:2.5,
    sectionWidth:5.5,sectionDepth:6
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'frame.createdBodyIds.0'}}}]
});
```

沿圆角矩形中心线扫掠椭圆截面。`sectionWidth` 决定正面带宽与内外宽高差；`sectionDepth` 独立决定侧深。PG5866 的图面给出内 25×19、外 36×30、侧视 Ø6，因此此例得到 36×30×6 mm 的外观候选；内 R2.5 与椭圆截面是试拟，原图未证实，不能把模型体积当源件体积。PG5134 的另一方向示例可输入内宽17.7、内高19.7、正面料宽5.25、侧深4、试拟内R2.5，形成28.2×30.2×4 mm候选；来源未证实截面必为椭圆。圆截面方框用 `rectBuckle`。查看批次状态、精确测量和渲染修订；失败整步回滚，调参用 `feature.edit`。完整限制见 `readDocs({docId:'recipes.ellipse-section-rect'})`。

## 开口 U 形椭圆截面线

`curveSweep` 接受 `section:'ellipse'`、`sectionWidth`（正面料宽）和 `sectionDepth`（侧面深度）。非圆截面路径须同处 XY 平面，宽深须为不相等的正数。由源图明确的外宽、内宽、外高及外冠 R 计算五段中心路径，脚本范例与 PG10537 的尺寸推导见 `readDocs({docId:'recipes.ellipse-u-wire'})`。AI 先 `getTool({id:'curveSweep'})`，再以当前 `context` 用 `api.run` 提交 `{op:'curveSweep',refs:[],params:{pathType:'segments',segments,section:'ellipse',sectionWidth:2.9,sectionDepth:4.3}}`，随后 `measure` 并读回渲染 revision。PG10537 的外26.8、内21、外高36、侧深4.3 可产生开口 U 外观候选；内冠计算 R8.1 与图面 R8 相差0.1，椭圆截面和端部 M2.5 的实际几何未证实。该工具不生成螺纹、局部打磨或可直接生产的成品。

## 半圆冠双端孔 U 板

“快捷模型 → 半圆冠双端孔 U 板”对应 `quickModel.kind='uEndHolePlate'`。外宽、内宽、总高、平板厚度、两端通孔直径和孔心距端面的距离均可编辑；两个孔沿板厚贯穿。AI 可用 `getTool({id:'quickModel'})` 发现参数，在空白工程执行：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'partA',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'uEndHolePlate',outerWidth:22,innerWidth:10,totalHeight:31.7,
    thickness:3,holeDiameter:3.3,holeInset:2.7
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'partA.createdBodyIds.0'}}}]
});
```

PG11804 A 件源图支持外宽22、内宽10、总高31.7、侧深3 mm，孔位文字标 2-Ø3.3，另有 2-M2 标注；`holeInset:2.7` 为位置试拟，通孔不代表真实攻牙。B 件、装配关系和局部圆润截面未建，不能用 A 件试算代替完整产品。工具要求孔完整落在直腿内、与端面和冠有净距；失败整步回滚。读 `status`、精确 `measure` 与渲染版本，修改历史可用 `feature.edit`。详见 `readDocs({docId:'recipes.u-end-hole-plate'})`。

## 斜肩开口框

“快捷模型 → 斜肩开口框”对应 `quickModel` 的 `gableOpenFrame`。AI 可先 `getTool({id:'quickModel'})` 取当前参数，再在空白工程中调用：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'gable',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'gableOpenFrame',outerWidth:25,innerWidth:20,
    outerPeakHeight:16,outerShoulderHeight:12.4,
    innerPeakHeight:13.5,innerShoulderHeight:10.5,
    thickness:4,endRadius:1
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'gable.createdBodyIds.0'}}}]
});
```

两只直腿上接斜肩屋顶，脚端用真实圆弧和短平底保持外高，生成 25×16×4 mm 的单实体。PG7918 的内峰 13.5 和内肩 10.5 是按图面轮廓试拟；未逐边回读源曲线，也未构造侧视全部圆端截面。不能把外廓尺寸吻合当成完整复刻。读批次 `status`、`measure` 和渲染修订；失败整步回滚，参数可用 `feature.edit` 调整。约束详见 `readDocs({docId:'recipes.gable-open-frame'})`。

## 倒角方线恒截面框

“快捷模型”的 D 扣、方扣、日字扣、圆圈、大开口 C 环和四圆弧旦扣可选 `section:'chamferedSquare'`。`sectionSize` 是正面宽和侧面总深，`sectionChamfer` 是四角各自沿相邻边退入的 45° 平倒角尺寸，须满足 `0<sectionChamfer<sectionSize/2`；此截面有八条直边，不能用 `section:'square'` 的圆角 R 代替。AI 先读 `getTool({id:'quickModel'})` 的当前参数卡，再使用当前页面上下文：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({context:{...identity,expectedRevision:revision},
  idempotencyKey:crypto.randomUUID(),steps:[
    {id:'frame',method:'add',args:{op:'quickModel',refs:[],params:{
      kind:'dBuckle',section:'chamferedSquare',sectionSize:6,sectionChamfer:1.5,
      innerWidth:25,innerHeight:16.5,innerRadius:2,gapWidth:0
    }}},
    {id:'size',method:'measure',args:{bodyId:{$ref:'frame.createdBodyIds.0'}}}
  ]});
```

PG4819 的正视标外 37×28.5、内 25×16.5，侧剖总深 6、顶面平段 3；平倒角截面对应边长 6、单边倒角 1.5 mm。该例的 `innerRadius:2` 和半圆冠中心路径是可编辑外观试拟，源图冠部由多段不同 R 圆弧组成，不能凭包围尺寸认定逐线复刻。检查返回 `status`、单实体、精确测量和渲染修订；非法倒角或内核无效会拒绝提交。完整脚本与其它框类适用边界见 `readDocs({docId:'recipes.chamfered-wire-frame'})`。

## 独立底角 R 平板 D 框

“快捷模型 → 独立底角 R 平板 D 框”对应 `quickModel` 的 `dFlatFrame`。先用 `getTool({id:'quickModel'})` 读取实时参数卡，再按当前工程上下文调用：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'d',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'dFlatFrame',outerWidth:28,outerHeight:25,innerWidth:20,innerHeight:17,
    outerBottomRadius:3.5,innerBottomRadius:2,thickness:4,gapWidth:1
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'d.createdBodyIds.0'}}}]
});
```

半圆冠、直腿和底部圆角各自由参数确定。内外底角 R 独立，`thickness` 是平板深度；`gapWidth:0` 保持闭合，正数在底中切出平行缝。上述 1 mm 缝宽仅演示工具：PG9998 原图没有确认此数值，不能据试算宣称复刻。检查 `status`、测量结果和渲染修订；失败整步回滚，历史调整用 `feature.edit`。完整限制见 `readDocs({docId:'recipes.d-flat-frame'})`。

## 圆线直段长圈

“快捷模型 → 圆线直段长圈”使用 `quickModel` 的 `capsuleWire`。AI 读取 `getTool({id:'quickModel'})` 的当前参数卡，然后按当前工程身份调用：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'loop',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'capsuleWire',innerWidth:34.9,innerHeight:13.9,sectionSize:6.1
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'loop.createdBodyIds.0'}}}]
});
```

两端精确半圆、上下直段，圆截面直径为 `sectionSize`；要求内宽>内高>0、线径>0。闭合模型没有猜测的缝。外宽=内宽+2×线径，外高=内高+2×线径。PG11140 名义参数得到 **47.1×26.1×6.1 mm、约 3063.675857 mm³**；PG9782 用内 12.3×8.4、Ø3 得 **18.3×14.4×3 mm、约 308.290304 mm³**。两款都与原 text-to-cad STEP 的体积回读一致，但 PG9782 孤立无标注轮廓的语义未定，当前只表示有完整尺寸的主侧视主体。PG4680 的接缝语义未定，不能借用闭合结果断言无缝。`rectBuckle` 的内角 R 不能取短边一半；该工具直接构造半圆端部。读 `status`、`measure` 与 `renderedRevision`；失败整步回滚，历史调参用 `feature.edit`。详见 `readDocs({docId:'recipes.capsule-wire'})`。

## 椭圆截面圆环

“快捷模型 → 椭圆截面圆环”使用 `quickModel.kind='ellipseSectionRing'`。AI 先 `getTool({id:'quickModel'})` 查参数卡，再按当前工程身份调用：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'ring',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'ellipseSectionRing',innerDiameter:37.4,sectionWidth:4.1,sectionDepth:5
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'ring.createdBodyIds.0'}}}]
});
```

沿圆形中心线扫掠精确椭圆截面，正面内径、正面带宽、侧深分别输入，外径=内径+2×带宽。要求内径≥2.5×带宽、宽深均正且不等。PG6148 原 DWG 的同心圆内 Ø37.4、外 Ø45.6，侧深 5 mm；若误用 Ø5 圆线，外径会错成 47.4 mm。椭圆截面是符合两投影的试拟，不等于源曲面已证实。名义候选为 45.6×45.6×5 mm 单实体。读 `status`、`measure`、`renderedRevision`；失败回滚，历史可 `feature.edit`。详见 `readDocs({docId:'recipes.ellipse-section-ring'})`。

## 双孔弧形带板

“快捷模型 → 双孔弧形带板”使用 `quickModel.kind='arcBandPlate'`。AI 先 `getTool({id:'quickModel'})` 查参数卡，用当前工程身份调用：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'band',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'arcBandPlate',outerRadius:20,innerRadius:15,centerAngle:270,
    spanAngle:111.2807337553,thickness:5,holeInsetAngle:8.4521160504,
    holeDiameter:2.3,recessDiameter:3.3,recessDepth:0.7
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'band.createdBodyIds.0'}}}]
});
```

同心弧间形成恒宽平板；两孔在中半径上，按 `holeInsetAngle` 从两弧端对称退让。角度单位为度，尺寸为 mm；`recessDepth:0` 不切沉孔。要求外 R>内 R>0、0<弧跨度<350°、两孔及沉孔完整落在带板上且不相交、0≤沉孔深<板厚。PG5752 的 B 件源几何回读 R20/R15、弧跨度 111.2807338°、两孔中心距约25.6757 mm，Ø2.3 和 Ø3.3 两级轮廓；示例沉孔深 0.7 mm 是试拟，图纸尚未证实此深度。螺纹、A 件和完整装配另行建模。检查批次 `status`、测量与 `renderedRevision`，失败回滚；`feature.edit` 可改历史参数。完整限制见 `readDocs({docId:'recipes.arc-band-plate'})`。

## 圆角扁方截面直段长圈

“快捷模型 → 圆角扁方截面直段长圈”使用 `quickModel` 的 `profileLoop`。AI 从 `getTool({id:'quickModel'})` 读取实时参数卡后，使用页面当前工程身份：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'loop',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'profileLoop',innerWidth:35.2,innerHeight:14.6,
    sectionWidth:5.5,sectionDepth:6,sectionRadius:2.5
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'loop.createdBodyIds.0'}}}]
});
```

两端半圆、上下直段为中心路径，扫掠独立的圆角矩形截面。`sectionWidth` 是正面料宽，`sectionDepth` 是侧面厚度，`sectionRadius` 是截面 R；内宽须大于内高且均为正，截面宽厚须为正，`0<R≤min(宽,厚)/2`。R 等于短边一半时截面为精确的两半圆加直段，不使用会在此边界退化的圆角矩形草图。输出外宽=内宽+2×料宽、外高=内高+2×料宽。PG3195 名义尺寸得到单实体 **46.2×25.6×6 mm**、约 **2883.597260 mm³**，与解析体积和原 text-to-cad STEP 约 2883.597257 mm³ 一致。PG10669 可输入 `innerWidth:51,innerHeight:15,sectionWidth:4,sectionDepth:8,sectionRadius:2`，得到名义 **59×23×8 mm** 单实体；其细部及源件逐线一致性仍待核对。原 DWG 画线与标注可能有偏差，名义几何不能冒充全部源曲面验收。不能把侧厚 6 当作 Ø6 圆线，也不能把直段长圈套入真椭圆或四圆弧旦扣工具。检查 `status`、`measure`、`renderedRevision`；失败整步回滚，同一历史特征可用 `feature.edit` 调参。详见 `readDocs({docId:'recipes.profile-loop'})`。

## 内真椭圆开缝圆线圈

“快捷模型 → 内真椭圆开缝圆线圈”使用 `quickModel` 的 `ellipseOpenWire`。AI 先用 `getTool({id:'quickModel'})` 读取参数卡，再按页面工程的当前身份和版本调用：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'loop',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'ellipseOpenWire',innerWidth:15,innerHeight:20,sectionSize:3.5,gapWidth:0.2
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'loop.createdBodyIds.0'}}}]
});
```

输入的是**内孔**真椭圆宽、高，外轮廓由半线径等距偏移产生，不能用 PG9432 那类**外轮廓**真椭圆图纸的外宽高代填。两轴须不等，短轴至少为线径四倍，`0<gapWidth<sectionSize`；缝在底部中心，两端为 X=±缝宽/2 的平行平切面。PG11580 名义尺寸的内核验证为单实体、约 22×26.999563×3.5 mm、两端面实际距离 0.2 mm；切缝后总高会比闭环名义 27 mm 稍短。回执还须核 `status`、逐步测量与当前 `renderedRevision`。失败整步回滚，历史修改用 `feature.edit`。目前 PG9432 外真椭圆基准的切口会得到无效拓扑，已拒绝纳入此工具。完整说明见 `readDocs({docId:'recipes.ellipse-open-wire'})`。

实体体积由 OCCT 自适应 Gauss–Kronrod 积分测量。PG11580 这组 WebCAD 几何约 635.523 mm³；独立 text-to-cad STEP 为约 635.514 mm³。两者接近仍不能代替与原 DWG 的完整曲面和轮廓验收。旧的普通非自适应体积值约 634.399 mm³，会误导尺寸核对，已从实体元数据及 `measure` 中替换。

## 椭圆圈固定横杆

“快捷模型 → 椭圆圈固定横杆”使用 `quickModel` 的 `ellipseBar`。AI 先从 `getTool({id:'quickModel'})` 读取当前参数卡，再按页面工程的当前身份和版本调用：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'oval',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'ellipseBar',innerWidth:35,innerHeight:25,sectionSize:5,
    barDiameter:5,barDepthOffset:0
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'oval.createdBodyIds.0'}}}]
});
```

内轮廓是真椭圆；中心路径由其向外偏置半线径，扫掠圆线后与沿 X 的固定圆杆融合。`barDepthOffset` 沿 Z 调整杆轴。尺寸须满足长径>短径≥4×线径、杆径不大于线径，且错层保持实体交叠；失败整步不提交，历史修改用 `feature.edit`。PG5155 图面的内椭圆 35×25 和 Ø5 侧截面可作候选输入，但当前内核回读包围为约 **45.058424×35×5 mm**，X 比名义 45 多 0.058424 mm；源 DWG 外样条与杆端过渡尚未逐曲面对照。以实际 `measure` 和渲染修订为准，不能把候选写成精确产品验收。完整说明见 `readDocs({docId:'recipes.ellipse-bar'})`。

## 平板双窗扣

“快捷模型 → 平板双窗扣”是一个可编辑的 `quickModel` 历史特征。AI 先读 `getTool({id:'quickModel'})` 中 `twinWindowPlate` 的参数卡，再以当前工程上下文运行：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'plate',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'twinWindowPlate',outerWidth:44.8,outerHeight:26.6,outerRadius:3.5,
    windowWidth:37.8,totalInnerHeight:19.6,windowRadius:2,
    barWidth:3.5,thickness:3.5,edgeRadius:0.5
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'plate.createdBodyIds.0'}}}]
});
```

单孔净高 `(totalInnerHeight-barWidth)/2`，孔中心 Y 为 `±(totalInnerHeight+barWidth)/4`；中横条属于整板。`outerRadius`、`windowRadius` 为平面角 R，`edgeRadius` 为前后截面 R。尺寸不合法或任一切孔、倒圆失败时整步不提交；R 不会被自动缩小。用回执、精确测量与显示修订号核对结果，历史修改用 `feature.edit`。完整限制见 `readDocs({docId:'recipes.twin-window-plate'})`。示例取自 PG6217 DWG 名义尺寸，官方照片的外角与该图 R3.5 外观有差异，产品版本尚待确认。

## 紧凑圆线方扣

“快捷模型 → 方扣”的 `rectBuckle` 和闭合圆线“日字扣” `sliderBuckle` 支持内短边为线径 2.5 倍以上的紧凑框；开缝圆框和方线框仍须至少 4 倍。日字扣的中杆须接在两侧直腿区域，并保留上下各至少一倍框线径的净孔高。AI 先读 `getTool({id:'quickModel'})` 的当前参数卡，再用当前页面上下文调用 `api.run`：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'frame',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'rectBuckle',section:'round',innerWidth:10,innerHeight:25,
    sectionSize:3.5,innerRadius:0.9,gapWidth:0
  }}},{id:'size',method:'measure',args:{bodyId:{$ref:'frame.createdBodyIds.0'}}}]
});
```

这个 PG10251 图面参数候选得到外 17×32 mm、深 3.5 mm 的单实体；原图只有回退预览可用，尚未完成其它表面特征核验。读取回执、精确测量与显示修订，失败则保留旧模型。完整约束及历史修改方法见 `readDocs({docId:'recipes.compact-rect-buckle'})`。

PG7440 提供了一种更严格的源图选择法：原 DXF 的两条闭合多段线直接给出外 33×23、内 25×15，四个外角 R4.5、四个内角 R0.5；侧视两端圆弧 R2。宽高各相差 8 mm、角 R 相差 4 mm，与 Ø4 圆线的统一偏置吻合。AI 先核这些关系，再把上方 `params` 换成 `{kind:'rectBuckle',section:'round',innerWidth:25,innerHeight:15,innerRadius:0.5,sectionSize:4,gapWidth:0}`。浏览器得到单实体 33×23×4 mm、1152.436255 mm³；这验证了正视理想轮廓和圆截面候选，不推断图面未说明的接缝或局部表面。完整页面脚本及适用条件见 `readDocs({docId:'recipes.source-round-rect'})`。

PG3014 的紧凑圆线日字扣使用同一个 `quickModel`，`kind:'sliderBuckle'`，取图面内宽 19.9、内高 20.5、框线 Ø5.8、中杆 Ø3.5 mm；`innerRadius:3` 和 `barOffset:0` 是试拟。把上面 `params` 换为 `{kind:'sliderBuckle',section:'round',innerWidth:19.9,innerHeight:20.5,innerRadius:3,sectionSize:5.8,barDiameter:3.5,barOffset:0,gapWidth:0}` 即可经相同的 `api.run` 建模并测量。内核外廓 31.5×32.1×5.8 mm，比原图标注外廓 31.7×32.3 mm 各少 0.2 mm；不要擅自改 Ø5.8 消除这个差值。图上的局部细节仍待核验。完整脚本和限制见 `readDocs({docId:'recipes.compact-slider-buckle'})`。

PG8570 经正视和侧视核对属于圆线外框加中横杆，不是平板双窗。继续复用同一 `sliderBuckle` 页面工具：`{kind:'sliderBuckle',section:'round',innerWidth:45,innerHeight:20,innerRadius:7,sectionSize:5,barDiameter:5,barOffset:0,gapWidth:0}`。浏览器试建得到一个有效实体，精确包围 55×30×5 mm、体积 3523.416492 mm³，渲染修订与模型修订一致。源图标出内 45×20、外 55×30、框 Ø5，但 `innerRadius:7` 仅是可见外形的试拟；源图上下边略鼓，中杆侧视的 4.3 标注尚需解释，当前恒截面圆线和圆杆未逐线复原。把内 R 提到 8 会让横杆接在弯角区，工具按几何约束拒绝且保留旧模型。完整可调用脚本见 `readDocs({docId:'recipes.round-wire-slider'})`。

## 圆边独立 R 平面框

“快捷模型”中的 `roundedFlatFrame` 把独立内外轮廓和整件圆边放在一个可编辑的历史特征内。AI 先读 `getTool({id:'quickModel'})` 中该 kind 的参数卡，再按当前 `getState().context` 发 `api.run` 的 `add`：

```js
const api=window.webcad.api;
const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),
  steps:[{id:'frame',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'roundedFlatFrame',outerWidth:48,outerHeight:28,
    innerWidth:40,innerHeight:20,outerRadius:5,innerRadius:1.5,
    thickness:4,edgeRadius:1.9
  }}}]
});
```

整件尖边须全部按指定 R 成功；失败则此步骤不提交，也不会自动缩小 R。示例 R1.9 mm 对同类两张源图的参数试算通过，R2 mm 失败，所以这不是精确半圆截面的证明。读取精确测量、画面修订和限制见 `readDocs({docId:'recipes.rounded-flat-frame'})`。

PG3213 同类迁移可输入 `outerWidth:42,outerHeight:23,innerWidth:30,innerHeight:11,outerRadius:6,innerRadius:1.5,thickness:6,edgeRadius:2.9`：一个封闭实体，实测 42×23×6 mm、2923.414344 mm³。源图侧视写 Ø6，但精确半厚圆边 R3 被当前内核拒绝，R2.9 只提供相近外观。这里直边料宽 `(42−30)/2=6`，而外角 R6 与内角 R1.5 相差 4.5；角部不是恒定圆截面扫掠的同心偏置，不能改用 `ellipseSectionRectFrame` 来保持全部源尺寸。若要精确源角部及截面，需变量截面或源面重建。

## 圆环内接横杆快捷模型

界面从“快捷模型”选择“圆环内接横杆”；脚本先读 `getTool({id:'quickModel'})` 中的 `ringBar` 参数卡，再用当前 `getState().context` 调用 `api.run`：

```js
const api=window.webcad.api; const {revision,...identity}=api.getState().context;
const result=await api.run({
  context:{...identity,expectedRevision:revision},
  idempotencyKey:crypto.randomUUID(),
  steps:[{id:'ring',method:'add',args:{op:'quickModel',refs:[],params:{
    kind:'ringBar',section:'round',innerDiameter:20,sectionSize:3,
    barDiameter:2,barOffset:0,barDepthOffset:0
  }}}]
});
```

成功后读回新实体、精确测量值和显示修订号。`innerDiameter` 是孔径，外径为 `innerDiameter+2*sectionSize`；横杆沿 X，`barOffset` 沿 Y，`barDepthOffset` 沿 Z 相对环中面错层，默认 0。要求 `abs(barDepthOffset)<(sectionSize+barDiameter)/2`，保证横杆与环有实体交叠。PG10225/PG10226 的 Ø5 环和 Ø5 杆按侧视错层 4 mm 可形成 31/36 mm 外径、9 mm 总深的单实体候选；接头 R1.5 和端部曲线尚未复刻，不能当成原件通过。只适合固定单横杆，源图没有给出的尺寸不要猜成产品规格。完整约束和修改方法见 `readDocs({docId:'recipes.ring-bar'})`。

## 竖向底部开口四圆弧圈

先用 `quickModel` 的 `ovalBuckle` 创建横向、右端开口圈，再在同一页面批次中对实际新实体执行 `transform` 的 `rz:-90`。第二步的 `refs` 使用 `[{$ref:'oval.createdBodyIds.0'}]`，由第一步回执解析；完整参数与回读方法见 `readDocs({docId:'recipes.open-oval'})`。该组合支持调整开口宽度与截面，但四圆弧轮廓的半径需要从图纸或拟合取得，不能把示例半径当成源件尺寸。

## 批量圆柱凸台

“加工 → 孔与槽 → 批量圆柱凸台”对应严格 v2 `multiBoss`。AI 先用 `getState()` 取得当前上下文和真实实体 ID，`getTool({id:'multiBoss'})` 取得版本及 schemaHash，再经 `execute` 的 `feature.add` 或 `api.run` 的 `add` 提交。对已有 40×20×3 mm 板件：

```js
{op:'multiBoss',refs:[bodyId],params:{
  radius:2,height:3,axis:'Z',direction:1,
  points:[[10,10,3],[30,10,3]]
}}
```

每个 XYZ 是全局凸台底面圆心；最多 64 个。圆柱沿有符号的 X/Y/Z 轴生成，每一个必须增加材料并与主体连成单一实体，失败则整步不提交。示例理论体积为 `2400 + 2 * Math.PI * 2**2 * 3` mm³。用 `getState()` 和 `measure` 读回实际结果；可用 `feature.edit` 修改原历史特征并重建。通孔另用 `multiHole`。页面内完整说明：`readDocs({docId:'recipes.multi-boss'})`。

## 批量矩形凹槽

工具栏“加工 → 孔与槽 → 批量矩形凹槽”与页面脚本共用 `multiPocket` 严格 v2 工具。先读取当前 `getState()` 的上下文及实体 ID，再调用 `getTool({id:'multiPocket'})` 取得实际 `version/schemaHash`。用 `api.run` 的 `add` 步骤传入：

```js
{op:'multiPocket',refs:[bodyId],params:{depth:0.5,axis:'Z',direction:-1,pockets:[
  {x:10,y:10,z:3,width:6,height:4},
  {x:25,y:10,z:3,width:6,height:4,cornerRadius:0.5}
]}}
```

这里假设目标为高 3 mm 的板件。每个 XYZ 是世界坐标的刀具入口中心；切入轴为 Z 时，宽沿 X、高沿 Y，`direction:-1` 沿负 Z 切入，统一切深 0.5 mm。切入轴为 X 时宽/高沿 Y/Z，轴为 Y 时沿 Z/X，可加工对应的侧面。`cornerRadius` 可省略或为 0，非零时必须小于宽高短边的一半。支持 1–64 个凹槽，每个必须实际去除材料；任何一个失败，整步不提交。提交后读回 revision、特征和实体，再用 `measure` 核对体积。用 `feature.edit` 修改该历史特征的参数可从源几何重新计算。页面脚本详细用法可直接读 `readDocs({docId:'recipes.multi-pocket'})`；圆孔用 `multiHole`。

在空白工程中，可直接由页面脚本调用同一个命令队列：

```js
const api = window.webcad.api;
const {revision, ...identity} = api.getState().context;
const result = await api.run({
  context:{...identity, expectedRevision:revision},
  idempotencyKey:crypto.randomUUID(),
  steps:[
    {id:'plate',method:'add',args:{op:'box',params:{width:40,depth:20,height:3},refs:[]}},
    {id:'recess',method:'add',args:{op:'multiPocket',refs:{$ref:'plate.createdBodyIds.0'},params:{
      depth:0.5,axis:'Z',direction:-1,pockets:[
        {x:10,y:10,z:3,width:6,height:4},
        {x:25,y:10,z:3,width:6,height:4,cornerRadius:0.5}
      ]}}},
    {id:'size',method:'measure',args:{bodyId:{$ref:'recess.createdBodyIds.0'}}}
  ]
});
console.log(result, api.getState().context);
```

`api.run` 是逐步提交的批次；如果第二步失败，第一步板件仍保留。已有实体时只提交 `multiPocket` 一步并传当前真实 bodyId。

完整操作说明：[整件圆边、选面过渡、参数重调与全局显示](ROUNDING-AND-DISPLAY.zh-CN.md)。全局设置用 setDisplayPreferences，默认颜色/材质和灯光保存在 Cookie，单体覆盖保留在属性中。

## 平滑过渡与接缝定位

`smoothTransition` 是严格 v2 工具，参数 `{radius:0.1,faceIds:[当前面序号,...]}`，`refs:[当前实体ID]`。UI 在“加工 → 曲面处理 → 平滑过渡”：切到面模式、Ctrl 多选至少两个相邻面，再预览/确认。只处理所选面相互之间的尖锐接缝，多条接缝联动求解；不会把文字孔边或与未选面的所有边界一起纳入。半径不自动缩小。

`queryGeometry` 的边结果新增 `startPoint/endPoint/midpoint/bounds/adjacentFaceIds/normalAngleDeg/sharp/degenerate`，面结果含 `edgeIds`。法向夹角取精确面在边上 20%、50%、80% 三点的最大值；超过 1° 标为尖锐，无法测量为 null，退化极点单独标记。可通过空间坐标和相邻面直接找接缝，不需要模拟鼠标或猜索引。

成功后 `getState().bodies[].transitionReport` 返回源面组、处理的源边、半径以及结果中其余尖锐边的当前序号。结果必须是有效封闭实体；抽样检查拒绝保留下来的所选尖缝或无法归属的新尖缝；局部过渡止于未选面的锐利边界通过 boundarySharpEdges 单列报告。该检查不是连续曲率证明、所有顶点证明或整件安全认证；未选的原有锐边仍会保留并报告。`TEST.stp` 的外围面组已用 R0.1 实测；字槽原有边仍需按产品要求另行处理。新旧面/边序号不可跨修订混用。

## 1.2 编辑接口与文档下载

AI 可用 `execute` 调用 `document.rename`、`feature.rename`、`body.visibility`、`body.appearance`、`document.appearance`、`body.explode`、`preview.start/commit/cancel`。先 `getTool({id:动作名})` 读取字段与示例；UI 对应表为 `readDocs({docId:'api.ui-coverage'})`。`getState()` 读回 `hidden/colors/appearance/renderFinish/view`。

`body.appearance` 的参数是 `{bodyIds:[实际ID],color:'#ff8844',finish:'design'}`。颜色与材质独立；`color:null` 重置默认色，`finish:null` 跟随工程。`document.appearance` 使用 `{finish:'nickel'}`，只影响没有材质覆盖的实体。二者均保存到工程，并支持撤销。

`setView` 还支持 `display:solid|edges|wire`、`grid/snap:布尔值`、`gizmo:off|translate|rotate`、`selectionMode:body|face|edge`、`camera:{position:[x,y,z],target:[x,y,z]}` 和 `language:zh|en`。`measure({context,points:[XYZ,XYZ]})` 测输入坐标间距，结果来源为 provided-coordinates；不会冒称自动吸附所得精确几何。

按需读取：[轻量目录](../public/automation/manifest.json)、`automation/tools/<id>.json` 与 `automation/docs/<id>.md`。全量知识库：[Markdown](../public/automation/knowledge.md) / [JSON](../public/automation/index.json)。网页 AI 面板提供下载按钮。所有说明与卡片完整分页导出；导入知识库后仍应比较 `info().catalogHash`，有变化重新读取当前卡片。

WebCAD 的页面自动化入口是 `window.webcad.api`。正常产品使用是通过 HTTPS 或本机 localhost 打开构建后的静态页面。建模计算在浏览器 Worker 中完成。客户端需要具备获授权的页面 JS 调用及返回能力；页面公开这个对象本身，不代表现有 ChatGPT 侧边栏已接通。此文档是接口目标和发现说明，实际可用性以当前构建的 `info()` 与真实调用结果为准。

产品目的和验收标准见 [PROJECT.md](../PROJECT.md)。AI 速读入口是发布页的 `llms.txt` 与 `automation/quickstart.md`，HTML 也提供 alternate 文档链接。无需使用终端 CLI。

## 批量调用与侧栏入口

具备授权页面脚本通道时，直接调用 `await window.webcad.api.run(request)`。本次 Chrome 开发环境的 CDP `Runtime.evaluate` 配合 `awaitPromise: true` 可使用此入口；不要据此假定所有侧栏都支持脚本。AI 通过宿主已授权的页面脚本通道后台调用公开 API；JSON 面板仅供用户明确要求时手工调试，不能作为 AI 自动回退入口。无脚本通道时报告实际限制。宿主通道发现见 `readDocs({docId:"api.connection"})`。

```js
const a = window.webcad.api;
const s = a.getState(); // 就绪：s.summary.kernelReady && !s.summary.busy
const {revision, ...context} = s.context;
await a.run({
  context: {...context, expectedRevision: revision},
  idempotencyKey: crypto.randomUUID(),
  steps: [
    {id:'ring', method:'add', args:{op:'torus',
      params:{majorRadius:15, minorRadius:2.5}, name:'线径5 内径25圆环'}},
    {id:'size', method:'measure', args:{bodyId:{$ref:'ring.createdBodyIds.0'}}},
    {id:'step', method:'files.export', args:{format:'step',
      ids:{$ref:'ring.createdBodyIds'}, name:'ring-25-5.step'}}
  ]
});
```

最大 20 步、3 MiB、JSON 深度 32。`add` 自动取得当前工具版本/hash，参数和引用仍按工具卡填写；不会把 advisory 卡升级成严格契约。批次自动推进本批回执中的 revision，遇外部修改即停止。

`completed` 表示步骤已完成；`displayMatchesContext` 才表示回执时的画面对应当前模型版本。需要可见结果时加入 `setView` 或 `redraw` 步骤，并检查该字段；画面呈现可能晚于几何提交。

用 `{$ref:'步骤ID.返回字段.数组序号'}` 引用前步真实结果。批次不是原子事务：`atomic:false`；`partial` 时先前成功步骤保留，可逐步撤销。相同文档实例内、完全相同 key/请求重发返回原回执，修改请求需新 key。key 最多 80 字符，每实例最多 100 份批次回执，跨页面重载无保证。失败回执不能当成全部成功。`elapsedMs` 是页面内批次耗时。

可用方法、参数与错误处理详见 `readDocs({docId:'api.run'})`。`files.register` 在批次中接收 `{name,base64,mime?}`；统一 LOGO 的面、放置点、平面/曲面限制和 `placementVersion:2` 见 `readDocs({docId:'api.logo'})`。LOGO 可直接把已复核的闭合轮廓放入 `params.regions`，无需文件选择器；PDF/SVG 文件字节本身不等于已验证的轮廓。新建/打开、截图、读取完整文件字节继续使用专用页面 API。

面板的“下载”只表示发起下载。`files.save/export` 返回生成资源；脚本取字节使用 `files.read({resourceId,as:'bytes'})`，不能误传 `as:'base64'`。只有 `files.write` 对已授权句柄写入并回读匹配后才是 `write_verified`。

## 单步发现与调用

```js
const api = window.webcad.api;
const info = api.info();
const state = api.getState();
const tools = api.searchTools({ query: '安装板' });
const box = api.getTool({ id: 'box' });
const coordinates = api.readDocs({ docId: 'coordinates' });
```

`info()` 报告构建标识、`transport: "in-page"`、就绪状态、单位、目录哈希和能力限制。`getState(options)` 读取当前工程、特征、实体、revision、dirty、显示状态，以及已保存的 `parameters` 和计算后的 `parameterValues`；默认不返回导入源字节。`searchTools({query,category?,limit?,cursor?})` 从真实操作注册表查询。`getTool({id,version?})` 返回当前操作或页面方法的卡片；例如 `getTool({id:'setView'})`、`getTool({id:'measure'})`、`getTool({id:'files.save'})`。`readDocs({docId,version?,cursor?,limitChars?})` 只读白名单说明，不接收文件路径。可读 `start`、`coordinates`、`errors`、`api.execute`、`api.named-parameters`、`api.query-geometry`、`api.views`、`api.file-errors`、`recipes.mounting-plate` 和 `recipe.file-workflow`。操作工具说明可使用 `webcad://operations/<id>/<version>`，版本和哈希来自当前工具卡。

`queryGeometry(request)` 用当前 B-Rep 筛选面或边，处理零结果、歧义、分页及绑定当前几何快照的选择令牌。`execute(request)` 由同一 CommandService 提交建模、编辑、撤销等已注册命令。写入请求必须携带当前页面返回的完整上下文：

```js
{
  context: { sessionId, documentId, documentInstanceId, expectedRevision },
  idempotencyKey: '本次语义命令的唯一键',
  action: 'feature.add',
  args: {
    op: 'box',
    opVersion: box.version,
    schemaHash: box.schemaHash,
    params: { width: 50, depth: 30, height: 3 },
    refs: []
  }
}
```

示例中的上下文字段须取自当前 `getState()`，不得照抄或自行增加 revision。下一次修改读取本次真实提交结果或新状态。`box` 从世界坐标原点沿 +X/+Y/+Z 延伸，尺寸是宽、深、高，单位 mm。`hole` 和 `multiHole` 使用**半径**与世界 XYZ 刀具起点，不接受 `diameter` 或直接把二维 XY 点代入。工具卡的 `schemaHash` 必须与执行请求一致。当前严格 v2 参数契约覆盖 `box`、`hole`、`multiHole`、`faceHole`、`fillet`、`chamfer`、`shell`；其他操作通过页面 CommandService 的 advisory 适配器可执行，但 Schema 不保证内核结果。可复现的四孔板脚本见 [页面 API 示例](examples/page-api-plate.js)，按实际提交结果取特征与实体 ID。

圆角 `fillet` 与倒角 `chamfer` 都要求恰好一种明确范围：`allEdges:true` 表示当前实体全部边；`faceIds:[...]` 表示当前所选面的全部边界（包括孔边）；`edgeIds:[...]` 表示指定边。先对当前实体 `queryGeometry`，不能跨修订复用面/边序号。页面 UI 选体、选面、选边时分别显示并传入相应范围；AI 调用应直接传这三个字段之一。R 值或倒角距离过大、边界过密时内核会拒绝，保持原模型并返回可读错误，不会自动缩小尺寸。2 mm 厚板可先试 R0.3 mm；这只是操作示例，不是产品尺寸建议。

## 命名参数与尺寸联动

`getTool({id:'document.parameters'})` 描述 `execute` 的 `document.parameters` 动作。`args.parameters` 中的每个名称映射到 `{value,unit}`，其中 `value` 是数字或表达式字符串，`unit` 为 `mm` 或 `scalar`；`args.bindings` 以实际特征 ID 为键，将特征现有数值字段路径映射到表达式。定义和绑定与已有工程内容合并，一次更新作为一个可撤销的原子重建。示例：

```js
await api.execute({
  context: currentContext(),
  idempotencyKey: crypto.randomUUID(),
  action: 'document.parameters',
  args: {
    parameters: {
      length: { value: 50, unit: 'mm' },
      edgeMargin: { value: 5, unit: 'mm' }
    },
    bindings: {
      [plateFeatureId]: { width: 'length' },
      [holesFeatureId]: {
        'points.1.0': 'length-edgeMargin',
        'points.3.0': 'length-edgeMargin'
      }
    }
  }
});
```

`plateFeatureId`、`holesFeatureId` 和 `currentContext()` 由实际页面状态及操作结果取得；完整可运行写法在示例文件中。此后只提交 `args:{parameters:{length:{value:63,unit:'mm'}}}`，右孔 X 会按绑定计算。用户也可在“参数表”只改数值，不需要 AI 运行。已绑定字段的直接数值编辑返回 `PARAMETER_BOUND`。表达式不执行 JS；循环、缺失参数、单位不符、越界和不安全的后续拓扑索引都会拒绝并保持上一好模型。当前没有通用二维约束求解或角度/面积表达式绑定。

## 文本命令与数值拟合

`executeText({context,idempotencyKey,text,dryRun?})` 是纯输入命令入口。每行可写 `add <操作ID> key=value ...` 或 `measure <bodyId|$last>`，最多 20 行；例如 `add box width=30 depth=20 height=2.5` 后接 `measure $last`。复杂字段使用 JSON 值。`dryRun:true` 返回解析后的步骤，执行则交给已有 `run` 与 CommandService，回执标明每步结果；已提交步骤可撤销。此入口只解析白名单语法，不执行 JS、shell 或任意自然语言。用户明确要求手工调试时，可从“帮助 → 手工 JSON 调试”打开文本输入框。详见 `readDocs({docId:'api.text-command'})`。

`fitProfile({context,kind:'circle'|'line',plane?:'XY'|'XZ'|'YZ',points:[[u,v],...],maxResidualMm?})` 是只读计算入口，返回截面采样点的圆心/半径或直线方向，以及最大和 RMS 残差。`maxResidualMm` 是调用者输入的比较阈值，并非默认产品公差。它借鉴原 `text-to-cad` 截面圆候选计算；不自动认定源图为解析圆，也不生成实体。已有 `fittedSurface` 建模操作可将结构化点阵拟合为一张 B-spline 面；可通过文本 `add fittedSurface points=... tolerance=...` 调用。详见 `readDocs({docId:'api.profile-fitting'})`。

## 成型几何检查

从 text-to-cad 的 `dfam-check` 迁入的 `inspectPrintability({context,bodyId,angleLimitDeg?:45})` 可在“视图 → 成型检查”操作，也可通过页面 API 调用。它读取当前实体的显示网格，报告表面积、当前方向悬垂面积、六个轴向摆放方向的悬垂面积及成型高度，并给出支撑柱体粗估；包围尺寸和体积来自精确 B-Rep 元数据。角度阈值由调用者输入，范围为 0–90 度（不含端点）。这是几何事实，不包含材料和设备工艺限值，也未测最小壁厚、孔径或实际切片支撑；结果不改变工程 revision。完整限制见 `readDocs({docId:'api.printability'})`。

## 实测、视图与真实画面

`measure({context,bodyId,kind?,topologyId?})` 从精确 B-Rep 读取当前实体的体积和包围尺寸，或面/边测量。面/边请求需 `kind:'face'|'edge'` 与非负整数 `topologyId`；返回单位、`source:'exact-brep'` 与实际内核结果。`setView({context,direction?,projection?,fit?,selectedIds?,section?})` 支持方向 `top/bottom/front/back/left/right/side/iso`、正交/透视、适配、当前实体选择和 `section:{axis:'X'|'Y'|'Z',position:有限数字,enabled:boolean}`。section 只是画面裁剪，不切割 B-Rep；相机/裁剪改变不增加建模 revision。`redraw({context})` 重绘当前模型；`capture({context})` 等待画面版本与工程 revision 一致后返回 `image/png` 的真实 `dataUrl`、context 和 display，画面不匹配时返回 `DISPLAY_FAILED`。宿主若只能返回文本，需使用其已有的合法图像工具，不能声称 AI 已看到图片。

```js
const { revision, ...identity } = api.getState().context;
const context = { ...identity, expectedRevision: revision };
await api.setView({ context, direction: 'top', projection: 'orthographic', fit: true });
const picture = await api.capture({ context });
if (picture.status !== 'read') throw new Error(picture.error?.code || 'capture failed');
// picture.dataUrl is the actual PNG data URL for this rendered frame.
```

`measure`、`setView`、`redraw` 和 `capture` 的校验错误返回 `status:'failed'`、`commitState:'not_committed'`、错误代码及当前 context。`execute`、`queryGeometry` 返回 CommandService 的结构化状态；`files` 方法抛带 `code` 的 Error，调用方应捕获。详细边界由 `readDocs({docId:'api.views'})` 和 `readDocs({docId:'api.file-errors'})` 提供。

## 浏览器文件方法

`api.files` 提供 `capabilities`、`register`、`new`、`open`、`import`、`save`、`export`、`read`、`download`、`write`、`release`。`capabilities()` 返回当前浏览器限制和格式。`register({name,data,mime?})` 的 `data` 是实际 `File`、`Blob`、`ArrayBuffer` 或 `Uint8Array`，`name` 是安全文件名；不能用本机路径字符串或远端 URL 代替。它返回 `resourceId`、字节长度和 SHA-256。`new({context})`、`open({context,resourceId})`、`import({context,resourceId})`、`save({context,name?})`、`export({context,format,ids?,name?})` 使用当前完整上下文。页面 API 的新建/打开遇 dirty **一律拒绝** `UNSAVED_REPLACEMENT`；UI 的真实用户确认是另一条路径。坏文件或重建失败保留原几何、历史、身份和 dirty。原生 `.webcad` 包含导入源字节和可编辑历史，重开生成新的 `documentInstanceId`。

`save`/`export` 返回 `status: 'generated'` 的资源描述；`read({resourceId,as:'blob'|'bytes'})` 返回实际 Blob 或 `Uint8Array`。`download({resourceId})` 仅返回 `download_initiated`；`write({resourceId,handle})` 在已授权的 File System Access 句柄写入、关闭并校验回读大小和 SHA-256 后返回 `write_verified`。保存旧快照时若已有新 revision，dirty 仍为真。`release({resourceId})` 释放资源；已经启动的下载 Object URL 由定时器回收，不因 release 立即撤销。文件选择或授权可能需要真实用户操作，页面 API 不会伪造授权点击。跨插件 JSON 边界不能假设 Blob 会无损传递；客户端不能传真实字节时，可由用户在 WebCAD 页面选择文件。每个资源上限 20 MiB，最多 32 个、合计 64 MiB，有效期 30 分钟。自包含工程的导入源会以 base64 放入格式化 JSON；为保证仍能生成 `.webcad`，有效上限约为 20 MiB 减去 4 KiB，不能只看原始导入文件大小。

静态版不含原有本机 IGES 转换器，也不含 DWG/DXF/矢量 PDF/AI 的服务端转换器。目录中相应卡片标为 `unavailable`，执行应返回 `CAPABILITY_UNAVAILABLE`。可先在现有 CAD 工具中离线转 STEP；这不算 WebCAD 的原生 IGES 支持。

## 运行与证据边界

应用不接收 `eval`、`new Function`、任意脚本源码、任意 URL 加载或任意文件系统路径。当前选择令牌只对其文档实例、revision 和 B-Rep 快照有效；旧令牌不得重定向到新拓扑。命令幂等回执只保证同一页面工程实例内的有限内存范围，重载后不保证。失败结果应区分未提交、已提交但显示或保存失败，以及无法确认的状态。

`src/page-api-docs.js` 从真实 `operation-registry.js` 生成操作目录。执行 `node scripts/generate-page-docs.mjs` 会更新 `public/automation/index.md` 和 `index.json`，构建时一并复制到静态包。模型可按版本和目录哈希缓存说明，不应把旧 session、revision、body ID 或拓扑编号当作永久事实。旧协议文档保留为开发历史，不用于正常页面调用。

静态包可部署在 HTTPS 或本机 localhost 的普通静态托管位置。打开页面后等待 `api.info().ready === true`，并核对 `info().page.url` 和 `getState().context` 指向目标标签页；然后调用白名单方法。静态索引位于部署目录的 `automation/index.md` 与 `automation/index.json`，可先阅读接口再操作模型。Node/Vite 是构建及测试工具，不是页面建模服务。代码示例仅展示调用方式，实际浏览器运行和 ChatGPT 侧边栏访问须分别验证。
