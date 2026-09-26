import assert from 'node:assert/strict';
import test from 'node:test';
import { webcadShortcut } from '../src/webcad-shortcuts.js';

const key = (name, extra = {}) => ({ key: name, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, isComposing: false, ...extra });

test('WebCAD claims model shortcuts outside text fields', () => {
  for (const [name, command] of [['a', 'selectAll'], ['c', 'copySelection'], ['v', 'pasteSelection'], ['s', 'save'], ['o', 'open']])
    assert.equal(webcadShortcut(key(name)), command);
  assert.equal(webcadShortcut(key('z')), 'undo');
  assert.equal(webcadShortcut(key('z', { shiftKey: true })), 'redo');
});

test('text fields keep native select, copy and paste', () => {
  for (const name of ['a', 'c', 'v']) assert.equal(webcadShortcut(key(name), { editing: true }), null);
  assert.equal(webcadShortcut(key('s'), { editing: true }), 'save');
  assert.equal(webcadShortcut(key('c'), { dialogOpen: true }), null);
  assert.equal(webcadShortcut(key('c', { altKey: true })), null);
  assert.equal(webcadShortcut(key('c', { isComposing: true })), null);
});
