# ParentApplication：普通 ASHX + 根 bin DLL

此包把 `cadservices/api.ashx` 放在现有 ASP.NET 4.8 应用的普通目录中，由父应用根 `bin` 加载编译 DLL。无需 cadservices 子应用或 Windows Host 服务。只保留现有应用池架构，托管 DLL 使用 AnyCPU；Logo/OCCT 作为受控独立 x64 工作进程运行。

## 部署前核对依赖

包包含所有 Gateway 构建依赖，`parent-application-dependencies.json` 逐文件记录目标位置、程序集完整名称、文件版本与 SHA256。

| 包内目录 | 用途 |
|---|---|
| `bin/` | 本产品的 WebCADServices.Contracts/Gateway/Logo/Runtime DLL |
| `parent-dependencies/bin/` | 需要与父应用核对的 LogoVector.Contracts、LogoVector.Geometry、Newtonsoft.Json、System.Data.SQLite 及 x86/x64 SQLite.Interop |
| `cadservices/runtime/` | 独立 Logo/OCCT 程序与匹配的内核验收 proof |

`parent-dependencies` 是待核对文件，不是 CLR 自动探测目录。不能只上传 `bin` 后就视为依赖安装完成，也不能把整个包直接 FTP 覆盖 ERP 根目录。

1. 先备份目标将受影响的文件；读取父应用相关 `assemblyBinding` 和当前池架构，不导出授权或数据库连接配置。
2. 按 manifest 的 `requiredDestination` 核对目标 `bin`。现有文件 SHA 完全一致可保留；缺失依赖在核对后从 `parent-dependencies/bin` 放入对应目录。SQLite 托管 DLL 与 interop 版本必须配套，保留 x86/x64 子目录。
3. 同名文件 SHA 不同，即使程序集版本相同，也不能默认兼容或静默覆盖。核对公开接口、父应用版本绑定和双方使用路径；在隔离环境验证。版本冲突未解决前停止该父应用部署，保留现有服务。不要为了装此包盲改全站绑定重定向。
4. 一个全新独立验收应用可把两组 `bin` 内容合并到根 `bin`。已有 ERP 应用只按核对结论放入文件；修改 bin 可能触发该应用回收，需要安排时机。

## 配置与验收

使用现有允许的配置入口，或在部署安排中明确配置 `WebCAD.CredentialFile`、`AllowedOrigin`、`DataRoot`、`NativeWorker`、`LogoWorker`、`NativeAcceptance`。授权文件、持久数据放在 Web 根外；授权文件仅目标应用身份及系统管理员可读。包不含授权或真实业务数据。复制运行程序后保留 worker 目录结构、库依赖、执行权限和匹配 proof。

现有父应用配置值优先。新独立站点需要自己的 .NET 4.8 配置及应用池；不要把静态前端的 `web.config` 覆盖已有 ASP.NET 根配置。前端与 Gateway 设置应合并并局部检查。

部署后用授权 GET `api.ashx?route=/v1/health`、`/v1/capabilities` 核对 IIS DLL 模式和实际 Native SHA；页面安装结果、保存和离线重开是后续独立验收。健康检查成功不代表所有 ERP 功能已验证兼容。
