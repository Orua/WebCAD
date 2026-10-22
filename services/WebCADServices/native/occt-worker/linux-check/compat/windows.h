// Linux test-build shim (NOT part of the repo Windows build).
#pragma once
#include <cstdio>
#include <cstddef>
#include <fstream>
#include <string>
typedef void* HANDLE; typedef unsigned long DWORD; typedef int BOOL;
#define MOVEFILE_REPLACE_EXISTING 1
#define MOVEFILE_WRITE_THROUGH 8
inline HANDLE GetCurrentProcess(){return nullptr;}
inline BOOL MoveFileExA(const char* a,const char* b,DWORD){return std::rename(a,b)==0;}
