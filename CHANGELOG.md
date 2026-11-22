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
