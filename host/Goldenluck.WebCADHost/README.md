# Agent 工作台宿主适配器

本目录是 Agent 工作台桥接、页面入口和工程交接入口的唯一维护源码，独立程序集 `Goldenluck.WebCADHost.dll`，命名空间 `Goldenluck.WebCAD.Hosting`。部署网站仅承载 `site/AI/WebCAD` 与该 DLL，不把 WebCAD 类编译到生产系统的 `Web.dll`，也不引用 `Web.dll` 或相邻项目源码。

构建：`scripts/build-agent-host.ps1 -ReferenceDirectory <已安装网站集成库目录> -OutputDirectory <候选程序包目录>`。集成库 BLL/DAL/Main/Model/ChatClass 提供既有账号与 Agent 权限接口，Newtonsoft.Json/BouncyCastle 提供序列化与签名；显式传入程序集目录，不复制业务源码、配置、密钥或数据。构建检查程序集引用和类型归属。

Agent 会话仍按网站当前用户权限进行验证。Services 计算是独立模块：同域直接 `/cadservices/api.ashx`，不调用这里的认证、页面或桥接类。旧 `/AI/WebCAD/WebCADCompute.ashx` 仅是 Services 自有的兼容转发入口。

发布前验证同一候选包的本机实际页面、认证到期和正式登录恢复、原命令回执、锁、作图及截图。旧 `WebCAD.NativeBridge.dll` 和 `Web.dll` 内历史类型不作为新入口的依赖；不为清理历史类型覆盖整个业务程序集。回滚按发布清单恢复原入口和桥接 DLL。
