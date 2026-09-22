import { evaluateDimension } from './parameter-calculator.js';

export function createDimensionCalculator(form, { element, button }) {
  const panel = element('details', { class: 'wide dimension-calculator' });
  panel.append(element('summary', {}, '尺寸计算器 / Calculator'));
  panel.append(element('p', {}, '例如 (13.4-12.4)/2；支持 + - * / ^、sqrt、pi。三角函数使用弧度，例如 sin(30*pi/180)。计算结果为数值，不转换单位。'));
  const expression = element('input', { type: 'text', maxlength: '256', 'aria-label': '尺寸表达式', placeholder: '(13.4-12.4)/2', 'data-no-translate': '' });
  const result = element('output', { 'aria-live': 'polite', 'data-no-translate': '' }); let value = null;
  const targets = element('select', { 'aria-label': '填入参数' });
  const apply = button('填入所选参数', () => {
    const input = form?.elements.namedItem(targets.value);
    if (value !== null && input && !input.disabled) { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
  }); apply.disabled = true;
  const calculate = () => { try { value = evaluateDimension(expression.value); result.textContent = ' = ' + value; apply.disabled = !targets.value; } catch (error) { value = null; result.textContent = error.message; apply.disabled = true; } };
  expression.addEventListener('input', () => { value = null; result.textContent = ''; apply.disabled = true; });
  expression.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); calculate(); } });
  panel.append(expression, button('计算', calculate), result);
  if (form) {
    panel.append(targets, apply);
    const refreshTargets = () => {
      const previous = targets.value; targets.replaceChildren();
      for (const input of form.querySelectorAll('input[type="number"][name]')) if (!input.disabled) { const label = input.closest('label')?.querySelector('span')?.textContent || input.name; targets.append(element('option', { value: input.name }, label)); }
      if ([...targets.options].some(option => option.value === previous)) targets.value = previous;
      apply.disabled = value === null || !targets.value;
    };
    panel.addEventListener('toggle', refreshTargets); form.addEventListener('change', refreshTargets);
  }
  return panel;
}
