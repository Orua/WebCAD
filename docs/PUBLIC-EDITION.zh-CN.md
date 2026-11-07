# Public 与 integrated 构建

`npm run build:public` 和 `npm run build:integrated` 复用同一建模源码、注册表和知识生成器，默认分别输出至 `dist/public`、`dist/integrated`。可用 `WEBCAD_DIST_DIR` 指定独立产物目录。命令只构建，不部署或推送。原 `npm run build` 默认保持 integrated。

public 在编译时选择无宿主入口，不初始化助手 iframe、宿主适配器、上传回执通道、Agent 控制锁或旧 `agent=1` 连接。旧助手地址、Services 本地配置和会话凭据不能恢复这些能力。页面仍提供 `window.webcad.api`；它只操作当前页面，不授予外部脚本权限。`info()`、`connect()` 和 `edition.json` 声明实际 edition 与能力。宿主专属调用明确返回 `CAPABILITY_UNAVAILABLE`；本地文件导入、建模、保存与导出保持原有路径。

public 构建使用静态资产 allowlist，并在真实打包模块图中拒绝宿主启动模块。`build-modules.json` 记录相对模块名，`public-feature-parity.json` 从当前操作注册表和执行策略生成待验收清单。profile 进入 buildId、catalogHash 与 docsHash；两种构建不能共用契约缓存。integrated 保留现有助手配置与授权方式，不改变服务器鉴权。

## 尚未验收与发布门禁

本地能力保留不等于所有原功能已完成匿名平价。public 当前禁用外部 Services，未建立匿名计算服务。原本依赖 Services 的拟合、转换或复杂计算仍须逐项核对；清单中标为 `BLOCKED_REMOTE_PARITY` 的项目不能记为完成。未运行的浏览器、几何、保存重开、STEP 读回和权限负向检查均为 `NOT_RUN`。

本实现不选择新许可，不表示公开分发获准。T01 对应源码、媒体及权属证据闭合后，才能对同一候选包执行其公开分发门禁。不得把本地构建成功、模块隔离或已有演示地址当作许可或官网发布通过。未批准新公开 URL，不修改 README 演示链接。

验收只在协调者安排的既有本机站点及任务专属空白工程进行；不要从任务分支调用现有自动推送 main 的部署流程。站点替换、备份、无 Cookie 验收及回滚由协调者串行安排；官网发布需另外授权。上线前还需完成匿名操作、旧缓存隔离、受保护端点拒绝、功能平价及回滚检查。

## 针对性验证

- `node --test tests/public-edition.test.mjs tests/page-context-policy.test.mjs tests/services-settings.test.mjs`：隔离、旧配置、API 与 integrated 设置回归。
- `node scripts/check-edition-bundle.mjs`：在内存中编译两种 edition 并核对真实模块图，不写产物、不启动站点。
- `tests/public-edition-browser.js`：供已有 Playwright CLI 的 `run-code --filename` 使用。通过 `WEBCAD_PUBLIC_CANDIDATE` 指定完整 public 候选目录。脚本新建独立浏览器 context，只在该 context 将既有 `http://localhost/webcad/` 请求映射到候选包字节，不改 IIS、磁盘站点或用户页面，不开新服务。它实际运行浏览器内核并核对模型体积、撤销/重做、工程重开及 STEP 往返；其结果只证明候选包的浏览器行为，不能当作真实站点部署通过。缺少 CLI 或候选包时应记录未运行。

影响：本地建模运算与工程格式不变；Services 只在 public 前端禁用配置恢复，服务端、Logo、Native 和既有认证未修改。页面契约增加 edition 信息并更新到 1.62.0；静态知识与宿主软件的 ZIP 内容按 edition 区分。需要重新生成两种 profile 的知识和发布材料，不能复用原构建产物。
