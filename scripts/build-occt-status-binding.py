"""Rebuild the pinned Replicad single-threaded kernel with its missing enum.

Usage: python scripts/build-occt-status-binding.py --cache <build-cache>
       --emsdk <emsdk-5.0.1> --output <vendor-dist>

The immutable upstream OCI image supplies matching OCCT objects/headers; Docker
is not required. Emscripten must be activated locally. Downloads and intermediates
stay in the explicitly selected cache, never in the repository root.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import runpy
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile

REPLICAD = "e4b05f67dc4e2393a876ce8c5064a9c93db05bf1"
IMAGE = "sha256:deb9be8470038652c060b47f2d2e7e2e46d899bb896ecabb007bf60307ee2d54"
OCI = "https://ghcr.io/v2/taucad/opencascade.js/"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def windows_path(path):
    value = str(path.resolve())
    return Path("\\\\?\\" + value) if os.name == "nt" and not value.startswith("\\\\?\\") else Path(value)


def download(url, path, expected=None, headers=None):
    if path.is_file() and (expected is None or "sha256:" + digest(path) == expected):
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".partial")
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=90) as response, partial.open("wb") as target:
        shutil.copyfileobj(response, target)
    if expected and "sha256:" + digest(partial) != expected:
        raise RuntimeError("Dependency digest mismatch: " + path.name)
    partial.replace(path)
    return path


def prepare(cache):
    token = json.load(urllib.request.urlopen("https://ghcr.io/token?service=ghcr.io&scope=repository:taucad/opencascade.js:pull", timeout=30))["token"]
    headers = {"Authorization": "Bearer " + token, "Accept": "application/vnd.oci.image.manifest.v1+json"}
    manifest_path = download(OCI + "manifests/" + IMAGE, cache / "image-manifest.json", IMAGE, headers)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    image = windows_path(cache / "image")
    # Source headers + applied patches + compiled objects and declaration index.
    for index in [11, 13, 17, 19, 26, 28]:
        layer = manifest["layers"][index]
        archive = download(OCI + "blobs/" + layer["digest"], cache / ("layer-" + str(index) + ".tgz"), layer["digest"], headers)
        marker = cache / ("extracted-" + str(index) + ".json")
        if marker.is_file() and json.loads(marker.read_text()).get("digest") == layer["digest"]:
            continue
        with tarfile.open(archive) as tar:
            for member in tar:
                name = PurePosixPath(member.name)
                if not member.isfile() or name.is_absolute() or ".." in name.parts:
                    continue
                selected = member.name.startswith("opencascade.js/") and (
                    member.name.endswith((".hxx", ".h", ".lxx", ".gxx", ".o", ".a", ".json"))
                    or member.name.startswith("opencascade.js/src/") and member.name.endswith(".py"))
                if member.name == "emsdk/upstream/emscripten/src/lib/libembind.js":
                    selected = True
                if selected:
                    target = image / str(name)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with tar.extractfile(member) as source, target.open("wb") as destination:
                        shutil.copyfileobj(source, destination)
        marker.write_text(json.dumps({"digest": layer["digest"]}))
        print("Prepared matching image layer", index, flush=True)
    upstream = download("https://codeload.github.com/sgenoud/replicad/zip/" + REPLICAD, cache / "replicad-source.zip", "sha256:723dbc4e95fbebfd988402454c2db79ace29e3bf72b80b4dca4a0939118ab18c")
    with zipfile.ZipFile(upstream) as archive:
        prefix = "replicad-" + REPLICAD + "/packages/replicad-opencascadejs/build-config/"
        for name in archive.namelist():
            if name.startswith(prefix) and not name.endswith("/"):
                relative = PurePosixPath(name[len(prefix):])
                if ".." in relative.parts:
                    raise RuntimeError("Invalid source archive path")
                target = cache / "replicad-build-config" / str(relative)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(name))
    package = download("https://registry.npmjs.org/replicad-opencascadejs/-/replicad-opencascadejs-1.1.0.tgz", cache / "upstream-package.tgz", "sha256:be73ff9e1bd95f021d01d50dcfe85094e6c6d1ad876283694bbca2ef00f446d9")
    baseline = cache / "baseline"
    with tarfile.open(package) as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            if member.isfile() and name.parts[0] == "package" and ".." not in name.parts:
                target = baseline / str(PurePosixPath(*name.parts[1:]))
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, target.open("wb") as destination:
                    shutil.copyfileobj(source, destination)
    return image / "opencascade.js", baseline


def build(cache, emsdk, output, image, baseline):
    include = cache / "include"
    include.mkdir(exist_ok=True)
    for source in (image / "deps/OCCT").rglob("*"):
        if source.is_file() and source.suffix in {".h", ".hxx", ".lxx", ".gxx"}:
            target = include / source.name
            if not target.exists() or digest(source) != digest(target):
                shutil.copyfile(source, target)
    # The precompiled bindings use this exact upstream embind runtime patch.
    shutil.copyfile(image.parent / "emsdk/upstream/emscripten/src/lib/libembind.js", emsdk / "upstream/emscripten/src/lib/libembind.js")
    baseline_types = (baseline / "dist/replicad_single.d.ts").read_text(encoding="utf-8")
    config = (cache / "replicad-build-config/custom_build_single.yml").read_text(encoding="utf-8")
    symbols = set(re.findall(r"^  - symbol: (\S+)", config, re.M))
    symbols.update(re.findall(r"^export declare class (\w+)", baseline_types, re.M))
    symbols.add("BRepFill_ThruSectionErrorStatus")
    fragments = {f.name[:-10]: f for f in (image / "build/bindings").rglob("*.d.ts.json")}
    for _ in range(3):
        for name in list(symbols):
            if name not in fragments:
                continue
            fragment = json.loads(fragments[name].read_text(encoding="utf-8"))
            symbols.update(fragment.get("referenced_classes") or [])
            for chain in (fragment.get("ancestors") or {}).values():
                symbols.update(chain)
    object_index = {f.name[:-6]: f for f in (image / "build/compiled-bindings").rglob("*.cpp.o")}
    objects = []
    object_cache = cache / "objects"
    object_cache.mkdir(exist_ok=True)
    for name in sorted(symbols):
        if name in object_index:
            target = object_cache / (hashlib.sha256(name.encode()).hexdigest()[:20] + ".o")
            if not target.exists():
                shutil.copyfile(object_index[name], target)
            objects.append(target)
    headers = "".join("#include <" + name + ".hxx>\n" for name in sorted(symbols) if (include / (name + ".hxx")).exists())
    headers += "#include <sstream>\n#include <iomanip>\n#include <cstdint>\n#include <BRep_Builder.hxx>\n#include <TopTools_ShapeMapHasher.hxx>\n#include <Poly.hxx>\n#include <emscripten/bind.h>\n"
    source = headers + runpy.run_path(str(image / "src/ocjs_bindgen/embind_builtins.py"))["BUILTIN_ADDITIONAL_BIND_CODE"]
    for name in ["shape-hasher", "shape-caster", "mesh-extractor", "edge-mesh-extractor", "brep-io", "geom2d-io"]:
        source += "\n" + (cache / ("replicad-build-config/wrappers/" + name + ".cpp")).read_text(encoding="utf-8")
    source += "\nEMSCRIPTEN_BINDINGS(webcad_replicad_wrappers){using namespace emscripten;\n"
    for cls, methods in {"ReplicadShapeHasher": ["HashCode"], "ReplicadShapeCaster": ["CompSolid"], "BRepToolsWrapper": ["Write", "Read"], "GeomToolsWrapper": ["Write", "Read"], "ReplicadMeshExtractor": ["mesh", "extract"], "ReplicadEdgeMeshExtractor": ["extract"]}.items():
        source += 'class_<' + cls + '>("' + cls + '").constructor<>()' + ''.join('.class_function("' + method + '",&' + cls + '::' + method + ')' for method in methods) + ';\n'
    for cls, methods in {"ReplicadMeshData": ["getVerticesPtr", "getNormalsPtr", "getTrianglesPtr", "getFaceGroupsPtr", "getVerticesSize", "getNormalsSize", "getTrianglesSize", "getFaceGroupsSize"], "ReplicadEdgeMeshData": ["getLinesPtr", "getLinesSize", "getEdgeGroupsPtr", "getEdgeGroupsSize"]}.items():
        source += 'class_<' + cls + '>("' + cls + '").constructor<>().constructor<const ' + cls + '&>()' + ''.join('.function("' + method + '",&' + cls + '::' + method + ')' for method in methods) + ';\n'
    cpp = cache / "custom-bindings.cpp"
    cpp.write_text(source + "}\n", encoding="utf-8")
    emcc = emsdk / "upstream/emscripten/emcc.py"
    custom = cache / "custom-bindings.o"
    def run(arguments, log_name):
        with (cache / log_name).open("w", encoding="utf-8") as log:
            subprocess.run([sys.executable, str(emcc), *arguments], stdout=log, stderr=subprocess.STDOUT, check=True)
    run(["-std=c++17", "-fwasm-exceptions", "-msimd128", "-O3", "-DOCCT_NO_DUMP", "-UOCC_CONVERT_SIGNALS", "-DOCCT_NO_PLUGINS", "-DIGNORE_NO_ATOMICS=1", "-frtti", "-I" + str(include), "-c", str(cpp), "-o", str(custom)], "compile.log")
    output.mkdir(parents=True, exist_ok=True)
    arguments = ["-lembind", str(custom), *map(str, objects), *[str(f) for f in sorted((image / "build/occt-libraries").glob("*.a"))], "-o", str(output / "replicad_single.js"), "-fwasm-exceptions", "-sEXPORT_EXCEPTION_HANDLING_HELPERS", "-sEXPORT_ES6=1", "-sMODULARIZE", "-sALLOW_MEMORY_GROWTH=1", "-sINITIAL_MEMORY=100MB", "-sMAXIMUM_MEMORY=4GB", '-sEXPORTED_RUNTIME_METHODS=["FS","wasmMemory"]', "-sENVIRONMENT=web,worker,node", "--no-entry", "-sERROR_ON_UNDEFINED_SYMBOLS=0", "-sSTACK_SIZE=8388608", "-sWASM_BIGINT", "-msimd128", "-O3", "-sEVAL_CTORS=2", "-sMALLOC=mimalloc"]
    response = cache / "link.rsp"
    response.write_text("\n".join('"' + a.replace("\\", "/").replace('"', '\\"') + '"' for a in arguments), encoding="utf-8")
    run(["@" + str(response)], "link.log")
    # CJS delegates to the exact same ESM/WASM pair, avoiding a second kernel.
    (output / "replicad_single.cjs").write_text('module.exports = async function(options) { return (await import("./replicad_single.js")).default(options); };\n', encoding="utf-8")
    enum = json.loads(fragments["BRepFill_ThruSectionErrorStatus"].read_text(encoding="utf-8"))[".d.ts"]
    block = re.compile(r"(export declare class BRepOffsetAPI_ThruSections\b.*?)(?=\nexport )", re.S)
    types = block.sub(lambda match: match[0].replace("GetStatus(): unknown", "GetStatus(): BRepFill_ThruSectionErrorStatus"), baseline_types)
    types = types.replace("export type OpenCascadeInstance = {", "export type OpenCascadeInstance = {\n  BRepFill_ThruSectionErrorStatus: typeof BRepFill_ThruSectionErrorStatus;")
    (output / "replicad_single.d.ts").write_text(enum + types, encoding="utf-8")
    # Multi-threaded is not used by WebCAD; preserve its original upstream pair.
    for name in ["replicad_multi.js", "replicad_multi.cjs", "replicad_multi.wasm", "replicad_multi.d.ts"]:
        shutil.copyfile(baseline / "dist" / name, output / name)
    receipt = {"schemaVersion": 1, "upstreamCommit": REPLICAD, "occtVersion": "8.0.1", "emscriptenVersion": "5.0.1", "imageManifest": IMAGE, "bindingAdded": "BRepFill_ThruSectionErrorStatus", "compiledBindingCount": len(objects), "multiThreaded": "upstream unchanged; not the WebCAD execution kernel", "files": {f.name: {"sha256": digest(f), "sizeBytes": f.stat().st_size} for f in output.iterdir() if f.is_file()}}
    (output / "build-manifest.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    parser.add_argument("--emsdk", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    image_root, upstream_package = prepare(args.cache.resolve())
    build(args.cache.resolve(), args.emsdk.resolve(), args.output.resolve(), image_root, upstream_package)
