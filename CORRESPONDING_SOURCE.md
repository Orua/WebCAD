# Corresponding source and build information

This repository distributes WebAssembly and JavaScript derived from GNU LibreDWG and `mlightcad/libredwg-web`. The matching source used for the distributed build is included at:

`corresponding-source/libredwg-web-20260805/`

## Source versions

- GNU LibreDWG: tag `0.14.8556`, commit `e405fcff2eaff86b8389222b7e99529284e7ea0a`
- `mlightcad/libredwg-web`: tag `v0.7.9`, base commit `b70b5573a6bf2345e5fb10f2adff7fb74a8123c5`
- Golden Luck modifications: progressive conversion and large-file browser handling, marked in the modified TypeScript source
- Build toolchain: Emscripten `6.0.5`

## Distributed file checksums

SHA-256 checksums for the files distributed in `cad-viewer/wasm/`:

| File | SHA-256 |
| --- | --- |
| `libredwg-web.wasm` | `6FFD78D6CE4D356E31530365D6017B16F2B007400A4A6B7E08F1F8BDA601714B` |
| `libredwg-web.js` | `3954BBEFFC83712FF722B4C0BA0A850D758478C9B7BE0ACF6705E25B60E7293A` |
| `libredwg-web` JavaScript binding bundle | `E23103E334AAE2D9AFB93470B8EBB1A4B79886DE429C2195E06E1112D0F1944F` |

The JavaScript binding bundle is distributed as `cad-viewer/bindings/libredwg-web.js`.

## Rebuilding

See `corresponding-source/libredwg-web-20260805/README.md`. Its `build-wasm.ps1` script rebuilds the native LibreDWG/Embind layer with the documented Emscripten settings. The JavaScript package is rebuilt with the checked-in lockfile.

## Other native component

The 3D importer is `occt-import-js` `0.0.23` at commit `c2148e54b456b571238d35cac037d304053d64b2`, incorporating Open CASCADE Technology at commit `d2abb6d844231cb8f29be6894440874a4700e4a5`. Its published source is available from the upstream repository and its retained licence and exception notices are under `cad-viewer/vendor/occt-import-js/`.

| Distributed file | SHA-256 |
| --- | --- |
| `occt-import-js.js` | `3FB44CE11D00611F9B3F3C5775D520EBAB48930C1F08279B7B1316F05F0D3379` |
| `occt-import-js.wasm` | `33391FC9D94EA5C869A6718488BF0A9A464222BAC9BDC764DFE1690CEF281952` |
| `occt-import-js-worker.js` | `82A522FF94E1476E073B070B46B0AF6EE0BCBF99723328CF867FB69C4B95D5CF` |
| `font-engine.js` | `52A19A5BB5AE4B3CC833DB911FB331617E25082000AE320B447A03E49A384A98` |

This document is an engineering record of the distributed source and notices; it is not legal advice.

## WebCAD 当前构建的精确性与材料入口

上文的哈希和源码提交是保留的 legacy 记录，不自动证明其他建模内核、未来构建或当前 working 字节。当前公开仓库是 `https://github.com/Orua/WebCAD`，不是旧 CADViewer 仓库。构建自动生成：

- `./open-source-notices.html`：首页可直接链接的许可/源码总入口。
- `./open-source/manifest.json`：全部开源材料的 SHA-256 与字节数；manifest 自身不自包含哈希。
- `./open-source/inventory.json`：Vite 主构建和 Worker 的实际模块、安装版本、包元数据/许可、锁文件来源与 integrity、完整分发文件哈希；原生 WASM 必须与安装包或已保留 runtime 字节对应。
- `./open-source/build-source.json`：同一 `scripts/build-identity.mjs` 的 `buildId`、基础 commit、working 状态、`sourceHash`、工具版本和未齐材料。基础提交链接固定 commit，不链接 HEAD/main 冒充 exact；dirty 状态明确显示。
- `./open-source/build-inputs.json`：现有 build identity 算法覆盖的全部输入逐文件 SHA-256；哈希规则为按路径排序，对每项依次追加 `path + NUL + byteLength + NUL` 与原始字节。生成器不更改已有 identity 算法，因此根许可文档等额外证明材料另以 manifest/快照锁定。
- `./open-source/source-snapshot.json` 与 `working-source.zip`：实际工作字节的受限源码快照。记录每项路径、长度、SHA-256 及清单 treeHash，ZIP 固定时间戳，生成时和 release gate 核对磁盘工作字节。它不是 Git HEAD 的打包副本，也不是完整第三方内核源。

快照仅选择白名单文本源码、构建脚本、契约、测试、许可、文档及已有 LibreDWG 子集。排除数据、密钥/本机配置、历史 agent、图片缓存、二进制、node_modules、生成发现材料和 Services/宿主源配置。完整 build identity 的额外输入只给指纹，不以删去这些内容后的 ZIP 冒称完整重建包；静态图片等必要资源须按分发清单另外取得。内置敏感内容检测不能替代发布前的人审。

安装依赖使用仓库 `package-lock.json`（`npm ci`）；正常入口 `npm run build` 自动生成证明并执行 release gate。生成器不联网、不新增运行依赖。`scripts/verify-release.mjs` 拒绝缺失首页链接、过期 identity、改写许可、缺文件/遗留文件、源码 ZIP 不匹配或分发哈希漂移。该门禁是证明材料完整性检查，不是“已法律合规”或“所有第三方源码已齐”的判定。

## 固定来源与尚未齐备的对应源

| 组件 | 已有版本/来源证据 | 不能据此声称的内容 |
| --- | --- | --- |
| WebCAD 应用 | 构建时基础 commit URL 与本地 working 指纹/受限快照 | dirty 字节已发布到该 commit、完整产品可只靠此 ZIP 重建 |
| LibreDWG/libredwg-web | 上文固定提交及已有源码子集、Embind、构建脚本；本次实际 runtime 哈希 | 本轮已重编译、全部静态依赖及工具链对应源完整或逐字节复现 |
| replicad/replicad-opencascadejs 1.1.0 | 安装包 gitHead `e4b05f67dc4e2393a876ce8c5064a9c93db05bf1`，`https://github.com/sgenoud/replicad/tree/e4b05f67dc4e2393a876ce8c5064a9c93db05bf1`；已核对该提交 package.json | 此 gitHead 就是 OCCT 内核 commit、镜像内容不可变、完整内核源/修改/重链接材料已齐 |
| manifold-3d 3.5.4 | 安装 package.json/LICENSE、实际 JS/WASM 哈希；公开版本入口 `https://github.com/elalish/manifold/tree/v3.5.4` | npm 版本足以证明 C++ 和编入依赖的精确源闭包或构建可复现 |
| occt-import-js legacy | 上文固定 commits 和原许可/exception 原文保留 | legacy importer 一定随当前 Vite 分发，或可作为新建模 WASM 的源包 |
| PyMuPDF 1.26.4 可选 Python | requirements、实际 import 调用、本机既有安装元数据及官方同版本完整 AGPL | 当前部署版本/商业授权已核实、完整 MuPDF 源已提供、服务端 AGPL 边界已经审查完成 |

`replicad-opencascadejs` 安装包的真实构建脚本使用 `ghcr.io/taucad/opencascade.js:canary-ebd263f1-single-threaded` / `-multi-threaded`，README 中的泛化旧镜像说明不能替代这些脚本；尚缺镜像不可变 digest、匹配 OCCT/opencascade.js 源码树、生成配置及补丁、完整 native 依赖许可/对应源、工具链来源及替换/重链接验证。没有把本机另一份 OCCT SDK 或不同项目的源码混入，冒称当前 WASM 对应源。原 Open CASCADE LGPL exception 保持原文，不擅自扩大适用范围。

这些缺口在生成页面和机器清单中持续展示，不因通过工程 release gate 而被隐去；本次不提供未经授权的商业授权推定、书面源提供承诺或法律合规结论。

## Scope audit and publication gate

The build also publishes `open-source/docs/compliance/source-license-map.json`, its pending-decision document and `open-source/distribution-policy.json`. The report evaluates actual browser packages and copied public resource hashes against the reviewed map for `public-web` and `integrated-web`. The original release-integrity check verifies these materials against the current working source; an unresolved scope remains visibly blocked even when byte-integrity checks pass.

Run `node scripts/verify-public-release.mjs <candidate-directory> public-web` before publishing. It runs the existing release checks and then requires scope approval. Optional host/service deployments require their own actual inventories; static inventory does not approve their runtime or network behavior. See [build instructions](docs/BUILD.md) and [pending decisions](docs/compliance/LICENSE_DECISION.md). A clean application build, native-kernel rebuild/replacement, real-model acceptance and deployment are separate results; none is inferred from this documentation.
