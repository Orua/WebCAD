# Matched OCCT status binding

This local package preserves Replicad 1.1.0's single-threaded API and adds the
complete `BRepFill_ThruSectionErrorStatus` registration. It does not change the
OCCT numerical algorithm, profile geometry, degree, tolerances or cap semantics.

Build before installing this file dependency in a fresh checkout:

```text
python scripts/build-occt-status-binding.py --cache <external-build-cache> --emsdk <activated-emsdk-5.0.1> --output vendor/replicad-opencascadejs/dist
npm install
```

The cache and SDK are development build inputs; the published browser app needs
only the resulting matched JavaScript/WASM files. `dist` is generated and ignored.
Storage-constrained hosts may link `dist` to their external dependency directory.

Inputs are pinned and verified: upstream Replicad commit
`e4b05f67dc4e2393a876ce8c5064a9c93db05bf1`, OCCT 8.0.1, Emscripten 5.0.1,
and the immutable `taucad/opencascade.js` single-threaded image manifest
`sha256:deb9be8470038652c060b47f2d2e7e2e46d899bb896ecabb007bf60307ee2d54`.
The script downloads the matching precompiled objects, patched headers, embind
runtime and original Replicad wrapper sources, then links the kernel locally.
`build-manifest.json` records exact output hashes. CommonJS initializes the same
ESM/WASM pair. The unused multi-threaded pair is retained unchanged from upstream.

The original LGPL 2.1 license and upstream copyrights are retained. Corresponding
source, wrapper sources and applied patch inventory remain in the selected build
cache and are identified by the immutable upstream commits/image layers.
