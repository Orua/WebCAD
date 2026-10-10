param([string]$CMake='F:/WebCADServices-local/dependencies/cmake/cmake-3.31.6-windows-x86_64/bin/cmake.exe',[string]$ToolchainRoot='F:/WebCADServices-local/dependencies/llvm-mingw/llvm-mingw-20260616-ucrt-x86_64',[string]$SourceRoot='F:/WebCADServices-local/dependencies/occt-source/OCCT-7_8_1',[string]$BuildRoot='F:/WebCADServices-local/occt-build',[string]$InstallRoot='F:/WebCADServices-local/dependencies/occt-sdk-rebuilt',[int]$Jobs=8)
$ErrorActionPreference='Stop'
if([IO.Path]::GetFullPath($BuildRoot) -notmatch '^F:[\\/]' -or [IO.Path]::GetFullPath($InstallRoot) -notmatch '^F:[\\/]'){throw 'Native build/install outputs must be on a fixed local F: path'}
New-Item -ItemType Directory -Force (Join-Path $BuildRoot 'temp') | Out-Null
$env:TEMP=Join-Path $BuildRoot 'temp';$env:TMP=$env:TEMP
$toolBin=(Join-Path $ToolchainRoot 'bin').Replace('\','/');$env:PATH="$toolBin;$env:PATH"
& $CMake -S $SourceRoot -B $BuildRoot -G 'MinGW Makefiles' `
  "-DCMAKE_C_COMPILER=$toolBin/x86_64-w64-mingw32-clang.exe" "-DCMAKE_CXX_COMPILER=$toolBin/x86_64-w64-mingw32-clang++.exe" `
  "-DCMAKE_MAKE_PROGRAM=$toolBin/mingw32-make.exe" "-DCMAKE_RC_COMPILER=$toolBin/x86_64-w64-mingw32-windres.exe" `
  -DCMAKE_BUILD_TYPE=Release "-DCMAKE_INSTALL_PREFIX=$InstallRoot" -DBUILD_CPP_STANDARD=C++17 `
  -DBUILD_LIBRARY_TYPE=Static `
  -DBUILD_MODULE_FoundationClasses=ON -DBUILD_MODULE_ModelingData=ON -DBUILD_MODULE_ModelingAlgorithms=ON `
  -DBUILD_MODULE_Visualization=OFF -DBUILD_MODULE_ApplicationFramework=OFF -DBUILD_MODULE_DataExchange=OFF -DBUILD_MODULE_DETools=OFF -DBUILD_MODULE_Draw=OFF `
  -DUSE_FREETYPE=OFF -DUSE_FREEIMAGE=OFF -DUSE_TBB=OFF -DUSE_VTK=OFF -DUSE_OPENGL=OFF -DUSE_GLES2=OFF `
  -DINSTALL_DIR_BIN=bin -DINSTALL_DIR_LIB=lib -DINSTALL_DIR_INCLUDE=include/opencascade
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
& $CMake --build $BuildRoot --parallel $Jobs
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
& $CMake --install $BuildRoot
exit $LASTEXITCODE
