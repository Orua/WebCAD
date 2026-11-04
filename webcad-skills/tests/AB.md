# 模型实验与几何回归的边界

本库的runtime-raw.json是本轮主Agent经授权页面API执行的完整请求和原始回执。verify-runtime.mjs独立验算5个代表性任务，不是A/B改进证据。方法/路由加载的语义由routing.test检验，其通过也不能证明模型会正确建模。

真实A/B入口为scripts/model-session.mjs，调用者提供同一模型/工具适配器、独立初始工程与judge。A不加本库，B将按需方法放入实际messages。每次原始请求/响应/工具结果由record归档；同模型ID、工具哈希、任务、初始状态、共享几何替代预算=1一致。maxRounds约束模型回合，不替代宿主的几何重试预算。独立judge按benchmarks要求判定，模型自己的完成语句无效。reset隔离工程与会话由宿主负责。

本轮没有配置真实模型请求适配器，未执行A/B，不把“未配置”说成已证明环境不能运行。model-session.test用假适配器仅检验内容进入请求和工具回合，不产生模型效果数据。完成率/首次正确率/错工具次数/真实端到端耗时/Token全部null。若后续获得授权的适配器，逐项独立运行A/B，记录失败和manual_review，不删除困难案例。工厂验收、复杂曲面与LOGO源件仍须各自证据。
