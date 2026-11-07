# Licensing

The viewer distribution includes and directly integrates GPL-3.0-or-later LibreDWG components. Accordingly, the combined viewer distribution is offered under GPL-3.0-or-later. Source files that originated under the MIT License remain available under their original MIT terms when used independently, and all third-party notices remain in force.

The bundled occt-import-js and Open CASCADE WebAssembly components are provided under LGPL-2.1. Open CASCADE also includes its published LGPL exception. The retained licence texts and exception are under `cad-viewer/vendor/occt-import-js/`.

This repository contains components under different open-source licenses:

- Application code derived from `mlightcad/cad-viewer` is provided under the MIT License. See [`LICENSES/MIT.txt`](LICENSES/MIT.txt).
- The bundled LibreDWG JavaScript/WebAssembly parser components are provided under GPL-3.0-or-later. See [`LICENSES/GPL-3.0-or-later.txt`](LICENSES/GPL-3.0-or-later.txt).
- The bundled public font sample contains only fonts covered by the SIL Open Font License; licence files are under `cad-data/open/licenses/`.
- The SHX parser retains its notice in `cad-viewer/vendor/shx-parser-LICENSE.txt`.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for component paths and [`CORRESPONDING_SOURCE.md`](CORRESPONDING_SOURCE.md) for exact source versions, build material and runtime hashes.

No single license in this file overrides the license notices attached to individual third-party files.

## WebCAD 实际构建分发

上文保留的是既有 viewer 的组合分发许可声明及上游权利，不是对本次所有新增源码重新授权。不得删除或改写上游版权，不将新脚本、Services、宿主或独立第三方组件一律标记为 GPL。各文件的原许可继续有效。

WebCAD 的 Vite 构建自动生成根目录 `./open-source-notices.html` 与 `./open-source/`，复制安装包的完整 LICENSE/COPYING/NOTICE，并记录实际构建（包括 Worker）的模块、安装版本、锁文件来源和分发文件 SHA-256。建模使用的 `replicad-opencascadejs` 为 LGPL-2.1-only；`manifold-3d` 为 Apache-2.0，完整文本保留于 `LICENSES/manifold-3d-3.5.4-Apache-2.0.txt`。原有 Open CASCADE exception 原文仍保留，但旧 importer 的版本/exception 不能证明新建模内核的完整来源。

本地 Python 转换器确实在 PDF/AI 分支使用 PyMuPDF。其 1.26.4 安装包的 COPYING 只包含双许可声明；该声明原样保留，另附官方同版本 AGPL-3.0 全文 `LICENSES/PyMuPDF-1.26.4-AGPL-3.0.txt`。未验证商业授权，不把声明理解为已经取得商业使用许可。Python/MuPDF 不随静态 dist 复制，不表示相关服务无需许可评估。

生成物包含精确工作字节的受限源码快照和完整 build identity 输入指纹；基础 Git 提交链接不冒称 dirty working 源码。完整第三方内核对应源、构建工具链闭包与重新链接/复现仍有缺口，见 `CORRESPONDING_SOURCE.md` 和生成的 `open-source/build-source.json`。这些材料是工程记录，不构成法律意见或已法律合规的声明。

## 分发范围与待决授权

[来源与许可清单](docs/compliance/source-license-map.json)分别记录原始来源、AI 辅助状态、许可、权利主体、证据状态及 public-web / integrated-web / agent-host / services / dev-only 范围。未知主体保持 pending；本说明没有替新增应用代码选择版权人或统一授予 MIT。维护者需确认的文件范围和工程材料列于[待决事项](docs/compliance/LICENSE_DECISION.md)。

当前公开分发未获门禁批准。构建生成 `open-source/distribution-policy.json`，保留阻塞项；`npm run build` 校验材料完整性，不替代公开授权。公开发布须运行 `node scripts/verify-public-release.mjs <候选目录> public-web`，相关范围未闭合时拒绝。可选服务不因未复制到静态包而自动免审；公开功能一旦调用该服务，须审查该次实际部署范围。
