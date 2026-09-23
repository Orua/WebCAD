# M1 operation contracts and static AI documentation

`src/operation-registry.js` composes the existing base, advanced and reference
catalogs. It does not initialize the CAD kernel, DOM, Worker, or a second document.
`src/ai-docs.js` serves bounded static bootstrap/search/tool/document results in
Node and browsers. Existing operation IDs and legacy MCP tool names remain intact.

## Strict migration boundary

Only `box`, `hole`, `multiHole`, `faceHole`, `fillet`, `chamfer`, `shell` are enabled
for v2 feature execution. Other operations have complete discoverable cards but
retain advisory schemas and the existing legacy entrypoint. Their documentation
does not certify a successful runtime or geometry test. `remove` and `import`
remain dedicated operations rather than `feature.add` candidates.

The `quickModel` card derives a per-kind `oneOf` parameter schema, fields, examples
and defaults from `QUICK_MODELS`, including `HARDWARE_TEMPLATES`. It is still an
advisory legacy operation. UI field minima are not promoted into kernel limits:
the kernel's existing geometric relationships remain authoritative.

The seven migrated operations use the existing JSON Schema definitions plus the
explicit conditional requirements in the registry. The project-local validator
in `src/contracts/operation-schema.js` implements a restricted JSON Schema
2020-12 vocabulary: types, object fields/required/additionalProperties, array
items/count/uniqueness, numeric and string bounds, enum/const, anyOf/allOf/oneOf/not.
It throws for unrecognized assertion keywords; it does not resolve external refs,
coerce types, remove fields, or inject Schema `default` annotations. Normalization
in the registry injects defaults after validation. All values must be finite JSON.

`schemaHash` is synchronous SHA-256 over canonical JSON with sorted object keys;
the hash covers the parameter contract, refs, units, defaults and selection/edit
semantics. `docsHash` separately identifies the complete published documentation.
Cards and lists are copied on read so caller mutation cannot change the registry.

## Preserved parameter meaning and intentional rejection changes

| Operation | Preserved meaning and defaults |
| --- | --- |
| box | Width/depth/height are required positive X/Y/Z dimensions from the origin. Kernel has no dimension fallback; UI 40/20/10 are form initial values, not API defaults. |
| hole | Radius, positive depth, world start XYZ; omitted XYZ=0, axis=Z, direction=1. |
| multiHole | 1–100 world XYZ cutter starts; shared radius/depth; axis=Z, direction=1. No `through` or diameter field. |
| faceHole | Explicit world point, radius and planar face; through=false by default, requiring depth. through=true computes sufficient depth. |
| fillet/chamfer | Positive radius/distance and explicit nonempty edgeIds or allEdges=true. |
| shell | Nonzero signed thickness and nonempty faceIds; positive means inward. |

New commands reject unknown fields, numeric strings, nonfinite values, invalid
enums, duplicate topology IDs, empty selections, malformed 2D hole points, and
`allEdges=true` combined with `edgeIds`. These inputs could previously be ignored
or coerced by permissive code. They are intentionally invalid now; radius is never
silently reinterpreted as diameter. Existing stored history is replayed by the
legacy kernel path; this registry is not a destructive history migration.

For fillet/chamfer editing, a patch containing nonempty `edgeIds` replaces the old
all-edge mode. A patch containing `allEdges:true` replaces prior edgeIds. A patch
containing both is rejected. Other parameters are merged, then the full result is
validated. Generic parameter deletion is unsupported.

Token-based feature creation uses two validation phases. The input phase allows
the token to supply face/edge IDs and rejects any explicit selector fields. After
the command service resolves the current-snapshot token, the resolved phase checks
complete kernel params. Tokens do not retarget historical feature edits. The
registry validates reference shape/count; the command service verifies actual
body existence, document/instance/revision and token validity.

The slot angle help now correctly reports degrees, without an appended mm unit.

## Static discovery and cache behavior

`bootstrap(options)` receives server/build identity from its host; absent host
identity it returns null/unreported and does not fabricate sessions. Modeling is
`not_ready` without a ready browser. Search without sessionId always reports
runtime availability `unknown`. Static contract hashes do not vary with browser
connection state.

Search is over the stable modeling catalog, sorted by ID. Cursors bind to query,
category, session scope and catalog hash. Documents have an explicit whitelist;
file paths are rejected. Document cursors bind to content hash. `get_tool` accepts
the existing op ID and registered version only. Resource URIs can be read through
the ordinary document tool even when the host does not register MCP Resources.

The execute workflow is bootstrap → list sessions → state → discover/read tool →
query topology if needed → execute → exact measurement → legacy export. M1 has
up to 1000 receipts per running document instance; new commands are refused at
capacity and existing receipts are not evicted. There is no durable or cross-reload
idempotency guarantee. File lifecycle automation, arbitrary workplanes, expressions
and generic sketch solving remain later milestones.

Cache tools under `agent/cache/webcad/` using trusted server identity, authorization
scope, apiVersion, catalogHash, operation ID and version. Do not treat revisions,
body IDs, topology indices or selection tokens as durable knowledge.

## Verification

`node --test tests/operation-registry.test.mjs` checks all card examples against
their published schemas, all template examples/defaults, strict parameter failures,
mode switching, token phases, reference/version gates, SHA-256 equivalence against
Node crypto, static discovery, pagination, and document path rejection. These are
pure contract checks. Kernel/browser/MCP execution and saved STEP readback are
separate acceptance categories recorded in the task report; schema validation by
itself proves no geometry result.

## Classified test entrypoints

| Command | Scope / prerequisites |
| --- | --- |
| `npm test` | Portable contracts + real WASM kernel + simulated MCP transport suites. Does not include local business fixtures or browser E2E. |
| `npm run test:contracts` | Pure parameter/command contracts, recovery/selection isolation and bounded viewport/unit checks; no browser or WASM startup. |
| `npm run test:kernel` | Real locked Replicad/OpenCascade WASM and generated small geometry fixtures. |
| `npm run test:mcp` | Real local protocol endpoints with simulated browser/adapter; does not certify browser/kernel E2E. |
| `npm run test:e2e` | Runs `node tests/m1-e2e.mjs`: actual MCP → isolated browser → real Worker. Requires a task-owned isolated service and exactly one empty ready test page. |
| `npm run test:local-fixtures` | Explicit workstation IGES import and roundtrip checks; needs matching original fixture files and the configured local OCP converter. |

`scripts/test.mjs` always runs from the repository directory, starts children with
`windowsHide:true`, and uses `node --test --test-concurrency=1` for the classified
test files. All existing `*.test.mjs` files must belong to exactly one group; a new
unclassified test causes a manifest error instead of silently disappearing from
the suite. A failed child returns its exit code. No unavailable test is converted
to a successful skip.

For browser E2E, `WEBCAD_TEST_URL` defaults to
`http://127.0.0.1:17667/mcp`. Start a separate test service/profile and open an empty
page first. The test checks that there is exactly one session and its design is
empty before modeling; never point it at a working user design. It writes its
acceptance artifacts under `agent/output/m1/`.

Local fixture locations can be overridden without editing assertions:

- `WEBCAD_IGES_IMPORT_FIXTURE`: default
  `G:/TEXT-TO-CAD/工程图3D_20260914/0/gc15372.igs`.
- `WEBCAD_IGES_ROUNDTRIP_FIXTURE`: default
  `G:/TEXT-TO-CAD/工程图3D_20260914/GC/HS13006.igs`.

Overrides must point to the corresponding original samples, not arbitrary IGES
geometry: the roundtrip test deliberately keeps its 70 faces / 0 solids assertion.
Missing files make the local-fixtures runner print `BLOCKED` and exit `2`, before
starting tests. Configure `WEBCAD_PYTHON` for the existing OCP conversion runtime
where needed; converter errors remain failures and are not hidden as skips.
