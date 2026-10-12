# WebCAD 界面与模型库升级

页面 API：1.32.0。源码发布范围为工作区、菜单显隐、可配置快捷模型库及对应 Agent 契约；几何执行继续使用原有 CommandService 和 Worker。

## 新布局

- **建模**：工具依次按编辑、路径、创建、实体、面加工、实体加工、曲面、修饰、检查、视图和设置组织。原有工具仍保留，工具搜索始终在顶栏。
- **模型库**：在中央大幅展示模型，可搜索并切换卡片和详细列表。选中条目显示说明、默认参数和 Agent 调用契约，再进入参数、预览和应用任务。
- **Agent**：集中显示连接／控制状态、当前工程、模型版本、执行状态及接口知识入口。手工 JSON 调试收在高级入口；Agent 直接调用页面 API。
- **收起工具**：独立隐藏工具分类及工具菜单。**专注画布**同时收起菜单及左右栏，保留顶栏恢复入口。退出专注恢复此前显隐。
- 模型库和 Agent 工作区自动收起建模菜单与两侧栏；返回建模时恢复原状态。左右栏仍可分别隐藏。未应用任务或参数草稿必须先应用／取消，切换不会悄悄丢弃。

## 维护模型库

在模型库点击“管理模型库”。普通表单可维护模型 ID、名称、说明、几何类型和默认参数；选定条目后编辑或删除，用上移／下移调整顺序。高级区域可直接编辑单条配置 JSON。

“导入／导出配置”支持完整库 JSON；导入会替换当前库。“全量恢复默认库”恢复所有默认条目、参数和顺序，也会移除自定义条目，请先导出需保留的配置。

库在当前浏览器、当前站点的 localStorage 保存。不同域名或浏览器之间请导出／导入；库不会自动随 `.webcad` 工程或账号同步。模型 ID 是库内身份，几何 `kind` 是已安装构建器的稳定身份。

删除或修改库条目不会改动已创建实体。工程保存解析后的 `kind` 和实际参数，仍可修改、撤销、重做及重开。

## 用脚本添加常用模型

复制并修改 `scripts/model-library.example.mjs`。可以返回条目数组，也可以返回接收默认库的函数，进行参数计算、追加、移除和排序：

```javascript
export default defaults => [
  {
    id: 'ring_30_4', kind: 'ring',
    label: '常用圆圈 · 内径30 线径4',
    description: '圆线圈，单位 mm。',
    defaults: { innerDiameter: 30, sectionSize: 4 }
  },
  ...defaults
];
```

在宿主生成已校验的配置：

```powershell
node scripts/export-model-library.mjs scripts/model-library.example.mjs G:/CAD-Workspace/WebCAD/output/my-model-library.json
```

把生成的 JSON 导入模型库即可热更新，无需重启页面或部署。浏览器不执行任意脚本；脚本在受信宿主生成参数数据。若需要新增几何算法，则按 `src/quick-models/README.md` 增加独立 `definition.js / build.js / icon.svg / index.js` 并注册稳定 `kind`，重新构建发布后自动生成其模板契约。网页运行不要求安装上述脚本或终端服务。

## Agent 契约

首次使用按 `connect().onboarding` 下载并核验有限知识包，先读实际宿主的脚本通道，再读取所需完整卡。布局调用：

```javascript
const api = window.webcad.api;
await api.setView({ context: api.createRequestContext(), focus: true });
await api.setView({ context: api.createRequestContext(), focus: false });
await api.setView({ context: api.createRequestContext(),
  workspace: 'library', libraryMode: 'list', toolbar: false });
// getState().view.workspaceLayout / view.panels 读回；getUILayout().current 同步。
```

库读取和生成：

```javascript
const library = await api.getModelLibrary();
// entries 包含 fields、inputSchema、toolId、execution 和已知限制。
const resolved = await api.resolveModelLibrary({
  context: api.createRequestContext(), id: 'ring',
  expectedLibraryRevision: library.revision,
  params: { innerDiameter: 30, sectionSize: 4 }
});
if (resolved.status === 'failed') throw new Error(resolved.error.message);
const receipt = await api.run({
  context: api.createRequestContext(), idempotencyKey: crypto.randomUUID(),
  steps: [{id:'part', method:'add', args:{
    op:resolved.op, params:resolved.params, refs:resolved.refs, name:resolved.name
  }}]
});
```

库管理用 `updateModelLibrary({context, expectedLibraryRevision, operation, ...})`：

| operation | 额外参数 | 行为 |
| --- | --- | --- |
| upsert | entry:{id,kind,label,description?,defaults?} | 按 ID 新增或替换 |
| remove | id | 删除一个库条目 |
| move | id,index | 移到操作后零起始索引 |
| import | library:{format:'webcad-model-library',version:1,entries:[...]} | 全量替换 |
| restore | 无 | 全量恢复默认库 |

读取当前库 revision 后再修改。`LIBRARY_REVISION_CONFLICT` 表示库已被其他操作改变；重新读取并规划，不覆盖别人的修改。存储失败不报告成功；损坏库显式恢复需 `expectedLibraryRevision:-1`。库最多 200 个唯一 ID，配置不超过 1 MiB。未知类型、字段、非法数值和选项会拒绝。预览先取消；活动人工任务切换工作区返回 `UI_TASK_ACTIVE`。

## 本次验证与边界

独立发布版本的 75 项针对性测试、构建工具映射与知识包门禁通过；保留 75 项几何操作、167 条 UI 路由。真实浏览器验证了表单添加、卡片／列表、搜索详情、显隐恢复、预览取消，以及 Agent 配置→解析→建模→精确测量→匹配帧。测试工程实际写入 G:、重开、历史尺寸编辑及撤销／重做通过。

这是新增工作流和工具映射的验证，没有重新逐项认证所有复杂几何算法。Services、Logo 转换和 Native 算法未修改。生产发布仅更新现有 WebCAD 静态目录，保留原有助手后端、服务配置和旧资源以支持回滚。

## 既有远程助手兼容

远程 MCP 的固定方法白名单无需升级服务：`webcad_read` 使用 method=`getUILayout`、args=`{includeModelLibrary:true}`，读取返回的 `modelLibrary` 完整条目与实际生成合同；管理用 `webcad_view` 的 method=`setView`、args=`{context,modelLibraryChange:{expectedLibraryRevision,operation,entry?,id?,index?,library?}}`，返回与 `updateModelLibrary` 完全相同的回执。管理请求单独提交，不与视图修改混用。生成把条目的 `execution` 放入已有 `run/add`。浏览器脚本宿主继续直接调用三个模型库方法。
