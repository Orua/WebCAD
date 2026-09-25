# api.workspace

UI 配置源 src/ui-layout.js：tabs/groups/controls/header/panels/defaultTab，修改后构建生成静态站点。getUILayout() 读取当前完整配置。文件、创建、曲面、编辑、加工、检查、视图七个选项卡与常用操作共一行，工程名称放在左侧设计树顶部。浏览器标题显示未保存标记及工程名称；URL document 参数仅区分当前工程，不是可恢复工程的分享链接。setRenderQuality({context,quality}) 提供 draft/standard/fine/ultra 四档，getState().renderQuality 提供毫米公差、角度公差（弧度）及三角面数。只重算显示网格，不改工程 revision、精确 BRep 或 STEP 导出；不是屏幕自适应网格。OpenCascade 可保留已有更细网格，降档不承诺减少三角面数。当前不提供斑马纹、曲率梳和精确 G0/G1/G2 连续性认证；导入 STEP 也不能反推原始特征历史。
