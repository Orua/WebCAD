# WebCAD

面向小五金零件的浏览器三维作图软件。通过草图、参数化模型和实体加工，快速完成单次建模、核对最终形体、保存工程或导出精确 STEP。

基础建模在浏览器内运行，使用 Replicad / OpenCascade WebAssembly 计算精确几何，Three.js 显示模型。可以人工独立使用，也可以按需接入 Agent 自动化和 Services 转换、复杂几何计算。

[在线使用](https://goldenfu.cn/webcad/) · [使用手册](docs/USER-GUIDE.zh-CN.md) · [页面 API](docs/PAGE-API.zh-CN.md) · [许可说明](LICENSE.md)

[English](README.en.md) · [快速开始](docs/QUICKSTART.md) · [构建与发布门禁](docs/BUILD.md) · [贡献](CONTRIBUTING.md) · [安全与隐私](SECURITY.md) · [变更记录](CHANGELOG.md)

当前在线链接保持原地址。本轮独立匿名公开版、无 Agent 操作台的构建及新演示地址尚待实现和实际验收，不能将已有静态页面入口视为这些事项已通过。公开分发仍受[许可决策与材料缺口](docs/compliance/LICENSE_DECISION.md)阻塞；开发构建通过不代表已获公开发布批准。

## 能做什么

| 方向 | 主要功能 |
| --- | --- |
| 快速建模 | 基本实体，以及框扣、圆环、牌件、轴套、螺丝、弹簧等参数化快捷模型 |
| 草图与轮廓 | 解析线弧、尺寸与几何约束、偏移、修剪、投影和轮廓修复 |
| 实体加工 | 拉伸、旋转、扫掠、放样、布尔、孔槽、阵列、圆角、倒角、抽壳和分割 |
| 图案与表面 | LOGO 路径、凹凸加工和浮雕；具体格式、曲面和复杂度范围以工具说明为准 |
| 检查与展示 | 尺寸、体积、间隙、干涉和部分壁厚检查，标准视图、金属材质与截图 |
| 文件交换 | 打开与保存 WebCAD 工程，导入 STEP / BREP，导出 STEP / STL / BREP |
| 自动化 | 人工与 Agent 操作同一个当前工程，共用命令、几何内核与错误回执 |

工具是否可执行，取决于当前选择、几何条件和已配置的能力。复杂圆角、自由曲面、密集浮雕等功能有适用范围，不能仅凭工具名称判断模型已具备加工条件。

## 开始作图

1. 从快捷模型、基本实体或打开已有文件开始，也可以先画轮廓再拉伸。
2. 选择实体、面或边，使用加工与变换工具，输入实际尺寸；需要预览的操作先预览再应用。
3. 在当前会话中调整参数，使用撤销、重做检查结果。
4. 保存 `.webcad` 工程；需要交给其他 CAD 软件或切片软件时，再导出对应格式。

默认保存的 `.webcad` 包含最终精确 BRep 或完整网格、对象身份、外观、显隐、材料和有效锚点。重新打开后恢复最终形态；默认文件不保存建模配方和撤销时间线。浏览器自动恢复只能辅助找回中断状态，仍应主动保存工程。

更详细的菜单、选面、参考锚点和文件操作说明见[完整使用手册](docs/USER-GUIDE.zh-CN.md)。

## 文件格式

| 格式 | 支持范围 |
| --- | --- |
| `.webcad` | 保存与打开工程，继续对已保存的几何进行操作；兼容读取旧版工程 |
| `.step` / `.stp` | 导入、导出精确 CAD 几何，不携带原软件的草图和特征树 |
| `.brep` / `.brp` | OpenCascade 精确几何交换 |
| `.stl` | 导出三角网格，供切片或其他网格流程使用；不等同于可编辑的精确实体 |
| LOGO / 矢量路径 | 支持 `.logo.json`、受限 SVG 等本地路径；其他格式取决于已配置的转换能力 |

IGES、DWG / DXF、PDF / AI 等格式的支持需要区分浏览器能力、查看器和可选转换服务。没有相应能力时，可先在其他 CAD 工具中转换为 STEP；各工具不会因此自动获得完整格式兼容性。

## Agent 自动化

页面公开 `window.webcad.api`，允许具备授权页面脚本通道的宿主发现工具、读取当前状态、建模、测量及处理文件。

```js
const session = await window.webcad.api.connect({
  queries: ['创建模型', '测量', '导出'],
});
```

首次连接后按握手提供的工作流、工具卡和知识包操作，检查 `canExecute` 与 `blockers`。接口暴露在页面上，不代表任意聊天侧栏都已具备执行页面脚本的权限。

- [Agent 入门](docs/AGENT-RUNTIME.zh-CN.md)
- [能力发现](docs/AI-DISCOVERY.zh-CN.md)
- [知识包与缓存](docs/AGENT-KNOWLEDGE.zh-CN.md)
- [页面 API 参考](docs/PAGE-API.zh-CN.md)

CLI / MCP 代码保留作开发兼容工具。正常使用静态页面和人工建模不需要安装它们。

## 从源码构建

需要 Node.js 22.12+（或兼容的较新受支持版本）与 npm；已锁定 Vite 包的 engines 声明是最终依据。

```sh
npm ci
npm run build
```

构建结果位于 `dist/`，可部署到 HTTPS 或本机 localhost 静态托管环境。项目使用相对资源路径；部署时保留 Worker、WASM、静态资源、自动化契约及开源材料的完整目录结构。`file://` 双击打开不作为受支持的运行方式。

静态前端无需安装 WebCAD 应用服务。可选后端源码位于 `services/WebCADServices/`；服务端转换与复杂计算需要单独配置对应能力，不能由静态托管代替。

常用验证入口：

```sh
npm run test:contracts
node --test scripts/open-source.test.mjs
node --test scripts/license-policy.test.mjs
```

测试分组、私有夹具和浏览器验收有不同前提；单元测试通过不代表任意真实模型或生产环境已经验收。

准备公开分发时，在同一候选输出上执行 `node scripts/verify-public-release.mjs dist public-web`，先跑原有发布完整性检查，再按实际组件、静态复制文件和[来源清单](docs/compliance/source-license-map.json)核对许可范围。当前未闭合项会使该门禁失败；开发阶段的 `npm run build` 不因此被当作公开发布批准。详见[验证口径](docs/VALIDATION.md)与[公开版交付边界](docs/PUBLIC-DEPLOYMENT.md)。

## 开源组件与许可

本仓库包含不同许可下的组件。许可证按组件和文件分别适用；现有 viewer 的组合分发声明不等于对所有新增源码作了统一授权。

| 材料 | 内容 |
| --- | --- |
| [LICENSE.md](LICENSE.md) | 许可范围与当前 WebCAD 分发说明 |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | 第三方组件、版权、使用位置及补充许可记录 |
| [CORRESPONDING_SOURCE.md](CORRESPONDING_SOURCE.md) | 对应源码版本、构建信息、证明材料及尚缺的内容 |
| [LICENSES/](LICENSES/) | 随仓库保留的完整许可证原文 |

构建会自动生成 `open-source-notices.html` 和 `open-source/`。页面右下角的“开源许可”入口可查看本次构建的组件清单、许可文本、构建标识、分发文件哈希，以及受限的工作源码快照。源码快照有明确收录范围，不替代完整第三方内核对应源或全部重建材料。

当前仍有 OCCT / WASM 完整对应源、工具链和替换重链接材料等缺口；可选 Python 转换器使用的 PyMuPDF 也需按实际部署核对其授权。生成材料和校验通过表示工程记录一致，不代表所有许可义务已完成。具体证据与范围见上述说明文件。

## 技术结构

- `src/`：页面、命令、工具、建模、浏览器 Worker 与 Agent 接口。
- `public/`：静态资源、示例和生成的公开自动化文档。
- `services/WebCADServices/`：可选转换与复杂计算服务。
- `scripts/`：构建、契约生成、开源材料生成与发布校验。
- `tests/`：契约、几何与集成测试。
- `docs/`：使用手册、接口和开发说明。

项目目的与架构约束见 [PROJECT.md](PROJECT.md)。问题反馈请提交到 [GitHub Issues](https://github.com/Orua/WebCAD/issues)，附操作步骤、预期结果和脱敏后的错误信息；请勿上传私有图纸、账号凭据或客户资料。
