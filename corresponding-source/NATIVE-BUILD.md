# Pinned native source and replacement material

The [archive manifest](native-materials.json) contains exact downloaded upstream bytes, versions and SHA-256. Download outside the checkout with `node scripts/fetch-corresponding-source.mjs <directory>`. A corrupt or different existing archive is rejected. These archives are source material, not an assertion that a native rebuild was executed.

## Modeling WASM

Extract the pinned replicad source and use `packages/replicad-opencascadejs`. Its `build-source/` directory contains binding definitions and custom wrappers. The package scripts first run `ytt -f build-source/ --output-files build-config`, then its `buildSingle` / `buildMulti` scripts link the respective custom YAML using the recorded opencascade.js image tags. Preserve all configuration and wrapper files; do not substitute another OCCT SDK.

The exact generator source is opencascade.js `ebd263f15337b440b391492af073662707e86482`. Its `DEPS.json`, Dockerfile, maintainer documentation and patches specify OCCT `b8f597c677811d1f9f4d8a97f5ae2825c0353a42` and declared dependencies. The pinned OCCT, RapidJSON and FreeType archives accompany that record. Follow that checkout's maintainer build instructions to rebuild the toolchain and then link the replicad YAML. The recorded image tag is not presented as an immutable image digest.

For an intended replacement, keep the published JS interface and matching generated WASM together, select the replacement package in a separate development environment, and run the affected real-model, import/export and final-project acceptance checks before publishing. Build success alone is not geometric or compatibility acceptance. Current native rebuild, relink and replacement execution remain unverified; byte-identical reproduction is separately unverified.

## LibreDWG

Use complete upstream LibreDWG `e405fcff2eaff86b8389222b7e99529284e7ea0a` and libredwg-web `b70b5573a6bf2345e5fb10f2adff7fb74a8123c5`, together with the retained [overlay and build scripts](libredwg-web-20260805/). Preserve its generated `src/config.h`, `javascript/package-lock.json`, binding/build inputs and local TypeScript source rather than replacing them with an unrelated current checkout. The reviewed native source matches the pinned upstream; the retained configuration and modified TypeScript files remain part of this project's supplied source.

The recorded Emscripten 6.0.5 zlib port points to zlib 1.3.2, which is pinned in the manifest. Follow the retained build scripts in their declared environment and verify DWG interpretation against original fixtures before replacing the distributed JS/WASM pair. No fresh native build or replacement is claimed here.

## Manifold

Manifold 3.5.4 corresponds to `ce50d78021d64507f89e8c9fc2c2e51018117857`. Its npm artifact matches the lockfile and installed JS/WASM/LICENSE bytes. The source workflow and CMake configuration identify Clipper2 `46f639177fe418f9689e8ddb74f08a870c71f5b4`; its Boost license and the original embedded header notices are retained. Native rebuilding is an engineering verification item, separate from retaining the actual Apache license and applicable notices.

## Scope

Retain the original component licenses and OCCT exception. This document grants no new application or reference-image rights. Public availability of the final source bundle, exact deployed files and any required replacement route must be checked independently at release time. Do not treat local material acquisition as a deployed source offering.
