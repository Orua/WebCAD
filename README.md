# WebCAD

**Browser-based precision CAD, designed for people and Agents.**

[Open the public editor](https://goldenfu.cn/webcad/public/) · [中文](README.md#中文说明) · [User guide](docs/USER-GUIDE.zh-CN.md) · [Page API](docs/PAGE-API.zh-CN.md) · [Licensing](LICENSE.md)

WebCAD is a browser CAD application for small hardware parts, from buckles, rings and hooks to plates, sleeves and custom solid models. Open it in a browser, build with real dimensions, inspect the geometry, save a project and export precise STEP or mesh STL files.

## Why WebCAD

- **Open a browser and start modeling.** Core modeling runs locally through WebAssembly; no desktop CAD installation or mandatory application server is required. Optional Services add selected conversions and complex geometry operations.
- **An API designed for Agents.** Agents discover capabilities and call structured CAD operations directly. The automation workflow replaces traditional Computer Use—screenshot interpretation, coordinate clicks and simulated keystrokes—with explicit parameters, state queries and operation receipts.
- **Choose your own Agent.** External Agents such as Codex, DSH and WorkBuddy can control WebCAD through an authorized page JavaScript channel or a compatible host adapter. Integration follows the public API contract and is not tied to one model, provider or built-in chat interface.
- **Human and Agent share one model.** Both use the same current document, command layer and geometry Worker. You can inspect the result visually, adjust it manually and continue the workflow through the API.
- **Precise geometry and practical delivery.** Replicad and OpenCascade provide BRep modeling, Three.js renders the viewport, and project saving plus STEP export carries the result into other CAD workflows.

## What you can do

| Area | Capabilities |
| --- | --- |
| Fast modeling | Primitives and parameterized hardware models, including buckles, rings, plates, sleeves, screws and springs |
| Profiles and sketches | Lines and arcs, dimensions and geometric constraints, offset, trim, projection and profile repair |
| Solid operations | Extrusion, revolution, sweep, loft, booleans, holes, arrays, fillets, chamfers, shells and splits |
| Patterns and surfaces | Vector paths, engraving, embossing and relief within each tool's documented scope |
| Inspection and display | Dimensions, volume, clearance, interference, selected wall-thickness checks, materials and standard views |
| Files | Save/open `.webcad`; exchange STEP and BREP; export STL meshes |
| Automation | Capability discovery, modeling, measurement, file operations, state readback and structured errors |

Availability depends on input geometry, selection and configured capabilities. Difficult fillets, dense relief and general freeform surfaces have limits; this is not a complete mechanical CAD/CAM suite.

## Agent integration: API instead of screen clicking

```text
External Agent → authorized page channel → window.webcad.api
               → shared commands → geometry Worker → result and state
```

Start with capability discovery in the open page:

```js
const session = await window.webcad.api.connect({
  queries: ['create model', 'measure', 'export'],
});
```

Follow the returned workflow and knowledge-package instructions, verify the package hashes, then load the relevant tool cards. Check `canExecute` and `blockers`, call the documented operation with explicit arguments, and read back the resulting state. The API gives the Agent CAD semantics instead of asking it to infer button positions from pixels.

An Agent host must supply an authorized channel for executing page JavaScript. The names above are integration examples, not a claim that every version connects automatically. The public editor does not include a built-in Agent console; external control depends on the host's capabilities and authorization. Manual modeling works independently. CLI/MCP compatibility code is optional development tooling.

[Agent workflow](docs/AGENT-RUNTIME.zh-CN.md) · [Capability discovery](docs/AI-DISCOVERY.zh-CN.md) · [Knowledge packages](docs/AGENT-KNOWLEDGE.zh-CN.md) · [API reference](docs/PAGE-API.zh-CN.md)

## Start modeling and save your work

1. Open the public editor and create a primitive or a parameterized model, import an existing part, or draw a profile and extrude it.
2. Select the required object, face or edge; enter dimensions and apply an operation.
3. Inspect the result and use session undo/redo as needed.
4. Save `.webcad`, then export STEP for precise CAD exchange or STL for a mesh workflow.

A default `.webcad` file stores final BRep or complete meshes, object identity, appearance, visibility, materials and valid anchors. Reopening restores the final shape; the default file does not preserve a full parametric feature tree or the session undo timeline. Browser recovery supplements explicit saving.

STEP/STP and BREP/BRP exchange precise geometry. STL export produces a triangle mesh. Other formats, including IGES, DWG/DXF and PDF/AI, depend on the specific viewer, importer or optional conversion service; listing a format does not imply complete browser modeling support. See the [user guide](docs/USER-GUIDE.zh-CN.md).

## Build from source

Use Node.js 22.12+ or a compatible newer supported version, with npm:

```sh
npm ci
npm run build
```

Host the complete `dist/` directory over HTTPS or localhost. Keep relative asset paths, Workers, WASM, automation contracts and open-source materials together. Opening the HTML through `file://` is unsupported. Optional backend source lives in `services/WebCADServices/`.

[Quick start](docs/QUICKSTART.md) · [Build instructions](docs/BUILD.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

## Projects used and licensing

WebCAD combines its application code with the following projects. Original copyrights and component-specific licenses remain in force.

| Project / material | Role | License |
| --- | --- | --- |
| Replicad 1.1.0 | Browser parametric modeling API | MIT |
| replicad-opencascadejs 1.1.0 / OpenCascade | Precise BRep geometry kernel compiled to WebAssembly | Bindings: LGPL-2.1-only; OCCT: LGPL-2.1 with its applicable exception |
| Three.js 0.180.0 | 3D rendering, cameras and interaction | MIT |
| Manifold 3.5.4 | Closed-mesh boolean operations | Apache-2.0; Clipper2 dependency: BSL-1.0 |
| polygon-clipping 0.15.7 | Union of overlapping relief contours | MIT; dependencies retain their own terms |
| mlightcad/cad-viewer | Retained viewer-derived application code | MIT for the original code |
| GNU LibreDWG / mlightcad/libredwg-web | DWG parsing components | GPL-3.0-or-later |
| occt-import-js 0.0.23 | Retained CAD viewer importer | LGPL-2.1; bundled OCCT exception retained |
| text-to-cad 0.7.19 | Adapted modeling guidance | MIT, © 2026 Thompson Labs LLC |
| Poly Haven studio HDR / bundled public fonts | Lighting and font resources | CC0-1.0 / SIL OFL-1.1 respectively |
| MCP SDK, ws and zod | Optional Node compatibility tools | MIT |
| Vite | Frontend build tooling | MIT |

Optional Python conversion uses ezdxf (MIT), svgelements (MIT), Shapely (BSD-3-Clause) and PyMuPDF (AGPL-3.0 or a separately obtained Artifex commercial license). Optional LogoVector service dependencies include Newtonsoft.Json (MIT), StbImageSharp (Unlicense OR MIT) and PdfPig (Apache-2.0). These service/tool dependencies are separate from the static browser runtime. Transitive and embedded libraries are detailed in the notices.

**This is a multi-license repository.** The existing combined viewer distribution is offered under GPL-3.0-or-later because it directly integrates LibreDWG. Independently licensed original files retain their terms. That viewer declaration does not assign a single license or copyright holder to every WebCAD, Agent or Services file, and this documentation does not introduce a blanket MIT grant.

- [LICENSE.md](LICENSE.md): licensing scope and distribution terms.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): upstream projects, copyright notices, paths and embedded dependencies.
- [LICENSES/](LICENSES/): retained full license texts.
- [CORRESPONDING_SOURCE.md](CORRESPONDING_SOURCE.md): pinned source versions, source availability and build/replacement material.
- [Scope decisions](docs/compliance/LICENSE_DECISION.md): recorded authorizations and per-candidate checks.

Builds generate `open-source-notices.html` and `open-source/` with component inventories, notices and hashes. Existing publication authorization is recorded by scope; each changed release still requires its own checks. Native rebuild/relink and byte-identical reproduction have not been executed, and optional service deployments require separate scope review.

## Repository and feedback

`src/` contains the UI, commands, Worker and Agent API; `public/` contains static assets; `services/` contains optional backends; `scripts/`, `tests/` and `docs/` cover development and documentation. See [PROJECT.md](PROJECT.md) for product scope and architecture.

Report reproducible issues through [GitHub Issues](https://github.com/Orua/WebCAD/issues), with sanitized steps and errors. Keep private drawings, customer data and credentials out of reports.

---

## 中文说明

**在浏览器里精确建模，面向人工与 Agent 共同设计。**

[打开公开版](https://goldenfu.cn/webcad/public/) · [English](#webcad) · [使用手册](docs/USER-GUIDE.zh-CN.md) · [页面 API](docs/PAGE-API.zh-CN.md) · [版权与许可](LICENSE.md)

WebCAD 是面向小五金零件的浏览器 CAD 工具，适用于框扣、圆环、挂钩、牌件、轴套及自定义实体。打开浏览器即可按真实尺寸建模、检查形体、保存工程，并导出精确 STEP 或网格 STL。

### 特点与优势

- **浏览器访问，直接开始作图。** 基础建模由 WebAssembly 在浏览器内计算，无需安装桌面 CAD，也不强制依赖应用服务器。可选 Services 用于特定格式转换和复杂几何运算。
- **从接口层面面向 Agent 设计。** 摒弃传统 Computer Use 的看截图、猜坐标、模拟点击与键盘操作方式，Agent 通过公开 API 直接发现工具、传入参数、读取状态和接收结构化回执。
- **外部 Agent 自由接入。** 不限于 Codex、DSH、WorkBuddy，也不绑定某个模型、厂商或内置聊天框。只要宿主提供经过授权的页面 JavaScript 执行通道或兼容适配器，就能按契约直接控制 WebCAD。
- **人工与 Agent 操作同一个工程。** 两者共用当前文档、命令层和几何 Worker。Agent 完成后，人可以直接查看、修改，再继续交给 Agent 处理。
- **精确几何与文件交付。** Replicad / OpenCascade 负责 BRep 建模，Three.js 显示结果，可保存工程并通过 STEP 与其他 CAD 软件交换几何。

### 主要功能

| 方向 | 功能 |
| --- | --- |
| 快速建模 | 基础实体及框扣、圆环、牌件、轴套、螺丝、弹簧等参数化模型 |
| 草图与轮廓 | 直线圆弧、尺寸与几何约束、偏移、修剪、投影与轮廓修复 |
| 实体加工 | 拉伸、旋转、扫掠、放样、布尔、孔槽、阵列、圆角、倒角、抽壳和分割 |
| 图案与表面 | 矢量路径、刻线、凹凸加工与适用范围内的浮雕 |
| 检查与展示 | 尺寸、体积、间隙、干涉、部分壁厚检查、材质与标准视图 |
| 文件与自动化 | 工程保存/打开、STEP/BREP 交换、STL 导出，以及对应 API 操作与状态读回 |

可执行性取决于输入几何、选择条件和已配置能力。复杂圆角、密集浮雕及一般自由曲面存在适用范围，当前并非完整的机械 CAD/CAM 套件。

### Agent 如何控制

调用路径为：**外部 Agent → 授权页面通道 → `window.webcad.api` → 共用命令与几何内核 → 结果和状态**。

首次连接在已打开的页面中调用：

```js
const session = await window.webcad.api.connect({
  queries: ['创建模型', '测量', '导出'],
});
```

按握手返回的流程下载并核对知识包哈希，加载需要的工具卡，检查 `canExecute` 与 `blockers`，再按文档传参并读回结果。Agent 获得的是明确的 CAD 操作语义，无需从屏幕像素推断按钮位置。

宿主必须具备经过授权的页面脚本执行能力。上述 Agent 名称表示可接入的宿主类型，不代表任意版本都能免配置连接。公开版不内置 Agent 操作台；能否外部控制取决于宿主能力与授权。人工建模可独立使用，CLI / MCP 兼容代码只是可选开发工具。

[Agent 工作流](docs/AGENT-RUNTIME.zh-CN.md) · [能力发现](docs/AI-DISCOVERY.zh-CN.md) · [知识包](docs/AGENT-KNOWLEDGE.zh-CN.md) · [API 参考](docs/PAGE-API.zh-CN.md)

### 开始使用与保存

1. 打开公开版，从基本实体、参数化模型、导入零件或绘制轮廓开始。
2. 选择对象、面或边，输入实际尺寸，应用加工或变换。
3. 核对结果，按需撤销、重做。
4. 保存 `.webcad`；精确几何交换导出 STEP，网格流程导出 STL。

默认 `.webcad` 保存最终 BRep 或完整网格，以及对象身份、外观、显隐、材料和有效锚点。重开恢复最终形态，不保存完整参数特征树或会话撤销时间线。浏览器恢复只作辅助，仍需主动保存。

STEP/STP、BREP/BRP 用于精确几何交换，STL 导出为三角网格。IGES、DWG/DXF、PDF/AI 等格式应区分查看器、导入器和可选转换服务，不代表浏览器建模完整支持这些格式。详细操作见[使用手册](docs/USER-GUIDE.zh-CN.md)。

### 从源码构建

需要 Node.js 22.12+ 或兼容的较新受支持版本，以及 npm：

```sh
npm ci
npm run build
```

通过 HTTPS 或 localhost 托管完整 `dist/`，保留相对资源路径、Worker、WASM、自动化契约和开源材料。不支持用 `file://` 双击运行。可选后端源码位于 `services/WebCADServices/`。

[快速开始](docs/QUICKSTART.md) · [构建说明](docs/BUILD.md) · [贡献](CONTRIBUTING.md) · [安全](SECURITY.md) · [变更记录](CHANGELOG.md)

### 使用的项目与版权许可证

| 项目 / 材料 | 用途 | 许可证 |
| --- | --- | --- |
| Replicad 1.1.0 | 浏览器参数化建模 API | MIT |
| replicad-opencascadejs 1.1.0 / OpenCascade | WebAssembly 精确 BRep 几何内核 | 绑定包 LGPL-2.1-only；OCCT 为 LGPL-2.1 及其适用例外 |
| Three.js 0.180.0 | 三维显示、相机和交互 | MIT |
| Manifold 3.5.4 | 闭合网格布尔 | Apache-2.0；Clipper2 依赖为 BSL-1.0 |
| polygon-clipping 0.15.7 | 浮雕交叠轮廓并集 | MIT；传递依赖分别保留原许可 |
| mlightcad/cad-viewer | 保留的查看器派生代码 | 原始代码 MIT |
| GNU LibreDWG / mlightcad/libredwg-web | DWG 解析组件 | GPL-3.0-or-later |
| occt-import-js 0.0.23 | 保留的 CAD 查看器导入组件 | LGPL-2.1，保留所带 OCCT 例外 |
| text-to-cad 0.7.19 | 改编的建模指导材料 | MIT，© 2026 Thompson Labs LLC |
| Poly Haven HDR / 公开字体样本 | 环境光照与字体资源 | 分别为 CC0-1.0 / SIL OFL-1.1 |
| MCP SDK、ws、zod / Vite | 可选 Node 兼容工具 / 前端构建 | MIT |

可选 Python 转换使用 ezdxf（MIT）、svgelements（MIT）、Shapely（BSD-3-Clause）和 PyMuPDF（AGPL-3.0 或另行取得的 Artifex 商业许可）。可选 LogoVector 服务使用 Newtonsoft.Json（MIT）、StbImageSharp（Unlicense OR MIT）和 PdfPig（Apache-2.0）。这些与静态浏览器运行时分开记录；嵌入库和传递依赖见完整第三方声明。

**本仓库采用多许可证，不能简单标成“全仓库 MIT”。** 既有查看器直接集成 LibreDWG，其组合分发保留 GPL-3.0-or-later 声明；可独立使用的原始文件继续适用原许可。该声明不把所有 WebCAD、Agent 或 Services 文件统一授权为 GPL，也不为新增代码指定统一版权人。本次文档整理不改变现有授权。

- [LICENSE.md](LICENSE.md)：许可范围与分发条款。
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)：上游项目、版权、文件位置和嵌入依赖。
- [LICENSES/](LICENSES/)：保留的完整许可证原文。
- [CORRESPONDING_SOURCE.md](CORRESPONDING_SOURCE.md)：固定源码版本、源码获取及构建/替换材料。
- [范围与授权记录](docs/compliance/LICENSE_DECISION.md)：已记录的授权及逐次发布检查。

构建生成 `open-source-notices.html` 和 `open-source/`，列出组件、许可与哈希。已有公开分发授权按范围记录，每次变更仍需核对候选包。原生重编、重链接及逐字节复现尚未执行；可选服务的实际部署范围需单独检查。

### 目录与反馈

`src/` 为页面、命令、Worker 和 Agent API，`public/` 为静态资源，`services/` 为可选后端，`scripts/`、`tests/`、`docs/` 为构建、测试和文档。产品定位与架构见 [PROJECT.md](PROJECT.md)。

问题请提交到 [GitHub Issues](https://github.com/Orua/WebCAD/issues)，附脱敏后的复现步骤和错误信息，不上传私有图纸、客户资料或凭据。
