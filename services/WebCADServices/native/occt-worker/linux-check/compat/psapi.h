#pragma once
#include "windows.h"
struct PROCESS_MEMORY_COUNTERS{DWORD cb;std::size_t PeakWorkingSetSize;};
typedef PROCESS_MEMORY_COUNTERS PROCESS_MEMORY_COUNTERS_EX;
inline BOOL GetProcessMemoryInfo(HANDLE,PROCESS_MEMORY_COUNTERS* c,DWORD){std::ifstream s("/proc/self/status");std::string k;while(s>>k){if(k=="VmHWM:"){std::size_t v;s>>v;c->PeakWorkingSetSize=v*1024;return 1;}}return 0;}
