param([string]$CMake='F:/WebCADServices-local/dependencies/cmake/cmake-3.31.6-windows-x86_64/bin/cmake.exe',[string]$ToolchainRoot='F:/WebCADServices-local/dependencies/llvm-mingw/llvm-mingw-20260616-ucrt-x86_64',[string]$OcctRoot='F:/WebCADServices-local/dependencies/occt-sdk',[string]$JsonInclude='F:/WebCADServices-local/dependencies/nlohmann/include',[string]$BuildRoot='F:/WebCADServices-local/native-build',[string]$InstallRoot='F:/WebCADServices-local/runtime/native-rebuilt')
$ErrorActionPreference='Stop'
if([IO.Path]::GetFullPath($BuildRoot) -notmatch '^F:[\\/]' -or [IO.Path]::GetFullPath($InstallRoot) -notmatch '^F:[\\/]'){throw 'Native outputs must be on a fixed local F: path'}
$toolBin=(Join-Path $ToolchainRoot 'bin').Replace('\','/');$env:PATH="$toolBin;$env:PATH"
$repoRoot=Split-Path $PSScriptRoot
& $CMake -S "$repoRoot/services/WebCADServices/native/occt-worker" -B $BuildRoot -G 'MinGW Makefiles' "-DCMAKE_CXX_COMPILER=$toolBin/x86_64-w64-mingw32-clang++.exe" "-DCMAKE_MAKE_PROGRAM=$toolBin/mingw32-make.exe" "-DCMAKE_RC_COMPILER=$toolBin/x86_64-w64-mingw32-windres.exe" "-DCMAKE_PREFIX_PATH=$OcctRoot" "-DJSON_INCLUDE_DIR=$JsonInclude" "-DCMAKE_INSTALL_PREFIX=$InstallRoot" -DCMAKE_BUILD_TYPE=Release
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
& $CMake --build $BuildRoot --parallel 4
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
& $CMake --install $BuildRoot
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
if(Test-Path "$OcctRoot/bin/*.dll"){Copy-Item "$OcctRoot/bin/*.dll" "$InstallRoot/bin/" -Force}
foreach($name in @('libc++.dll','libunwind.dll','libwinpthread-1.dll')){if(Test-Path "$toolBin/$name"){Copy-Item "$toolBin/$name" "$InstallRoot/bin/" -Force}}
exit 0
