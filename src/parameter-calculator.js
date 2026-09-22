const MAX_LENGTH = 256;
const MAX_DEPTH = 64;
const MAX_STEPS = 2048;

const FUNCTIONS = Object.freeze({
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  min: Math.min,
  max: Math.max,
});

export function evaluateDimension(expression) {
  if (typeof expression !== 'string') throw new Error('尺寸表达式必须是字符串');
  if (expression.length > MAX_LENGTH) throw new Error('尺寸表达式过长（最多256个字符）');
  const text = expression.trim();
  if (!text) throw new Error('尺寸表达式不能为空');
  let position = 0;
  let steps = 0;
  let depth = 0;
  const fail = (message) => { throw new Error(`尺寸表达式错误：${message}（位置${position + 1}）`); };
  const tick = () => { if (++steps > MAX_STEPS) fail('表达式计算步骤超限'); };
  const enter = () => { if (++depth > MAX_DEPTH) fail('括号或调用嵌套过深'); };
  const leave = () => { --depth; };
  const peek = () => text[position] ?? '';
  const consume = (character) => { if (peek() === character) { position++; return true; } return false; };
  const skipSpaces = () => { while (/\s/.test(peek())) position++; };
  const ensureFinite = (value) => { if (!Number.isFinite(value)) fail('结果不是有限数字'); return value; };

  function parseNumber() {
    tick();
    const start = position;
    const match = text.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (!match) fail('需要数字');
    position += match[0].length;
    return ensureFinite(Number(match[0]));
  }
  function parseIdentifier() {
    const start = position;
    while (/[A-Za-z_]/.test(peek())) position++;
    return text.slice(start, position);
  }
  function parsePrimary() {
    tick(); skipSpaces();
    if (consume('(')) { enter(); const value = parseAdditive(); skipSpaces(); if (!consume(')')) fail('缺少右括号'); leave(); return value; }
    if (/[0-9.]/.test(peek())) return parseNumber();
    if (/[A-Za-z_]/.test(peek())) {
      const name = parseIdentifier();
      if (name === 'pi') return Math.PI;
      skipSpaces();
      if (!consume('(')) fail(`未知标识“${name}”`);
      if (!Object.hasOwn(FUNCTIONS, name)) fail(`未知函数“${name}”`);
      const fn = FUNCTIONS[name];
      enter(); skipSpaces();
      const args = [];
      if (!consume(')')) {
        do { args.push(parseAdditive()); skipSpaces(); } while (consume(','));
        if (!consume(')')) fail('缺少右括号');
      }
      leave();
      if ((name === 'sqrt' || name === 'abs' || name === 'sin' || name === 'cos' || name === 'tan') && args.length !== 1) fail(`${name}需要1个参数`);
      if ((name === 'min' || name === 'max') && args.length < 1) fail(`${name}至少需要1个参数`);
      return ensureFinite(fn(...args));
    }
    fail('需要数字、括号或函数');
  }
  // unary is below power so -2^2 means -(2^2), while 2^-2 remains valid.
  function parseUnary() { tick(); skipSpaces(); if (consume('+')) return parseUnary(); if (consume('-')) return -parseUnary(); return parsePower(); }
  function parsePower() { tick(); let value = parsePrimary(); skipSpaces(); if (consume('^')) value = ensureFinite(value ** parseUnary()); return value; }
  function parseMultiplicative() { let value = parseUnary(); for (;;) { skipSpaces(); if (consume('*')) value = ensureFinite(value * parseUnary()); else if (consume('/')) { const divisor = parseUnary(); if (divisor === 0) fail('除数不能为零'); value = ensureFinite(value / divisor); } else return value; } }
  function parseAdditive() { let value = parseMultiplicative(); for (;;) { skipSpaces(); if (consume('+')) value = ensureFinite(value + parseMultiplicative()); else if (consume('-')) value = ensureFinite(value - parseMultiplicative()); else return value; } }

  const result = parseAdditive();
  skipSpaces();
  if (position !== text.length) fail('存在尾随字符');
  return ensureFinite(result);
}
