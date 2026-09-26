import { showProfileSolidDialog } from '../src/ui/forms/profile-solid-dialogs.js';

// Run in an isolated browser fixture; exercises native select, form and DOM events.
// await import('/tests/profile-solid-dialogs.test.mjs').then(m => m.runProfileSolidDialogDomTests())
export function runProfileSolidDialogDomTests() {
  if (typeof document === 'undefined') throw new Error('This suite requires an actual browser DOM');
  const checks = [], check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  const equal = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
  const throws = (callback, expected) => { try { callback(); return false; } catch (error) { return expected.test(error.message); } };
  const fixture = document.createElement('div'); fixture.style.cssText = 'position:fixed;left:-10000px;top:0;width:480px'; document.body.append(fixture);
  const element = (name, attributes = {}, text) => {
    const node = document.createElement(name); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = text; return node;
  };
  const button = (label, callback, className = '') => { const node = element('button', { type: 'button', class: className }, label); node.addEventListener('click', callback); return node; };
  const addField = (host, [key, label, value, type]) => {
    const wrap = element('label', { class: 'form-field', 'data-field': key }), input = element('input', { name: key, type: type === 'boolean' ? 'checkbox' : 'number', step: 'any' });
    if (type === 'boolean') input.checked = value; else { input.value = String(value); input.required = true; }
    wrap.append(element('span', {}, label), input); host.append(wrap); return input;
  };
  const readParams = (form, fields) => {
    const params = {};
    for (const [key, , , type] of fields) {
      const input = form.elements.namedItem(key); if (input.disabled) continue;
      if (type === 'boolean') params[key] = input.checked;
      else { if (!input.value.trim() || !Number.isFinite(Number(input.value))) throw new Error('需要有效数字'); params[key] = Number(input.value); }
    }
    return params;
  };
  const originalBodies = [
    { id: 'section-a', name: '起始圆', solidCount: 0, faceCount: 1, edgeCount: 2, renderVersion: 'a-1' },
    { id: 'section-b', name: '结束圆', solidCount: 0, faceCount: 1, edgeCount: 2, renderVersion: 'b-1' },
    { id: 'section-c', name: '中间圆', solidCount: 0, faceCount: 1, edgeCount: 2, renderVersion: 'c-1' },
    { id: 'path-a', name: '开放路径', solidCount: 0, faceCount: 0, edgeCount: 3, renderVersion: 'path-1' },
    { id: 'body-a', name: '加工实体', solidCount: 1, faceCount: 6, edgeCount: 12, renderVersion: 'body-1' },
    { id: 'compound', name: '多实体组合', solidCount: 2, faceCount: 12, edgeCount: 24, renderVersion: 'compound-1' },
  ];
  const create = (op, selectedIds) => {
    const state = { bodies: originalBodies.map(body => ({ ...body })), selectedIds, busy: false };
    let refreshCallback, readCallback, inputEvents = 0;
    const controller = showProfileSolidDialog(op, {
      state, element, button, addField, readParams,
      openDialog: title => { const node = element('section', { role: 'dialog' }); node.append(element('h2', {}, title)); fixture.append(node); return node; },
      bindParameterForm: (form, action, read) => {
        readCallback = read; form.dataset.boundOperation = action;
        form.append(element('button', { type: 'button', 'data-preview': 'true' }, '预览'), element('button', { type: 'submit' }, '应用'));
        form.addEventListener('input', () => inputEvents++);
      },
      setTaskTargetRefresh: callback => { refreshCallback = callback; },
    });
    return { ...controller, state, refreshCallback: () => refreshCallback(), readCallback: () => readCallback(), inputEvents: () => inputEvents };
  };
  const setValue = (form, name, value) => { const control = form.elements.namedItem(name); control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); return control; };
  const enabled = form => [...form.querySelectorAll('button[type="submit"],button[data-preview]')].every(control => !control.disabled);
  const click = (host, label) => { const control = [...host.querySelectorAll('button')].find(node => node.textContent === label); if (!control) throw new Error(`Missing button ${label}`); control.click(); };
  try {
    const rotate = create('profileRevolve', ['section-b', 'body-a']);
    check(rotate.form.dataset.boundOperation === 'profileRevolve' && rotate.dialog.querySelectorAll('details,textarea').length === 0, 'existing parameter form/preview path, no new folding or JSON fields');
    check(equal(rotate.readCallback(), { operation: 'newBody', axisPoint: [0, 0, 0], axisDirection: [0, 1, 0], angleDeg: 360, _targetRefs: ['section-b'] }), 'rotation initializes selected saved section and explicit world Y axis');
    check(rotate.form.querySelector('[data-field="targetBodyId"]').hidden && rotate.form.querySelector('[data-custom-direction]').hidden, 'target and custom direction appear only when needed');
    check([...rotate.form.elements.namedItem('profileSourceId').options].filter(option => option.value).every(option => option.value.startsWith('section-')), 'source dropdown contains actual section objects only');
    check([...rotate.form.elements.namedItem('operation').options].map(option => option.textContent).join(',') === '新建实体,加料,切除,保留交集', 'all material mode choices have Chinese labels');
    rotate.state.selectedIds = ['section-c']; rotate.refreshCallback();
    check(rotate.read()._targetRefs[0] === 'section-b', 'ordinary object inspection never swaps the locked source');
    setValue(rotate.form, 'axisKind', 'X'); setValue(rotate.form, 'axisPointX', '4'); setValue(rotate.form, 'angleDeg', '90');
    check(equal(rotate.read().axisDirection, [1, 0, 0]) && equal(rotate.read().axisPoint, [4, 0, 0]) && rotate.read().angleDeg === 90, 'principal axis and individual numeric point fields pack into explicit vectors');
    setValue(rotate.form, 'axisKind', 'custom'); setValue(rotate.form, 'axisDirectionX', '2'); setValue(rotate.form, 'axisDirectionY', '3');
    check(!rotate.form.querySelector('[data-custom-direction]').hidden && equal(rotate.read().axisDirection, [2, 3, 0]), 'custom direction uses three numeric components without JSON');
    for (const axis of ['X', 'Y', 'Z']) setValue(rotate.form, `axisDirection${axis}`, '0');
    check(!enabled(rotate.form) && throws(rotate.read, /零向量/), 'zero custom axis invalidates apply and preview');
    setValue(rotate.form, 'axisDirectionX', ''); setValue(rotate.form, 'axisKind', 'Z');
    check(enabled(rotate.form) && equal(rotate.read().axisDirection, [0, 0, 1]) && rotate.form.reportValidity(), 'unused custom fields are disabled and cannot block a principal axis');
    setValue(rotate.form, 'operation', 'cut');
    check(!rotate.form.querySelector('[data-field="targetBodyId"]').hidden && equal(rotate.read()._targetRefs, ['section-b', 'body-a']), 'material mode exposes explicit selected target as last ref');
    check(![...rotate.form.elements.namedItem('targetBodyId').options].some(option => option.value === 'compound'), 'multi-solid compounds are excluded from single-solid targets');
    const eventsBefore = rotate.inputEvents(); rotate.state.bodies.find(body => body.id === 'section-b').renderVersion = 'b-2'; rotate.refreshCallback();
    check(rotate.inputEvents() > eventsBefore && rotate.form.elements.namedItem('profileSourceId').value === 'section-b', 'source geometry refresh marks preview stale while retaining source identity');
    rotate.state.bodies = rotate.state.bodies.filter(body => body.id !== 'section-b'); rotate.refreshCallback();
    check(!enabled(rotate.form) && rotate.form.elements.namedItem('profileSourceId').value === 'section-b' && rotate.dialog.querySelector('.task-target').dataset.ready === 'false', 'removed source remains visibly invalid and never falls back to another profile');

    const sweep = create('profileSweep', ['section-a', 'path-a', 'body-a']);
    check(equal(sweep.read(), { operation: 'newBody', transitionMode: 'transformed', frenet: false, _targetRefs: ['section-a', 'path-a'] }), 'sweep packs actual selected section and saved path in order');
    check(sweep.dialog.textContent.includes('保存的世界位置') && sweep.dialog.textContent.includes('不会自动移动或旋转来源'), 'sweep clearly explains existing world placement and start-plane requirement');
    check([...sweep.form.elements.namedItem('transitionMode').options].map(option => option.textContent).join(',') === '随路径变换,直角过渡,圆角过渡', 'sweep transitions are understandable Chinese choices');
    setValue(sweep.form, 'operation', 'join'); check(equal(sweep.read()._targetRefs, ['section-a', 'path-a', 'body-a']), 'sweep material target is appended after both source refs');
    sweep.state.busy = true; sweep.refreshCallback(); check(!enabled(sweep.form), 'busy state disables both apply and preview');
    sweep.state.busy = false; sweep.state.bodies.find(body => body.id === 'path-a').faceCount = 1; sweep.refreshCallback();
    check(!enabled(sweep.form) && throws(sweep.read, /开放路径/), 'path type changes invalidate stored path without silently replacing it');

    const loft = create('profileLoft', ['section-a', 'section-c', 'section-b', 'body-a']);
    check(equal(loft.read()._targetRefs, ['section-a', 'section-c', 'section-b']), 'loft initializes explicit selected order of three distinct sections');
    click(loft.form.querySelector('[data-section-index="2"]'), '上移');
    check(equal(loft.read()._targetRefs, ['section-a', 'section-b', 'section-c']), 'loft up button updates the actual ordered refs');
    click(loft.form.querySelector('[data-section-index="0"]'), '下移');
    check(equal(loft.read()._targetRefs, ['section-b', 'section-a', 'section-c']), 'loft down button updates the actual ordered refs');
    click(loft.form.querySelector('[data-section-index="2"]'), '删除');
    check(equal(loft.read()._targetRefs, ['section-b', 'section-a']) && loft.form.querySelectorAll('.profile-loft-section').length === 2, 'loft removal preserves the two-section minimum');
    setValue(loft.form, 'section1', 'section-b'); check(!enabled(loft.form) && throws(loft.read, /重复/), 'duplicate loft sections fail before preview or application');
    setValue(loft.form, 'section1', 'section-a'); setValue(loft.form, 'operation', 'intersect');
    check(equal(loft.read()._targetRefs, ['section-b', 'section-a', 'body-a']), 'loft material target remains last after reordering/removal');
    for (let i = 2; i < 12; i++) click(loft.form, '添加截面');
    check(loft.form.querySelectorAll('.profile-loft-section').length === 12 && [...loft.form.querySelectorAll('button')].find(node => node.textContent === '添加截面').disabled, 'loft cannot exceed twelve section rows');
    check(loft.dialog.querySelectorAll('textarea,details').length === 0, 'loft ordering uses ordinary controls and adds no JSON/folding');
    return { status: 'passed', count: checks.length, checks };
  } finally { fixture.remove(); }
}
