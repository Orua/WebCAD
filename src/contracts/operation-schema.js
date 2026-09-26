/** Deliberately small JSON Schema 2020-12 subset used by the operation registry.
 * No coercion, default insertion, field removal, external refs or code execution.
 * Unknown assertion keywords fail closed. Descriptions/defaults are annotations.
 */
export class OperationContractError extends Error {
  constructor(code, path, message, recoveryAction = 'CORRECT_PARAMETERS') {
    super(message);
    this.name = 'OperationContractError';
    Object.assign(this, { code, path, retryable: false, recoveryAction });
  }
}

export function contractError(code, path, message, recoveryAction) {
  throw new OperationContractError(code, path, message, recoveryAction);
}

const annotations = new Set(['$schema', '$id', 'title', 'description', 'default', 'examples', '$comment']);
const assertions = new Set(['type', 'properties', 'required', 'additionalProperties', 'items',
  'minItems', 'maxItems', 'uniqueItems', 'minimum', 'maximum', 'exclusiveMinimum',
  'exclusiveMaximum', 'minLength', 'maxLength', 'pattern', 'enum', 'const', 'anyOf', 'allOf', 'oneOf', 'not']);

export function assertJsonValue(value, path = 'params', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) contractError('PARAM_SCHEMA_INVALID', path, 'A finite number is required.');
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) contractError('PARAM_SCHEMA_INVALID', path, 'A finite JSON value is required.');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    contractError('PARAM_SCHEMA_INVALID', path, 'A plain JSON object is required.');
  }
  if (Object.getOwnPropertySymbols(value).length) contractError('PARAM_SCHEMA_INVALID', path, 'Symbol fields are not supported.');
  seen.add(value);
  for (const key of Object.keys(value)) assertJsonValue(value[key], `${path}.${key}`, seen);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) contractError('PARAM_SCHEMA_INVALID', `${path}.${i}`, 'Sparse arrays are not supported.');
  }
  seen.delete(value);
}

export function validateSchema(schema, value, path = 'params') {
  assertJsonValue(value, path);
  function visit(s, v, p) {
    if (s === true) return;
    if (s === false) contractError('PARAM_SCHEMA_INVALID', p, 'This value is not accepted.');
    for (const key of Object.keys(s)) if (!annotations.has(key) && !assertions.has(key)) {
      throw new Error(`Unsupported schema keyword: ${key}`);
    }
    const fail = message => contractError('PARAM_SCHEMA_INVALID', p, message);
    const range = message => contractError('PARAM_RANGE_INVALID', p, message);
    const matches = sub => { try { visit(sub, v, p); return true; } catch (e) { if (!(e instanceof OperationContractError)) throw e; return false; } };
    if (s.type) {
      const ok = s.type === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v)
        : s.type === 'array' ? Array.isArray(v)
          : s.type === 'integer' ? Number.isInteger(v)
            : s.type === 'null' ? v === null : typeof v === s.type;
      if (!ok) fail(`Expected ${s.type}.`);
    }
    if (s.enum && !s.enum.some(x => canonicalJson(x) === canonicalJson(v))) fail('Value is not in the allowed enumeration.');
    if (Object.hasOwn(s, 'const') && canonicalJson(s.const) !== canonicalJson(v)) fail('Value does not match the required constant.');
    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum) range(`Minimum is ${s.minimum}.`);
      if (s.maximum !== undefined && v > s.maximum) range(`Maximum is ${s.maximum}.`);
      if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum) range(`Must exceed ${s.exclusiveMinimum}.`);
      if (s.exclusiveMaximum !== undefined && v >= s.exclusiveMaximum) range(`Must be less than ${s.exclusiveMaximum}.`);
    }
    if (typeof v === 'string') {
      const count = [...v].length;
      if (s.minLength !== undefined && count < s.minLength) range(`Minimum length is ${s.minLength}.`);
      if (s.maxLength !== undefined && count > s.maxLength) range(`Maximum length is ${s.maxLength}.`);
      if (s.pattern !== undefined && !new RegExp(s.pattern,'u').test(v)) fail('String does not match the required pattern.');
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) range(`At least ${s.minItems} items are required.`);
      if (s.maxItems !== undefined && v.length > s.maxItems) range(`At most ${s.maxItems} items are accepted.`);
      if (s.uniqueItems && new Set(v.map(canonicalJson)).size !== v.length) fail('Duplicate items are not accepted.');
      if (s.items) v.forEach((item, index) => visit(s.items, item, `${p}.${index}`));
    }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const key of s.required || []) if (!Object.hasOwn(v, key)) contractError('PARAM_SCHEMA_INVALID', `${p}.${key}`, 'Required field is missing.');
      for (const key of Object.keys(v)) {
        if (Object.hasOwn(s.properties || {}, key)) visit(s.properties[key], v[key], `${p}.${key}`);
        else if (s.additionalProperties === false) contractError('PARAM_SCHEMA_INVALID', `${p}.${key}`, 'Unknown field.');
        else if (typeof s.additionalProperties === 'object') visit(s.additionalProperties, v[key], `${p}.${key}`);
      }
    }
    if (s.allOf && !s.allOf.every(matches)) fail('Value does not meet all required conditions.');
    if (s.anyOf && !s.anyOf.some(matches)) fail('Value does not meet a required alternative.');
    if (s.oneOf && s.oneOf.filter(matches).length !== 1) fail('Exactly one alternative is required.');
    if (s.not && matches(s.not)) fail('This combination is not accepted.');
  }
  visit(schema, value, path);
  return value;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

// Synchronous SHA-256 over UTF-8; identical in Node and browsers, no runtime imports.
export function contractHash(value) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const length = Math.ceil((bytes.length + 9) / 64) * 64;
  const buffer = new Uint8Array(length);
  buffer.set(bytes); buffer[bytes.length] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(length - 8, Math.floor(bytes.length * 8 / 0x100000000));
  view.setUint32(length - 4, (bytes.length * 8) >>> 0);
  const primes = [], k = [], initial = [];
  for (let n = 2; primes.length < 64; n++) if (primes.every(p => n % p !== 0)) {
    primes.push(n);
    if (initial.length < 8) initial.push((Math.sqrt(n) % 1 * 0x100000000) >>> 0);
    k.push((Math.cbrt(n) % 1 * 0x100000000) >>> 0);
  }
  const h = initial, w = new Uint32Array(64), rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      w[i] = (w[i - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) + w[i - 7] + (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) >>> 0; });
  }
  return `sha256:${h.map(n => n.toString(16).padStart(8, '0')).join('')}`;
}
