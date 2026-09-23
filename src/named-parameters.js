import { evaluateExpression } from './parameter-calculator.js';
import { getOperation, migratedOperationIds, normalizeOperationParams } from './operation-registry.js';
import { assertJsonValue, canonicalJson, validateSchema } from './contracts/operation-schema.js';

export const NAMED_PARAMETER_LIMITS = Object.freeze({ parameters: 128, nameLength: 60,
  dependencyDepth: 64, featureExpressions: 256, documentExpressions: 2048, expressionLength: 256, pathLength: 150 });
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const reserved = new Set(['pi', 'sqrt', 'abs', 'sin', 'cos', 'tan', 'min', 'max']);
const units = new Set(['mm', 'scalar']);
const scalarFields = new Set(['scale', 'count', 'direction']);
const angularFields = new Set(['angle', 'startAngle', 'endAngle', 'draftAngle', 'rx', 'ry', 'rz']);
const topologyFields = new Set(['faceId', 'faceIds', 'edgeIds', 'solidIndex']);

export class NamedParameterError extends Error {
  constructor(code, path, message) {
    super(message);
    this.name = 'NamedParameterError';
    Object.assign(this, { code, path, retryable: false,
      recoveryAction: code === 'UNSAFE_LEGACY_REFERENCE' ? 'RESELECT_TOPOLOGY' : 'CORRECT_PARAMETERS' });
  }
}
const fail = (code, path, message) => { throw new NamedParameterError(code, path, message); };
const object = (value, path) => {
  if (!value || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail('PARAM_SCHEMA_INVALID', path, 'Expected a plain object.');
  }
};
const quantity = (value, unit) => ({ value, unit });

function calculate(text, lookup, path) {
  const mismatch = message => fail('PARAM_UNIT_MISMATCH', path, message);
  const same = (a, b) => { if (a.unit !== b.unit) mismatch(`Cannot combine ${a.unit} and ${b.unit}.`); };
  try {
    return evaluateExpression(text, {
      number: value => quantity(value, 'scalar'),
      identifier: name => name === 'pi' ? quantity(Math.PI, 'scalar') : lookup(name),
      unary: (op, value) => quantity(op === '-' ? -value.value : value.value, value.unit),
      finite: value => Number.isFinite(value?.value) && units.has(value?.unit),
      binary: (op, a, b) => {
        if (op === '+' || op === '-') {
          same(a, b); return quantity(op === '+' ? a.value + b.value : a.value - b.value, a.unit);
        }
        if (op === '*') {
          if (a.unit === 'mm' && b.unit === 'mm') mismatch('Area units are not supported; multiply a length by a scalar.');
          return quantity(a.value * b.value, a.unit === 'mm' || b.unit === 'mm' ? 'mm' : 'scalar');
        }
        if (op === '/') {
          if (b.value === 0) fail('PARAM_RANGE_INVALID', path, 'Division by zero.');
          if (a.unit === 'scalar' && b.unit === 'mm') mismatch('Inverse length units are not supported.');
          return quantity(a.value / b.value, a.unit === b.unit ? 'scalar' : 'mm');
        }
        fail('PARAM_EXPRESSION_INVALID', path, 'Named parameters support +, -, *, /; powers are not supported.');
      },
      call: (name, args) => {
        if (name === 'abs') return quantity(Math.abs(args[0].value), args[0].unit);
        if (name === 'min' || name === 'max') {
          args.forEach(arg => same(args[0], arg));
          return quantity(Math[name](...args.map(arg => arg.value)), args[0].unit);
        }
        if (args.some(arg => arg.unit !== 'scalar')) mismatch(`${name} requires a scalar argument.`);
        return quantity(Math[name](...args.map(arg => arg.value)), 'scalar');
      },
    });
  } catch (error) {
    if (error instanceof NamedParameterError) throw error;
    fail('PARAM_EXPRESSION_INVALID', path, error.message);
  }
}

/** Resolve an explicit parameter DAG without rewriting its saved expressions. */
export function evaluateNamedParameters(parameters = {}) {
  object(parameters, 'parameters');
  assertJsonValue(parameters, 'parameters');
  const names = Object.keys(parameters);
  if (names.length > NAMED_PARAMETER_LIMITS.parameters) fail('RESOURCE_LIMIT', 'parameters', 'At most 128 named parameters are supported.');
  for (const name of names) {
    const path = `parameters.${name}`;
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,59}$/.test(name) || forbidden.has(name) || reserved.has(name)) {
      fail('PARAM_SCHEMA_INVALID', path, 'Use a nonreserved ASCII identifier of at most 60 characters.');
    }
    const definition = parameters[name]; object(definition, path);
    if (Object.keys(definition).some(key => !['value', 'unit'].includes(key)) || !Object.hasOwn(definition, 'value') || !units.has(definition.unit)) {
      fail('PARAM_SCHEMA_INVALID', path, 'Parameter requires only value:number|string and unit:mm|scalar.');
    }
    if (typeof definition.value !== 'number' && typeof definition.value !== 'string') fail('PARAM_SCHEMA_INVALID', `${path}.value`, 'Expected a number or expression string.');
  }
  const values = Object.create(null), active = new Set(), stack = [];
  function resolve(name) {
    if (Object.hasOwn(values, name)) return values[name];
    if (!Object.hasOwn(parameters, name)) fail('PARAM_UNDEFINED', stack.length ? `parameters.${stack.at(-1)}.value` : 'parameters', `Undefined parameter: ${name}.`);
    if (active.has(name)) fail('PARAM_CYCLE', `parameters.${name}.value`, `Parameter cycle: ${[...stack, name].join(' -> ')}.`);
    if (stack.length >= NAMED_PARAMETER_LIMITS.dependencyDepth) fail('RESOURCE_LIMIT', `parameters.${name}.value`, 'Parameter dependency depth exceeds 64.');
    active.add(name); stack.push(name);
    const definition = parameters[name], path = `parameters.${name}.value`;
    try {
      const result = typeof definition.value === 'number' ? quantity(definition.value, definition.unit) : calculate(definition.value, resolve, path);
      if (!Number.isFinite(result.value)) fail('PARAM_RANGE_INVALID', path, 'A finite value is required.');
      if (result.unit !== definition.unit) fail('PARAM_UNIT_MISMATCH', path, `Expression yields ${result.unit}; declared unit is ${definition.unit}. Numeric literals in expressions are scalar.`);
      values[name] = result; return result;
    } finally { stack.pop(); active.delete(name); }
  }
  names.forEach(resolve);
  return Object.fromEntries(names.map(name => [name, { ...values[name] }]));
}

function pathTarget(feature, expressionPath, path) {
  if (expressionPath.length > NAMED_PARAMETER_LIMITS.pathLength || !/^[A-Za-z_][A-Za-z0-9_]*(?:\.(?:[A-Za-z_][A-Za-z0-9_]*|0|[1-9]\d*))*$/.test(expressionPath)) {
    fail('PARAM_PATH_INVALID', path, 'Expected a bounded dot path to an existing numeric parameter.');
  }
  const parts = expressionPath.split('.');
  if (parts.some(key => forbidden.has(key) || topologyFields.has(key))) fail('PARAM_PATH_INVALID', path, 'Expressions cannot change topology indices or prototype fields.');
  if (parts.some(key => angularFields.has(key) || key === 'areaMm2')) fail('PARAM_UNIT_MISMATCH', path, 'Angular and area expression fields are outside the mm/scalar milestone.');
  let schema = getOperation(feature.op).inputSchema;
  if (feature.op === 'quickModel') schema = schema.oneOf.find(candidate => candidate.properties.kind.const === feature.params.kind);
  let parent = feature.params;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key)
      || (Array.isArray(parent) && !/^(0|[1-9]\d*)$/.test(key))) fail('PARAM_PATH_INVALID', path, 'Expression path must already exist in feature.params.');
    schema = Array.isArray(parent) ? schema?.items : schema?.properties?.[key];
    if (!schema) fail('PARAM_PATH_INVALID', path, 'This parameter path has no registered numeric contract.');
    if (i === parts.length - 1) {
      if (!['number', 'integer'].includes(schema.type) || typeof parent[key] !== 'number' || !Number.isFinite(parent[key])) fail('PARAM_PATH_INVALID', path, 'Expression target must be an existing finite numeric leaf.');
      return { parent, key, schema, unit: scalarFields.has(parts[0]) ? 'scalar' : 'mm' };
    }
    parent = parent[key];
  }
}

function hasIndexedTopology(feature) {
  return feature.params && ['faceId', 'faceIds', 'edgeIds'].some(key => Object.hasOwn(feature.params, key));
}

/** Pure pre-rebuild transformation. The caller owns atomic rebuild/commit and undo. */
export function evaluateDocumentParameters(document, { previousDocument } = {}) {
  object(document, 'document');
  if (!Array.isArray(document.features)) fail('PARAM_SCHEMA_INVALID', 'features', 'Document features must be an array.');
  const output = structuredClone(document);
  const values = evaluateNamedParameters(document.parameters === undefined ? {} : document.parameters);
  let expressionCount = 0;
  for (let index = 0; index < output.features.length; index++) {
    const feature = output.features[index];
    if (feature.expressions === undefined) continue;
    const expressionRoot = `features.${index}.expressions`;
    object(feature.expressions, expressionRoot); assertJsonValue(feature.expressions, expressionRoot);
    const entries = Object.entries(feature.expressions);
    expressionCount += entries.length;
    if (entries.length > NAMED_PARAMETER_LIMITS.featureExpressions || expressionCount > NAMED_PARAMETER_LIMITS.documentExpressions) {
      fail('RESOURCE_LIMIT', expressionRoot, 'Expression count exceeds the per-feature (256) or document (2048) limit.');
    }
    for (const [expressionPath, text] of entries) {
      const path = `${expressionRoot}.${expressionPath}`;
      if (typeof text !== 'string') fail('PARAM_SCHEMA_INVALID', path, 'Feature expression must be a string.');
      const target = pathTarget(feature, expressionPath, path);
      const result = calculate(text, name => {
        if (!Object.hasOwn(values, name)) fail('PARAM_UNDEFINED', path, `Undefined parameter: ${name}.`);
        return values[name];
      }, path);
      if (result.unit !== target.unit) fail('PARAM_UNIT_MISMATCH', path, `Expression yields ${result.unit}; target requires ${target.unit}.`);
      validateSchema(target.schema, result.value, path);
      target.parent[target.key] = result.value;
    }
    if (entries.length && migratedOperationIds.includes(feature.op)) normalizeOperationParams(feature.op, feature.params);
    else if (entries.length) validateSchema(getOperation(feature.op).inputSchema, feature.params, `features.${index}.params`);
  }
  const prior = previousDocument ?? document;
  if (!Array.isArray(prior.features)) fail('PARAM_SCHEMA_INVALID', 'previousDocument.features', 'Previous document features must be an array.');
  const priorById = new Map(prior.features.map(feature => [feature.id, feature]));
  for (let index = 0; index < output.features.length; index++) {
    const feature = output.features[index], old = priorById.get(feature.id);
    if (!old) continue;
    const changed = canonicalJson({ op: old.op, params: old.params, refs: old.refs }) !== canonicalJson({ op: feature.op, params: feature.params, refs: feature.refs });
    if (changed && output.features.slice(index + 1).some(hasIndexedTopology)) {
      fail('UNSAFE_LEGACY_REFERENCE', `features.${index}.params`, 'An upstream change precedes face/edge index references that cannot be proven stable; no parameter results were committed.');
    }
  }
  return output;
}
