# WebCAD

[中文](README.md) · [Quick start](docs/QUICKSTART.md) · [Build](docs/BUILD.md) · [License](LICENSE.md)

WebCAD is a browser CAD workbench for small hardware parts. Create a part manually or through an authorized Page API host, check it, save the final geometry and export it. Replicad/OpenCascade WebAssembly performs local precise modeling; Three.js displays the result. Optional Services provide selected conversions and complex computations.

## Model and deliver

1. Create a basic solid or a parameterized quick model.
2. Select the object, face or edge needed by the operation; change dimensions and apply the result.
3. Check dimensions and geometry. Use session undo/redo when needed.
4. Save a `.webcad` file, then export STEP for precise BRep geometry or STL for a triangle mesh.

The default project stores final BRep or complete meshes, object identity, appearance, visibility, materials and valid anchors. It restores the final shape. It does not preserve a complete parametric feature tree or the session undo timeline. Mesh import does not by itself create precise STEP geometry.

## Capabilities and boundaries

The workbench includes primitives, hardware templates, profiles, extrusion/revolution, sweep/loft, booleans, holes, arrays and selected rounding, shelling, relief and inspection tools. Availability depends on input geometry and configured capabilities. Complex surfaces, dense relief and difficult fillets have limits; a successful tool receipt alone is not manufacturing approval.

Manual local modeling uses the static frontend. The **separate anonymous public build without the Agent console is planned and has not been accepted here**. Existing demo links in the Chinese README are retained; this change does not attest their anonymous access or deploy a new site. See [public deployment status](docs/PUBLIC-DEPLOYMENT.md).

`window.webcad.api.connect(...)` discovers the current Page API and knowledge bundle. The host must already have an authorized page execution channel; the API does not grant that channel to arbitrary chat sidebars. CLI/MCP compatibility tools are optional development tools. See [Agent runtime](docs/AGENT-RUNTIME.zh-CN.md) and [Page API](docs/PAGE-API.zh-CN.md).

## Develop

Use Node.js 22.12+ (or a compatible newer supported release) and npm:

```sh
npm ci
npm run build
node --test scripts/open-source.test.mjs scripts/license-policy.test.mjs
```

Serve the complete `dist/` tree over HTTPS or localhost; preserve relative asset URLs, Worker/WASM files and notices. `file://` is unsupported. [Build instructions](docs/BUILD.md) distinguish a development build from a distribution approved for publication.

## Licensing and participation

This is a multi-license repository. Existing viewer distribution terms and upstream notices remain in force; no repository-wide MIT grant for new code is introduced. Matching native source/toolchain materials and some resource provenance remain unresolved. A passing integrity check is not permission to publish. See [third-party notices](THIRD_PARTY_NOTICES.md), [corresponding source](CORRESPONDING_SOURCE.md), [scope map](docs/compliance/source-license-map.json) and [open decisions](docs/compliance/LICENSE_DECISION.md).

[Contributing](CONTRIBUTING.md) · [Security and privacy](SECURITY.md) · [Validation](docs/VALIDATION.md) · [Changes](CHANGELOG.md)
