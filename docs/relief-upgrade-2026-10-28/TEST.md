# 浮雕生产升级验收（2026-10-28）

在已经连上 Services 的生产同构页面上做。入口用 `http://localhost/webcad/` 或 `https://goldenfu.cn/webcad/`，工作台用 `https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx`。打开调试记录，失败时下载错误和日志。

## 测试图

| 名称 | 文件 | 用途 |
|---|---|---|
| 龙纹 | 会话附图 `11-dragon.jpg`；仓库内可先用 `tests/fixtures/relief-images/04-dragon-relief.png` | 照片 / 高度图，看大图能否走完 |
| 博物馆奖牌 | 会话附图 `04-medal.jpg` | 圆形人像浮雕 |
| 用户奖牌 | 会话附图 `medal-import.png` | 今晚要能导入的那张 PNG |

三张都走同一条点击路径。尺寸可用默认，或改成实物大约尺寸（奖牌直径约 40–60 mm，高度 0.5–1.5 mm）。

## 点击路径

1. 打开有一个平面的模型（长方体即可）。面模式下点选该平面。
2. 面加工 → 浮雕。
3. 选择上面的一张图。默认视图应只看到步骤、文件、宽高、高度、方向和缩略图。精度、阈值、轮廓在「高级配置」里，默认收起。
4. 点「用这张图做连续浮雕」。
5. 图片浮雕窗口里确认最大高度，点「预览浮雕」。不要先去填采样、控制网或加工意图。
6. 视口出现浮雕后，先截一张「应用前」图。再点「应用」。截一张「应用后」图。
7. 撤销。模型回到应用前。再重做一步，确认撤销栈可用。

对比时看：图案是否落在所选平面上、起伏方向是否大体对、边缘有没有炸面。不要求最大误差 ≤ 0.05 mm。

## 通过标准

- Services 高度转换成功（日志里高度转换作业完成，或界面写明 Services 转换）。Services 不可用而明确改用浏览器转换，也算这条通过，但要在记录里写原因。
- 拟合 `relief.design-fit-brep-1` 的 `POST /v1/compute/jobs` 返回 `jobId`，或在超过服务器等待预算后给出结构化超时。不允许再在 `timeoutMs: 30000`、`elapsedMs` 约 30001 处被客户端掐断。大请求体（约 1 MiB 以上）的提交时限应 ≥ 服务器等待时间（默认 180000 ms）。
- 若仍然超时或断线，提示和调试记录同时包含：
  - 代码 `SERVICES_CONNECTION_UNKNOWN`
  - 操作 `relief.design-fit-brep-1`
  - 请求键
  - `elapsedMs` 与 `timeoutMs`
  - 请求体级别（大请求会写「≥1 MiB」）
  - 「用 getServicesRequest 查询」「勿盲目重算」
  - 不能只剩「原任务的执行或提交结果尚未确认」而没有上述代码。
- 拟合结束后可以应用。残差大于 0.05 mm 时界面可以提示超过目标精度，但预览和应用按钮仍然可用。
- 应用写入历史，撤销能回到应用前的模型。
- 保存应用前、应用后各一张截图，文件名带测试图名称。

## 失败时怎么查

用页面里的调试复制，或：

`window.webcad.api.getDebugReport({limit:100,includeState:true})`

看 `source:'services'` 且 `action` 为 `/v1/compute/jobs` 的那条：`timeoutMs`、`elapsedMs`、`error.code`、`error.operation`、`error.idempotencyKey`、`error.bodyClass`。有请求键时先 `getServicesRequest`，不要换新键重算。
