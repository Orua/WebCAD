// src/contracts/operation-schema.js
var OperationContractError = class extends Error {
  constructor(code, path, message, recoveryAction = "CORRECT_PARAMETERS") {
    super(message);
    this.name = "OperationContractError";
    Object.assign(this, { code, path, retryable: false, recoveryAction });
  }
};
function contractError(code, path, message, recoveryAction) {
  throw new OperationContractError(code, path, message, recoveryAction);
}
var annotations = /* @__PURE__ */ new Set(["$schema", "$id", "title", "description", "default", "examples", "$comment", "unit", "quantityKind", "quantizationPolicy"]);
var assertions = /* @__PURE__ */ new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "pattern",
  "enum",
  "const",
  "anyOf",
  "allOf",
  "oneOf",
  "not"
]);
function assertJsonValue(value, path = "params", seen = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) contractError("PARAM_SCHEMA_INVALID", path, "A finite number is required.");
    return;
  }
  if (typeof value !== "object" || seen.has(value)) contractError("PARAM_SCHEMA_INVALID", path, "A finite JSON value is required.");
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    contractError("PARAM_SCHEMA_INVALID", path, "A plain JSON object is required.");
  }
  if (Object.getOwnPropertySymbols(value).length) contractError("PARAM_SCHEMA_INVALID", path, "Symbol fields are not supported.");
  seen.add(value);
  for (const key of Object.keys(value)) assertJsonValue(value[key], `${path}.${key}`, seen);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) contractError("PARAM_SCHEMA_INVALID", `${path}.${i}`, "Sparse arrays are not supported.");
  }
  seen.delete(value);
}
function validateSchema(schema, value, path = "params") {
  assertJsonValue(value, path);
  function visit(s, v, p) {
    if (s === true) return;
    if (s === false) contractError("PARAM_SCHEMA_INVALID", p, "This value is not accepted.");
    for (const key of Object.keys(s)) if (!annotations.has(key) && !assertions.has(key)) {
      throw new Error(`Unsupported schema keyword: ${key}`);
    }
    const fail = (message) => contractError("PARAM_SCHEMA_INVALID", p, message);
    const range = (message) => {
      const error = new OperationContractError("PARAM_RANGE_INVALID", p, message);
      if (Array.isArray(v)) error.details = { validation: { actualCount: v.length } };
      throw error;
    };
    const matches = (sub) => {
      try {
        visit(sub, v, p);
        return true;
      } catch (e) {
        if (!(e instanceof OperationContractError)) throw e;
        return false;
      }
    };
    if (s.type) {
      const ok = s.type === "object" ? v !== null && typeof v === "object" && !Array.isArray(v) : s.type === "array" ? Array.isArray(v) : s.type === "integer" ? Number.isInteger(v) : s.type === "null" ? v === null : typeof v === s.type;
      if (!ok) fail(`Expected ${s.type}.`);
    }
    if (s.enum && !s.enum.some((x) => canonicalJson(x) === canonicalJson(v))) fail("Value is not in the allowed enumeration.");
    if (Object.hasOwn(s, "const") && canonicalJson(s.const) !== canonicalJson(v)) fail("Value does not match the required constant.");
    if (typeof v === "number") {
      if (s.minimum !== void 0 && v < s.minimum) range(`Minimum is ${s.minimum}.`);
      if (s.maximum !== void 0 && v > s.maximum) range(`Maximum is ${s.maximum}.`);
      if (s.exclusiveMinimum !== void 0 && v <= s.exclusiveMinimum) range(`Must exceed ${s.exclusiveMinimum}.`);
      if (s.exclusiveMaximum !== void 0 && v >= s.exclusiveMaximum) range(`Must be less than ${s.exclusiveMaximum}.`);
    }
    if (typeof v === "string") {
      const count = [...v].length;
      if (s.minLength !== void 0 && count < s.minLength) range(`Minimum length is ${s.minLength}.`);
      if (s.maxLength !== void 0 && count > s.maxLength) range(`Maximum length is ${s.maxLength}.`);
      if (s.pattern !== void 0 && !new RegExp(s.pattern, "u").test(v)) fail("String does not match the required pattern.");
    }
    if (Array.isArray(v)) {
      if (s.minItems !== void 0 && v.length < s.minItems) range(`At least ${s.minItems} items are required.`);
      if (s.maxItems !== void 0 && v.length > s.maxItems) range(`At most ${s.maxItems} items are accepted.`);
      if (s.uniqueItems && new Set(v.map(canonicalJson)).size !== v.length) fail("Duplicate items are not accepted.");
      if (s.items) v.forEach((item, index) => visit(s.items, item, `${p}.${index}`));
    }
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const key of s.required || []) if (!Object.hasOwn(v, key)) contractError("PARAM_SCHEMA_INVALID", `${p}.${key}`, "Required field is missing.");
      for (const key of Object.keys(v)) {
        if (Object.hasOwn(s.properties || {}, key)) visit(s.properties[key], v[key], `${p}.${key}`);
        else if (s.additionalProperties === false) contractError("PARAM_SCHEMA_INVALID", `${p}.${key}`, "Unknown field.");
        else if (typeof s.additionalProperties === "object") visit(s.additionalProperties, v[key], `${p}.${key}`);
      }
    }
    if (s.allOf && !s.allOf.every(matches)) fail("Value does not meet all required conditions.");
    if (s.anyOf && !s.anyOf.some(matches)) fail("Value does not meet a required alternative.");
    if (s.oneOf && s.oneOf.filter(matches).length !== 1) fail("Exactly one alternative is required.");
    if (s.not && matches(s.not)) fail("This combination is not accepted.");
  }
  visit(schema, value, path);
  return value;
}
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function contractHash(value) {
  return binaryHash(new TextEncoder().encode(canonicalJson(value)));
}
function binaryHash(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("SHA-256 requires Uint8Array");
  const length = Math.ceil((bytes.length + 9) / 64) * 64;
  const buffer = new Uint8Array(length);
  buffer.set(bytes);
  buffer[bytes.length] = 128;
  const view = new DataView(buffer.buffer);
  view.setUint32(length - 8, Math.floor(bytes.length * 8 / 4294967296));
  view.setUint32(length - 4, bytes.length * 8 >>> 0);
  const primes = [], k = [], initial = [];
  for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p !== 0)) {
    primes.push(n);
    if (initial.length < 8) initial.push(Math.sqrt(n) % 1 * 4294967296 >>> 0);
    k.push(Math.cbrt(n) % 1 * 4294967296 >>> 0);
  }
  const h = initial, w = new Uint32Array(64), rotr = (x, n) => x >>> n | x << 32 - n;
  for (let offset = 0; offset < length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      w[i] = w[i - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ x >>> 3) + w[i - 7] + (rotr(y, 17) ^ rotr(y, 19) ^ y >>> 10) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + (e & f ^ ~e & g) + k[i] + w[i] >>> 0;
      const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + (a & b ^ a & c ^ b & c) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => {
      h[i] = h[i] + v >>> 0;
    });
  }
  return `sha256:${h.map((n) => n.toString(16).padStart(8, "0")).join("")}`;
}

// src/limits.js
var freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
var LIMITS = freeze({
  relief: { minSamples: 4, maxSamples: 65, maxLayers: 32, maxFaces: 2e4 },
  reliefSculpt: { minGrid: 4, maxGrid: 65, minLocalGrid: 7, maxStrokes: 128, maxPoints: 4096, maxCacheEntries: 2e4 },
  cylindricalRelief: { minBaseMm: 5e-3, maxBaseMm: 1, minRadiusMm: 1, maxRadiusMm: 1e4, maxAngleDeg: 90, maxAngleRad: Math.PI / 2, maxHeightRadiusFraction: 0.2 },
  heightfield: { minSide: 2, maxSide: 2049, maxSamples: 19e5, maxSmoothing: 8, maxHeightMm: 100, maxStrokes: 512, maxStrokePoints: 2e4 },
  meshReliefPlate: { maxTriangles: 2e5 },
  meshReliefEdit: { maxTriangles: 2e5, maxAffectedVertices: 2e4, maxRayTests: 12e6, maxSpatialEntries: 2e6 },
  mesh: { maxSourceBytes: 128 * 1024 * 1024, maxAssetBytes: 384 * 1024 * 1024, maxProjectBytes: 512 * 1024 * 1024, maxInputTriangles: 2e6, maxResultTriangles: 4e6, maxVertices: 12e6 },
  meshBoolean: { minRefs: 2, maxRefs: 16, minToleranceMm: 5e-3, maxToleranceMm: 1, defaultToleranceMm: 0.05 },
  document: { maxFeatures: 2e3, maxBytes: 20 * 1024 * 1024 },
  // Agent transport: single source of truth for every host (page, broker, MCP, bridge).
  transport: {
    maxInputBytes: 100 * 1024 * 1024,
    maxArtifactBytes: 100 * 1024 * 1024,
    maxResultBytes: 6 * 1024 * 1024,
    commandTimeoutMs: 9e4,
    chunkBytes: 4 * 1024 * 1024,
    chunkConcurrency: 2,
    chunkRetries: 3,
    uploadSessionTtlSeconds: 1800,
    waitMaxMs: 25e3,
    // Dedicated render/capture budget; capture fails with CAPTURE_TIMEOUT instead of holding the 90 s command slot.
    captureTimeoutMs: 1e4
  },
  // Published in AGENT_CONTRACT.limits; hosts/MCP must not invent a different step cap.
  batch: { maxSteps: 40 }
});

// src/page-context-policy.js
var none = /* @__PURE__ */ new Set(["getMetalMaterials", "getMaterials", "getBatchReceipt", "info", "getState", "getUILayout", "getHistory", "createRequestContext", "connect", "connectVector", "searchTools", "getTools", "getTool", "readDocs", "getQuickModelUsage", "getModelLibrary", "getAgentPanel", "getLogoConverter", "getServices", "getServicesCapabilities", "getServicesRouting", "getServicesRequest", "getServicesJob", "getJob", "cancelJob", "waitFor", "invoke", "submit", "decideServicesWait", "recoverServicesJob"]);
var identity = /* @__PURE__ */ new Set(["setMetalMaterials", "measureMass", "setView", "selectRectangle", "setDisplayPreferences", "setRenderQuality", "capture", "redraw", "measure", "measureRelation", "queryGeometry", "queryReferences", "resolvePlacement", "resolveModelLibrary", "planAlignment", "planPatternMachining", "prepareProfileEdit", "projectProfile", "fitProfile", "traceTwinWindow", "prepareReliefSculpt", "prepareReliefTopologyUpgrade", "readVector", "readRelief"]);
function contextPolicy(method) {
  if (["readLogo", "reviewLogo", "logoWizard"].includes(method)) return "identity";
  if (method === "probeBlendRadius") return "identity";
  if (none.has(method)) return "none";
  if (identity.has(method) || /^(inspect|sample)/.test(method)) return "identity";
  if (method.startsWith("files.")) return ["import", "export", "open", "save"].includes(method.slice(6)) ? "revision" : "none";
  return "revision";
}

// src/placement-schema.js
var vectorSchema = { type: "array", minItems: 3, maxItems: 3, items: { type: "number" } };
var quaternionSchema = { type: "array", minItems: 4, maxItems: 4, items: { type: "number" }, description: "Normalized quaternion [x,y,z,w]; runtime verifies unit length." };
var object = (properties, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
var FRAME_SCHEMA = { oneOf: [
  object({ kind: { const: "world" } }),
  object({ kind: { const: "snapshot" }, origin: vectorSchema, quaternion: quaternionSchema }),
  object({ kind: { const: "work" }, expectedFrameVersion: { type: "integer", minimum: 1 } }),
  object({ kind: { const: "saved" }, frameId: { type: "string", minLength: 1 }, expectedFrameVersion: { type: "integer", minimum: 1 } })
] };
var SOURCE_ANCHOR_SCHEMA = { oneOf: [
  object({ kind: { enum: ["model-origin", "bottom-center", "bounds-center"] } }),
  object({ kind: { const: "point" }, point: vectorSchema }),
  object({ kind: { const: "named" }, anchorId: { type: "string", minLength: 1 } })
] };
var PLACEMENT_SCHEMA = object({ version: { const: 1 }, frame: FRAME_SCHEMA, sourceAnchor: SOURCE_ANCHOR_SCHEMA }, ["version", "frame"]);

// src/page-input-contracts.js
var str = { type: "string", minLength: 1 };
var object2 = (properties, required = []) => ({ type: "object", additionalProperties: false, properties, required });
var IDENTITY_CONTEXT_SCHEMA = object2({ sessionId: str, documentId: str, documentInstanceId: str, revision: { type: "integer", minimum: 0 }, expectedRevision: { type: "integer", minimum: 0 } }, ["sessionId", "documentId", "documentInstanceId"]);
var revisionContext = { ...IDENTITY_CONTEXT_SCHEMA, required: ["sessionId", "documentId", "documentInstanceId", "expectedRevision"] };
var ADD_STEP_SCHEMA = object2({ op: str, params: { type: "object" }, refs: { type: "array", items: str }, name: { type: "string", minLength: 1, maxLength: 120 }, placement: PLACEMENT_SCHEMA }, ["op", "params"]);
var planFeature = { ...ADD_STEP_SCHEMA, required: ["key", "op", "params"], properties: { key: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9_-]{0,39}$" }, ...ADD_STEP_SCHEMA.properties, refs: { type: "array", items: { oneOf: [str, object2({ feature: str }, ["feature"])] } } } };
var STEP_SCHEMA = object2({ id: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9_-]{0,39}$" }, method: str, args: { type: "object" }, stage: { type: "string", minLength: 1, maxLength: 80 } }, ["id", "method"]);
var boolean = { type: "boolean" };
var vector = vectorSchema;
var PAGE_METHOD_SCHEMAS = {
  getMetalMaterials: object2({}),
  getMaterials: object2({}),
  setMetalMaterials: object2({ context: IDENTITY_CONTEXT_SCHEMA, configuration: { type: "object" } }, ["context", "configuration"]),
  add: ADD_STEP_SCHEMA,
  addMany: object2({ features: { type: "array", minItems: 1, maxItems: 64, items: planFeature } }, ["features"]),
  run: object2({ context: revisionContext, idempotencyKey: { type: "string", minLength: 1, maxLength: 80 }, steps: { type: "array", minItems: 1, maxItems: LIMITS.batch.maxSteps, items: STEP_SCHEMA } }, ["context", "idempotencyKey", "steps"]),
  resolvePlacement: object2({ context: IDENTITY_CONTEXT_SCHEMA, op: str, params: { type: "object" }, refs: { type: "array", items: str }, placement: PLACEMENT_SCHEMA }, ["context", "op", "params", "refs", "placement"]),
  capture: object2({ context: IDENTITY_CONTEXT_SCHEMA, maxWidth: { type: "integer", minimum: 64, maximum: 4096 }, format: { enum: ["png", "webp"] }, quality: { type: "number", exclusiveMinimum: 0, maximum: 1 } }, ["context"]),
  getEvidenceImage: object2({ context: revisionContext, evidenceId: { type: "string", pattern: "^ev_[a-f0-9]{32}$" }, viewId: { enum: ["iso", "front", "top", "right"] }, maxWidth: { type: "integer", minimum: 64, maximum: 1024 }, format: { enum: ["png", "webp"] }, quality: { type: "number", exclusiveMinimum: 0, maximum: 1 } }, ["context"]),
  setView: object2({
    context: IDENTITY_CONTEXT_SCHEMA,
    direction: { enum: ["top", "bottom", "front", "back", "left", "right", "side", "iso"] },
    projection: { enum: ["orthographic", "perspective"] },
    fit: boolean,
    interactionPhase: { enum: ["start", "update", "end"] },
    selectedIds: { type: "array", maxItems: 200, uniqueItems: true, items: str },
    section: object2({ axis: { enum: ["X", "Y", "Z"] }, position: { type: "number" }, enabled: boolean }, ["axis", "position", "enabled"]),
    display: { enum: ["solid", "edges", "wire", "transparentEdges"] },
    grid: boolean,
    snap: boolean,
    gizmo: { enum: ["off", "translate", "rotate"] },
    selectionMode: { enum: ["view", "body", "face", "edge"] },
    camera: object2({ position: vector, target: vector }, ["position", "target"]),
    language: { enum: ["zh", "en"] },
    temporaryDisplay: { enum: ["normal", "selectedOnly", "transparentOthers"] },
    anchorVisible: boolean,
    panels: object2({ left: boolean, right: boolean }),
    toolbar: boolean,
    workspace: { enum: ["modeling", "library", "agent"] },
    libraryMode: { enum: ["cards", "list"] },
    focus: boolean,
    modelLibraryChange: { type: "object" }
  }, ["context"]),
  queryGeometry: object2({ context: IDENTITY_CONTEXT_SCHEMA, bodyId: str, kind: { enum: ["face", "edge"] }, filter: { type: "object" }, requireUnique: boolean, expectedCount: { type: "integer", minimum: 1, maximum: 1e5 }, limit: { type: "integer", minimum: 1, maximum: 100 }, cursor: { type: "string", minLength: 1, maxLength: 2048 } }, ["context", "bodyId", "kind"]),
  getState: object2({ include: { type: "array", items: { enum: ["summary", "features", "bodies", "bodiesLite", "selection", "capabilities", "references", "reliefDesigns"] } }, compact: boolean, fields: { type: "array", minItems: 1, maxItems: 32, items: { type: "string", minLength: 1, maxLength: 40 } }, sinceRevision: { type: "integer", minimum: 0 } })
};
function validatePageInput(method, input2, path = "args") {
  const schema = PAGE_METHOD_SCHEMAS[method];
  if (schema) validateSchema(schema, input2, path);
}

// src/parameter-error-message.js
var labels = { depth: "\u96D5\u523B\u6DF1\u5EA6", depthMm: "\u6DF1\u5EA6", scale: "LOGO \u6BD4\u4F8B", angle: "\u65CB\u8F6C\u89D2\u5EA6", offsetX: "\u6C34\u5E73\u504F\u79FB", offsetY: "\u5782\u76F4\u504F\u79FB", point: "\u653E\u7F6E\u70B9\u5750\u6807", faceId: "\u76EE\u6807\u9762", sizeMm: "\u56FE\u6848\u5C3A\u5BF8", name: "\u540D\u79F0", source: "\u6765\u6E90\u8BB0\u5F55", regions: "\u56FE\u6848\u533A\u57DF", placementVersion: "\u5B9A\u4F4D\u7248\u672C", mode: "\u52A0\u5DE5\u65B9\u5F0F", projectionMode: "\u52A0\u5DE5\u8303\u56F4", draftAngle: "\u8131\u6A21\u659C\u5EA6", mirrorX: "\u955C\u50CF\u8BBE\u7F6E" };
function fieldName(path) {
  if (typeof path !== "string" || path.length > 220 || !/^params(?:\.(?:[A-Za-z_][A-Za-z_0-9]{0,39}|\d{1,7}))*$/.test(path) || /(?:password|secret|token|cookie|authorization|api_?key)/i.test(path)) return null;
  const keys = path.split(".").slice(1);
  if (!keys.length) return "\u53C2\u6570";
  let label = labels[keys[0]] || "\u53C2\u6570\u5B57\u6BB5";
  if (keys[0] === "regions" && /^\d+$/.test(keys[1] || "")) {
    label = `\u7B2C ${Number(keys[1]) + 1} \u4E2A\u56FE\u6848\u533A\u57DF`;
    if (keys[2] === "outer") label += "\u7684\u5916\u8F6E\u5ED3";
    if (keys[2] === "holes" && /^\d+$/.test(keys[3] || "")) label += `\u7684\u7B2C ${Number(keys[3]) + 1} \u4E2A\u5B54\u6D1E`;
    const index = keys[2] === "outer" ? 3 : keys[2] === "holes" ? 4 : -1;
    if (index >= 0 && /^\d+$/.test(keys[index] || "")) {
      label += `\uFF0C\u7B2C ${Number(keys[index]) + 1} \u4E2A\u8282\u70B9`;
      if (["0", "1"].includes(keys[index + 1])) label += keys[index + 1] === "0" ? " X \u5750\u6807" : " Y \u5750\u6807";
    }
  } else if (keys[0] === "point" && ["0", "1", "2"].includes(keys[1])) label += ` ${["X", "Y", "Z"][Number(keys[1])]}`;
  return `${label}\uFF08${path}\uFF09`;
}
function parameterErrorMessage(error = {}) {
  if (!["PARAM_SCHEMA_INVALID", "PARAM_RANGE_INVALID", "TYPE_MISMATCH", "INVALID_INPUT", "HEIGHTFIELD_INVALID"].includes(error.code)) return null;
  const field = fieldName(error.path);
  if (!field) return null;
  const message = String(error.message || ""), types = { number: "\u6570\u503C", integer: "\u6574\u6570", array: "\u6570\u7EC4", object: "\u5BF9\u8C61", string: "\u6587\u5B57", boolean: "\u662F\u6216\u5426", null: "\u7A7A\u503C" };
  let reason = {
    "A finite number is required.": "\u5FC5\u987B\u662F\u6709\u6548\u7684\u6709\u9650\u6570\u503C\uFF0C\u4E0D\u80FD\u662F NaN \u6216\u65E0\u7A77\u5927\u3002",
    "A finite JSON value is required.": "\u542B\u6709\u672A\u586B\u5199\u6216\u4E0D\u80FD\u63D0\u4EA4\u7684\u6570\u636E\uFF0C\u8FD9\u662F\u7A0B\u5E8F\u63D0\u4EA4\u6570\u636E\u7684\u95EE\u9898\u3002",
    "A plain JSON object is required.": "\u5FC5\u987B\u662F\u666E\u901A\u6570\u636E\u5BF9\u8C61\u3002",
    "Required field is missing.": "\u7F3A\u5C11\u5FC5\u586B\u5185\u5BB9\u3002",
    "Unknown field.": "\u5F53\u524D\u5DE5\u5177\u4E0D\u63A5\u53D7\u8FD9\u4E2A\u5B57\u6BB5\uFF0C\u8FD9\u662F\u7A0B\u5E8F\u63D0\u4EA4\u5B57\u6BB5\u7684\u95EE\u9898\u3002",
    "Value is not in the allowed enumeration.": "\u4E0D\u662F\u5F53\u524D\u5DE5\u5177\u652F\u6301\u7684\u9009\u9879\u3002",
    "Value does not match the required constant.": "\u4E0E\u5F53\u524D\u5DE5\u5177\u8981\u6C42\u7684\u56FA\u5B9A\u503C\u4E0D\u4E00\u81F4\u3002",
    "String does not match the required pattern.": "\u683C\u5F0F\u4E0D\u6B63\u786E\u3002",
    "Duplicate items are not accepted.": "\u5B58\u5728\u91CD\u590D\u9879\u3002",
    "Sparse arrays are not supported.": "\u5B58\u5728\u7F3A\u5931\u7684\u6570\u636E\u9879\u3002",
    "Symbol fields are not supported.": "\u542B\u6709\u4E0D\u80FD\u63D0\u4EA4\u7684\u5185\u90E8\u5B57\u6BB5\u3002",
    "This value is not accepted.": "\u5F53\u524D\u5DE5\u5177\u4E0D\u63A5\u53D7\u6B64\u503C\u3002",
    "Value does not meet all required conditions.": "\u672A\u6EE1\u8DB3\u6B64\u5B57\u6BB5\u7684\u7EC4\u5408\u6761\u4EF6\u3002",
    "Value does not meet a required alternative.": "\u672A\u5339\u914D\u6B64\u5B57\u6BB5\u652F\u6301\u7684\u683C\u5F0F\u3002",
    "Exactly one alternative is required.": "\u5FC5\u987B\u4E14\u53EA\u80FD\u9009\u62E9\u4E00\u79CD\u53C2\u6570\u683C\u5F0F\u3002",
    "This combination is not accepted.": "\u8FD9\u4E9B\u53C2\u6570\u4E0D\u80FD\u540C\u65F6\u4F7F\u7528\u3002"
  }[message];
  let match;
  if (match = /^Expected (number|integer|array|object|string|boolean|null)\.$/.exec(message)) reason = `\u5FC5\u987B\u662F${types[match[1]]}\u3002`;
  const number = "(-?\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)";
  for (const [prefix, text] of [["Minimum is ", "\u5FC5\u987B\u5927\u4E8E\u6216\u7B49\u4E8E"], ["Maximum is ", "\u5FC5\u987B\u5C0F\u4E8E\u6216\u7B49\u4E8E"], ["Must exceed ", "\u5FC5\u987B\u5927\u4E8E"], ["Must be less than ", "\u5FC5\u987B\u5C0F\u4E8E"]]) if (match = new RegExp("^" + prefix + number + "\\.$", "i").exec(message)) reason = `${text} ${match[1]}\u3002`;
  for (const [pattern, text] of [[/^At most (\d+) items are accepted\.$/, "\u6700\u591A\u5141\u8BB8"], [/^At least (\d+) items are required\.$/, "\u81F3\u5C11\u9700\u8981"]]) if (match = pattern.exec(message)) {
    const count = error.details?.validation?.actualCount;
    reason = `${text} ${match[1]} \u9879${Number.isSafeInteger(count) && count >= 0 ? `\uFF0C\u5F53\u524D\u4E3A ${count} \u9879` : ""}\u3002`;
  }
  for (const [pattern, text] of [[/^Minimum length is (\d+)\.$/, "\u6587\u5B57\u957F\u5EA6\u81F3\u5C11\u4E3A"], [/^Maximum length is (\d+)\.$/, "\u6587\u5B57\u957F\u5EA6\u6700\u591A\u4E3A"]]) if (match = pattern.exec(message)) reason = `${text} ${match[1]} \u4E2A\u5B57\u7B26\u3002`;
  return reason ? `${field}\uFF1A${reason}` : null;
}

// src/error-recovery.js
var rule = (id, codes, reason, next, tools = [], options = {}) => ({ id, codes: new Set(codes.split(" ").filter(Boolean)), reason, next, tools, ...options });
var rules = [
  rule("project-store", "PROJECT_STORE_FAILED", "\u5F53\u524D\u5DE5\u7A0B\u7684\u672C\u5730\u5B58\u50A8\u5199\u5165\u5931\u8D25\u3002", "\u4FDD\u7559\u5F53\u524D\u9875\u9762\u5DE5\u7A0B\uFF0C\u5148\u68C0\u67E5\u6D4F\u89C8\u5668\u5B58\u50A8\u548C\u539F\u4FDD\u5B58\u56DE\u6267\uFF1B\u4E0D\u80FD\u5BA3\u79F0\u5DF2\u4FDD\u5B58\u6216\u81EA\u52A8\u91CD\u7B97\u51E0\u4F55\u3002", ["getState"], { hardStop: true }),
  rule("relief-services-response", "SERVICES_RESPONSE_INVALID", "Services \u6D6E\u96D5\u54CD\u5E94\u4E0E\u8BF7\u6C42\u3001\u54C8\u5E0C\u6216\u8BEF\u5DEE\u4E0D\u4E00\u81F4\u3002", "\u4FDD\u7559\u5F53\u524D\u5DE5\u7A0B\uFF0C\u6838\u5BF9\u539F\u4EFB\u52A1\u4E0E\u8FD4\u56DE\u4EA7\u7269\uFF1B\u4E0D\u63D0\u4EA4\u3001\u4E0D\u81EA\u52A8\u91CD\u7B97\u6216\u56DE\u9000\u3002", ["getServicesJob", "getState"], { hardStop: true }),
  rule("relief-services-required", "RELIEF_DESIGN_SERVICES_REQUIRED", "\u4E34\u65F6\u63A7\u5236\u7F51\u9700\u8981 Services \u5B8C\u6210\u9996\u6B21\u62DF\u5408\u3002", "\u4FDD\u7559\u5F53\u524D\u8BBE\u8BA1\u5E76\u68C0\u67E5 Services \u80FD\u529B\uFF1B\u5982\u9700\u672C\u5730\u6267\u884C\uFF0C\u7531\u7528\u6237\u660E\u786E\u9009\u62E9\u6D4F\u89C8\u5668\u62DF\u5408\u540E\u91CD\u65B0\u51C6\u5907\u3002", ["reliefDesignFit", "getServicesCapabilities"], { hardStop: true }),
  rule("design-fit-capacity", "FIT_CAPACITY FIT_WORK_BUDGET FIT_UNDERSAMPLED", "\u62DF\u5408\u7684\u91C7\u6837\u3001\u63A7\u5236\u7F51\u683C\u6216\u6570\u503C\u5DE5\u4F5C\u91CF\u8D85\u51FA\u5F53\u524D\u8303\u56F4\u3002", "\u6838\u5BF9\u663E\u5F0F\u63A7\u5236\u6570\u4E0E\u539F\u573A\u91C7\u6837\u53CA\u5BB9\u91CF\uFF1B\u4FDD\u7559\u8BBE\u8BA1\uFF0C\u4E0D\u81EA\u52A8\u964D\u4F4E\u7CBE\u5EA6\u3001\u6539\u53D8\u8BEF\u5DEE\u6216\u91CD\u8BD5\u8017\u5C3D\u4EFB\u52A1\u3002", ["reliefDesignFit", "getTool"], { hardStop: true }),
  rule("design-fit-constraints", "FIT_SOURCE_INVALID FIT_CONSTRAINT_CONFLICT FIT_DIRECTION_CONFLICT FIT_DOMAIN_CONFLICT FIT_DOMAIN_EMPTY FIT_DOMAIN_UNSUPPORTED FIT_NO_FREEDOM FIT_PARAMETER_OUTSIDE", "\u5F53\u524D\u9AD8\u5EA6\u65B9\u5411\u3001\u652F\u6491\u6216\u4FDD\u62A4\u7EA6\u675F\u4E0E\u62DF\u5408\u6761\u4EF6\u4E0D\u4E00\u81F4\u3002", "\u8BFB\u53D6\u539F\u8BBE\u8BA1\u3001baseline\u53CA\u53D7\u4FDD\u62A4\u6781\u70B9\u62A5\u544A\uFF1B\u4E0D\u80FD\u5220\u5B54\u3001\u653E\u677E\u4FDD\u62A4\u6216\u7FFB\u8F6C\u9AD8\u5EA6\u6765\u901A\u8FC7\u3002", ["reliefDesignFit", "reliefDesignField"], { hardStop: true }),
  rule("design-fit-quality", "FIT_FAILED NUMERICAL_RESULT_MISMATCH FIT_DEVIATION FIT_PROTECTION_FAILED FIT_NOT_CONVERGED FIT_TIMEOUT FIT_WORKER_FAILED", "\u672C\u6B21\u62DF\u5408\u672A\u8FBE\u5230\u660E\u786E\u8BEF\u5DEE\u3001\u4FDD\u62A4\u6216\u6C42\u89E3\u6761\u4EF6\u3002", "\u4FDD\u7559\u539F\u8BBE\u8BA1\u573A\u548C\u5B9E\u9645\u8BCA\u65AD\uFF0C\u4E0D\u63D0\u4EA4\u4E3A\u5B9E\u4F53\uFF1B\u5148\u6838\u5BF9\u8BEF\u5DEE\u4E0E\u7EA6\u675F\uFF0C\u4E0D\u80FD\u81EA\u52A8\u4FEE\u6539\u5BB9\u5DEE\u6216\u6362\u7B97\u6CD5\u91CD\u7B97\u3002", ["reliefDesignFit"], { hardStop: true }),
  rule("design-fit-brep-binding", "RELIEF_DESIGN_BINDING_INVALID RELIEF_DESIGN_SOURCE_CHANGED RELIEF_DESIGN_SUPPORT_INVALID RELIEF_DESIGN_MASK_BLOCKED", "\u62DF\u5408\u4E0E\u652F\u6491\u9762\u3001\u653E\u7F6E\u6216\u63A9\u7801\u7684\u7ED1\u5B9A\u4E0D\u518D\u4E00\u81F4\u3002", "\u91CD\u65B0\u8BFB\u53D6\u5F53\u524D\u5DE5\u7A0B\uFF0C\u91CD\u65B0\u9009\u62E9\u771F\u5B9E\u5E73\u9762\u5E76\u91CD\u65B0\u51C6\u5907\uFF1B\u4E0D\u6CBF\u7528\u65E7\u9762\u7F16\u53F7\uFF0C\u4E0D\u653E\u5BBD\u7ED1\u5B9A\u6216\u6539\u7528\u5176\u4ED6\u8F6E\u5ED3\u7B56\u7565\u3002", ["prepareReliefDesignRelief", "reliefDesignFit", "getState"], { hardStop: true }),
  rule("design-fit-brep-native", "RELIEF_DESIGN_NATIVE_REQUIRED", "\u8BE5\u62DF\u5408\u6D6E\u96D5\u7684\u63A7\u5236\u7F51\u683C\u590D\u6742\u5EA6\u9700\u8981\u5C1A\u672A\u5F00\u653E\u7684Native\u5E73\u9762B\u6837\u6761\u80FD\u529B\u3002", "\u4FDD\u7559\u62DF\u5408\u4E0E\u5DE5\u7A0B\uFF1B\u51CF\u5C11\u663E\u5F0F\u63A7\u5236\u7F51\u683C\u540E\u91CD\u65B0\u62DF\u5408\uFF0C\u6216\u7B49\u5F85Native\u9A8C\u6536\uFF1B\u4E0D\u964D\u7EA7\u672C\u5730\u6267\u884C\u3002", ["reliefDesignFit", "prepareReliefDesignRelief"], { hardStop: true }),
  rule("design-fit-cancel", "FIT_CANCELLED", "\u6570\u503C\u62DF\u5408\u5DF2\u505C\u6B62\u3002", "\u539F\u5DF2\u89E3\u8BBE\u8BA1\u573A\u4FDD\u7559\uFF1B\u8BFB\u53D6\u5F53\u524D\u62DF\u5408\u72B6\u6001\uFF0C\u4E0D\u81EA\u52A8\u91CD\u542F\u3002", ["reliefDesignFit"], { hardStop: true }),
  rule("relief-reference", "RELIEF_REFERENCE_INVALID RELIEF_REFERENCE_MISSING", "\u6D6E\u96D5\u539F\u53C2\u8003\u56FE\u4E0D\u5B58\u5728\u3001\u5DF2\u6539\u53D8\u6216\u672A\u901A\u8FC7\u539F\u4EF6\u6821\u9A8C\u3002", "\u8BFB\u53D6\u5F53\u524D\u8BBE\u8BA1\u8349\u7A3F\u4E0E\u5DF2\u767B\u8BB0\u539F\u56FE\u8D44\u6E90\uFF1B\u6838\u5BF9\u771F\u5B9E\u56FE\u7247\u683C\u5F0F\u3001SHA256\u3001\u5927\u5C0F\u548C\u89E3\u7801\u7ED3\u679C\u3002\u539F\u56FE\u4EC5\u4F9B\u53C2\u8003\uFF0C\u4E0D\u80FD\u6309\u7167\u7247\u660E\u6697\u81EA\u52A8\u751F\u6210\u9AD8\u5EA6\u3002", ["reliefDesignReference", "getState"], { hardStop: true }),
  rule("design-capacity", "DOMAIN_CAPACITY FIELD_CAPACITY PIPELINE_CAPACITY", "\u8BBE\u8BA1\u573A\u7684\u91C7\u6837\u6570\u91CF\u6216\u6C42\u89E3\u5DE5\u4F5C\u91CF\u8D85\u8FC7\u5F53\u524D\u8303\u56F4\u3002", "\u8BFB\u53D6\u6570\u503C\u573A\u5DE5\u5177\u7684\u91C7\u6837\u4E0E\u8FED\u4EE3\u4E0A\u9650\uFF0C\u4FDD\u7559\u8349\u7A3F\uFF1B\u4E0D\u8981\u81EA\u52A8\u964D\u4F4E\u7528\u6237\u8981\u6C42\u7684\u9020\u578B\u7CBE\u5EA6\u3002", ["reliefDesignField", "getTool"], { hardStop: true }),
  rule("design-constraints", "DOMAIN_CONSTRAINT_CONFLICT DOMAIN_EMPTY DOMAIN_HARD_POINT_NOT_ON_GRID DOMAIN_HARD_POINT_OUTSIDE DOMAIN_INVALID FIELD_CONSTRAINT_CONFLICT FIELD_EMPTY_DOMAIN FIELD_INPUT_INVALID FIELD_SAMPLE_OUTSIDE FIELD_UNANCHORED LOCAL_EDIT_BOUNDS LOCAL_EDIT_CONSTRAINT_CONFLICT LOCAL_EDIT_EMPTY_DOMAIN LOCAL_EDIT_INVALID LOCAL_EDIT_OUTSIDE PIPELINE_INVALID", "\u6BEB\u7C73\u9AD8\u5EA6\u70B9\u3001\u652F\u6491\u3001\u5B54\u6216\u4FDD\u62A4\u533A\u57DF\u7684\u7EA6\u675F\u65E0\u6CD5\u540C\u65F6\u5E94\u7528\u3002", "\u68C0\u67E5\u70B9\u4F4D\u662F\u5426\u5728\u6709\u6548\u652F\u6491\u5185\u5E76\u907F\u5F00\u5B54\u548C\u4FDD\u62A4\u533A\uFF0C\u6838\u5BF9\u6700\u4F4E/\u6700\u9AD8\u9AD8\u5EA6\uFF1B\u53EA\u4FEE\u8BA2\u660E\u786E\u51B2\u7A81\u7684\u7EA6\u675F\uFF0C\u4E0D\u81EA\u52A8\u79FB\u52A8\u70B9\u6216\u5220\u9664\u4FDD\u62A4\u3002", ["reliefDesignField"], { hardStop: true }),
  rule("design-solve", "FIELD_FAILED FIELD_NOT_CONVERGED FIELD_NUMERICAL FIELD_TIMEOUT FIELD_WORKER_FAILED", "\u672C\u6B21\u6570\u503C\u6C42\u89E3\u672A\u53D6\u5F97\u6EE1\u8DB3\u505C\u6B62\u6761\u4EF6\u7684\u6709\u6548\u7ED3\u679C\u3002", "\u4FDD\u7559\u8349\u7A3F\uFF0C\u8BFB\u53D6\u672C\u6B21\u6B8B\u5DEE\u548C\u5DE5\u4F5C\u91CF\u62A5\u544A\uFF1B\u5148\u67E5\u5177\u4F53\u7EA6\u675F\u6216Worker\u6545\u969C\uFF0C\u4E0D\u5C06\u672A\u6536\u655B\u7684\u573A\u63D0\u4EA4\u4E3A\u6A21\u578B\u3002", ["reliefDesignField"], { hardStop: true }),
  rule("design-cancel", "FIELD_CANCELLED LOCAL_EDIT_CANCELLED PIPELINE_CANCELLED", "\u672C\u6B21\u6570\u503C\u6C42\u89E3\u6216\u5C40\u90E8\u7F16\u8F91\u5DF2\u505C\u6B62\u3002", "\u4FDD\u7559\u5DF2\u4FDD\u5B58\u8BBE\u8BA1\uFF1B\u9700\u8981\u7EE7\u7EED\u65F6\u5148\u8BFB\u53D6\u5F53\u524D\u8349\u7A3F\u548C\u4EFB\u52A1\u72B6\u6001\uFF0C\u4E0D\u81EA\u52A8\u91CD\u65B0\u6C42\u89E3\u3002", ["reliefDesignField"], { hardStop: true }),
  rule("logo-render", "LOGO_RENDERED_IMAGE_INVALID PDF_RENDER_FAILED", "PDF\u9875\u9762\u6E32\u67D3\u6216\u6E32\u67D3\u5E95\u56FE\u6821\u9A8C\u672A\u901A\u8FC7\u3002", "\u4FDD\u7559\u539F\u6587\u4EF6\uFF0C\u6838\u5BF9\u9875\u7801\u3001\u670D\u52A1\u7AEF\u6E32\u67D3\u80FD\u529B\u4E0E\u539F\u4F5C\u4E1A\u62A5\u544A\uFF1B\u53EF\u4EE5\u63D0\u4F9B\u540C\u4E00\u56FE\u6848\u7684\u53D7\u652F\u6301\u77E2\u91CF\u6587\u4EF6\uFF0C\u4E0D\u81EA\u52A8\u66FF\u6362\u5185\u5BB9\u3002", ["getServicesCapabilities", "getServicesJob", "logoWizard"], { hardStop: true }),
  rule("design-height-range", "RELIEF_DESIGN_HEIGHT_RANGE_UNSUPPORTED", "\u8BBE\u8BA1\u7684\u9AD8\u4F4E\u8DE8\u5EA6\u8D85\u8FC7\u5F53\u524D\u7F51\u683C\u9AD8\u5EA6\u8303\u56F4\u3002", "\u4FDD\u7559\u539F\u8BBE\u8BA1\uFF0C\u6838\u5BF9\u5F53\u524D\u5DE5\u5177\u7684100\u6BEB\u7C73\u9AD8\u5EA6\u8DE8\u5EA6\u4E0A\u9650\uFF1B\u4E0D\u8981\u81EA\u52A8\u538B\u7F29\u9AD8\u5EA6\u6765\u901A\u8FC7\u3002", ["getTool"], { hardStop: true }),
  rule("design-mask", "RELIEF_DESIGN_MASK_INVALID", "\u6D6E\u96D5\u8303\u56F4\u6570\u636E\u4E0E\u5F53\u524D\u91C7\u6837\u7F51\u683C\u4E0D\u4E00\u81F4\u3002", "\u91CD\u65B0\u8BFB\u53D6\u540C\u4E00\u8BBE\u8BA1\u8349\u7A3F\u5E76\u6C42\u89E3\uFF0C\u4FDD\u7559\u5B54\u4E0E\u652F\u6491\u8FB9\u754C\uFF1B\u4E0D\u8981\u624B\u5DE5\u586B\u8865\u6216\u4E22\u5F03\u63A9\u7801\u3002", ["reliefDesignField"], { hardStop: true }),
  rule("design-boundary", "RELIEF_DESIGN_DOMAIN_NONMANIFOLD RELIEF_DESIGN_DOMAIN_EMPTY RELIEF_DESIGN_DOMAIN_TOPOLOGY_CHANGED RELIEF_DESIGN_HOLE_TOPOLOGY_CHANGED RELIEF_DESIGN_FEATURE_UNRESOLVED", "\u5F53\u524D\u91C7\u6837\u5C1A\u4E0D\u80FD\u5B8C\u6574\u4FDD\u7559\u652F\u6491\u8FB9\u754C\u6216\u8D2F\u7A7F\u5B54\u3002", "\u67E5\u770B\u91C7\u6837\u95F4\u8DDD\u4E0E\u8FB9\u754C\u62A5\u544A\uFF0C\u5728\u5141\u8BB8\u8303\u56F4\u5185\u63D0\u9AD8\u91C7\u6837\u5206\u8FA8\u7387\uFF1B\u5B54\u4ECD\u65E0\u6CD5\u5206\u79BB\u65F6\u4FDD\u7559\u8349\u7A3F\uFF0C\u4E0D\u81EA\u52A8\u586B\u5B54\u6216\u66F4\u6362\u5E95\u677F\u3002", ["reliefDesignField"], { hardStop: true }),
  rule("design-base", "RELIEF_DESIGN_BASE_INTERSECTION", "\u8BBE\u8BA1\u9AD8\u5EA6\u4F1A\u7A7F\u8FC7\u5E95\u677F\u80CC\u9762\u3002", "\u6838\u5BF9\u6700\u4F4E\u8BBE\u8BA1\u9AD8\u5EA6\u4E0E\u5E95\u539A\uFF0C\u660E\u786E\u4FEE\u8BA2\u540E\u91CD\u65B0\u751F\u6210\u5019\u9009\uFF1B\u4E0D\u81EA\u52A8\u62AC\u9AD8\u6216\u524A\u5E73\u539F\u8BBE\u8BA1\u3002", ["reliefDesignField"], { hardStop: true }),
  rule("authorization", "UNAUTHORIZED AUTH_CONFIG_REQUIRED SERVICES_AUTH_REQUIRED UPLOAD_AUTH_REQUIRED RECOVERY_AUTH_REQUIRED PERMISSION_REQUIRED HOST_ACCESS_DENIED ORIGIN_FORBIDDEN HTTPS_REQUIRED IIS_STORAGE_FORBIDDEN LAN_ONLY AGENT_METHOD_DENIED action_not_allowed scope_denied method_not_allowed", "\u5F53\u524D\u6388\u6743\u6216\u8BBF\u95EE\u8303\u56F4\u4E0D\u5141\u8BB8\u8FD9\u9879\u64CD\u4F5C\u3002", "\u5148\u901A\u8FC7\u73B0\u6709\u8BBE\u7F6E\u5B8C\u6210\u767B\u5F55\u6216\u53D6\u5F97\u6240\u9700\u6388\u6743\uFF0C\u518D\u6838\u5BF9\u539F\u8BF7\u6C42\uFF1B\u4E0D\u8981\u7ED5\u8FC7\u6743\u9650\u6216\u64C5\u81EA\u4E0A\u4F20\u6765\u6E90\u3002", [], { hardStop: true }),
  rule("host-control", "lease_revoked task_ended task_binding_mismatch", "\u9875\u9762\u63A7\u5236\u6743\u6216\u5F53\u524D\u4EFB\u52A1\u7ED1\u5B9A\u5DF2\u7ED3\u675F\u6216\u6539\u53D8\uFF0C\u5E76\u4E0D\u7B49\u4E8E\u767B\u5F55\u5230\u671F\u3002", "\u6838\u5BF9\u539F\u4EFB\u52A1\u3001\u539F\u547D\u4EE4\u548C\u5F53\u524D\u9875\u9762\u7ED1\u5B9A\uFF1B\u901A\u8FC7\u5BBF\u4E3B\u91CD\u65B0\u8FDE\u63A5\u539F\u5DE5\u7A0B\uFF0C\u7ED3\u679C\u672A\u77E5\u65F6\u4E0D\u5F97\u6362\u952E\u91CD\u753B\u3002", ["getState", "getJob", "connect"], { hardStop: true }),
  rule("dispatch", "COMMAND_EXPIRED", "\u547D\u4EE4\u5728\u8FDB\u5165CAD\u6267\u884C\u524D\u5DF2\u8D85\u8FC7\u6D3E\u53D1\u671F\u9650\uFF0C\u5C1A\u672A\u63D0\u4EA4\u9875\u9762\u4F5C\u4E1A\u3002", "\u4FDD\u7559\u539F\u547D\u4EE4\u56DE\u6267\uFF0C\u6838\u5BF9\u8FDE\u63A5\u548C\u5F53\u524D\u5DE5\u7A0B\u72B6\u6001\uFF1B\u786E\u8BA4\u672A\u63D0\u4EA4\u5E76\u6062\u590D\u8FDE\u63A5\u540E\uFF0C\u624D\u5904\u7406\u5C1A\u672A\u6267\u884C\u7684\u6B65\u9AA4\u3002", ["getState", "getJob", "connect"], { hardStop: true }),
  rule("binding", "INSTANCE_MISMATCH DOCUMENT_MISMATCH REVISION_CONFLICT LIBRARY_REVISION_CONFLICT STALE_REFERENCE SELECTOR_CONTEXT_STALE SELECTOR_CONTEXT_REQUIRED LOGO_REVIEW_STALE SOURCE_HASH_MISMATCH RECOVERY_INPUT_CHANGED MACHINING_SOURCE_CONFLICT SOURCE_ANCHOR_INVALID COORDINATE_MODE_CONFLICT FRAME_SURFACE_MISMATCH TOPOLOGY_REFERENCE_STALE", "\u8BF7\u6C42\u5F15\u7528\u7684\u5DE5\u7A0B\u3001\u7248\u672C\u3001\u6765\u6E90\u6216\u5B9A\u4F4D\u5DF2\u53D8\u5316\u3002", "\u8BFB\u53D6\u5F53\u524D\u72B6\u6001\u4E0E\u6765\u6E90\uFF0C\u91CD\u65B0\u67E5\u8BE2\u5F15\u7528\u5E76\u91CD\u89C4\u5212\u5C1A\u672A\u5B8C\u6210\u7684\u6B65\u9AA4\uFF1B\u4E0D\u8981\u6CBF\u7528\u65E7\u9762\u8FB9\u7F16\u53F7\u3002", ["getState", "queryGeometry", "queryReferences"], { hardStop: true }),
  rule("idempotency", "IDEMPOTENCY_KEY_REUSED idempotency_conflict", "\u8BF7\u6C42\u6807\u8BC6\u5DF2\u7ED1\u5B9A\u53E6\u4E00\u4EFD\u53C2\u6570\u3002", "\u5148\u53D6\u539F\u56DE\u6267\u5E76\u6838\u5BF9\u662F\u5426\u5DF2\u63D0\u4EA4\uFF1B\u53EA\u6709\u660E\u786E\u4FEE\u8BA2\u540E\u7684\u5269\u4F59\u8BF7\u6C42\u624D\u4F7F\u7528\u65B0\u6807\u8BC6\u3002", ["getBatchReceipt", "getJob", "getState"], { hardStop: true }),
  rule("reconcile", "SERVICES_CONNECTION_UNKNOWN OBSERVATION_CANCELLED PREVIOUS_ATTEMPT_UNKNOWN RESULT_UNKNOWN JOB_TIMEOUT JOB_NOT_FOUND REQUEST_NOT_FOUND JOB_RESULT_UNAVAILABLE receipt_unavailable RECOVERY_RESULT_UNRESOLVED HOST_TIMEOUT HOST_INTERRUPTED TIMEOUT SERVICE_STOPPING RESULT_NOT_READY", "\u539F\u4EFB\u52A1\u7684\u6267\u884C\u6216\u63D0\u4EA4\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\u3002", "\u6309\u539F jobId\u3001\u8BF7\u6C42\u952E\u6216\u6279\u6B21\u6807\u8BC6\u67E5\u8BE2\u72B6\u6001\u5E76\u4E0E\u5F53\u524D\u5DE5\u7A0B\u5BF9\u8D26\uFF1B\u786E\u8BA4\u524D\u4E0D\u8981\u91CD\u653E\u3001\u6362\u952E\u6216\u53E6\u8D77\u8BA1\u7B97\u3002", ["getJob", "getBatchReceipt", "getServicesJob", "getServicesRequest", "getState"], { hardStop: true, reconcile: true }),
  rule("budget", "PREVIOUS_ATTEMPT_FAILED KNOWN_INPUT_FAILED", "\u6B64\u524D\u76F8\u540C\u8F93\u5165\u7684\u4EFB\u52A1\u672A\u6210\u529F\uFF0C\u672C\u6B21\u672A\u91CD\u65B0\u8BA1\u7B97\u3002", "\u67E5\u770B\u539F\u4EFB\u52A1\u7684\u5177\u4F53\u9519\u8BEF\uFF1BLOGO \u8BC6\u522B\u4EFB\u52A1\u786E\u8BA4\u5DF2\u505C\u6B62\u540E\uFF0C\u53EF\u91CD\u65B0\u70B9\u51FB\u8BC6\u522B\u3002\u5176\u4ED6\u5EFA\u6A21\u4EFB\u52A1\u987B\u5148\u6838\u5BF9\u5931\u8D25\u539F\u56E0\u548C\u5F53\u524D\u5DE5\u7A0B\u3002", ["getJob", "getServicesJob", "getServicesRequest"], { hardStop: true }),
  rule("recovery-active", "RECOVERY_WORKER_ACTIVE", "\u4E0A\u4E00\u4EFB\u52A1\u7684\u8BA1\u7B97\u8FDB\u7A0B\u4ECD\u5728\u8FD0\u884C\u3002", "\u7B49\u5F85\u539F\u4EFB\u52A1\u5B8C\u6210\uFF0C\u6216\u505C\u6B62\u539F\u4EFB\u52A1\u5E76\u786E\u8BA4\u7ED3\u675F\u540E\u518D\u64CD\u4F5C\u3002", ["getServicesJob"], { hardStop: true }),
  rule("recovery-denied", "RECOVERY_NOT_ALLOWED", "\u6B64\u4EFB\u52A1\u4E0D\u80FD\u4ECE\u4E2D\u65AD\u4F4D\u7F6E\u6062\u590D\u3002", "\u67E5\u770B\u539F\u4EFB\u52A1\u72B6\u6001\u548C\u5931\u8D25\u539F\u56E0\uFF1B\u5DF2\u5B8C\u6210\u6216\u5DF2\u505C\u6B62\u7684\u4EFB\u52A1\u4E0D\u80FD\u5F53\u4F5C\u53EF\u6062\u590D\u4EFB\u52A1\u7EE7\u7EED\u3002", ["getServicesJob"], { hardStop: true }),
  rule("schema", "PARAM_SCHEMA_INVALID PARAM_RANGE_INVALID INVALID_OPTIONS REQUEST_INVALID GATEWAY_REQUEST_INVALID NAME_INVALID BADGE_INVALID TYPE_MISMATCH FRAME_INVALID HOST_CONTROL_INVALID HOST_FRAME_INVALID INVALID_INPUT FIT_INPUT_INVALID", "\u8F93\u5165\u5B57\u6BB5\u3001\u7C7B\u578B\u3001\u8303\u56F4\u6216\u5750\u6807\u683C\u5F0F\u4E0D\u7B26\u5408\u5F53\u524D\u5DE5\u5177\u5951\u7EA6\u3002", "\u8BFB\u53D6\u5BF9\u5E94\u5B8C\u6574\u5DE5\u5177\u5361\uFF0C\u6838\u5BF9\u62A5\u9519\u5B57\u6BB5\u53CA\u5B9E\u9645\u5355\u4F4D\u540E\u4FEE\u6B63\u8BF7\u6C42\uFF1B\u4FDD\u7559\u539F\u8BBE\u8BA1\u5C3A\u5BF8\u548C\u52A0\u5DE5\u610F\u56FE\u3002", ["getTool"], { hardStop: true }),
  rule("units", "PARAM_UNIT_MISMATCH MESH_UNITS_REQUIRED SIZE_REQUIRED MACHINING_INTENT_REQUIRED MACHINING_INTENT_CONFLICT INTENT_CONFLICT RELIEF_UPGRADE_STRATEGY_REQUIRED RECOVERY_REASON_REQUIRED MIXED_PLAN_REQUIRED SOURCE_PREPARATION_REQUIRED", "\u5C3A\u5BF8\u5355\u4F4D\u3001\u52A0\u5DE5\u610F\u56FE\u3001\u6765\u6E90\u51C6\u5907\u6216\u6062\u590D\u4F9D\u636E\u5C1A\u672A\u660E\u786E\u3002", "\u8865\u9F50\u6765\u6E90\u652F\u6301\u7684\u6BEB\u7C73\u5C3A\u5BF8\u3001\u51F8\u51F9\u65B9\u5411\u3001\u6DF1\u5EA6\u4E0E\u660E\u786E\u7B56\u7565\uFF1B\u6DF7\u5408\u56FE\u6848\u5148\u62C6\u5206\u660E\u786E\u52A0\u5DE5\u8BA1\u5212\uFF0C\u7167\u7247\u5148\u51C6\u5907\u53D7\u652F\u6301\u9AD8\u5EA6/\u77E2\u91CF\u6765\u6E90\uFF0C\u4E0D\u80FD\u4ECE\u4EAE\u5EA6\u3001\u6587\u4EF6\u540D\u6216\u9ED8\u8BA4\u503C\u731C\u6D4B\u3002", ["getTool", "planPatternMachining"], { hardStop: true }),
  rule("parameters", "PARAM_CYCLE PARAM_EXPRESSION_INVALID PARAM_PATH_INVALID PARAM_UNDEFINED PARAMETER_BOUND", "\u547D\u540D\u53C2\u6570\u5B58\u5728\u5FAA\u73AF\u3001\u65E0\u6548\u8868\u8FBE\u5F0F\u6216\u7ED1\u5B9A\u51B2\u7A81\u3002", "\u68C0\u67E5\u53C2\u6570\u4F9D\u8D56\u4E0E\u5F15\u7528\u8DEF\u5F84\uFF0C\u4FEE\u6539\u539F\u53C2\u6570\u5B9A\u4E49\uFF1B\u4E0D\u8981\u7ED5\u8FC7\u7ED1\u5B9A\u53E6\u5199\u4E00\u4E2A\u5C3A\u5BF8\u3002", ["getState", "getTool"], { hardStop: true }),
  rule("selection", "LOCATION_NO_HIT AMBIGUOUS_SELECTION AMBIGUOUS_REFERENCE AMBIGUOUS_CONTOUR ROUND_SELECTION_AMBIGUOUS RELIEF_SELECTION_AMBIGUOUS TAP_BORE_AMBIGUOUS ALIGN_UNDERCONSTRAINED SELECTION_CONFLICT SELECTION_COUNT_CHANGED SELECTOR_UNCERTAIN SELECTOR_EMPTY SELECTOR_INVALID RESELECT_TOPOLOGY NO_MATCH PROFILE_SELECTION_INVALID LOGO_SELECTION_INVALID", "\u9009\u53D6\u8303\u56F4\u6CA1\u6709\u552F\u4E00\u5BF9\u5E94\u5F53\u524D\u51E0\u4F55\uFF0C\u6216\u5339\u914D\u6570\u91CF\u4E0D\u7B26\u5408\u9884\u671F\u3002", "\u67E5\u8BE2\u5F53\u524D\u9762\u3001\u8FB9\u53CA\u53C2\u8003\u5019\u9009\uFF0C\u660E\u786E\u76EE\u6807\u4E0E\u6570\u91CF\u540E\u518D\u6267\u884C\uFF1B\u4E0D\u80FD\u731C\u9009\u7F16\u53F7\u6216\u81EA\u52A8\u6269\u5927\u8303\u56F4\u3002", ["queryGeometry", "queryReferences", "getState"], { hardStop: true }),
  rule("history", "UNSAFE_LEGACY_REFERENCE HISTORY_INVALID PARALLEL_DEPENDENCY_MISSING", "\u5386\u53F2\u6216\u4E0B\u6E38\u7279\u5F81\u4F9D\u8D56\u65E0\u6CD5\u5B89\u5168\u5BF9\u5E94\u4FEE\u6539\u540E\u7684\u62D3\u6251\u3002", "\u8BFB\u53D6\u53D7\u5F71\u54CD\u7279\u5F81\uFF0C\u91CD\u65B0\u660E\u786E\u771F\u5B9E\u5F15\u7528\uFF1B\u4E0D\u5F97\u64C5\u5220\u540E\u7EED\u6B65\u9AA4\u3002\u64A4\u9500\u53EA\u7528\u4E8E\u5DF2\u6838\u5BF9\u7684\u672C\u6B21\u63D0\u4EA4\u3002", ["getHistory", "getState", "queryGeometry"], { hardStop: true }),
  rule("unsaved", "UNSAVED_REPLACEMENT ONE_PROJECT_ONLY", "\u5F53\u524D\u5DE5\u7A0B\u5C1A\u672A\u4FDD\u5B58\u6216\u4E0D\u80FD\u540C\u65F6\u66FF\u6362\u591A\u4E2A\u5DE5\u7A0B\u3002", "\u5148\u901A\u8FC7\u6587\u4EF6\u63A5\u53E3\u4FDD\u5B58\u5F53\u524D\u5DF2\u63D0\u4EA4\u5DE5\u7A0B\uFF0C\u518D\u7531\u7528\u6237\u660E\u786E\u9009\u62E9\u6253\u5F00\u6216\u65B0\u5EFA\u3002", ["files.save"], { hardStop: true }),
  rule("preview", "PREVIEW_ACTIVE UI_TASK_ACTIVE LOGO_WIZARD_BUSY LOGO_WIZARD_CLOSED AGENT_PANEL_ACTIVE RESOURCE_BUSY KERNEL_BUSY", "\u5DF2\u6709\u9884\u89C8\u3001\u7F16\u8F91\u8349\u7A3F\u3001\u8D44\u6E90\u5199\u5165\u6216\u8BA1\u7B97\u5360\u7528\u5F53\u524D\u64CD\u4F5C\u3002", "\u5148\u67E5\u770B\u5F53\u524D\u4EFB\u52A1\uFF1A\u7EE7\u7EED\u539F\u4EFB\u52A1\uFF0C\u6216\u660E\u786E\u5E94\u7528/\u53D6\u6D88\u8349\u7A3F\u540E\u518D\u6267\u884C\uFF1B\u4E0D\u8981\u81EA\u52A8\u5173\u95ED\u7528\u6237\u672A\u5B8C\u6210\u7F16\u8F91\u3002", ["getState", "getJob"], { hardStop: true }),
  rule("review", "LOGO_REVIEW_REQUIRED MACHINING_SOURCE_REQUIRED LOGO_SOURCE_REQUIRED", "\u56FE\u6848\u8F6E\u5ED3\u6216\u52A0\u5DE5\u6765\u6E90\u5C1A\u672A\u786E\u8BA4\u3002", "\u68C0\u67E5\u540C\u4E00\u7A3F\u4EF6\u7684\u539F\u56FE\u3001\u5B54\u6D1E\u3001\u6BEB\u7C73\u5C3A\u5BF8\u4E0E\u52A0\u5DE5\u6DF1\u5EA6\uFF0C\u660E\u786E\u786E\u8BA4\u540E\u624D\u751F\u6210\u52A0\u5DE5\u7279\u5F81\u3002", ["reviewLogo", "logoWizard", "planPatternMachining"], { hardStop: true }),
  rule("display", "DISPLAY_FAILED DISPLAY_INCOMPLETE DISPLAY_REFINEMENT_FAILED DISPLAY_VOLUME_MISMATCH STALE_DISPLAY CAPTURE_TIMEOUT UNSUPPORTED_RENDER_FEATURE", "\u753B\u9762\u6216\u622A\u56FE\u672A\u80FD\u786E\u8BA4\u4E0E\u5DF2\u63D0\u4EA4\u6A21\u578B\u4E00\u81F4\u3002", "\u8BFB\u53D6\u63D0\u4EA4\u56DE\u6267\u548C\u5F53\u524D\u72B6\u6001\uFF0C\u518D\u5C1D\u8BD5\u4E00\u6B21 redraw \u6216 capture\uFF1B\u53EA\u62A5\u544A\u753B\u9762\u672A\u786E\u8BA4\uFF0C\u4E0D\u8981\u91CD\u65B0\u6267\u884C\u5EFA\u6A21\u3002", ["getState", "redraw", "capture"], { readRetry: true }),
  rule("integrity", "ARTIFACT_CORRUPT HASH_MISMATCH MESH_ASSET_CORRUPT MESH_RESULT_MISMATCH RESULT_MISMATCH RESULT_INVALID LAYER_CACHE_CORRUPT ASSET_ROLE_MISMATCH GEOMETRY_CODEC_MISMATCH ROUND_RADIUS_MISMATCH REFINE_GEOMETRY_CHANGED", "\u6765\u6E90\u3001\u7ED3\u679C\u6216\u7F13\u5B58\u7684\u8EAB\u4EFD\u3001\u54C8\u5E0C\u3001\u8BED\u4E49\u6216\u51E0\u4F55\u6821\u9A8C\u672A\u901A\u8FC7\u3002", "\u505C\u6B62\u5B89\u88C5\u8BE5\u7ED3\u679C\uFF0C\u4FDD\u7559\u539F\u4EF6\u548C\u8BCA\u65AD\uFF1B\u6838\u5BF9\u539F\u4EFB\u52A1\u3001\u6765\u6E90\u3001\u53C2\u6570\u53CA\u53D1\u5E03\u7248\u672C\uFF0C\u4E0D\u80FD\u964D\u7EA7\u6821\u9A8C\u3002", ["getState", "getServicesJob", "getServicesRequest"], { hardStop: true }),
  rule("version", "CATALOG_CHANGED SCHEMA_MISMATCH KERNEL_BUILD_CHANGED DOCUMENT_VERSION_UNSUPPORTED OPERATION_VERSION_UNSUPPORTED SERVICES_PROTOCOL_MISMATCH SERVICES_MIGRATION_REQUIRED RELIEF_EDIT_VERSION", "\u9875\u9762\u3001\u6587\u6863\u3001\u6587\u4EF6\u6216\u540E\u7AEF\u534F\u8BAE\u7248\u672C\u4E0D\u517C\u5BB9\u3002", "\u91CD\u65B0\u63E1\u624B\u5E76\u8BFB\u53D6\u5339\u914D\u7248\u672C\u7684\u5B8C\u6574\u5951\u7EA6\uFF1B\u5DE5\u7A0B\u5148\u4FDD\u5B58\uFF0C\u4E0D\u80FD\u7528\u65E7\u5305\u6216\u65E7\u7F16\u53F7\u7EE7\u7EED\u5199\u5165\u3002", ["connect", "getTool", "getServicesCapabilities"], { hardStop: true }),
  rule("capacity", "SIZE_LIMIT RESOURCE_LIMIT FILE_TOO_LARGE IMPORT_TOO_LARGE RESULT_TOO_LARGE RESULT_TOO_LARGE_FOR_CLIENT CHECKPOINT_CLIENT_CAPACITY SOURCE_BUDGET_EXCEEDED GEOMETRY_SOURCE_LIMIT CONTOUR_TOO_COMPLEX LOFT_COMPLEXITY MESH_DISPLAY_CAPACITY MESH_SIZE_LIMIT RELIEF_EDIT_CAPACITY RELIEF_LIMIT RELIEF_PLAN_LIMIT REFINE_LIMIT PROFILE_CONSTRAINT_LIMIT", "\u8F93\u5165\u3001\u7ED3\u679C\u3001\u5DE5\u7A0B\u6216\u5BA2\u6237\u7AEF\u627F\u8F7D\u8D85\u8FC7\u8FD9\u6761\u5B9E\u9645\u94FE\u8DEF\u7684\u5BB9\u91CF\u3002", "\u8BFB\u53D6\u5BF9\u5E94\u5BB9\u91CF\u9650\u5236\uFF0C\u6309\u6765\u6E90\u5141\u8BB8\u7684\u90E8\u4EF6/\u5DE5\u7A0B\u62C6\u5206\u6216\u91CA\u653E\u65E0\u7528\u8D44\u6E90\uFF1B\u4E0D\u80FD\u81EA\u52A8\u51CF\u7EC6\u8282\u3001\u964D\u7CBE\u5EA6\u6216\u6539\u7528\u53E6\u4E00\u5185\u6838\u3002", ["files.capabilities", "getTool", "getState"], { hardStop: true }),
  rule("resource", "RESOURCE_EXPIRED ASSET_NOT_FOUND ARTIFACT_NOT_FOUND ARTIFACT_UNAVAILABLE SERVICES_SOURCE_UNAVAILABLE LIBRARY_ENTRY_NOT_FOUND HANDLE_REQUIRED", "\u6240\u9700\u8F93\u5165\u8D44\u6E90\u3001\u7ED3\u679C\u6587\u4EF6\u6216\u6388\u6743\u6587\u4EF6\u53E5\u67C4\u5DF2\u7ECF\u5931\u6548\u6216\u4E0D\u53EF\u7528\u3002", "\u4FDD\u7559\u539F\u8D44\u6E90/\u4EFB\u52A1\u6807\u8BC6\uFF1B\u7531\u5BBF\u4E3B\u91CD\u65B0\u63D0\u4F9B\u540C\u4E00\u6765\u6E90\u6216\u91CD\u65B0\u53D6\u5F97\u5DF2\u6709\u5DE5\u4EF6\u4E0E\u53E5\u67C4\uFF0C\u6838\u5BF9\u54C8\u5E0C\u540E\u7EE7\u7EED\u3002", ["files.capabilities", "getServicesJob", "getState"], { hardStop: true }),
  rule("file", "MALFORMED_FILE JSON_INVALID PROJECT_FORMAT_INVALID DOCUMENT_INVALID ASSET_INVALID LIBRARY_INVALID VECTOR_INVALID RELIEF_IMAGE_INVALID LOGO_READ_FAILED FILE_COMMAND_FAILED CONVERSION_FAILED", "\u6587\u4EF6\u5185\u5BB9\u3001\u683C\u5F0F\u8F6C\u6362\u3001\u7F16\u7801\u6216\u5DE5\u7A0B\u7ED3\u6784\u672A\u901A\u8FC7\u6821\u9A8C\u3002", "\u6838\u5BF9\u539F\u6587\u4EF6\u771F\u5B9E\u683C\u5F0F\u4E0E\u6765\u6E90\uFF0C\u4F7F\u7528\u53D7\u652F\u6301\u7684\u5BFC\u51FA\u683C\u5F0F\u91CD\u65B0\u63D0\u4F9B\uFF1B\u4E0D\u8981\u8986\u76D6\u539F\u6587\u4EF6\u6216\u5C06\u89E3\u6790\u5931\u8D25\u5F53\u6210\u7A7A\u6A21\u578B\u3002", ["getTool", "files.capabilities"], { hardStop: true }),
  rule("transfer", "ARTIFACT_TRANSFER_FAILED SAVE_CONFIRMATION_FAILED RESULT_REPORT_FAILED UPLOAD_FAILED PROJECT_ENCODING_FAILED PROJECT_ENCODING_MESSAGE_ERROR PROJECT_ENCODING_SEND_FAILED PROJECT_ENCODING_TIMEOUT", "\u6587\u4EF6\u4F20\u8F93\u3001\u5DE5\u7A0B\u7F16\u7801\u6216\u5199\u5165\u786E\u8BA4\u672A\u5B8C\u6210\u3002", "\u533A\u5206\u5DF2\u751F\u6210\u3001\u5DF2\u4F20\u8F93\u548C\u5DF2\u5199\u76D8\uFF1B\u5148\u53D6\u539F\u5DE5\u4EF6\u6216\u539F\u56DE\u6267\uFF0C\u518D\u4EC5\u6062\u590D\u672A\u5B8C\u6210\u7684\u4F20\u8F93\uFF0C\u4E0D\u91CD\u7B97\u6A21\u578B\u3002", ["files.save", "files.capabilities", "getBatchReceipt", "getJob"], { hardStop: true }),
  rule("storage", "STORAGE_UNAVAILABLE LIBRARY_STORAGE_UNAVAILABLE DATA_ROOT_IN_USE DATA_ROOT_INVALID GATEWAY_CONFIG_INVALID SERVICES_CONFIG_INVALID SERVICES_CONFIG_REQUIRED AGENT_URL_INVALID IIS_RUNTIME_UNAVAILABLE", "\u5B58\u50A8\u3001\u670D\u52A1\u6620\u5C04\u6216\u8FDE\u63A5\u914D\u7F6E\u5F53\u524D\u4E0D\u53EF\u7528\u3002", "\u901A\u8FC7\u73B0\u6709\u8BBE\u7F6E\u6838\u5BF9\u8FDE\u63A5\u4E0E\u5B58\u50A8\uFF1B\u4FDD\u7559\u5DE5\u7A0B\uFF0C\u5411\u8D1F\u8D23\u8BE5\u73AF\u5883\u7684\u5BBF\u4E3B\u8BF7\u6C42\u5904\u7406\uFF0C\u4E0D\u5EFA\u7ACB\u66FF\u4EE3\u670D\u52A1\u6216\u6539\u5199\u8FD0\u884C\u76EE\u5F55\u3002", ["getServices", "files.capabilities"], { hardStop: true }),
  rule("cancelled", "CANCELLED PREVIEW_CANCELLED BATCH_CANCELLED JOB_CANCELLED JOB_CANCELED WORKER_CANCELLED SERVICES_JOB_CANCELLED LOGO_READ_CANCELLED", "\u8FD9\u9879\u64CD\u4F5C\u5DF2\u53D6\u6D88\u6216\u5728\u5F53\u524D\u6B65\u9AA4\u540E\u505C\u6B62\u3002", "\u68C0\u67E5\u6700\u7EC8\u56DE\u6267\u548C\u4ECD\u4FDD\u7559\u7684\u5DF2\u63D0\u4EA4\u6B65\u9AA4\uFF1B\u53D6\u6D88\u8BF7\u6C42\u4E0D\u7B49\u4E8E\u5185\u6838\u5DF2\u505C\u6B62\uFF0C\u53EA\u6709\u6700\u7EC8\u505C\u6B62\u72B6\u6001\u624D\u80FD\u5F00\u59CB\u540E\u7EED\u8BA1\u7B97\u3002", ["getState", "getJob", "getServicesJob"], { hardStop: true }),
  rule("wait", "SERVICES_WAIT_DECISION_REQUIRED SERVICES_WAIT_NOT_PENDING", "\u540E\u53F0\u8BA1\u7B97\u9700\u8981\u660E\u786E\u7B49\u5F85\u51B3\u5B9A\uFF0C\u6216\u539F\u7B49\u5F85\u51B3\u5B9A\u5DF2\u7ECF\u8FC7\u671F\u3002", "\u67E5\u8BE2\u539F\u4EFB\u52A1\u5E76\u9009\u62E9\u7EE7\u7EED\u7B49\u5F85\u540C\u4E00\u4F5C\u4E1A\u6216\u53D7\u63A7\u505C\u6B62\uFF1B\u4E0D\u81EA\u52A8\u91CD\u65B0\u63D0\u4EA4\u3002", ["getServicesJob", "decideServicesWait"], { hardStop: true, reconcile: true }),
  rule("kernel", "KERNEL_CRASHED KERNEL_START_TIMEOUT KERNEL_TIMEOUT KERNEL_BUILD_FAILED KERNEL_RECOVERY_REQUESTED WORKER_MESSAGE_ERROR WORKER_SEND_FAILED WORKER_TERMINATED WORKER_TIMEOUT WORKER_FAILED WORKER_UNAVAILABLE NATIVE_WORKER_FAILED MESH_WORKER_FAILED", "\u51E0\u4F55\u5185\u6838\u6216\u53D7\u63A7\u5DE5\u4F5C\u8FDB\u7A0B\u672A\u80FD\u5B8C\u6210\u5F53\u524D\u8BA1\u7B97\u3002", "\u5148\u4FDD\u5B58\u6700\u540E\u5DF2\u63D0\u4EA4\u5DE5\u7A0B\u5E76\u6838\u5BF9\u539F\u4EFB\u52A1\uFF1B\u672C\u5730\u5185\u6838\u786E\u5B9E\u4E0D\u53EF\u7528\u65F6\u624D recoverKernel\uFF0C\u4E0D\u5237\u65B0\u9875\u9762\u3001\u4E0D\u91CD\u653E\u672A\u77E5\u547D\u4EE4\u3002", ["files.save", "getState", "getJob", "getServicesJob", "recoverKernel"], { hardStop: true }),
  rule("precision", "TOLERANCE_UNACHIEVABLE MESH_BOOLEAN_PRECISION_LIMIT MESH_EXPORT_PRECISION RELIEF_RESOLUTION_INSUFFICIENT GUIDED_LOFT_GUIDE_DEVIATION GUIDED_LOFT_CIRCULAR_RADIUS_CHANGE", "\u6240\u9700\u8BEF\u5DEE\u3001\u7CBE\u5EA6\u6216\u6765\u6E90\u5F62\u72B6\u4FDD\u6301\u6761\u4EF6\u672A\u8FBE\u5230\u3002", "\u4FDD\u7559\u6765\u6E90\u4E0E\u539F\u7CBE\u5EA6\uFF1B\u68C0\u67E5\u6765\u6E90\u6D4B\u91CF\u548C\u5DE5\u5177\u652F\u6301\u8303\u56F4\uFF0C\u53EA\u6709\u7528\u6237\u660E\u786E\u540C\u610F\u7684\u65B0\u8981\u6C42\u624D\u53EF\u53E6\u5B9A\u7CBE\u5EA6\u6216\u5C3A\u5BF8\u3002", ["getTool", "inspectProfile"], { hardStop: true }),
  rule("material", "NO_MATERIAL_ADDED NO_MATERIAL_REMOVED MATERIAL_CHECK_FAILED LOFT_VOLUME_MISMATCH MESH_BOOLEAN_EMPTY TAP_MATERIAL_INSUFFICIENT RELIEF_THICKNESS RELIEF_THICKNESS_UNKNOWN", "\u64CD\u4F5C\u6CA1\u6709\u4EA7\u751F\u8981\u6C42\u7684\u6750\u6599\u53D8\u5316\uFF0C\u6216\u539A\u5EA6/\u6750\u6599\u4F59\u91CF\u672A\u88AB\u8BC1\u660E\u3002", "\u68C0\u67E5\u76EE\u6807\u3001\u5200\u5177\u3001\u65B9\u5411\u3001\u622A\u9762\u3001\u6DF1\u5EA6\u53CA\u5B9E\u9645\u539A\u5EA6\uFF1B\u53EA\u4EE5\u539F\u53C2\u6570\u505A\u53D7\u63A7\u9884\u89C8\uFF0C\u4E0D\u80FD\u901A\u8FC7\u6539\u53D8\u5C3A\u5BF8\u51D1\u6210\u529F\u3002", ["measure", "queryGeometry", "inspectThickness", "getTool"], { candidate: true }),
  rule("contour", "OPEN_CONTOUR INVALID_CONTOUR INVALID_HOLE LOGO_CONTOUR_INVALID LOGO_EMPTY LOGO_MIN_VERTICES NO_VECTOR_CONTENT REGIONS_TOUCH_OR_OVERLAP SELF_INTERSECTION RASTER_SMOOTHING_TOPOLOGY RASTER_TOPOLOGY_AMBIGUOUS", "\u6765\u6E90\u8F6E\u5ED3\u5B58\u5728\u672A\u95ED\u5408\u3001\u5B54\u5F52\u5C5E\u3001\u4EA4\u53E0\u3001\u81EA\u4EA4\u6216\u63CF\u6479\u62D3\u6251\u95EE\u9898\u3002", "\u6838\u5BF9\u539F\u56FE\u4E0E\u53EF\u8BFB\u4E2D\u95F4\u8F6E\u5ED3\uFF1B\u660E\u786E\u4FEE\u6B63\u771F\u5B9E\u8F6E\u5ED3\uFF0C\u4FDD\u7559\u5B54\u4E0E\u5C3A\u5BF8\uFF0C\u4E0D\u81EA\u52A8\u586B\u6D1E\u3001\u5220\u7EC6\u8282\u6216\u6269\u5927\u5BB9\u5DEE\u3002", ["readVector", "inspectProfile", "reviewLogo"], { hardStop: true }),
  rule("constraints", "PROFILE_CONSTRAINT_CONFLICT PROFILE_CONSTRAINT_UNSATISFIED PROFILE_CONSTRAINT_NUMERICAL PROFILE_CONSTRAINT_GEOMETRY_INVALID PROFILE_CONSTRAINT_INVALID RELIEF_CONSTRAINT_CONFLICT RELIEF_CONSTRAINT_INVALID RELIEF_BOUNDARY_CONFLICT RELIEF_PATCH_PROTECTION RELIEF_DESIGN_PROTECTED REFERENCE_LOCKED", "\u7EA6\u675F\u3001\u4FDD\u62A4\u533A\u57DF\u6216\u9501\u5B9A\u89C4\u5219\u4E0E\u8FD9\u6B21\u4FEE\u6539\u51B2\u7A81\u3002", "\u8BFB\u53D6\u5B9E\u9645\u7EA6\u675F\u4E0E\u4FDD\u62A4\u533A\uFF0C\u660E\u786E\u4FEE\u6539\u54EA\u4E00\u9879\u6761\u4EF6\uFF1B\u4E0D\u80FD\u81EA\u52A8\u89E3\u9664\u9501\u5B9A\u3001\u5220\u9664\u5B54\u6216\u8986\u76D6\u4FDD\u62A4\u533A\u57DF\u3002", ["inspectConstraints", "getState", "getTool"], { hardStop: true }),
  rule("outside", "RELIEF_OUTSIDE_FACE RELIEF_SAMPLE_OUTSIDE RELIEF_TARGET_OUTSIDE RELIEF_DESIGN_OUTSIDE TAP_POINT_INVALID TAP_DEPTH_INVALID SUBD_BRUSH_NO_HIT", "\u64CD\u4F5C\u70B9\u3001\u6DF1\u5EA6\u6216\u52A0\u5DE5\u8303\u56F4\u672A\u843D\u5728\u5141\u8BB8\u7684\u5B9E\u9645\u76EE\u6807\u533A\u57DF\u3002", "\u91CD\u65B0\u6D4B\u91CF\u5F53\u524D\u76EE\u6807\u4E0E\u5C40\u90E8\u5750\u6807\uFF0C\u660E\u786E\u4F4D\u4E8E\u6750\u6599/\u652F\u6491\u8303\u56F4\u5185\u7684\u4F4D\u7F6E\uFF1B\u4FDD\u7559\u539F\u6DF1\u5EA6\u4E0E\u56FE\u6848\u6BD4\u4F8B\u3002", ["queryGeometry", "measure", "getTool"], { hardStop: true }),
  rule("no_change", "NO_CHANGE RELIEF_NO_CHANGE LOGO_UNDO_EMPTY CLEANUP_NOT_APPLICABLE BLEND_SKIPPED AUTO_PLACED COLOR_IGNORED_BY_METAL_FINISH", "\u5F53\u524D\u6761\u4EF6\u6CA1\u6709\u53EF\u5E94\u7528\u7684\u989D\u5916\u53D8\u5316\uFF0C\u6216\u56DE\u6267\u5305\u542B\u9700\u8981\u8BF4\u660E\u7684\u72B6\u6001\u3002", "\u8BFB\u53D6\u539F\u72B6\u6001\u4E0E\u62A5\u544A\u786E\u8BA4\u5B9E\u9645\u7ED3\u679C\uFF1B\u65E0\u9700\u91CD\u590D\u52A0\u5DE5\uFF0C\u4E0D\u5C06\u201C\u672A\u53D8\u5316\u201D\u5192\u79F0\u65B0\u51E0\u4F55\u5DF2\u751F\u6210\u3002", ["getState", "getTool"]),
  rule("sequence", "COMPLEX_BATCH_REQUIRES_SEQUENTIAL SERIAL_REBUILD_REQUIRED", "\u8FD9\u7EC4\u4F9D\u8D56\u9700\u8981\u6309\u5DF2\u63D0\u4EA4\u7684\u5F53\u524D\u7ED3\u679C\u987A\u5E8F\u6267\u884C\u3002", "\u6838\u5BF9\u524D\u5E8F\u5DF2\u63D0\u4EA4\u6B65\u9AA4\uFF0C\u4EC5\u628A\u672A\u5B8C\u6210\u90E8\u5206\u6309\u4F9D\u8D56\u987A\u5E8F\u89C4\u5212\u4E3A\u6709\u754C\u6B65\u9AA4\u3002", ["getState", "getHistory"], { hardStop: true }),
  rule("design_check", "DESIGN_CHECK_INCONCLUSIVE DESIGN_REQUIREMENTS_NOT_MET", "\u6307\u5B9A\u8BBE\u8BA1\u68C0\u67E5\u672A\u901A\u8FC7\uFF0C\u6216\u73B0\u6709\u8BC1\u636E\u4E0D\u8DB3\u4EE5\u8BC1\u660E\u6EE1\u8DB3\u8981\u6C42\u3002", "\u8BFB\u53D6\u9010\u9879\u68C0\u67E5\u548C\u672A\u9A8C\u8BC1\u9879\uFF0C\u4FEE\u6B63\u5DF2\u8BC1\u5B9E\u7684\u95EE\u9898\uFF1B\u4E0D\u80FD\u628A\u6709\u6548\u5B9E\u4F53\u6216\u5DE5\u5177\u6267\u884C\u6210\u529F\u5F53\u6210\u8BBE\u8BA1\u9A8C\u6536\u3002", ["inspectDesign", "getState"], { hardStop: true }),
  rule("host_connection", "AGENT_PANEL_FAILED AGENT_PANEL_TIMEOUT host_unavailable PAGE_REQUIRED ROUTE_NOT_FOUND", "\u5BBF\u4E3B\u3001\u9875\u9762\u7ED1\u5B9A\u6216\u73B0\u6709\u63A5\u53E3\u8FDE\u63A5\u672A\u5EFA\u7ACB\u3002", "\u6838\u5BF9\u6240\u9009\u9875\u9762\u548C\u5BBF\u4E3B\u5B9E\u9645\u811A\u672C\u80FD\u529B\u3001\u5DF2\u6709\u8FDE\u63A5\u914D\u7F6E\uFF1B\u6700\u591A\u4E00\u6B21\u9488\u5BF9\u6027\u91CD\u8FDE\uFF0C\u4E0D\u80FD\u5237\u65B0\u672A\u4FDD\u5B58\u5DE5\u7A0B\u6216\u5EFA\u7ACB\u66FF\u4EE3\u670D\u52A1\u3002", ["connect", "getAgentPanel"], { hardStop: true }),
  rule("manual_lock", "HOST_INTERACTION_LOCKED", "\u5F53\u524D\u9875\u9762\u7684\u4EBA\u5DE5\u7F16\u8F91\u7531\u6B63\u5728\u6267\u884C\u7684Agent\u63A7\u5236\u6682\u65F6\u9501\u5B9A\u3002", "\u7B49\u5F85\u539F\u63A7\u5236\u4EFB\u52A1\u5B8C\u6210\u6216\u901A\u8FC7\u65E2\u6709\u63A7\u5236\u5165\u53E3\u91CA\u653E\u7F16\u8F91\u6743\uFF1B\u4E0D\u8981\u7ED5\u8FC7\u9501\u5B9A\u3002", ["getState"], { hardStop: true }),
  rule("placement", "PLACEMENT_NOT_APPLICABLE", "\u8FD9\u9879\u64CD\u4F5C\u4E0D\u63A5\u53D7\u5F53\u524D\u5B9A\u4F4D\u65B9\u5F0F\u3002", "\u8BFB\u53D6\u5DE5\u5177\u5B9A\u4F4D\u5951\u7EA6\uFF0C\u6CBF\u6765\u6E90\u51BB\u7ED3\u5750\u6807\u6267\u884C\u52A0\u5DE5\uFF1B\u4E0D\u80FD\u53E0\u52A0\u5F53\u524D\u951A\u70B9\u9020\u6210\u9519\u4F4D\u3002", ["getTool", "getState"], { hardStop: true }),
  rule("execution", "BATCH_FAILED JOB_EXECUTION_FAILED SERVICES_JOB_FAILED SERVICES_REQUEST_FAILED HOST_FAILED TEXT_COMMAND_FAILED UPGRADE_FAILED", "\u6267\u884C\u94FE\u8DEF\u8FD4\u56DE\u5931\u8D25\uFF0C\u5177\u4F53\u539F\u56E0\u987B\u7ED3\u5408\u672C\u6B21\u9636\u6BB5\u548C\u8BCA\u65AD\u786E\u8BA4\u3002", "\u8BFB\u53D6\u539F\u9519\u8BEF\u7684code\u3001path\u3001stage\u3001report\u4E0E\u9010\u6B65\u56DE\u6267\uFF1B\u5148\u6838\u5BF9\u63D0\u4EA4\u72B6\u6001\uFF0C\u4EC5\u4FEE\u590D\u5DF2\u8BC1\u5B9E\u7684\u539F\u56E0\u3002\u4E0D\u8981\u81EA\u52A8\u91CD\u7B97\u6216\u628A\u672A\u77E5\u5931\u8D25\u5F52\u548E\u4E8E\u6A21\u578B\u3002", ["getState", "getJob", "getServicesJob"], { hardStop: true })
];
var exact = new Map(rules.flatMap((item) => [...item.codes].map((code) => [code, item])));
var unavailable = rule("unsupported", "", "\u5F53\u524D\u5DE5\u5177\u3001\u5BBF\u4E3B\u6216\u6267\u884C\u7AEF\u4E0D\u652F\u6301\u8FD9\u4EFD\u6765\u6E90\u4E0E\u8BF7\u6C42\u8BED\u4E49\u3002", "\u8BFB\u53D6\u5DE5\u5177\u5361\u4E0E\u5B9E\u9645\u80FD\u529B\uFF1B\u4EC5\u9009\u62E9\u8F93\u5165\u3001\u8F93\u51FA\u3001\u5B54\u6D1E\u3001\u5C3A\u5BF8\u548C\u6DF1\u5EA6\u8BED\u4E49\u4E00\u81F4\u7684\u5DF2\u652F\u6301\u5DE5\u5177\u3002\u6CA1\u6709\u7B49\u4EF7\u5DE5\u5177\u65F6\u8BF4\u660E\u7F3A\u53E3\u5E76\u505C\u6B62\uFF0C\u4E0D\u6362\u6838\u515C\u5E95\u3002", ["getTool", "getServicesCapabilities"], { hardStop: true });
var geometry = rule("geometry", "", "\u5019\u9009\u51E0\u4F55\u672A\u901A\u8FC7\u6784\u9020\u3001\u6709\u6548\u6027\u6216\u6765\u6E90\u4FDD\u6301\u68C0\u67E5\u3002", "\u8BFB\u53D6\u672C\u6B21\u9636\u6BB5\u4E0E\u8BCA\u65AD\u5E76\u68C0\u67E5\u6765\u6E90\uFF1B\u53EA\u5728\u786E\u8BA4\u672A\u63D0\u4EA4\u3001\u6709\u65B0\u673A\u5236\u8BC1\u636E\u548C\u5269\u4F59\u9884\u7B97\u65F6\uFF0C\u901A\u8FC7\u73B0\u6709 preview.start/update/cancel \u8BC4\u4F30\u4E00\u4E2A\u5019\u9009\u3002\u4FDD\u7559\u5C3A\u5BF8\u3001\u56FE\u6848\u3001\u6DF1\u5EA6\u4E0ER\u3002", ["getTool", "queryGeometry", "measure"], { candidate: true });
var input = rule("source_parameters", "", "\u6B64\u6765\u6E90\u6216\u5DE5\u5177\u53C2\u6570\u7EC4\u5408\u4E0D\u6EE1\u8DB3\u51E0\u4F55\u8F93\u5165\u6761\u4EF6\u3002", "\u8BFB\u53D6\u5BF9\u5E94\u5DE5\u5177\u5361\u548C\u62A5\u9519\u9636\u6BB5\uFF0C\u590D\u6838\u6765\u6E90\u622A\u9762\u3001\u8DEF\u5F84\u3001\u652F\u6491\u53CA\u53C2\u6570\u5173\u7CFB\uFF1B\u5148\u4FEE\u6B63\u5DF2\u8BC1\u5B9E\u7684\u8F93\u5165\u95EE\u9898\uFF0C\u4E0D\u80FD\u7528\u8BD5\u9519\u6539\u53D8\u8BBE\u8BA1\u3002", ["getTool", "inspectProfile"], { hardStop: true });
var guided = rule("guided_loft", "", "\u5BFC\u5F15\u653E\u6837\u7684\u6765\u6E90\u7ED1\u5B9A\u3001\u622A\u9762\u3001\u5F15\u5BFC\u6216\u63A5\u5408\u6761\u4EF6\u672A\u6210\u7ACB\u3002", "\u6838\u5BF9\u5F53\u524D\u6765\u6E90\u622A\u9762\u3001\u5F15\u5BFC\u8DEF\u5F84\u548C\u5339\u914D\u6761\u4EF6\uFF1B\u4EC5\u652F\u6301\u5361\u7247\u516C\u5E03\u7684\u8303\u56F4\uFF0C\u4E0D\u7528\u8FD1\u4F3C\u9762\u66FF\u4EE3\u5B9E\u4F53\u6216\u7ED5\u8FC7\u6765\u6E90\u7ED1\u5B9A\u3002", ["getTool", "inspectProfile", "getState"], { hardStop: true });
var unknown = rule("unclassified", "", "\u64CD\u4F5C\u672A\u80FD\u5B8C\u6210\uFF0C\u76EE\u524D\u6CA1\u6709\u8DB3\u591F\u8BC1\u636E\u786E\u5B9A\u5B89\u5168\u6062\u590D\u65B9\u5F0F\u3002", "\u4FDD\u7559\u5F53\u524D\u5DE5\u7A0B\u4E0E\u539F\u59CB\u9519\u8BEF\u56DE\u6267\uFF0C\u5148\u68C0\u67E5\u63D0\u4EA4\u548C\u4EFB\u52A1\u72B6\u6001\uFF1B\u5C06\u660E\u786E\u7684\u5931\u8D25\u539F\u56E0\u53CA\u9700\u8981\u7684\u4E0B\u4E00\u9879\u4FE1\u606F\u544A\u77E5\u7528\u6237\u3002", ["getState", "getJob"], { hardStop: true });
var ERROR_RECOVERY_VERSION = "1.0.0";
function businessReason(message) {
  const value = String(message || "").trim();
  if (!/[\u3400-\u9fff]/u.test(value) || value.length > 300 || /(?:^|\s)\/(?:[^\s/]+\/)+[^\s]*/.test(value) || /[\r\n]|https?:|[A-Za-z]:[\\/]|\\\\|(?:\bat\s+.+\(|stack|bearer|token|cookie|authorization|password|secret|api.?key|jobId|requestId|diagnosticsRef|密钥|令牌|密码)|[A-Za-z0-9_-]{24,}|刷新页面|降低精度|已回滚|原工程保留|工程未(?:改变|变化)|已保存到/i.test(value)) return null;
  return value;
}
function recoveryRule(code, message = "") {
  if (exact.has(code)) return exact.get(code);
  if (/UNSUPPORTED|UNAVAILABLE|_MISSING$|_TBD$|_UNMATCHED$|^UNKNOWN_OPERATION$|^FORMAT_|^CONTINUITY_|^SCOPE_EXPANSION_REQUIRED$|^OPERATION_|^NATIVE_ACCEPTANCE_/.test(code)) return unavailable;
  if (/^GUIDED_LOFT_/.test(code)) return guided;
  if (/^(?:GEOMETRY_|BLEND_RADIUS_|REFINE_FAILED|OCCT_FAILURE|CLOSED_GRINDING_|GRINDING_STRIP_|RELIEF_(?:GEOMETRY|INTERSECTION|NOT_CLOSED|MULTIVALUED)|MESH_BOOLEAN_INVALID)/.test(code)) return geometry;
  if (/^(?:PROFILE_|FIT_|RELIEF_|HEIGHTFIELD_|MESH_|PROJECTION_|DEGENERATE_|UNSUPPORTED_CURVE_)/.test(code)) return input;
  if (code === "UNCLASSIFIED_ERROR") {
    if (/permission|unauthor|forbidden|权限|授权|未登录/i.test(message)) return exact.get("UNAUTHORIZED");
    if (/ambiguous|select (?:a|one)|请选择|选中|选择.*[面边体]|含混|歧义/i.test(message)) return exact.get("AMBIGUOUS_SELECTION");
    if (/unsupported|not supported|不支持|尚未支持/i.test(message)) return unavailable;
    if (/must |expected |invalid (?:parameter|input)|请输入|参数|必须.*(?:大于|小于|有限|数值)/i.test(message)) return exact.get("PARAM_SCHEMA_INVALID");
    if (/contour|wire|闭合|轮廓|自交/i.test(message)) return exact.get("OPEN_CONTOUR");
    if (/kernel|worker|内核/i.test(message)) return exact.get("KERNEL_CRASHED");
    if (/geometry|boolean|fillet|chamfer|BRep|几何|布尔|圆角|倒角/i.test(message)) return geometry;
  }
  return unknown;
}
function errorRecovery(error = {}, receipt = {}) {
  const code = String(error.code || "UNCLASSIFIED_ERROR"), base = recoveryRule(code, String(error.message || ""));
  const logoFailure = error.details?.logoFailure, logoReason = businessReason(logoFailure?.reason), logoNext = businessReason(logoFailure?.next);
  const parameterReason = parameterErrorMessage(error), detail = businessReason(error.message), reason = logoReason ?? parameterReason ?? (detail ? base === unknown ? detail : `${base.reason}${detail}` : base.reason);
  const commit = receipt.commitState ?? error.commitState ?? error.serviceCommitState;
  const uncertain = receipt.status === "unknown" || commit === "unknown" || base.reconcile === true;
  const partial = receipt.status === "partial" || receipt.atomic === false && receipt.results?.some((step) => ["committed", "completed"].includes(step.result?.status));
  const notCommitted = ["not_committed", "notCommitted"].includes(commit);
  const committed = ["committed", "applied"].includes(commit);
  const preservation = uncertain ? "\u6267\u884C\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF1B\u8BF7\u4FDD\u7559\u5F53\u524D\u5DE5\u7A0B\u548C\u539F\u4EFB\u52A1\u56DE\u6267\u3002" : partial ? "\u524D\u9762\u5DF2\u63D0\u4EA4\u7684\u6B65\u9AA4\u4ECD\u4FDD\u7559\uFF0C\u540E\u7EED\u6B65\u9AA4\u5DF2\u7ECF\u505C\u6B62\uFF1B\u4E0D\u8981\u91CD\u5EFA\u5DF2\u6210\u529F\u90E8\u5206\u3002" : notCommitted ? "\u672C\u6B21\u5931\u8D25\u6B65\u9AA4\u672A\u63D0\u4EA4\uFF0C\u5148\u524D\u5DF2\u63D0\u4EA4\u5185\u5BB9\u4FDD\u7559\u3002" : committed ? "\u5DF2\u6709\u64CD\u4F5C\u63D0\u4EA4\uFF0C\u8BF7\u5148\u6838\u5BF9\u5F53\u524D\u5DE5\u7A0B\u4E0E\u663E\u793A\u72B6\u6001\u3002" : "\u8BF7\u4FDD\u7559\u5F53\u524D\u5DE5\u7A0B\uFF1B\u662F\u5426\u5DF2\u6709\u63D0\u4EA4\u987B\u4EE5\u539F\u56DE\u6267\u548C\u72B6\u6001\u4E3A\u51C6\u3002";
  const classification = uncertain ? "reconcile" : base.id;
  const next = uncertain ? "\u5148\u6309\u539F\u4EFB\u52A1\u6216\u8BF7\u6C42\u6807\u8BC6\u67E5\u8BE2\u56DE\u6267\u5E76\u4E0E\u5F53\u524D\u5DE5\u7A0B\u5BF9\u8D26\uFF0C\u786E\u8BA4\u524D\u4E0D\u8981\u91CD\u653E\u3001\u6362\u952E\u6216\u53E6\u8D77\u8BA1\u7B97\u3002" : logoNext ?? base.next;
  const candidate = base.candidate === true && !uncertain && notCommitted && error.budgetExhausted !== true;
  return {
    version: ERROR_RECOVERY_VERSION,
    code,
    classification,
    reason,
    preservation,
    next,
    scope: "failed-operation",
    agentMayContinue: true,
    userMessage: logoReason ? `${reason}${next}` : `${reason}${preservation}${next}`,
    automaticRetry: false,
    retry: { allowed: false, condition: base.readRetry && !uncertain ? "\u4EC5\u91CD\u8BD5\u53EA\u8BFB\u753B\u9762/\u622A\u56FE\u4E00\u6B21\uFF1B\u4E0D\u91CD\u505A\u5EFA\u6A21\u3002" : "\u539F\u9519\u8BEF\u6761\u4EF6\u5DF2\u660E\u786E\u4FEE\u6B63\u3001\u72B6\u6001\u5DF2\u5BF9\u8D26\u4E14\u5171\u4EAB\u9884\u7B97\u5141\u8BB8\uFF1B\u4E0D\u5F97\u81EA\u52A8\u91CD\u653E\u3002" },
    candidate: { eligible: candidate, allowed: false, mode: candidate ? "evaluate-existing-preview-conditions" : "blocked", requires: ["known-not-committed", "new-mechanism-evidence", "shared-budget-available", "supported-tool-contract", "unchanged-design-intent"], commit: "only-after-valid-preview-and-explicit-task-authorization" },
    alternatives: { mode: "contract-compatible-only", readTools: uncertain ? ["getJob", "getBatchReceipt", "getServicesJob", "getServicesRequest", "getState"] : base.tools, automaticFallback: false },
    stop: uncertain || base.hardStop === true || !candidate,
    guide: "api.error-recovery"
  };
}
function withErrorRecovery(receipt) {
  if (!receipt || typeof receipt !== "object") return receipt;
  if (Array.isArray(receipt)) return receipt.map((item) => withErrorRecovery(item));
  const prototype = Object.getPrototypeOf(receipt);
  if (prototype !== Object.prototype && prototype !== null) return receipt;
  const result = { ...receipt };
  if (receipt.error && typeof receipt.error === "object") {
    const recovery = errorRecovery(receipt.error, receipt);
    result.error = { ...receipt.error, userMessage: recovery.userMessage, recovery };
  }
  for (const key of ["results", "result", "attachment", "saveConfirmation"]) {
    if (Array.isArray(receipt[key])) result[key] = receipt[key].map((item) => withErrorRecovery(item));
    else if (receipt[key] && typeof receipt[key] === "object") result[key] = withErrorRecovery(receipt[key]);
  }
  return result;
}

// src/agent/protocol.js?v=command-lock-20261010
var PROTOCOL = "goldenluck.webcad/1";
var IDENTITY_KEYS = Object.freeze(["sessionId", "documentId", "documentInstanceId"]);
var READ_METHODS = /* @__PURE__ */ new Set([
  "getBatchReceipt",
  "connect",
  "info",
  "getState",
  "waitFor",
  "getAgentPanel",
  "getHistory",
  "searchTools",
  "getTools",
  "getTool",
  "readDocs",
  "getMetalMaterials",
  "getMaterials",
  "measureMass",
  "queryGeometry",
  "queryReferences",
  "resolvePlacement",
  "measure",
  "measureRelation",
  "inspectDesign",
  "inspectProfile",
  "inspectConstraints",
  "inspectFit",
  "inspectThickness",
  "inspectDraft",
  "inspectPrintability",
  "files.capabilities",
  "planPatternMachining",
  "prepareProfileEdit",
  "projectProfile",
  "sampleMeshRelief",
  "sampleReliefHeight",
  "prepareReliefSculpt",
  "readRelief",
  "readVector",
  "connectVector",
  "fitProfile",
  "traceTwinWindow",
  "planAlignment",
  "getUILayout",
  "getQuickModelUsage",
  "inspectRound",
  "getModelLibrary",
  "resolveModelLibrary"
]);
var VIEW_METHODS = /* @__PURE__ */ new Set(["setMetalMaterials", "setView", "setRenderQuality", "setDisplayPreferences", "selectRectangle", "redraw", "capture", "getEvidenceImage", "updateModelLibrary", "markLocation"]);
var DISCOVERY_METHODS = /* @__PURE__ */ new Set(["getBatchReceipt", "connect", "info", "getState", "getAgentPanel", "getHistory", "searchTools", "getTools", "getTool", "readDocs", "files.capabilities", "getUILayout", "getQuickModelUsage", "getModelLibrary"]);
var EDIT_ACTIONS = /* @__PURE__ */ new Set([
  "feature.add",
  "feature.addMany",
  "feature.edit",
  "feature.rename",
  "document.rename",
  "document.materials",
  "feature.compileServices",
  "document.reliefDesign",
  "body.visibility",
  "body.appearance",
  "body.explode",
  "document.appearance",
  "history.undo",
  "history.redo",
  "reference.setWorkFrame",
  "reference.resetWorkFrame",
  "reference.setLocked",
  "reference.setBodyAnchor",
  "reference.saveFrame",
  "reference.activateFrame",
  "reference.renameFrame",
  "reference.deleteFrame",
  "reference.deleteBodyAnchor",
  "preview.start",
  "preview.update",
  "preview.commit",
  "preview.cancel",
  "feature.remove",
  "document.parameters",
  "document.refresh",
  "body.align",
  "history.restore"
]);
var JOB_METHODS = /* @__PURE__ */ new Set([
  "run",
  "execute",
  "queryGeometry",
  "measure",
  "measureRelation",
  "inspectProfile",
  "inspectConstraints",
  "inspectDesign",
  "inspectFit",
  "inspectThickness",
  "inspectDraft",
  "setView",
  "setRenderQuality",
  "files.save",
  "files.export",
  "files.import",
  "prepareProfileEdit",
  "projectProfile",
  "createDrawing",
  "exportDrawing",
  "copySelection",
  "pasteSelection",
  "inspectRound"
]);
var EDIT_METHODS = /* @__PURE__ */ new Set(["execute", "files.import", "copySelection", "pasteSelection", "recoverKernel", "setMetalMaterials"]);
var EXPORT_METHODS = /* @__PURE__ */ new Set(["files.save", "files.export", "files.reattach", "createDrawing", "exportDrawing"]);
JOB_METHODS.add("recoverKernel");
JOB_METHODS.add("measureMass");
READ_METHODS.add("probeBlendRadius");
for (const method of ["getServices", "getServicesCapabilities", "getServicesRouting", "readLogo"]) READ_METHODS.add(method);
for (const method of ["reviewLogo", "logoWizard", "reliefDesignField", "reliefDesignReference", "reliefDesignFit"]) {
  READ_METHODS.add(method);
  JOB_METHODS.add(method);
}
READ_METHODS.add("prepareReliefDesignRelief");
JOB_METHODS.add("readLogo");
JOB_METHODS.add("probeBlendRadius");
JOB_METHODS.add("files.reattach");
var HOST_ONLY_METHODS = Object.freeze({
  invoke: "dispatch wrapper",
  submit: "adapter owns job IDs",
  getJob: "original receipt via webcad_job",
  cancelJob: "host stop control",
  awaitJob: "adapter awaits page job completion",
  configureAgentPanel: "user-owned assistant destination",
  setAgentPanel: "user-owned connection lifetime",
  setServices: "host service credentials and upload consent",
  clearServicesCredential: "host authorization lifetime",
  getServicesJob: "host server job ownership",
  getServicesRequest: "host server request reconciliation",
  cancelServicesJob: "host server cancellation",
  decideServicesWait: "host user wait decision",
  recoverServicesJob: "requires explicit recovery approval",
  prepareReliefTopologyUpgrade: "host-approved saved topology migration planning",
  createRequestContext: "use live requestContext",
  executeText: "use explicit run steps",
  getLogoConverter: "service configuration",
  setLogoConverter: "service credentials",
  convertLogoPdf: "host binary conversion",
  "files.register": "host binary upload",
  "files.read": "host artifact transport",
  "files.download": "host download",
  "files.write": "host disk capability",
  "files.confirmWritten": "host write receipt",
  "files.release": "host resource lifetime",
  "files.new": "requires new document binding",
  "files.open": "requires new document binding"
});
var contract = {
  schemaVersion: 1,
  adapterVersion: 2,
  protocol: PROTOCOL,
  readMethods: [...READ_METHODS].sort(),
  viewMethods: [...VIEW_METHODS].sort(),
  jobMethods: [...JOB_METHODS].sort(),
  discoveryMethods: [...DISCOVERY_METHODS].sort(),
  editActions: [...EDIT_ACTIONS].sort(),
  editMethods: [...EDIT_METHODS].sort(),
  exportMethods: [...EXPORT_METHODS].sort(),
  // Hosts read timeouts and byte limits from here; WebCAD is their single source.
  limits: { transport: { ...LIMITS.transport }, batch: { ...LIMITS.batch } },
  hostOnlyMethods: HOST_ONLY_METHODS,
  routingGuidance: {
    wrongTool: "\u6309 allowedTool \u8C03\u7528\u76F8\u540C method\uFF0C\u4FDD\u7559\u5176\u53C2\u6570\uFF1B\u672C\u6B21\u672A\u63D0\u4EA4\uFF0C\u4E0D\u9700\u8981\u91CD\u8FDE\u6216\u91CD\u753B\u3002",
    hostOnly: "\u8BE5\u65B9\u6CD5\u7531\u5BBF\u4E3B\u7BA1\u7406\uFF0C\u4E0D\u662F Agent \u53EF\u8C03\u7528\u5165\u53E3\uFF1B\u4E0D\u8981\u6362\u5DE5\u5177\u53CD\u590D\u8C03\u7528\uFF0C\u4E5F\u4E0D\u8981\u901A\u8FC7 invoke/submit \u5305\u88C5\u7ED5\u8FC7\u3002\u9009\u62E9\u5DF2\u8BFB\u5DE5\u5177\u5361\u7684\u516C\u5F00\u64CD\u4F5C\u6216\u62A5\u544A\u8BE5\u80FD\u529B\u672A\u5F00\u653E\u3002",
    notExposed: "\u5F53\u524D\u7ED1\u5B9A\u5951\u7EA6\u6CA1\u6709\u5F00\u653E\u6B64\u65B9\u6CD5\uFF1B\u6709\u9875\u9762\u6587\u6863\u4E0D\u7B49\u4E8E MCP \u53EF\u6267\u884C\u3002\u6838\u5BF9 methodTools \u548C\u5DE5\u5177\u5361 mcpCall\uFF1B\u540C\u4E00\u7248\u672C\u65E0\u65B0\u8BC1\u636E\u65F6\u505C\u6B62\u6362\u5165\u53E3/\u91CD\u8FDE/\u53CD\u590D\u67E5\u5361\u3002"
  },
  methodSchemas: PAGE_METHOD_SCHEMAS,
  contextPolicies: Object.fromEntries([...READ_METHODS, ...VIEW_METHODS, ...EDIT_METHODS, ...EXPORT_METHODS, "run", "add", "addMany"].map((name) => [name, contextPolicy(name)])),
  methodTools: Object.fromEntries([...READ_METHODS, ...VIEW_METHODS, ...EXPORT_METHODS, ...JOB_METHODS].map((name) => [name, VIEW_METHODS.has(name) ? "webcad_view" : EXPORT_METHODS.has(name) ? "webcad_artifact" : READ_METHODS.has(name) ? "webcad_read" : "webcad_submit"]))
};
var AGENT_CONTRACT = Object.freeze({ ...contract, contractHash: contractHash(contract) });
function editsDocument(payload) {
  if (payload?.method === "reliefDesignReference") return ["attach", "detach"].includes(payload.args?.action);
  if (payload?.method === "run") return (payload.args?.steps || []).some(editsDocument);
  return ["add", "addMany", "execute", "files.import", "pasteSelection", "setMetalMaterials"].includes(payload?.method);
}
function failure(code, message) {
  const error = Object.assign(new Error(message), { code });
  const recovery = errorRecovery(error);
  return Object.assign(error, { userMessage: recovery.userMessage, recovery });
}
var plain = (value) => value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function bounded(value, depth = 0) {
  if (depth > 32) throw failure("RESOURCE_LIMIT", "JSON nesting exceeds 32");
  if (value && typeof value === "object") {
    if (!Array.isArray(value) && !plain(value)) throw failure("PARAM_SCHEMA_INVALID", "Plain JSON objects only");
    for (const [key, member] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw failure("PARAM_SCHEMA_INVALID", "Unsafe JSON key");
      bounded(member, depth + 1);
    }
  } else if (!["string", "number", "boolean"].includes(typeof value) && value !== null || typeof value === "number" && !Number.isFinite(value)) {
    throw failure("PARAM_SCHEMA_INVALID", "Finite JSON values required");
  }
  if (depth === 0 && new TextEncoder().encode(JSON.stringify(value)).length > 3 * 1024 * 1024) throw failure("RESOURCE_LIMIT", "Request exceeds 3 MiB");
}
function assertIdentity(context, binding) {
  if (!context || IDENTITY_KEYS.some((key) => typeof context[key] !== "string" || context[key] !== binding[key])) {
    throw failure("INSTANCE_MISMATCH", "Document instance differs from the authorized binding");
  }
}
function validatePayload(payload, binding, scopes) {
  bounded(payload);
  if (!plain(payload) || Object.keys(payload).sort().join(",") !== "args,method" || !plain(payload.args)) throw failure("PARAM_SCHEMA_INVALID", "Expected method and args");
  const { method, args } = payload;
  if (!scopes.includes("cad.read")) throw failure("scope_denied", "CAD read access required");
  if (method === "reliefDesignReference" && !["get", "resource"].includes(args.action ?? "get") && !scopes.includes("cad.edit")) throw failure("scope_denied", "CAD edit access required for reference attachment");
  if (method === "reliefDesignField" && !["get", "candidate"].includes(args.action ?? "get") && !scopes.includes("cad.edit")) throw failure("scope_denied", "CAD edit access required for numerical field tasks");
  if (method === "reliefDesignFit" && (args.action ?? "get") !== "get" && !scopes.includes("cad.edit")) throw failure("scope_denied", "CAD edit access required for numerical fitting tasks");
  if (["reviewLogo", "logoWizard"].includes(method)) {
    const action = args.action ?? "get";
    if (action === "artifacts" && !scopes.includes("cad.export")) throw failure("scope_denied", "CAD export access required");
    if (!["get", "artifacts", ...method === "logoWizard" ? ["attach"] : []].includes(action) && !scopes.includes("cad.edit")) throw failure("scope_denied", "CAD edit access required for contour draft changes");
  }
  if (method === "run") {
    if (Object.keys(args).sort().join(",") !== "context,idempotencyKey,steps" || typeof args.idempotencyKey !== "string" || !args.idempotencyKey.length || args.idempotencyKey.length > 80 || !Array.isArray(args.steps) || !args.steps.length || args.steps.length > LIMITS.batch.maxSteps) throw failure("PARAM_SCHEMA_INVALID", `A run requires 1..${LIMITS.batch.maxSteps} steps`);
    const ids = /* @__PURE__ */ new Set();
    for (const step of args.steps) {
      if (!plain(step) || !["args,id,method", "args,id,method,stage"].includes(Object.keys(step).sort().join(",")) || step.stage !== void 0 && (typeof step.stage !== "string" || !step.stage.trim() || step.stage.length > 80) || typeof step.id !== "string" || !step.id.length || ids.has(step.id) || step.method === "run") throw failure("PARAM_SCHEMA_INVALID", "Unique bounded steps required");
      ids.add(step.id);
      validatePayload({ method: step.method, args: { ...step.args, context: args.context } }, binding, scopes);
    }
  } else if (method === "add" || method === "addMany" || EDIT_METHODS.has(method)) {
    if (!scopes.includes("cad.edit")) throw failure("scope_denied", "CAD edit access required");
    if (method === "execute" && !EDIT_ACTIONS.has(args.action)) throw failure("action_not_allowed", "Action is outside the adapter allowlist");
  } else if (EXPORT_METHODS.has(method)) {
    if (!scopes.includes("cad.export")) throw failure("scope_denied", "CAD export access required");
  } else if (!READ_METHODS.has(method) && !VIEW_METHODS.has(method)) {
    throw failure("method_not_allowed", "Use structured public CAD methods only");
  }
  if (!DISCOVERY_METHODS.has(method)) {
    const contextlessRead = contextPolicy(method) === "none" && READ_METHODS.has(method) && (PAGE_METHOD_SCHEMAS[method] || Object.keys(args).length === 0);
    if (contextlessRead && PAGE_METHOD_SCHEMAS[method]) validatePageInput(method, args);
    if (!contextlessRead) {
      assertIdentity(args.context, binding);
      if (contextPolicy(method) !== "identity" && (!Number.isSafeInteger(args.context.expectedRevision) || args.context.expectedRevision < 0)) throw failure("PARAM_SCHEMA_INVALID", "expectedRevision required");
    }
  }
}

// src/agent/host-adapter.js
function createHostAdapter({ api, session, report, artifact, onStateChange = () => {
}, now = () => Date.now(), wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  if (!api?.connect || !api?.invoke || !api?.getState || typeof report !== "function") throw failure("host_unavailable", "Current public page API and an authorized result channel required");
  const binding = { ...session.binding }, scopes = [...session.scopes];
  let accepting = true, activeTask = null, tail = Promise.resolve();
  const commands = /* @__PURE__ */ new Map();
  const archived = /* @__PURE__ */ new Map();
  const endedTasks = /* @__PURE__ */ new Set();
  const pending = (entry) => !entry.result || entry.result.status === "unknown";
  const indexSteps = (steps) => {
    const methods = /* @__PURE__ */ new Map();
    const visit = (items) => {
      for (const step of items || []) {
        if (step?.id && step?.method) methods.set(step.id, step.method);
        visit(step?.args?.steps);
      }
    };
    visit(steps);
    return methods;
  };
  const samePage = () => assertIdentity(api.getState().context, binding);
  samePage();
  function archiveFinished() {
    for (const [id, entry] of commands) if (endedTasks.has(entry.command.taskId) && entry.reported && !pending(entry)) {
      archived.set(id, { requestHash: entry.command.requestHash, payload: JSON.stringify(entry.command.payload), taskId: entry.command.taskId });
      commands.delete(id);
    }
  }
  async function transfer(entry, result, method) {
    if (result?.attachment?.status === "agent_write_verified" && result.attachment.sha256 === result.sha256 && result.attachment.size === result.size) return result;
    if (artifact && result?.status === "generated" && result.resourceId) {
      try {
        const bytes = await api.files.read({ resourceId: result.resourceId, as: "bytes" });
        let attachment;
        for (let attempt = 0; ; attempt++) {
          try {
            attachment = await artifact(entry.command, result, bytes);
            break;
          } catch (error) {
            error.attempts = error.attempts || attempt + 1;
            if (attempt >= 2 || error.attempts >= 4 || ["HASH_MISMATCH", "SIZE_LIMIT", "ASSET_INVALID", "CANCELLED"].includes(error.code) || [400, 403, 413].includes(error.status)) throw error;
            await wait(300 * 2 ** attempt);
          }
        }
        result = { ...result, attachment };
        if (method === "files.save" && attachment?.status === "agent_write_verified" && attachment.size === result.size && attachment.sha256 === result.sha256) {
          try {
            result.saveConfirmation = await api.files.confirmWritten({ resourceId: result.resourceId, size: attachment.size, sha256: attachment.sha256 });
          } catch (error) {
            result.saveConfirmation = { status: "failed", error: { code: error.code || "SAVE_CONFIRMATION_FAILED", message: error.message } };
          }
        }
      } catch (error) {
        result = { ...result, attachment: { status: "failed", error: { code: "ARTIFACT_TRANSFER_FAILED", cause: error.code, message: error.message, httpStatus: error.status ?? null, attempts: error.attempts ?? 1 } } };
      }
    }
    return result;
  }
  async function finish(entry, result) {
    if (result && typeof result === "object" && !result.status) result = { status: "read", ...result };
    if (result?.status !== "unknown") entry.editing = false;
    entry.resolveExecution?.();
    onStateChange();
    result = withErrorRecovery(await transferTree(entry, result, entry.command.payload.method));
    entry.result = structuredClone(result);
    if (endedTasks.has(entry.command.taskId) && ![...commands.values()].some((item) => item !== entry && item.command.taskId === entry.command.taskId && pending(item))) activeTask = null;
    void sendResult(entry);
    return entry.result;
  }
  async function transferTree(entry, value, method) {
    if (!value || typeof value !== "object") return value;
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Blob) return value;
    if (value.status === "generated" && value.resourceId && EXPORT_METHODS.has(method)) return transfer(entry, value, method);
    if (Array.isArray(value)) {
      const items = [];
      for (const item of value) items.push(await transferTree(entry, item, method));
      return items;
    }
    const output = { ...value };
    if (Array.isArray(value.results)) {
      output.results = [];
      for (const item of value.results) {
        const childMethod = entry.stepMethods.get(item?.id) || method;
        const transferred = item && typeof item === "object" && Object.hasOwn(item, "result") ? { ...item, result: await transferTree(entry, item.result, childMethod) } : await transferTree(entry, item, childMethod);
        output.results.push(transferred);
      }
    }
    for (const [key, child] of Object.entries(value)) if (key !== "results" && child && typeof child === "object") output[key] = await transferTree(entry, child, method);
    return output;
  }
  async function sendResult(entry) {
    if (entry.reported) return true;
    if (entry.resultReportPromise) return entry.resultReportPromise;
    entry.resultReportPromise = (async () => {
      try {
        await report("result", entry.command, { result: entry.result });
        entry.reported = true;
        entry.reportError = null;
        return true;
      } catch (error) {
        entry.reportError = { code: error.code || "RESULT_REPORT_FAILED", message: error.message };
        return false;
      } finally {
        entry.resultReportPromise = null;
        if (endedTasks.has(entry.command.taskId) && ![...commands.values()].some((item) => item.command.taskId === entry.command.taskId && pending(item))) activeTask = null;
        archiveFinished();
        onStateChange();
      }
    })();
    return entry.resultReportPromise;
  }
  async function monitor(entry) {
    let job = api.getJob({ jobId: entry.jobId });
    while (job.status === "queued" || job.status === "running") {
      if (now() >= entry.command.deadline * 1e3) return finish(entry, { status: "unknown", commitState: "unknown", error: { code: "JOB_TIMEOUT", message: "Inspect the original page job; do not replay" }, pageJobId: entry.jobId, context: api.getState().context });
      if (!accepting && job.status === "queued") api.cancelJob({ jobId: entry.jobId });
      const budget = Math.floor(Math.max(0, Math.min(25e3, entry.command.deadline * 1e3 - now())));
      if (typeof api.awaitJob === "function") await api.awaitJob({ jobId: entry.jobId, timeoutMs: budget });
      else if (typeof api.waitFor === "function") await api.waitFor({ jobId: entry.jobId, timeoutMs: Math.floor(Math.max(0, Math.min(25e3, entry.command.deadline * 1e3 - now()))) });
      else await wait(250);
      job = api.getJob({ jobId: entry.jobId });
    }
    return finish(entry, job.result || { status: job.status === "cancelled" ? "failed" : "unknown", error: { code: job.status === "cancelled" ? "JOB_CANCELLED" : "JOB_RESULT_UNAVAILABLE" }, context: api.getState().context });
  }
  async function execute(entry) {
    const command = entry.command;
    try {
      if (!accepting) throw failure("lease_revoked", "Host page control has ended before CAD dispatch");
      if (command.deadline * 1e3 <= now()) throw failure("COMMAND_EXPIRED", "Command deadline passed before CAD dispatch; no page job was submitted");
      if (endedTasks.has(command.taskId)) throw failure("task_ended", "Task control has already ended");
      samePage();
      validatePayload(command.payload, binding, scopes);
      const recoverySave = command.payload.method === "files.save" || command.payload.method === "run" && command.payload.args?.steps?.length === 1 && command.payload.args.steps[0]?.method === "files.save";
      if (!recoverySave && activeTask && command.taskId !== activeTask) throw failure("task_binding_mismatch", "A different task still has running commands");
      if (!recoverySave) activeTask = command.taskId;
      entry.editing = editsDocument(command.payload);
      onStateChange();
      if (JOB_METHODS.has(command.payload.method)) {
        entry.jobId = "wc_" + command.commandId;
        api.submit({ jobId: entry.jobId, method: command.payload.method, args: command.payload.args });
        entry.submitted = true;
        await report("ack", command, { pageJobId: entry.jobId });
        return await monitor(entry);
      }
      await report("ack", command, {});
      return await finish(entry, await api.invoke(command.payload));
    } catch (error) {
      if (entry.submitted && !entry.result) {
        try {
          return await monitor(entry);
        } catch (_) {
        }
        if (!entry.result) return finish(entry, { status: "unknown", commitState: "unknown", error: { code: error.code || "JOB_RESULT_UNAVAILABLE", message: error.message }, pageJobId: entry.jobId, context: api.getState().context });
      }
      if (entry.result) throw error;
      return finish(entry, { status: "failed", commitState: "not_committed", error: { code: error.code || "HOST_FAILED", message: error.message }, context: api.getState().context });
    }
  }
  function receive(command) {
    if (command.protocol !== PROTOCOL || command.cadSessionId !== session.cadSessionId || command.leaseEpoch !== session.leaseEpoch || !/^[a-f0-9]{32}$/.test(command.commandId || "") || typeof command.requestHash !== "string") throw failure("INSTANCE_MISMATCH", "Invalid command envelope");
    const previous = commands.get(command.commandId);
    const saved = archived.get(command.commandId);
    if (saved) {
      if (saved.requestHash !== command.requestHash || saved.payload !== JSON.stringify(command.payload)) throw failure("idempotency_conflict", "Command ID reused with a different payload");
      return Promise.resolve({ status: "already_reported", commandId: command.commandId });
    }
    if (previous) {
      if (JSON.stringify(previous.command.payload) !== JSON.stringify(command.payload) || previous.command.requestHash !== command.requestHash) throw failure("idempotency_conflict", "Command ID reused with a different payload");
      if (previous.result) return sendResult(previous).then(() => previous.result);
      return previous.promise;
    }
    const entry = { command: structuredClone(command) };
    entry.stepMethods = indexSteps(command.payload?.args?.steps);
    const executionDone = new Promise((resolve) => {
      entry.resolveExecution = resolve;
    });
    commands.set(command.commandId, entry);
    const recoverySave = command.payload.method === "files.save" || command.payload.method === "run" && command.payload.args?.steps?.length === 1 && command.payload.args.steps[0]?.method === "files.save";
    if (recoverySave) entry.promise = execute(entry).finally(entry.resolveExecution);
    else {
      entry.promise = tail.then(() => execute(entry)).finally(entry.resolveExecution);
      tail = executionDone;
    }
    return entry.promise;
  }
  function endTask(taskId) {
    endedTasks.add(taskId);
    archiveFinished();
    if (taskId !== activeTask) return;
    for (const entry of commands.values()) if (entry.command.taskId === taskId && entry.jobId && pending(entry)) {
      try {
        api.cancelJob({ jobId: entry.jobId });
      } catch (_) {
      }
    }
    if (![...commands.values()].some((entry) => entry.command.taskId === taskId && pending(entry))) activeTask = null;
  }
  async function reconcilePending() {
    for (const entry of commands.values()) if (entry.submitted && entry.result?.status === "unknown") {
      const job = api.getJob({ jobId: entry.jobId });
      if (!["queued", "running"].includes(job.status) && job.result && job.result.status !== "unknown") await finish(entry, job.result);
    }
  }
  return Object.freeze({
    receive,
    endTask,
    release() {
      accepting = false;
      endTask(activeTask);
    },
    reconcilePending,
    async retryReports() {
      await reconcilePending();
      await Promise.all([...commands.values()].filter((entry) => entry.result && !entry.reported).map(sendResult));
      archiveFinished();
    },
    state() {
      return { accepting, activeTask, editing: accepting && [...commands.values()].some((entry) => entry.editing), pending: [...commands.values()].filter((entry) => pending(entry) || !entry.reported).map((entry) => ({ commandId: entry.command.commandId, pageJobId: entry.jobId || null, deliveryState: entry.reportError ? "retry_pending" : entry.result?.status === "unknown" ? "unknown" : "pending", error: entry.reportError || null })) };
    },
    replay: async (commandId) => {
      const entry = commands.get(commandId);
      if (!entry?.result) throw failure("receipt_unavailable", "Original result not known");
      await report("result", entry.command, { result: entry.result });
      return entry.result;
    }
  });
}
export {
  createHostAdapter
};
