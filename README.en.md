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
