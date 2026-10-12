export function mountAgentWorkspace(root, {element, button, onDebug, onFocus}) {
  const heading = element('header', {class:'agent-heading'});
  heading.append(element('h1', {}, 'Agent 工作区'), element('p', {}, '连接当前工程，发现工具，在同一画布上执行。'));
  const status = element('p', {class:'agent-connection', role:'status'}), context = element('dl', {class:'agent-context'});
  const actions = element('div', {class:'agent-workspace-actions'});
  actions.append(button('专注画布', onFocus, 'primary'));
  for (const [path, label] of [['agent-start.html','连接指南'], ['quickstart.md','调用示例'], ['routes.json','全部界面契约'], ['agent-knowledge.json','完整知识包']]) {
    const link = element('a', {href:'./automation/' + path, target:'_blank', rel:'noopener'}, label); actions.append(link);
  }
  const docs = element('section', {class:'agent-instructions'});
  docs.append(element('h2', {}, '从当前页面开始'), element('pre', {}, 'window.webcad.api.connect({\n  queries: ["模型库", "视图", "建模"]\n})'), element('p', {}, '先检查宿主的页面脚本能力，再按 connect 返回的知识包和工具卡执行。操作前读取当前 context；任务完成后读回实体与匹配的画面。'));
  const debug = element('details', {class:'agent-debug'}); debug.append(element('summary', {}, '高级 · 手工 JSON 调试'), element('p', {}, '仅用于人工检查请求和回执。Agent 直接使用公共页面 API。'), button('打开手工调试面板', onDebug, 'secondary'));
  root.append(heading, status, context, actions, docs, debug);
  return {update(state, hostControl) {
    status.textContent = (hostControl.connected ? 'Agent 已连接' : 'Agent 未连接') + ' · ' + (hostControl.locked ? 'Agent 控制中，人工编辑暂停' : '人工编辑可用');
    status.dataset.connected = String(hostControl.connected); context.replaceChildren();
    for (const [label, value] of [['当前工程', state.document?.name || '新建工程'], ['模型版本', state.revision ?? 0], ['实体', state.bodies?.length || 0], ['执行状态', state.busy ? '计算中' : state.kernelReady ? '可执行' : '内核加载中']]) context.append(element('dt', {}, label), element('dd', {}, String(value)));
  }};
}
