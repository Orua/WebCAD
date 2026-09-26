import { profileSolidLabels, profileSolidRefCounts } from '../../modeling/profiles/profile-solid-contracts.js';

const resultLabels = [['newBody', '新建实体'], ['join', '加料'], ['cut', '切除'], ['intersect', '保留交集']];
const isProfile = body => body.solidCount === 0 && body.faceCount > 0;
const isPath = body => body.solidCount === 0 && body.faceCount === 0 && body.edgeCount > 0;
const isTarget = body => body.solidCount === 1;

export function showProfileSolidDialog(op, env) {
  if (!profileSolidLabels[op]) throw new Error('不支持的轮廓成型工具');
  const { state, openDialog, element, button, addField, readParams, bindParameterForm, setTaskTargetRefresh } = env;
  const selectedAtOpen = [...(state.selectedIds || [])];
  const dialog = openDialog(profileSolidLabels[op], '选择保存的轮廓来源；普通查看其它对象不会改变本次来源。预览后确认应用。', { returnToSelect: true });
  dialog.dataset.commandId = op;
  if (typeof env.onLegacy === 'function') {
    const legacy = button('改用基本尺寸', env.onLegacy, 'secondary'); legacy.type = 'button'; dialog.append(legacy);
  }
  const form = element('form', { class: 'parameter-form' });
  const status = element('p', { class: 'task-target wide', 'aria-live': 'polite', 'data-ready': 'false' });
  const notice = element('p', { class: 'property-footnote wide', 'aria-live': 'polite' });
  dialog.append(status);
  const fields = [], sourceInputs = [], loftRows = [];
  const bodies = () => state.bodies || [];
  const profiles = () => bodies().filter(isProfile);
  const paths = () => bodies().filter(isPath);
  const targets = () => bodies().filter(isTarget);
  const initial = candidates => selectedAtOpen.find(id => candidates.some(body => body.id === id)) || (candidates.length === 1 ? candidates[0].id : '');
  const choice = (host, name, label, options, value) => {
    const wrap = element('label', { class: 'form-field wide', 'data-field': name }), select = element('select', { name, 'aria-label': label });
    wrap.append(element('span', {}, label), select);
    for (const [id, text] of options) select.append(element('option', { value: id }, text));
    select.value = value; host.append(wrap); return { wrap, select };
  };
  const result = choice(form, 'operation', '结果', resultLabels, 'newBody');
  const populate = (select, candidates, placeholder, saved = select.value) => {
    select.replaceChildren(element('option', { value: '' }, placeholder));
    for (const body of candidates) select.append(element('option', { value: body.id }, body.name || body.id));
    if (saved && !candidates.some(body => body.id === saved)) select.append(element('option', { value: saved, disabled: true }, `已失效：${saved}`));
    select.value = saved || '';
  };
  const sourceChoice = (name, label, candidates, saved) => {
    const control = choice(form, name, label, [], ''); populate(control.select, candidates(), `请选择${label}`, saved);
    sourceInputs.push({ ...control, candidates, label }); return control.select;
  };
  const numberField = (host, spec) => { fields.push(spec); return addField(host, spec); };
  let axisKind, directionHost, section, path, addSection, loftHost;

  if (op === 'profileLoft') {
    loftHost = element('div', { class: 'wide profile-loft-sections' });
    form.append(element('p', { class: 'property-footnote wide' }, '从起始到结束排列 2–12 个截面。各截面只含一个闭合外环，首版不支持内孔。'), loftHost);
    const chosen = selectedAtOpen.filter(id => profiles().some(body => body.id === id)).slice(0, 12);
    for (const id of chosen.length ? chosen : [initial(profiles())]) loftRows.push({ value: id });
    while (loftRows.length < 2) loftRows.push({ value: '' });
    const renderRows = () => {
      loftHost.replaceChildren();
      loftRows.forEach((row, index) => {
        const host = element('div', { class: 'profile-loft-section', 'data-section-index': String(index) });
        const control = choice(host, `section${index}`, `截面 ${index + 1}`, [], '');
        populate(control.select, profiles(), '请选择轮廓截面', row.value); row.select = control.select;
        row.select.addEventListener('change', () => { row.value = row.select.value; });
        const controls = element('div', { class: 'profile-editor-toolbar' });
        const move = amount => { const destination = index + amount; if (destination < 0 || destination >= loftRows.length) return; [loftRows[index], loftRows[destination]] = [loftRows[destination], loftRows[index]]; renderRows(); changed(); };
        const up = button('上移', () => move(-1), 'secondary'), down = button('下移', () => move(1), 'secondary');
        const remove = button('删除', () => { if (loftRows.length <= 2) return; loftRows.splice(index, 1); renderRows(); changed(); }, 'secondary');
        for (const control of [up, down, remove]) control.type = 'button';
        up.disabled = index === 0; down.disabled = index === loftRows.length - 1; remove.disabled = loftRows.length <= 2;
        up.setAttribute('aria-label', `截面 ${index + 1} 上移`); down.setAttribute('aria-label', `截面 ${index + 1} 下移`); remove.setAttribute('aria-label', `删除截面 ${index + 1}`);
        controls.append(up, down, remove); host.append(controls); loftHost.append(host);
      });
      if (addSection) addSection.disabled = loftRows.length >= 12;
    };
    addSection = button('添加截面', () => { if (loftRows.length >= 12) return; loftRows.push({ value: '' }); renderRows(); changed(); }, 'secondary');
    addSection.type = 'button'; form.append(addSection);
    numberField(form, ['ruled', '直纹过渡', false, 'boolean']);
    renderRows();
  } else {
    section = sourceChoice('profileSourceId', '轮廓截面', profiles, initial(profiles()));
    if (op === 'profileRevolve') {
      axisKind = choice(form, 'axisKind', '旋转轴方向', [['X', 'X 轴'], ['Y', 'Y 轴'], ['Z', 'Z 轴'], ['custom', '自定义方向']], 'Y').select;
      for (const axis of ['X', 'Y', 'Z']) numberField(form, [`axisPoint${axis}`, `轴上一点 ${axis}（世界 mm）`, 0]);
      directionHost = element('div', { class: 'parameter-form wide', 'data-custom-direction': 'true' });
      for (const [index, axis] of ['X', 'Y', 'Z'].entries()) numberField(directionHost, [`axisDirection${axis}`, `方向 ${axis}`, index === 1 ? 1 : 0]);
      form.append(directionHost); numberField(form, ['angleDeg', '旋转角度 °', 360, 'angle']);
      form.append(element('p', { class: 'property-footnote wide' }, '轴上一点使用世界坐标；旋转轴须位于保存的截面平面内。原生面内孔会一起保留。'));
    } else {
      path = sourceChoice('pathSourceId', '开放路径', paths, initial(paths()));
      choice(form, 'transitionMode', '路径拐角过渡', [['transformed', '随路径变换'], ['right', '直角过渡'], ['round', '圆角过渡']], 'transformed');
      numberField(form, ['frenet', '沿曲率标架转向', false, 'boolean']);
      form.append(element('p', { class: 'property-callout wide' }, '截面与路径使用保存的世界位置。截面须先放在路径起点平面，并垂直起点切线；工具不会自动移动或旋转来源。首版不支持截面内孔、闭合或分叉路径。'));
    }
  }
  const target = choice(form, 'targetBodyId', '加工目标', [], '');
  populate(target.select, targets(), '请选择明确的单实体目标', initial(targets()));
  form.append(notice);

  const references = () => {
    const refs = op === 'profileLoft' ? loftRows.map(row => row.select.value) : op === 'profileSweep' ? [section.value, path.value] : [section.value];
    const sectionIds = op === 'profileSweep' ? refs.slice(0, 1) : refs;
    if (sectionIds.some(id => !profiles().some(body => body.id === id))) throw new Error('请选择当前有效的保存轮廓截面');
    if (op === 'profileSweep' && !paths().some(body => body.id === path.value)) throw new Error('请选择当前有效的单一开放路径');
    if (result.select.value !== 'newBody') {
      if (!targets().some(body => body.id === target.select.value)) throw new Error('请选择当前有效的单实体加工目标');
      refs.push(target.select.value);
    }
    if (new Set(refs).size !== refs.length) throw new Error('截面、路径和加工目标不能重复；放样截面须各自不同');
    const bounds = profileSolidRefCounts[op][result.select.value === 'newBody' ? 'newBody' : 'modification'];
    if (refs.length < bounds.min || refs.length > bounds.max) throw new Error('来源引用数量无效');
    return refs;
  };
  const read = () => {
    const refs = references(), parsed = readParams(form, fields), params = { operation: result.select.value };
    if (op === 'profileRevolve') {
      params.axisPoint = ['X', 'Y', 'Z'].map(axis => parsed[`axisPoint${axis}`]);
      params.axisDirection = axisKind.value === 'custom' ? ['X', 'Y', 'Z'].map(axis => parsed[`axisDirection${axis}`]) : ['X', 'Y', 'Z'].map(axis => Number(axis === axisKind.value));
      params.angleDeg = parsed.angleDeg;
      if (params.axisPoint.some(value => !Number.isFinite(value)) || params.axisDirection.some(value => !Number.isFinite(value)) || Math.hypot(...params.axisDirection) <= 1e-12) throw new Error('轴点须为有效数字，自定义方向不能为零向量');
      if (!(params.angleDeg > 0 && params.angleDeg <= 360)) throw new Error('旋转角度须大于 0 且不超过 360°');
    } else if (op === 'profileSweep') { params.transitionMode = form.elements.namedItem('transitionMode').value; params.frenet = parsed.frenet; }
    else params.ruled = parsed.ruled;
    return { ...params, _targetRefs: refs };
  };
  const updateValidity = () => {
    target.wrap.hidden = result.select.value === 'newBody';
    if (directionHost) {
      directionHost.hidden = axisKind.value !== 'custom';
      for (const input of directionHost.querySelectorAll('input')) input.disabled = directionHost.hidden;
    }
    let issue = '';
    try {
      references();
      if (op === 'profileRevolve') {
        const numeric = name => { const input = form.elements.namedItem(name); if (!input.value.trim() || !Number.isFinite(Number(input.value))) throw new Error('轴点和角度需要有效数字'); return Number(input.value); };
        for (const axis of ['X', 'Y', 'Z']) numeric(`axisPoint${axis}`);
        const angle = numeric('angleDeg'); if (!(angle > 0 && angle <= 360)) throw new Error('旋转角度须大于 0 且不超过 360°');
        if (axisKind.value === 'custom' && Math.hypot(...['X', 'Y', 'Z'].map(axis => numeric(`axisDirection${axis}`))) <= 1e-12) throw new Error('自定义轴方向不能为零向量');
      }
    } catch (error) { issue = error.message; }
    status.dataset.ready = String(!issue); status.textContent = issue || '来源已锁定；预览与应用使用相同有序引用';
    notice.textContent = result.select.value === 'newBody' ? '新建结果；保存的轮廓与路径保留。' : '仅加工目标被替换；保存的轮廓与路径保留。';
    for (const control of form.querySelectorAll('button[type="submit"],button[data-preview]')) control.disabled = !!issue || !!state.busy;
  };
  const changed = () => { updateValidity(); form.dispatchEvent(new Event('input', { bubbles: true })); };
  let previousStamp;
  const refresh = () => {
    for (const control of sourceInputs) populate(control.select, control.candidates(), `请选择${control.label}`);
    for (const row of loftRows) { row.value = row.select.value; populate(row.select, profiles(), '请选择轮廓截面', row.value); }
    populate(target.select, targets(), '请选择明确的单实体目标');
    const ids = [...sourceInputs.map(control => control.select.value), ...loftRows.map(row => row.select.value), ...(result.select.value === 'newBody' ? [] : [target.select.value])];
    const stamp = JSON.stringify(ids.map(id => { const body = bodies().find(candidate => candidate.id === id); return body ? [id, body.renderVersion, body.geometryFingerprint, body.faceCount, body.edgeCount, body.solidCount] : [id, 'missing']; }));
    updateValidity();
    if (previousStamp !== undefined && stamp !== previousStamp) form.dispatchEvent(new Event('input', { bubbles: true }));
    previousStamp = stamp;
  };
  form.addEventListener('change', changed); form.addEventListener('input', updateValidity);
  bindParameterForm(form, op, read);
  dialog.append(form); setTaskTargetRefresh(refresh); refresh();
  (section || loftRows[0]?.select)?.focus();
  return { dialog, form, read, refresh };
}
