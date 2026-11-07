# Pending authorization and source decisions

Status: **BLOCKED for public distribution**. No new license or copyright holder is selected by this document. The [machine-readable map](source-license-map.json) records evidence separately from AI assistance, component origin and intended distribution scope.

## Application rights: one maintainer decision

Existing [LICENSE.md](../../LICENSE.md) preserves inherited viewer terms and individual third-party licenses. It does not identify a confirmed rights holder and approved license for every new WebCAD application, service, host or documentation contribution. Git authors, repository ownership and AI generation alone are insufficient evidence of authorization.

The maintainer must identify which new files they have authority to license, the actual rights holder(s), and the approved outward license for that file scope. Candidate: MIT for independently licensable new work, retaining upstream terms and any applicable combined-distribution obligations. Alternative: retain current scoped terms and obtain missing permissions before adding a grant. This is one rights/scope decision, not a request to relabel the entire repository. Record the approved scope and evidence before changing `LICENSE.md`; no automatic approval is assumed.

## Engineering closure requirements

| Item | Available evidence | Required before affected publication |
| --- | --- | --- |
| Modeling OCCT WASM | Locked replicad-opencascadejs 1.1.0, retained LGPL text, package-level source record | Matching kernel and binding-generator source, patches/configuration, immutable toolchain identity, native dependencies and documented rebuild/replacement result |
| LibreDWG | Retained fixed commits, source subset, build script and historical runtime hashes | Verify complete matching-source/build material for distributed bytes; run a clean rebuild and explain any nonidentical bytes |
| Manifold | Locked 3.5.4 and retained Apache text | Exact native source/configuration and compiled-in dependency/notice review |
| Antique metal texture | `public/render-assets/antique-metal-reference.jpg`, used by `src/metal-materials.js` | Creator, fixed source, redistribution grant and unchanged/modified status; otherwise replace/remove in a coordinated implementation |
| Model examples and trial samples | Static-copy model folders under `public/` | Per-file source and rights review; files are not removed or relabeled by the audit |
| Referenced preview media | 108 image/guide files match the committed preview manifest and authoring scripts; individual hashes and model kinds are recorded in the scope map | Provenance is established; application authorization remains pending. Public copying now uses only current manifest references, excluding the 41 unreferenced old PNGs without deleting their source files |
| text-to-cad adaptation | Retained adaptation note and version fingerprints | Confirm retained upstream notice and scope of copied/adapted material; do not infer rights to unrelated application code |
| Optional Python/native service | Actual PyMuPDF import, requirements and retained license notice | Actual deployment versions, applicable authorization/source obligations and service boundary review |

These are evidence gaps, not findings that every component is unlawful. The matching-source inventory and byte-integrity generator remain useful while publication is blocked. Downloading a different OCCT SDK or citing a floating container tag does not close the matching-source requirement.

The retained `string.prototype.codepointat` notice has been matched to installed `LICENSE-MIT.txt`. Earcut 3.0.1 is tracked as a Three.js embedded copy rather than a fictitious top-level package. fflate and the svg-numbers fragment have separate exact installed-source and notice records; the latter's original upstream commit remains unknown and is not invented. The companion HDR attribution text is registered separately from its binary. These source/notice checks do not grant a license for new application code or close native-kernel corresponding-source obligations.

Applicable browser records are selected from the actual package/module graph and copied artifacts. An optional or tree-shaken package is not made a browser release blocker merely because it is installed. Referenced preview hashes establish a known generated source lineage while preserving the pending rights state; they do not turn arbitrary PNGs into approved resources.

## Handoff to public-build work

There is currently **no approved complete public package**. Reviewed HDR attribution can be retained, but that does not clear its surrounding application. Keep local host tools, optional Services and dev-only fixtures separate from static-browser approval. If a public feature invokes a service, add that service to the reviewed release scope.

Never copy private evidence, local configuration, customer CAD, backups or credentials. Keep the existing demo URL until actual public acceptance. Publication must run `node scripts/verify-public-release.mjs <candidate-directory> public-web`, which combines the existing release-integrity gate with scope approval; failures are release blockers, not warnings.

## 2026-11-07 technical material update

The current option is to retain existing scoped terms; this task does not require choosing a universal new MIT grant. Manifold's exact npm/commit/source/notice evidence and text-to-cad's complete upstream MIT notice have been registered. The 108 current generated previews inherit rights only from an explicitly approved application parent, while their own byte/source provenance remains independently checked. No blanket exemption covers unknown media or automation files.

Complete pinned OCCT/generator/bindings/dependency and LibreDWG/libredwg-web/zlib archives have now been acquired and compared; see [native material manifest](../../corresponding-source/native-materials.json). Statements above that those complete upstream archives are unavailable are historical. Native rebuild/replacement and public source delivery remain unexecuted, distinct from source acquisition. Manifold's Apache source package/rebuild is not a newly imposed source-disclosure condition; original license/notice requirements remain.

Outstanding actual facts are maintainer authority over the new application/example scope and the origin/redistribution grant for the antique reference image. These cannot be inferred solely from Git authors or generated image hashes. No new copyright holder, photo grant or public-release approval is invented by this update.
