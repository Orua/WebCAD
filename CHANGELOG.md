## 1.75.19 — bounded real-surface staggered engraving

- Optional `projectedGroove.pattern` projects every guide row and contour footprint onto one actual trimmed BRep face. Independent adaptive-polyline row lengths support equal spacing and stagger phases; explicit contour/projection/count budgets fail closed.
- Cut the original skin with a compound of bounded surface-normal tools, keeping one solid instead of floating positive copies. Reject boundaries/seams and unsupported variable laws; this is not raised scale embossing, geodesic wrapping or automatic fusion.
- Fixed-order BRepGProp quadrature on trimmed BSplines could report increased volume after a real cut. Surface-groove material checks now use signed span-aware adaptive integration, with measured convergence, not absolute volumes or relaxed removal checks.
- Region inspection now explicitly owns its native Common builder, returned solids and bounds. Completed null/zero-solid results are empty; native exceptions and unfinished operations are errors, never invented zero material. Numeric acceptance thresholds are unchanged.
- Curved/tapered, translated/scaled, endpoint material witnesses and public PageAPI + native save/reopen probes accompany the change. Browser artistic approval remains separate.

## 1.75.18 — preserve sculpted spine-law landmarks within the station budget

- Add explicit `curveSweep` spine `lawSampling:"preserveKnots"` for width/depth/roll scalar-law sample parameters. Keep `stations.count` as a hard 2–64 budget; reject insufficient budgets before public host execution. Omitted/`stations` recipes retain legacy sampling, and categorical profile laws are unchanged.
- Report actual section parameter, center, width and depth through `loftReport.spineFrames`, with requested/generated station counts and preserved knots. This corrects clipped mane/shoulder flares without promising no between-section overshoot.
- Document anatomy/negative-space-first sculpting and retain a reproducible public Page API anatomical dragon probe. Browser review loaded 29 objects/29 solids/45 history entries and found recognizable head/limbs but short torso, crowded mane/neck and unclear jaw/palm connections. This is basic display evidence, not full visual, connectivity or manufacturing acceptance.
- Preserve cubic S-body overshoot/negative-volume failures; the model uses an explicitly tested quadratic body, not absolute volume or silent fallback. Native picker, shared-edge mesh seams and ellipsoid zero-tip Boolean limitations remain unresolved.

## 1.75.17 — cross-realm public file registration

- Accept genuine Uint8Array, ArrayBuffer and Blob/File inputs across the public file boundary without relying on same-realm constructor identity. Copy bytes into local storage; retain strict type and byte-budget checks.
- Reject unrelated views and forged tags; cover foreign subviews, request objects, copy isolation, Blob/File inputs and exact open forwarding.
- Keep the review fixture's parent-realm input and verify registration SHA-256/byte length before opening. Independent browser review reported successful registration and a one-solid, 14-feature open; this is not native-picker or detailed mesh/shape acceptance.
- The older 1.75.15 saved-model metadata correction remains required. Native-picker behavior, six mesh boundary segments and rational-face zero-depth point-cap Boolean failures remain unresolved.

## 1.75.16 — browser-compatible probe files and saved-placement validation

- Match saved-placement version validation between browser open and the headless validator. Correct the probe writer to emit the same semantics metadata as the page host. Earlier probe files lacking this metadata are not browser-openable.
- Add file-picker lifecycle diagnostics, cancellation feedback, and an explicit local public-files-API review fixture. Native file-picker behavior and visual acceptance remain separate checks.
- Distinguish input, audited, and discarded degenerate triangle counts. Keep real boundary-edge warnings.
- Do not ship the experimental cubic point-cap change: the original sample passes, but a translated half-scale regression still fails. The zero-depth rational-face Boolean issue remains unresolved.

## 1.75.15 — refine shared-edge groove crossings

- Replace the 32-grid-point crossing choice with bounded refinement of sampled local-minimum basins, removing visible sideways detours on non-grid-aligned paths. This remains a 3D shared-edge polyline, not a geodesic or guaranteed global optimizer.
- Dispose rejected groove cut candidates, and document the unresolved rational-face zero-depth point-cap boolean limitation.
- Add a reproducible public Page API → command service → real OCCT coiled-dragon probe, including exact save/reopen checks. Browser visual acceptance remains separate.

## 1.75.14 — infer projectedGroove faces from nearest-face snap

- Allow `projectedGroove` to omit `faceId` and `faceIds`. Each path point snaps to the nearest current face within 0.1 mm, and the inferred chain must still change faces only across a shared topological edge. This is not a UV geodesic and does not search for a route on faces the polyline does not already approach. An inferred snap equally near two faces stays on the previous face when that face is one of the ties; otherwise it is rejected and the caller should pass explicit face ids. If a path point already lies on the shared edge, the crossing is still reported and is not dropped as a duplicate station. Explicit `faceId` / `faceIds` keep the 1.75.13 behavior. Width and depth laws are unchanged. Headless tests on a box omit face ids and still cut the top and side while leaving the interior diagonal unchanged, reject a non-adjacent inferred pair, and reject an ambiguous first point on a shared edge. Visual status is NOT_REVIEWED.

## 1.75.13 — variable-width projected groove along the existing path

- Extend `projectedGroove` with optional `widthLaw` (number or spline samples). The law is the full groove width in the local tangent plane, the same unit as `widthMm`, not half-width and not the `depthLaw` penetration unit. Constant `widthMm` remains valid; if `widthLaw` is present it governs width. Interior zeros are rejected; a path endpoint may be 0 and is closed with the existing ThruSections point cap, reported as `projectedGrooveReport.zeroEndWidth` / `tipPoints`. `depthLaw` is unchanged. `zeroEndDepth` now reflects only a zero penetration tip, so a zero-width tip does not claim a zero-depth tip. This is not UV geodesic projection or blended multi-face corners. Headless tests check a widening-to-narrowing plane groove against an off-axis shoulder, mid-path rejection, and a zero-width tip. Visual status is NOT_REVIEWED.

## 1.75.12 — scoped multi-face projected groove across shared edges

- Extend `projectedGroove` with optional `faceIds` (1–8). Points snap to the nearest listed face (0.1 mm). A face change is allowed only across a shared topological edge; the crossing is the shared-edge point that minimizes the 3D polyline length, not a UV geodesic. Each face is cut with its own surface-normal cutter; sharp corners are not blended. Single-face `faceId` remains valid. Width is still constant. Headless tests on a box show material removed on both the top and side, while an interior diagonal region is unchanged. Visual status is NOT_REVIEWED.

## 1.75.11 — variable-depth projected groove along one face

- Extend `projectedGroove` with optional `depthLaw` (number or spline samples). The law is actual inward penetration along the projected path, not `curveSweep` full-section height. Constant `depthMm` remains valid; if `depthLaw` is present it governs penetration. Interior zeros are rejected; a path endpoint may be 0 and is closed with the existing ThruSections point cap, reported as `projectedGrooveReport.zeroEndDepth` / `tipPoints`. Width is still constant. This is not multi-face continuation or geodesic projection. Headless tests check a fading groove on a cylinder and a plane, mid-path rejection, and a zero tip. Visual status is NOT_REVIEWED.

## 1.75.10 — single-face surface-normal projected groove

- Add `projectedGroove`: snap a 2–64 point world polyline onto one current face (0.1 mm) and cut a constant-width groove whose section depth follows the local surface normal. `depthMm` is actual inward penetration. This is not a planar slot, not logo engrave, and not multi-face or geodesic projection. Guidance routes surface-follow queries to this first slice; fading-recess remains the variable-depth spine path. Headless tests distinguish a cylindrical-arc groove from a chord-wise planar cut. Visual status is NOT_REVIEWED.

## 1.75.9 — point-cap zero tip on spine fading recesses

- Allow spine `widthLaw`/`depthLaw` to reach exactly 0 at a path endpoint. The kernel drops the degenerate ellipse and closes that end with an existing ThruSections point cap at the path point, reported as `loftReport.zeroEndDepth` and `tipPoints`. Mid-path zeros and negative values are still rejected, and at least two positive stations remain required. This is not surface-projected grooving. Guidance, contracts and headless cut tests are updated together.

## 1.75.8 — read-only region volume for local sculpt evidence

- Add measure kind `region` with axis-aligned `minMm`/`maxMm`. The kernel isolates a BREP copy and returns the exact AABB ∩ solid volume, solidCount, empty/overlap and intersection bounds without writing the document or filling whole-body metrics. Disjoint regions return volume 0; meshes and whole assemblies are explicitly unavailable. Fading-recess guidance now prefers this over a destructive intersect on the live solid. Headless tests confirm the documented cutter regions and that the source shape is unchanged.

## 1.75.7 — discover fading recesses from the modeling brief

- Route Chinese and English fading-groove requests to a focused guide and current curveSweep/cut/intersect/measure cards. Explain full section depth versus actual surface penetration, positive-tip limits, safe diagnostic copies and local volume evidence. Surface-projection queries explicitly reach unsupported-capability guidance, not a claim of a new groove engine. Verify routing and full card retrieval through the generated, hashed offline knowledge package.

## 1.75.6 — fading recess recipe on existing spine and cut tools

- Document the supported fading-groove route: a `curveSweep` spine cutter with strictly positive shrinking `depthLaw`, then `cut`. Zero end depth is rejected with an explicit message. Discoverable organic routing now includes the `cut` card. A headless test checks that the deep end removes more material than the shallow end; this is not a new projection-groove engine and was not visually reviewed.

## 1.75.5 — public cage-handle protection

- Add optional `protectVertexIds` on each `subdBody` brush: listed original cage vertex indices stay fixed for that stroke, with `protectedInRange` and `SUBD_BRUSH_PROTECTED_ONLY` when every in-range handle is pinned. Adjacent unlisted handles may still move, so this is not a fitted-surface lock. Public schema, tool notes, discoverable organic guidance and recovery catalog stay consistent.

## 1.75.4 — sculpting material verification and agent workflow

- Add opt-in local union `verifyMaterial:true`: exact per-source difference checks catch omitted material that total volume, bounding extents and even source vertices miss. Failed/unavailable verification preserves inputs; reports distinguish material coverage from connectivity and seam smoothing. Saved ordered Boolean topology remains ordered; Services rejects this unsupported option instead of ignoring it.
- Expand the discoverable organic modeling route with representation boundaries, continuous primary forms, batch/incremental detail differences, fading-detail limits, numerical vs visual evidence, verified save/reopen and timeout recovery.

# Changelog

## 1.63.4 — released 2026-11-08

- Restore exact profile faces and paths from final-state projects without forcing them into a 3D wrapper.
- Allow performance recovery after CPU load improves; defer busy display actions without consuming the attempt.
- Add independently owned, expiring visitor compute sessions and quotas; retain explicit internal bearer ownership.
- Public builds retain explicit same-origin computation without reading internal settings or credentials. Legacy shared-principal compute endpoints are rejected before upload.
- Retain the explicitly approved antique reference and original appearance; use an original procedural atlas only if reference loading fails.
- Publish the public editor separately from the retained integrated workspace; verify anonymous modeling, persisted visitor isolation and actual source downloads.
- Pin acquired native source materials and retain upstream notices; native recompilation remains separately unexecuted.


## Unreleased

- Added an English entry, build and quick-start instructions, contribution guidance, security/privacy boundaries and validation status guidance.
- Added a scoped source/license map and a fail-closed distribution-policy checker. The map records unresolved rights, native-source and static-resource provenance rather than granting a new repository-wide license.
- Existing modeling, Page API contracts, saved-file semantics and demo URLs are unchanged by these documentation and compliance additions.

The anonymous public build, new demo deployment, real Agent benchmark, geometry fixes and adaptive-performance work are not delivered by this entry. Existing release history remains in Git; no historical acceptance result is inferred here.
