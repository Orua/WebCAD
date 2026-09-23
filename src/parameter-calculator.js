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

const numericSemantics = {
  number: value => value,
  identifier: name => { if (name === 'pi') return Math.PI; throw new Error(`未知标识“${name}”`); },
  unary: (op, value) => op === '-' ? -value : value,
  binary: (op, left, right) => {
    if (op === '/' && right === 0) throw new Error('除数不能为零');
    return { '+': () => left + right, '-': () => left - right, '*': () => left * right,
      '/': () => left / right, '^': () => left ** right }[op]();
  },
  call: (name, args) => FUNCTIONS[name](...args),
  finite: value => Number.isFinite(value),
};

/** Shared bounded parser. Semantics are trusted local callbacks, never user code. */
export function evaluateExpression(expression, semantics = numericSemantics) {
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
  const ensureFinite = (value) => { if (!semantics.finite(value)) fail('结果不是有限数字'); return value; };
  const apply = (method, ...args) => {
    try { return ensureFinite(semantics[method](...args)); }
    catch (error) { if (error.code) throw error; fail(error.message); }
  };

  function parseNumber() {
    tick();
    const start = position;
    const match = text.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (!match) fail('需要数字');
    position += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail('数字超出有限范围');
    return apply('number', value);
  }
  function parseIdentifier() {
    const start = position;
    while (/[A-Za-z0-9_]/.test(peek())) position++;
    return text.slice(start, position);
  }
  function parsePrimary() {
    tick(); skipSpaces();
    if (consume('(')) { enter(); const value = parseAdditive(); skipSpaces(); if (!consume(')')) fail('缺少右括号'); leave(); return value; }
    if (/[0-9.]/.test(peek())) return parseNumber();
    if (/[A-Za-z_]/.test(peek())) {
      const name = parseIdentifier();
      skipSpaces();
      if (!consume('(')) return apply('identifier', name);
      if (!Object.hasOwn(FUNCTIONS, name)) fail(`未知函数“${name}”`);
      enter(); skipSpaces();
      const args = [];
      if (!consume(')')) {
        do { args.push(parseAdditive()); skipSpaces(); } while (consume(','));
        if (!consume(')')) fail('缺少右括号');
      }
      leave();
      if ((name === 'sqrt' || name === 'abs' || name === 'sin' || name === 'cos' || name === 'tan') && args.length !== 1) fail(`${name}需要1个参数`);
      if ((name === 'min' || name === 'max') && args.length < 1) fail(`${name}至少需要1个参数`);
      return apply('call', name, args);
    }
    fail('需要数字、括号或函数');
  }
  // unary is below power so -2^2 means -(2^2), while 2^-2 remains valid.
  function parseUnary() {
    tick(); skipSpaces(); enter();
    try { if (consume('+')) return apply('unary', '+', parseUnary()); if (consume('-')) return apply('unary', '-', parseUnary()); return parsePower(); }
    finally { leave(); }
  }
  function parsePower() { tick(); let value = parsePrimary(); skipSpaces(); if (consume('^')) value = apply('binary', '^', value, parseUnary()); return value; }
  function parseMultiplicative() { let value = parseUnary(); for (;;) { skipSpaces(); if (consume('*')) value = apply('binary', '*', value, parseUnary()); else if (consume('/')) value = apply('binary', '/', value, parseUnary()); else return value; } }
  function parseAdditive() { let value = parseMultiplicative(); for (;;) { skipSpaces(); if (consume('+')) value = apply('binary', '+', value, parseMultiplicative()); else if (consume('-')) value = apply('binary', '-', value, parseMultiplicative()); else return value; } }

  const result = parseAdditive();
  skipSpaces();
  if (position !== text.length) fail('存在尾随字符');
  return ensureFinite(result);
}

export function evaluateDimension(expression) { return evaluateExpression(expression); }
