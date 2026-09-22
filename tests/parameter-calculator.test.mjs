import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDimension } from '../src/parameter-calculator.js';

test('计算基础运算、函数和常量', () => {
  assert.equal(evaluateDimension(' 2 + 3 * 4 '), 14);
  assert.equal(evaluateDimension('2^3^2'), 512);
  assert.equal(evaluateDimension('-2^2'), -4);
  assert.equal(evaluateDimension('2^-2'), 0.25);
  assert.ok(Math.abs(evaluateDimension('sin(pi/2)') - 1) < 1e-12);
  assert.equal(evaluateDimension('max(2, min(9, 4))'), 4);
});

test('拒绝危险或无效输入并给出中文错误', () => {
  for (const expression of ['1/0', '2+abc', 'constructor(1)', 'toString()', '1 2', 'sqrt(-1)', '1+', '']) {
    assert.throws(() => evaluateDimension(expression), /尺寸表达式/);
  }
  assert.throws(() => evaluateDimension('1'.repeat(257)), /过长/);
  assert.throws(() => evaluateDimension('2**3'), /需要数字|尾随字符/);
});
