# Scoped publication and source decisions

The maintainer explicitly approved continued public distribution of the new application work under the repository's existing scoped terms, and distribution of the supplied antique reference image. The [exact scope map](source-license-map.json) records those confirmations separately from source provenance. No new repository-wide license or uniform copyright holder is selected; [LICENSE.md](../../LICENSE.md), third-party copyrights, notices and applicable exceptions remain in force.

| Scope | Recorded evidence and limits |
| --- | --- |
| Application, generic examples and generated helpers | Existing scoped terms plus explicit maintainer publication authorization. Generated items inherit only the verified application parent; hashes and source lineage are checked independently. |
| Current generated previews | 108 exact current image/guide files and authoring provenance. Only manifest references are copied; 41 obsolete unreferenced PNGs remain in source but are excluded from builds. Unknown or changed media cannot inherit approval. |
| Antique reference | Exact JPEG SHA-256 191b602d3fcd6367e67162a7b4b2410fba1c1b308b6cc70f66abcf6b0c041af1, supplied and approved for distribution by the maintainer. Original bytes remain the normal material input. No invented creator or external source URL. |
| Procedural antique fallback | Original deterministic source code; samples no photograph. Used only if the approved reference cannot load; existing finish IDs, parameters and CAD geometry remain. |
| Modeling OCCT and bindings | Pinned complete replicad, opencascade.js, OCCT and declared dependency archives, retained configuration/wrappers/patches and original LGPL/exception notices. See the [material manifest](../../corresponding-source/native-materials.json) and [build instructions](../../corresponding-source/NATIVE-BUILD.md). |
| LibreDWG | Complete pinned LibreDWG and libredwg-web archives, retained local overlay/configuration/build inputs and zlib source. Actual rebuilt or replacement binaries have not been produced by this task. |
| Manifold | Exact 3.5.4 commit, npm integrity and installed JS/WASM/LICENSE match; Clipper2 source and Boost notice retained. Apache notice obligations are separate from optional native rebuilding. |
| text-to-cad adaptation | Exact 0.7.19 fingerprints and complete upstream MIT copyright/permission notice retained. This does not grant unrelated component rights. |
| Optional service components | Reviewed only when actually deployed or invoked. Browser approval does not automatically approve optional Python/native service packages or their deployment. |

The installed codepointat notice, Three.js embedded Earcut, fflate, svg-numbers fragment and HDR companion attribution have separate exact source/notice records. An unknown original fragment commit is not invented. Applicable browser records derive from the actual module graph and copied files, rather than every installed development dependency.

Complete source acquisition, public source availability, native rebuild/relink execution and byte-identical reproduction are distinct claims. The latter engineering checks were not executed here. Local archives alone are not a deployed source offering; final source links and package identities must be verified during release.

Run `node scripts/verify-public-release.mjs <candidate-directory> public-web` for the actual candidate. It combines byte integrity and scoped distribution checks. Unknown files, changed reviewed bytes, missing parent authorization and relevant missing notices remain blockers. Candidate approval does not certify running backend isolation or website deployment.

Never publish private configuration, credentials, customer CAD, internal evidence, logs or backups. Preserve the existing demo address until the new public URL passes actual anonymous acceptance.
