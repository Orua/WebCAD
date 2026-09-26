import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectNamer} from '../src/project-name.js';

const memoryStorage = () => {
  const entries = new Map();
  return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
};

test('local date, daily sequence and persisted continuation across pages', () => {
  const storage = memoryStorage();
  let today = new Date(2026,8,26,23,59);
  const first = createProjectNamer(storage,()=>today);
  assert.equal(first(),'新建工程20260926-001');
  assert.equal(first(),'新建工程20260926-002');
  const second = createProjectNamer(storage,()=>today);
  assert.equal(second(),'新建工程20260926-003');
  assert.equal(first(),'新建工程20260926-004');
  today = new Date(2026,8,27,0,1);
  assert.equal(first(),'新建工程20260927-001');
  today = new Date(2026,8,26,23,59);
  assert.equal(first(),'新建工程20260926-005');
});

test('blocked or stale storage retains increasing in-memory names', () => {
  const date = ()=>new Date(2026,0,2);
  const blocked = createProjectNamer({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},date);
  assert.equal(blocked(),'新建工程20260102-001');
  assert.equal(blocked(),'新建工程20260102-002');
  const stale = createProjectNamer({getItem:()=> '5',setItem(){throw Error('quota');}},date);
  assert.equal(stale(),'新建工程20260102-006');
  assert.equal(stale(),'新建工程20260102-007');
});

test('malformed counters are ignored and long sequences are not truncated', () => {
  const date = ()=>new Date(2026,8,26);
  for (const raw of ['NaN','-1','1.5','9007199254740992','{}']) {
    assert.equal(createProjectNamer({getItem:()=>raw,setItem(){}},date)(),'新建工程20260926-001');
  }
  assert.equal(createProjectNamer({getItem:()=> '999',setItem(){}},date)(),'新建工程20260926-1000');
});
