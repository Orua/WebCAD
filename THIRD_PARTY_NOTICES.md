# Third-party notices

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

## Optional local vector-import dependencies

Vector-logo file parsing runs in an installed local Python environment, separate from the browser bundle. tools/requirements-logo.txt records versions: ezdxf 1.4.4 (MIT), svgelements 1.9.6 (MIT), Shapely 2.1.2 (BSD-3-Clause), and PyMuPDF 1.26.4 (GNU AGPL-3.0 or Artifex commercial license, as declared by its installed metadata). PyMuPDF's unchanged notice is retained in LICENSES/PyMuPDF-1.26.4-COPYING.txt. These Python packages are not copied into dist. DWG parsing invokes a separately installed GNU LibreDWG executable; it is not bundled by this change. Existing viewer licenses and corresponding-source records remain applicable.
