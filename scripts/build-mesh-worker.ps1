param(
 [string]$CMake='F:/WebCADServices-local/dependencies/cmake/cmake-3.31.6-windows-x86_64/bin/cmake.exe',
 [string]$ToolchainRoot='F:/WebCADServices-local/dependencies/llvm-mingw/llvm-mingw-20260616-ucrt-x86_64',
 [string]$ManifoldRoot='F:/WebCADServices-local/dependencies/manifold-3.5.4',
 [string]$JsonInclude='F:/WebCADServices-local/dependencies/nlohmann/include',
 [string]$BuildRoot='F:/WebCADServices-local/mesh-build-phase2',
 [string]$InstallRoot='F:/WebCADServices-local/runtime/mesh-phase2'
)
$ErrorActionPreference='Stop'
foreach($target in @($BuildRoot,$InstallRoot)){if([IO.Path]::GetFullPath($target) -notmatch '^F:[\\/]'){throw 'Required build/runtime outputs must stay on fixed F:'}}
$source=Get-Content -LiteralPath (Join-Path $ManifoldRoot 'CMakeLists.txt') -Raw
if($source -notmatch 'set\(MANIFOLD_VERSION_MAJOR 3\)' -or $source -notmatch 'set\(MANIFOLD_VERSION_MINOR 5\)' -or $source -notmatch 'set\(MANIFOLD_VERSION_PATCH 4\)'){throw 'Pinned Manifold 3.5.4 source is required'}
$toolBin=(Join-Path $ToolchainRoot 'bin').Replace('\','/');$env:PATH="$toolBin;$env:PATH"
$repoRoot=Split-Path $PSScriptRoot
# The installed host lacks the MSVC C++ component. Reuse the already accepted
# native Clang/MinGW toolchain; no installer or administrator change is made.
& $CMake -S "$repoRoot/services/WebCADServices/native/mesh-worker" -B $BuildRoot -G 'MinGW Makefiles' "-DCMAKE_CXX_COMPILER=$toolBin/x86_64-w64-mingw32-clang++.exe" "-DCMAKE_MAKE_PROGRAM=$toolBin/mingw32-make.exe" "-DMANIFOLD_ROOT=$ManifoldRoot" "-DJSON_INCLUDE_DIR=$JsonInclude" "-DCMAKE_INSTALL_PREFIX=$InstallRoot" -DCMAKE_BUILD_TYPE=Release
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
& $CMake --build $BuildRoot --parallel 4
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
& $CMake --install $BuildRoot
exit $LASTEXITCODE
