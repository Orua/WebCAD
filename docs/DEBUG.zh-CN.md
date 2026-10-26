# Debug 诊断接口

自 Page API **1.57.25** 提供。入口是设置菜单最后的 **Debug**，与下列 API 共用同一份脱敏日志。开发排查先读取诊断，核对原请求和提交状态；不要通过重复计算来取代定位。

```js
const api = window.webcad.api;
const report = await api.getDebugReport({limit:100, includeState:true});
// 只看 Agent 的连接、握手、命令派发与回执
const agent = await api.getDebugReport({source:'agent', limit:100});
// 筛选错误或具体字段；支持 afterSequence 增量读取
const errors = await api.getDebugReport({level:'error', query:'params.', limit:100});
// 独立窗口，不关闭工具草稿或取消计算
await api.setDebugPanel({context:api.createRequestContext(), visible:true});
```

`getDebugReport` 是只读接口，不要求 context；`setDebugPanel` 使用当前 identity context。AI 通过获授权的页面通道使用，先发现完整工具卡；原生 Agent 分别走 `webcad_read` 和 `webcad_view`。不以浏览器暴露函数来假定宿主有执行权限。

参数：`source=all|ui|api|agent|kernel|services|runtime`，`level=all|info|warn|error`，`query` 最多160字符，`afterSequence>=0`，`limit=1..1500`，`includeState` 控制是否生成当前状态。未知参数拒绝。

结果包含 `status`、`capturedAt`、`coverage`、`events`、`lastSequence`、`state`、`redaction` 和 `limitations`。每条日志带 sequence、时间、来源、动作、级别和受限数据；可用 commandId/taskId/pageJobId/requestId、文档实例和 revision 关联阶段。错误保留 code/path/message，undefined、NaN、Infinity 显式标记。

记录范围：人工/API工具开始与结果、参数校验失败、执行端选择、内核请求与节流进度、模型提交、恢复检查点、Services握手/任务阶段/错误，以及Agent连接/断开/握手就绪、命令接收/派发/ack/结果/回报失败、产物传递和保存确认。

容量：最近 **1500条或1MiB UTF-8**，先到上限就淘汰旧记录；单条 **8KiB**，截断会标记。窗口最多渲染200条；完整下载仍可取得保留的全部日志。相同标签页刷新可从sessionStorage恢复已脱敏记录，存储失败会提示并仅保留内存。复制AI摘要最多约96KB UTF-8；提供“查看文本”作为手动复制入口。

状态只含有限的参数/轮廓摘要、版本/hash、工程修订、选择、忙碌/内核、当前LOGO和连接状态。凭证、URL查询、图片和模型二进制被过滤，大数组只留样本和数量。当前实现不读取服务器磁盘日志、其他标签页或此前未记录的历史。API结果、模型提交、画面呈现、文件生成、文件实际写入分开判断；诊断包不能作为工程备份或制造验收。
