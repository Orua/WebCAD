# Third-party notices

## Distribution review status

The retained notices below are preserved. The [scope map](docs/compliance/source-license-map.json) adds explicit source, notice and review status for actual browser packages, copied resources and optional runtimes. Twelve JavaScript package notices were compared with existing installed package metadata and retained text (CRLF/LF normalized); this does not claim a new clean installation or native rebuild. Build-time module-graph and runtime hashes remain authoritative for the candidate bytes.

The maintainer explicitly approved distribution of the exact supplied antique reference and new application work under existing scoped terms. Reviewed examples and generated previews retain per-file provenance and parent-scope checks. Pinned complete native source materials and retained build inputs are recorded in [corresponding source](CORRESPONDING_SOURCE.md). No creator identity, unrelated image grant or new uniform license is invented. See [scoped decisions](docs/compliance/LICENSE_DECISION.md) and the actual generated distribution report.

## mlightcad/cad-viewer

This project is derived from [mlightcad/cad-viewer](https://github.com/mlightcad/cad-viewer), which is distributed under the MIT License. The retained license text is in [`LICENSES/MIT.txt`](LICENSES/MIT.txt).

## LibreDWG WebAssembly parser

The following bundled runtime files are from or derived from [mlightcad/libredwg-web](https://github.com/mlightcad/libredwg-web) and [GNU LibreDWG](https://github.com/LibreDWG/libredwg):

- `cad-viewer/wasm/libredwg-web.js`
- `cad-viewer/wasm/libredwg-web.wasm`
- `cad-viewer/bindings/libredwg-web.js`

These components are distributed under GPL-3.0-or-later. The licence text is in [`LICENSES/GPL-3.0-or-later.txt`](LICENSES/GPL-3.0-or-later.txt).

The bundled build is pinned to GNU LibreDWG `0.14.8556` (`e405fcff2eaff86b8389222b7e99529284e7ea0a`) and mlightcad/libredwg-web `v0.7.9` (`b70b5573a6bf2345e5fb10f2adff7fb74a8123c5`), plus the Golden Luck progressive-viewer modifications. The complete source subset used for the build, build instructions and artifact hashes are retained under [`corresponding-source/libredwg-web-20260805/`](corresponding-source/libredwg-web-20260805/) and documented in [`CORRESPONDING_SOURCE.md`](CORRESPONDING_SOURCE.md).

## OpenCascade model importer

STEP, STP, IGES, IGS, BREP, and BRP files are imported by occt-import-js 0.0.23 and Open CASCADE Technology in a browser Web Worker. The bundled runtime files are:

- cad-viewer/vendor/occt-import-js/occt-import-js.js
- cad-viewer/vendor/occt-import-js/occt-import-js.wasm
- cad-viewer/vendor/occt-import-js/occt-import-js-worker.js

occt-import-js and the bundled Open CASCADE runtime are distributed under LGPL-2.1. Open CASCADE is also covered by its published LGPL exception. The licence texts and exception are retained beside the runtime as `license.occt-import-js.txt`, `license.occt.txt`, and `OCCT_LGPL_EXCEPTION.txt`.

The bundled runtime corresponds to occt-import-js tag `0.0.23` (`c2148e54b456b571238d35cac037d304053d64b2`) and its Open CASCADE submodule commit `d2abb6d844231cb8f29be6894440874a4700e4a5`. Exact source links and runtime hashes are recorded in [`CORRESPONDING_SOURCE.md`](CORRESPONDING_SOURCE.md).

## SHX parser

The bundled SHX parsing code retains its license notice at `cad-viewer/vendor/shx-parser-LICENSE.txt`.

## Bundled JavaScript libraries

`cad-viewer/font-engine.js` includes `@mlightcad/shx-parser`, `iconv-lite`, `buffer`, `ieee754`, and `safe-buffer`. Its generated licence banner and the separate SHX parser MIT notice must remain intact when redistributing the bundle.

## Studio HDR environment

`cad-viewer/studio-small-09.bin` is the unmodified Radiance HDR file `studio_small_09_1k.hdr` (renamed for static-server MIME compatibility), by Sergej Majboroda, distributed by Poly Haven under CC0 1.0. Source: https://polyhaven.com/a/studio_small_09. License: https://creativecommons.org/publicdomain/zero/1.0/. Runtime attribution accompanies the asset in `studio-small-09.LICENSE.txt`.

## Fonts

The self-hosted public font sample under `cad-data/open/fonts/` contains only Basic, Tenor Sans and VT323. Their SIL Open Font License texts are retained under `cad-data/open/licenses/`; source metadata is recorded in `cad-data/open/README.md` and `cad-data/open/manifest.json`. Other locally installed CAD fonts are intentionally excluded because their redistribution rights have not been established.

## WebCAD modeling runtime additions

The notices above remain applicable to the retained original CadViewer. WebCAD additionally uses the following installed runtime packages. Versions and declared licenses below were read directly from the installed package.json files; license texts were copied unchanged from each installed package LICENSE file.

| Runtime package | Version | Declared license | Retained license text |
|---|---|---|---|
| three | 0.180.0 | MIT | [three-0.180.0-MIT.txt](LICENSES/three-0.180.0-MIT.txt) |
| replicad | 1.1.0 | MIT | [replicad-1.1.0-MIT.txt](LICENSES/replicad-1.1.0-MIT.txt) |
| replicad-opencascadejs | 1.1.0 | LGPL-2.1-only | [replicad-opencascadejs-1.1.0-LGPL-2.1-only.txt](LICENSES/replicad-opencascadejs-1.1.0-LGPL-2.1-only.txt) |

Three.js provides WebCAD's viewport and camera controls. Replicad provides modeling operations. Replicad-opencascadejs supplies the additional OpenCascade JavaScript/WebAssembly modeling kernel included in the generated dist/assets files. These are separate from the legacy occt-import-js viewer runtime described above. Existing legacy license texts, exceptions, corresponding-source records and font notices have not been replaced by these new package notices.

## WebCAD local MCP runtime additions

The local MCP server additionally uses these installed packages. Package names, versions and MIT declarations were checked in their actual package.json metadata. License files below are unchanged copies of the installed LICENSE files; previous viewer and modeling notices remain intact.

| Runtime package | Version | Declared license | Retained text |
|---|---|---|---|
| @modelcontextprotocol/sdk | 1.30.0 | MIT | [mcp-sdk-1.30.0-MIT.txt](LICENSES/mcp-sdk-1.30.0-MIT.txt) |
| ws | 8.21.3 | MIT | [ws-8.21.3-MIT.txt](LICENSES/ws-8.21.3-MIT.txt) |
| zod | 4.6.5 | MIT | [zod-4.6.5-MIT.txt](LICENSES/zod-4.6.5-MIT.txt) |

The SDK implements MCP transport and tool registration, ws provides the local browser session bridge, and zod validates MCP tool arguments. They run in the local Node service; CAD geometry still executes in the browser's existing kernel.

## Relief contour union

The browser relief tool uses [polygon-clipping](https://github.com/mfogel/polygon-clipping) 0.15.7 to merge crossing and overlapping stroke outlines before constructing CAD cutters. Its dependencies are robust-predicates 3.0.3 and splaytree 3.2.3. Unmodified installed notices are retained at [polygon-clipping MIT](LICENSES/polygon-clipping-0.15.7-MIT.txt), [robust-predicates Unlicense](LICENSES/robust-predicates-3.0.3-Unlicense.txt), and [splaytree README including MIT license](LICENSES/splaytree-3.2.3-README-MIT.txt).

## Optional local vector-import dependencies

Vector-logo file parsing runs in an installed local Python environment, separate from the browser bundle. tools/requirements-logo.txt records versions: ezdxf 1.4.4 (MIT), svgelements 1.9.6 (MIT), Shapely 2.1.2 (BSD-3-Clause), and PyMuPDF 1.26.4 (GNU AGPL-3.0 or Artifex commercial license, as declared by its installed metadata). PyMuPDF's unchanged notice is retained in LICENSES/PyMuPDF-1.26.4-COPYING.txt. These Python packages are not copied into dist. DWG parsing invokes a separately installed GNU LibreDWG executable; it is not bundled by this change. Existing viewer licenses and corresponding-source records remain applicable.

## manifold-3d 3.5.4

- Use: mesh boolean (union / subtract / intersect) for closed triangle meshes in the CAD Worker (`src/mesh/mesh-boolean.js`).
- License: Apache-2.0, Copyright The Manifold Authors. https://github.com/elalish/manifold
- 完整安装包原文：[manifold-3d 3.5.4 Apache-2.0](LICENSES/manifold-3d-3.5.4-Apache-2.0.txt)。官方 v3.5.4 的 `src/manifold.cpp` 版权行为 `Copyright 2021 The Manifold Authors.`。安装包未提供独立 NOTICE，生成器仍会保留安装包内出现的全部 LICENSE/COPYING/NOTICE；未将缺少 NOTICE 推断为无其他原生依赖义务。

## 实际 WebCAD 分发范围与补充证据

上述 legacy viewer 段落及其版权/许可继续保留，是历史组件记录，不表示其中所有 runtime、字体和 importer 都被当前 Vite 复制。当前配置另复制 LibreDWG 的 binding、JS 与 WASM；浏览器模块、Worker、静态资源和实际哈希以构建自动生成的 `open-source/inventory.json` 为准。旧 `cad-viewer/open-source-notices.html` 分发入口改为指向根 notices 页面，避免旧的 `CADViewer/main` 链接冒称当前 WebCAD exact source。

安装包声明与实际构建范围分开记录：`@modelcontextprotocol/sdk`、`ws`、`zod` 为本地 Node 兼容工具，Vite 为构建工具，不能据 npm dependencies 把它们全部标成浏览器运行库。Replicad 传递依赖中实际入包的 flatbush/flatqueue（ISC）、opentype.js/tiny-inflate/string.prototype.codepointat（MIT）也由构建模块图收集并保留完整许可；只有实际模块图出现时才标记 browser-bundled。

Three.js 附带 `examples/jsm/libs/fflate.module.js` 自报版本为 **0.8.2**，不是锁文件中另一个 fflate 版本；其 [官方 v0.8.2 MIT 原文](LICENSES/fflate-0.8.2-MIT.txt) 单独保留。Three SVGLoader 中来自 `ppvg/svg-numbers` 的 MIT 片段保留[上游版权与许可](LICENSES/svg-numbers-MIT.txt)；该嵌入副本没有版本证明，不声称已定位 exact upstream commit。Poly Haven HDR 的归属原文及 [CC0-1.0 全文](LICENSES/CC0-1.0.txt) 同包分发。

## PyMuPDF 使用核实（静态包外的可选转换器）

- `tools/logo-vector-import.py` 的 `_pdf_geometry` 中执行 `import pymupdf as fitz`、`fitz.open`，并读取绘图数据；不是仅列在 requirements 中的闲置依赖。`scripts/logo-import.mjs` 通过可配置解释器调用它，PDF 和 PDF 兼容 AI 路径需要关注。
- `tools/requirements-logo.txt` 固定 1.26.4；本机既有 `text-to-cad/.venv` 的该版本 METADATA 与 COPYING 确认 `Dual Licensed - GNU AFFERO GPL 3.0 or Artifex Commercial License`，原有一行 COPYING 保持不变。补入[官方 1.26.4 完整 AGPL](LICENSES/PyMuPDF-1.26.4-AGPL-3.0.txt)，不再把那一行当作全文。
- 全文来源为 `https://raw.githubusercontent.com/pymupdf/PyMuPDF/1.26.4/COPYING`；源码版本入口为 `https://github.com/pymupdf/PyMuPDF/tree/1.26.4`。这不是对实际部署解释器版本、MuPDF 内核提交、服务是否走该分支或商业授权的证明。当前其他 Services 转换路径也不能凭此一并判定。
- 不把 Python/MuPDF 复制到浏览器 dist，不增加运行依赖；单独服务分发的其余 Python/原生依赖及网络使用的许可边界仍须按真实部署审查。此处不是授权或法律合规结论。

## 许可文本取证来源

现有 LICENSES 原文均保留；补充安装包副本不改写版权。fflate 来自 `https://raw.githubusercontent.com/101arrowz/fflate/v0.8.2/LICENSE`；svg-numbers 来自 `https://raw.githubusercontent.com/ppvg/svg-numbers/master/LICENSE`（仅许可证取证，不是源码版本认定）；CC0 全文来自 SPDX license-list-data v3.26.0 的 `text/CC0-1.0.txt`。原文随包保留并在材料 manifest 中记录 SHA-256，构建不依赖联网。

## text-to-cad method adaptation and Manifold dependency material

The Chinese modeling guidance retains the upstream text-to-cad v0.7.19 attribution, **Copyright (c) 2026 Thompson Labs LLC**, and its complete unchanged [MIT license](LICENSES/text-to-cad-0.7.19-MIT.txt). This identifies the upstream adapted material; it does not relicense unrelated application or service files.

The fixed Manifold 3.5.4 source includes its Clipper2 dependency at 46f639177fe418f9689e8ddb74f08a870c71f5b4. The complete unchanged [Boost Software License 1.0](LICENSES/Clipper2-Boost-1.0.txt) is retained. Original embedded header notices and Apache-2.0 texts remain unchanged. Exact acquired archive URLs and SHA-256 are listed in [native materials](corresponding-source/native-materials.json); native recompilation remains unexecuted; actual frontend/source deployment is recorded separately.
