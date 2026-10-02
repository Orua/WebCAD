# recipes.hardware-practice

可复用组合流程位于 automation/hardware-practice.js（源文件 docs/examples/hardware-practice.js），导出 hardwarePracticeBatches 与 runHardwarePractice(api)。尺寸为自主练习值，不用于重建客户源 CAD。先通过受支持的页面脚本通道取得 api，读取相关卡与最新 context，并确认 canExecute；helper 每批重新取 context，失败即停，不重放已完成批次。第一批 5 步：保存槽轮母线，沿世界 Y 轴旋转，切四个安装孔，使用 body.visibility 的 visible:false 隐藏母线，精确测量。成品外径 32 mm、轴向长度 18 mm。第二批 8 步：保存三个不同尺寸与转角的圆角截面，依次放样，切直径 6 mm 的轴孔，隐藏来源，测量，等轴显示；旋钮高 32 mm。几何量、修订与来源引用来自实际回执，只有 displayMatchesContext 与实际页面画面确认后才算显示验收。helper 的 saved:false 明确表示未写工程文件。内核/公开 API 集成测试不能代替真实页面验收。
