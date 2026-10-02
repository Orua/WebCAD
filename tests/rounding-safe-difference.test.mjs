import test from 'node:test';
import assert from 'node:assert/strict';
import {cutRoundingDifferenceNonDestructive} from '../src/modeling/rounding/geometry-quality.js';

function fixture(failed = false) {
  const calls = [], built = {};
  class List {
    constructor() {this.values = [];}
    Append(value) {this.values.push(value);}
    delete() {}
  }
  class Cut {
    constructor(...args) {assert.equal(args.length, 0, 'two-shape constructor would build before safe options'); calls.push('empty-constructor');}
    SetNonDestructive(value) {this.safe = value; calls.push('safe');}
    SetRunParallel(value) {this.parallel = value; calls.push('serial');}
    SetToFillHistory(value) {this.history = value; calls.push('no-history');}
    SetArguments(value) {this.objects = value.values;}
    SetTools(value) {this.tools = value.values;}
    Build() {assert.equal(this.safe, true); assert.equal(this.parallel, false); assert.equal(this.history, false); calls.push('build');}
    IsDone() {return !failed;} HasErrors() {return failed;} NonDestructive() {return this.safe;}
    Shape() {calls.push('result'); return built;}
    delete() {calls.push('delete-builder');}
  }
  const oc = {BRepAlgoAPI_Cut: Cut, NCollection_List_TopoDS_Shape: List, Message_ProgressRange: class {delete() {}}};
  return {calls, built, cad: {getOC: () => oc, cast: native => ({wrapped: native})}};
}

test('rounding differences configure serial safe processing before building either input', () => {
  const {calls, built, cad} = fixture(), first = {wrapped: {id: 'source'}}, second = {wrapped: {id: 'candidate'}};
  const result = cutRoundingDifferenceNonDestructive(first, second, cad);
  assert.equal(result.wrapped, built);
  assert.deepEqual(calls, ['empty-constructor', 'safe', 'serial', 'no-history', 'build', 'result', 'delete-builder']);
  assert.deepEqual(first.wrapped, {id: 'source'}); assert.deepEqual(second.wrapped, {id: 'candidate'});
});

test('failed safe differences reject without returning a result shape', () => {
  const {calls, cad} = fixture(true);
  assert.throws(() => cutRoundingDifferenceNonDestructive({wrapped: {}}, {wrapped: {}}, cad), error => error.code === 'MATERIAL_CHECK_FAILED');
  assert(!calls.includes('result')); assert(calls.includes('delete-builder'));
});
