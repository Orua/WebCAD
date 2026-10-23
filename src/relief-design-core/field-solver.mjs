/**
 * Bounded convex design-height solver. All values are millimetres; row 0 is -Y.
 * This is an independent numerical reference implementation, not a BRep kernel.
 * A successful result certifies the stated DISCRETE constraints only.
 */
export const FIELD_LIMITS = Object.freeze({
  maxSide: 257,
  maxNodes: 16_641,
  maxObservations: 65_536,
  maxIterations: 50_000,
  maxWorkUnits: 100_000_000,
});

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
}

const isArray = value => Array.isArray(value)
  || (ArrayBuffer.isView(value) && !(value instanceof DataView));
const clamp = (value, lower, upper) => Math.min(upper, Math.max(lower, value));

/** Shared validation for solver, samplers and the local-edit module. */
export function validateGridShape(grid) {
  if (!grid || typeof grid !== 'object') fail('FIELD_INPUT_INVALID', 'A grid is required.');
  const { columns, rows, widthMm, heightMm } = grid;
  if (![columns, rows].every(value => Number.isInteger(value) && value >= 2))
    fail('FIELD_INPUT_INVALID', 'columns and rows must be integers >= 2.');
  if (columns > FIELD_LIMITS.maxSide || rows > FIELD_LIMITS.maxSide
      || columns * rows > FIELD_LIMITS.maxNodes)
    fail('FIELD_CAPACITY', 'Grid exceeds the numerical prototype budget.', { limits: FIELD_LIMITS });
  if (![widthMm, heightMm].every(value => Number.isFinite(value) && value > 0))
    fail('FIELD_INPUT_INVALID', 'widthMm and heightMm must be finite and positive.');
  const dxMm = widthMm / (columns - 1), dyMm = heightMm / (rows - 1);
  if (![dxMm, dyMm, widthMm / 2, heightMm / 2].every(value => Number.isFinite(value) && value > 0))
    fail('FIELD_INPUT_INVALID', 'Grid spacing is not numerically usable.');
  return { columns, rows, widthMm, heightMm, dxMm, dyMm, count: columns * rows };
}

/** Copies input: callers' source arrays are never modified. */
export function copyFiniteArray(value, count, name) {
  if (!isArray(value) || value.length !== count)
    fail('FIELD_INPUT_INVALID', `${name} must have ${count} entries.`);
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(value[i])) fail('FIELD_INPUT_INVALID', `${name}[${i}] must be finite.`);
    out[i] = value[i];
  }
  return out;
}

export function copyMask(value, count, name) {
  if (!isArray(value) || value.length !== count)
    fail('FIELD_INPUT_INVALID', `${name} must have ${count} entries.`);
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (value[i] !== 0 && value[i] !== 1)
      fail('FIELD_INPUT_INVALID', `${name}[${i}] must be 0 or 1.`);
    out[i] = value[i];
  }
  return out;
}

export function copyBounds(value, count, name) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('FIELD_INPUT_INVALID', `${name} must be finite.`);
    return new Float64Array(count).fill(value);
  }
  return copyFiniteArray(value, count, name);
}

function validateObservations(raw, grid, active) {
  if (!Array.isArray(raw)) fail('FIELD_INPUT_INVALID', 'observations must be an array.');
  if (raw.length > FIELD_LIMITS.maxObservations)
    fail('FIELD_CAPACITY', 'observations exceeds the observation budget.');
  const ids = new Set();
  return raw.map((row, index) => {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string'
        || !row.id.length || row.id.length > 128 || ids.has(row.id))
      fail('FIELD_INPUT_INVALID', `Observation ${index} needs a unique nonempty id.`);
    ids.add(row.id);
    if (!isArray(row.indices) || !isArray(row.coefficients)
        || row.indices.length < 1 || row.indices.length > 4
        || row.coefficients.length !== row.indices.length)
      fail('FIELD_INPUT_INVALID', `Observation ${row.id} needs 1–4 matching indices/coefficients.`);
    if (!Number.isFinite(row.valueMm) || !Number.isFinite(row.weight) || row.weight < 0)
      fail('FIELD_INPUT_INVALID', `Observation ${row.id} has an invalid target or weight.`);
    const seen = new Set();
    const indices = Array.from(row.indices), coefficients = Array.from(row.coefficients);
    indices.forEach((i, k) => {
      if (!Number.isInteger(i) || i < 0 || i >= grid.count || seen.has(i)
          || !active[i] || !Number.isFinite(coefficients[k]) || coefficients[k] === 0)
        fail('FIELD_INPUT_INVALID', `Observation ${row.id} has an invalid, duplicate or inactive term.`);
      seen.add(i);
    });
    return { id: row.id, indices, coefficients, valueMm: row.valueMm, weight: row.weight };
  });
}

/**
 * A bilinear physical-location observation is soft. No nearest-node snapping.
 * Exactly grid-aligned coordinates naturally reduce to a one-node observation.
 */
export function createBilinearObservation(gridInput, observation = {}) {
  const grid = validateGridShape(gridInput);
  if (!observation || typeof observation !== 'object' || Array.isArray(observation))
    fail('FIELD_INPUT_INVALID', 'An observation object is required.');
  const { id, xMm, yMm, valueMm, weight = 1 } = observation;
  if (typeof id !== 'string' || !id.length || id.length > 128 || ![xMm, yMm, valueMm, weight].every(Number.isFinite)
      || weight < 0)
    fail('FIELD_INPUT_INVALID', 'A finite location/target/weight and nonempty id are required.');
  if (xMm < -grid.widthMm / 2 || xMm > grid.widthMm / 2
      || yMm < -grid.heightMm / 2 || yMm > grid.heightMm / 2)
    fail('FIELD_SAMPLE_OUTSIDE', 'The sample lies outside the physical grid frame.', { xMm, yMm });
  // Samples placed on a grid node must hit that node exactly: floating round-off (u = 49.9999999…) would
  // otherwise add a ~1e-15 term on the neighbouring node, which may be inactive near a curved support rim.
  const snap = t => { const r = Math.round(t); return Math.abs(t - r) < 1e-9 ? r : t; };
  const u = snap((xMm + grid.widthMm / 2) / grid.dxMm);
  const v = snap((yMm + grid.heightMm / 2) / grid.dyMm);
  const i = Math.min(grid.columns - 2, Math.floor(u));
  const j = Math.min(grid.rows - 2, Math.floor(v));
  const a = Math.min(1, Math.max(0, u - i)), b = Math.min(1, Math.max(0, v - j));
  const terms = [
    [j * grid.columns + i, (1 - a) * (1 - b)],
    [j * grid.columns + i + 1, a * (1 - b)],
    [(j + 1) * grid.columns + i, (1 - a) * b],
    [(j + 1) * grid.columns + i + 1, a * b],
  ].filter(([, coefficient]) => coefficient !== 0);
  return { id, indices: terms.map(([i]) => i), coefficients: terms.map(([, c]) => c), valueMm, weight };
}

export function sampleHeightField(field, xMm, yMm) {
  const grid = validateGridShape(field);
  const values = copyFiniteArray(field.heightsMm, grid.count, 'heightsMm');
  const active = copyMask(field.active, grid.count, 'active');
  const observation = createBilinearObservation(grid, { id: 'sample', xMm, yMm, valueMm: 0 });
  if (observation.indices.some(i => !active[i]))
    fail('FIELD_SAMPLE_OUTSIDE', 'The interpolation cell crosses an inactive sample.', { xMm, yMm });
  return observation.indices.reduce((sum, i, k) => sum + values[i] * observation.coefficients[k], 0);
}

function connectedAnchorCheck(grid, active, fixed, edges, observations) {
  const parent = Int32Array.from({ length: grid.count }, (_, i) => i);
  const rank = new Uint8Array(grid.count);
  const find = i => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const join = (a, b) => {
    a = find(a); b = find(b);
    if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a]++;
  };
  // Only smoothing edges determine the geometric constant-mode components.
  // A sparse observation MUST NOT merge islands and hide relative zero modes.
  edges.forEach(edge => join(edge.a, edge.b));
  const components = new Map();
  for (let i = 0; i < grid.count; i++) if (active[i]) {
    const key = find(i), component = components.get(key) ?? { sample: i, freeCount: 0, anchored: false };
    if (fixed[i]) component.anchored = true; else component.freeCount++;
    components.set(key, component);
  }
  // Conservatively prove absolute anchoring of every constant mode. Each row
  // can prove one mode when every other mode in that row is already anchored.
  // General full-rank mixed systems that cannot be peeled this way are rejected
  // rather than silently adding a regularizer or selecting by initial guess.
  const remainingRows = [], rowsByComponent = new Map(), queue = [];
  for (const row of observations) if (row.weight > 0) {
    const sums = new Map();
    row.indices.forEach((i, k) => {
      const key = find(i), term = sums.get(key) ?? { sum: 0, magnitude: 0 };
      term.sum += row.coefficients[k]; term.magnitude += Math.abs(row.coefficients[k]);
      if (!Number.isFinite(term.sum) || !Number.isFinite(term.magnitude))
        fail('FIELD_NUMERICAL', 'Observation constant-mode coefficients overflowed.', { id: row.id });
      sums.set(key, term);
    });
    const unresolved = new Set();
    let uncertain = false;
    for (const [key, { sum, magnitude }] of sums) if (!components.get(key).anchored && sum !== 0) {
      if (Math.abs(sum) <= 1e-12 * magnitude) uncertain = true;
      unresolved.add(key);
    }
    // Never delete a small-but-nonzero coupling and then claim a proof using
    // the simplified row. The entire ambiguous row is unusable as an anchor.
    if (uncertain) continue;
    const rowIndex = remainingRows.length; remainingRows.push(unresolved);
    for (const key of unresolved) {
      const incident = rowsByComponent.get(key) ?? []; incident.push(rowIndex); rowsByComponent.set(key, incident);
    }
    if (unresolved.size === 1) queue.push(rowIndex);
  }
  while (queue.length) {
    const unresolved = remainingRows[queue.pop()];
    if (unresolved.size !== 1) continue;
    const key = unresolved.values().next().value;
    components.get(key).anchored = true;
    for (const rowIndex of rowsByComponent.get(key) ?? []) {
      const row = remainingRows[rowIndex]; row.delete(key);
      if (row.size === 1) queue.push(rowIndex);
    }
  }
  const unanchored = [...components.values()].filter(c => c.freeCount && !c.anchored);
  if (unanchored.length)
    fail('FIELD_UNANCHORED', 'Absolute-height anchoring of every free component could not be proved.', {
      components: unanchored, reason: 'constant-mode-anchor-not-proven',
      remedy: 'Supply fixed nodes or independent absolute observations for each remaining component.',
    });
  return components.size;
}

function createProblem(input) {
  const grid = validateGridShape(input), n = grid.count;
  const initial = copyFiniteArray(input.initialMm, n, 'initialMm');
  const active = copyMask(input.active, n, 'active');
  const fixed = copyMask(input.fixedMask, n, 'fixedMask');
  const fixedMm = copyFiniteArray(input.fixedMm, n, 'fixedMm');
  const lower = copyBounds(input.lowerMm, n, 'lowerMm'), upper = copyBounds(input.upperMm, n, 'upperMm');
  const smoothWeight = input.smoothWeight ?? 1;
  if (!Number.isFinite(smoothWeight) || smoothWeight < 0)
    fail('FIELD_INPUT_INVALID', 'smoothWeight must be finite and nonnegative.');
  const maxIterations = input.maxIterations ?? 20_000, toleranceMm = input.toleranceMm ?? 1e-8;
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > FIELD_LIMITS.maxIterations)
    fail('FIELD_CAPACITY', 'maxIterations is outside the numerical prototype budget.');
  if (!Number.isFinite(toleranceMm) || toleranceMm <= 0)
    fail('FIELD_INPUT_INVALID', 'toleranceMm must be finite and positive.');
  if (input.shouldCancel !== undefined && typeof input.shouldCancel !== 'function')
    fail('FIELD_INPUT_INVALID', 'shouldCancel must be a function.');
  let activeCount = 0, freeCount = 0, initialProjectionCount = 0;
  const x = new Float64Array(initial), free = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (lower[i] > upper[i]) fail('FIELD_CONSTRAINT_CONFLICT', 'A lower bound exceeds an upper bound.', { index: i });
    if (!active[i]) {
      if (fixed[i] && fixedMm[i] !== initial[i])
        fail('FIELD_CONSTRAINT_CONFLICT', 'An inactive node cannot change to a different fixed height.', { index: i });
      if (initial[i] < lower[i] || initial[i] > upper[i])
        fail('FIELD_CONSTRAINT_CONFLICT', 'An unchanged inactive node lies outside its bounds.', { index: i });
      continue;
    }
    activeCount++;
    if (fixed[i]) {
      if (fixedMm[i] < lower[i] || fixedMm[i] > upper[i])
        fail('FIELD_CONSTRAINT_CONFLICT', 'A fixed height violates its bounds.', { index: i });
      x[i] = fixedMm[i];
    } else if (lower[i] === upper[i]) {
      fixed[i] = 1; x[i] = fixedMm[i] = lower[i];
    } else {
      x[i] = clamp(initial[i], lower[i], upper[i]);
      if (x[i] !== initial[i]) initialProjectionCount++;
      free[i] = 1; freeCount++;
    }
  }
  if (!activeCount) fail('FIELD_EMPTY_DOMAIN', 'The grid has no active design node.');
  const observations = validateObservations(input.observations ?? [], grid, active);
  const edges = [];
  if (smoothWeight > 0) {
    const wx = smoothWeight / (grid.dxMm * grid.dxMm), wy = smoothWeight / (grid.dyMm * grid.dyMm);
    if (![wx, wy].every(value => Number.isFinite(value) && value > 0))
      fail('FIELD_NUMERICAL', 'Physical spacing and smoothing weight produce unusable coefficients.');
    for (let j = 0; j < grid.rows; j++) for (let i = 0; i < grid.columns; i++) {
      const a = j * grid.columns + i;
      if (!active[a]) continue;
      if (i + 1 < grid.columns && active[a + 1]) edges.push({ a, b: a + 1, weight: wx });
      if (j + 1 < grid.rows && active[a + grid.columns]) edges.push({ a, b: a + grid.columns, weight: wy });
    }
  }
  const componentCount = connectedAnchorCheck(grid, active, fixed, edges, observations);
  const rowBound = new Float64Array(n);
  edges.forEach(({ a, b, weight }) => {
    if (free[a]) rowBound[a] += weight * (free[b] ? 2 : 1);
    if (free[b]) rowBound[b] += weight * (free[a] ? 2 : 1);
  });
  observations.forEach(row => {
    if (!row.weight) return;
    const sum = row.indices.reduce((s, i, k) => s + (free[i] ? Math.abs(row.coefficients[k]) : 0), 0);
    row.indices.forEach((i, k) => { if (free[i]) rowBound[i] += row.weight * Math.abs(row.coefficients[k]) * sum; });
  });
  let lipschitz = 0;
  for (const value of rowBound) lipschitz = Math.max(lipschitz, value);
  if (!Number.isFinite(lipschitz) || (freeCount && lipschitz <= 0))
    fail('FIELD_NUMERICAL', 'The free-variable Hessian has unusable scale.');
  const workPerEvaluation = n + edges.length * 4
    + observations.reduce((sum, row) => sum + row.indices.length * 2 + 1, 0);
  return { ...grid, initial, active, fixed, fixedMm, lower, upper, x, free, observations, edges,
    maxIterations, toleranceMm, lipschitz, freeCount, activeCount, componentCount,
    initialProjectionCount, workPerEvaluation, shouldCancel: input.shouldCancel };
}

function evaluate(problem, x, gradient) {
  gradient.fill(0);
  let objective = 0;
  for (const { a, b, weight } of problem.edges) {
    const difference = x[a] - x[b], derivative = weight * difference;
    objective += 0.5 * derivative * difference;
    if (problem.free[a]) gradient[a] += derivative;
    if (problem.free[b]) gradient[b] -= derivative;
  }
  for (const row of problem.observations) {
    if (!row.weight) continue;
    const predicted = row.indices.reduce((sum, i, k) => sum + x[i] * row.coefficients[k], 0);
    const residual = predicted - row.valueMm, derivative = row.weight * residual;
    objective += 0.5 * derivative * residual;
    row.indices.forEach((i, k) => { if (problem.free[i]) gradient[i] += derivative * row.coefficients[k]; });
  }
  if (!Number.isFinite(objective) || gradient.some(value => !Number.isFinite(value)))
    fail('FIELD_NUMERICAL', 'Nonfinite objective or derivative; rescale the numerical problem.');
  return objective;
}

function report(problem, x, iterations, objective, projectedResidualMm, workUnits) {
  let minHeightMm = Infinity, maxHeightMm = -Infinity, maxBoundViolationMm = 0;
  let maxFixedChangeMm = 0, maxInactiveChangeMm = 0;
  for (let i = 0; i < problem.count; i++) {
    if (problem.active[i]) {
      minHeightMm = Math.min(minHeightMm, x[i]); maxHeightMm = Math.max(maxHeightMm, x[i]);
      maxBoundViolationMm = Math.max(maxBoundViolationMm, problem.lower[i] - x[i], x[i] - problem.upper[i]);
      if (problem.fixed[i]) maxFixedChangeMm = Math.max(maxFixedChangeMm, Math.abs(x[i] - problem.fixedMm[i]));
    } else maxInactiveChangeMm = Math.max(maxInactiveChangeMm, Math.abs(x[i] - problem.initial[i]));
  }
  const observationResiduals = problem.observations.map(row => {
    const predictedMm = row.indices.reduce((sum, i, k) => sum + x[i] * row.coefficients[k], 0);
    if (!Number.isFinite(predictedMm) || !Number.isFinite(predictedMm - row.valueMm))
      fail('FIELD_NUMERICAL', 'An observation residual is nonfinite.', { id: row.id });
    return { id: row.id, targetMm: row.valueMm, predictedMm, residualMm: predictedMm - row.valueMm,
      weight: row.weight, constraintType: 'soft-linear-observation' };
  });
  const positiveRows = observationResiduals.filter(row => row.weight > 0);
  const sumWeight = positiveRows.reduce((sum, row) => sum + row.weight, 0);
  const sumSquared = positiveRows.reduce((sum, row) => sum + row.weight * row.residualMm ** 2, 0);
  if (!Number.isFinite(sumWeight) || !Number.isFinite(sumSquared))
    fail('FIELD_NUMERICAL', 'Observation residual statistics overflowed.');
  return {
    status: 'converged', method: 'box-constrained-projected-gradient',
    objective: 'weighted-linear-observations-plus-physical-grid-gradient-energy',
    iterations, objectiveValue: objective, projectedResidualMm, toleranceMm: problem.toleranceMm,
    lipschitzUpperBound: problem.lipschitz, workUnits, componentCount: problem.componentCount,
    activeNodeCount: problem.activeCount, freeNodeCount: problem.freeCount,
    initialProjectionCount: problem.initialProjectionCount,
    minHeightMm, maxHeightMm, extremaScope: 'active-grid-nodes-only',
    maxBoundViolationMm, maxFixedChangeMm, maxInactiveChangeMm,
    observationResiduals,
    maxObservationResidualMm: positiveRows.reduce((value, row) => Math.max(value, Math.abs(row.residualMm)), 0),
    weightedRmsObservationResidualMm: sumWeight ? Math.sqrt(sumSquared / sumWeight) : 0,
    guarantees: ['finite-grid-heights', 'discrete-fixed-values', 'discrete-box-bounds', 'inactive-values-unchanged'],
    globalContinuousErrorBound: null, uniquenessCertified: false,
    likenessStatus: 'not-evaluated', manufacturingStatus: 'not-evaluated',
    geometryKind: 'design-height-field', commitState: 'notCommitted',
  };
}

/**
 * Finds a discrete stationary point of a convex bounded quadratic.
 * Projected residual is ||x-P_box(x-gradient/L)||_infinity, in mm.
 * It is NOT a distance-to-the-exact-minimizer guarantee or an artistic metric.
 */
export function solveHeightField(input) {
  if (input?.shouldCancel !== undefined && typeof input.shouldCancel !== 'function')
    fail('FIELD_INPUT_INVALID', 'shouldCancel must be a function.');
  if (input?.shouldCancel?.()) fail('FIELD_CANCELLED', 'Design solve cancelled before work.');
  const problem = createProblem(input), x = problem.x;
  const gradient = new Float64Array(problem.count), next = new Float64Array(problem.count);
  let workUnits = 0, projectedResidualMm = Infinity, objective = 0;
  for (let iteration = 0; iteration <= problem.maxIterations; iteration++) {
    if (problem.shouldCancel?.()) fail('FIELD_CANCELLED', 'Design solve cancelled.', { iterations: iteration, workUnits });
    workUnits += problem.workPerEvaluation;
    if (workUnits > FIELD_LIMITS.maxWorkUnits)
      fail('FIELD_CAPACITY', 'Numerical work budget exhausted.', { iterations: iteration, workUnits, projectedResidualMm });
    objective = evaluate(problem, x, gradient);
    projectedResidualMm = 0;
    for (let i = 0; i < problem.count; i++) {
      next[i] = problem.free[i] ? clamp(x[i] - gradient[i] / problem.lipschitz, problem.lower[i], problem.upper[i]) : x[i];
      if (!Number.isFinite(next[i])) fail('FIELD_NUMERICAL', 'A nonfinite iterate was produced.', { index: i });
      projectedResidualMm = Math.max(projectedResidualMm, Math.abs(next[i] - x[i]));
    }
    if (projectedResidualMm <= problem.toleranceMm)
      return { heightsMm: new Float64Array(x), report: report(problem, x, iteration, objective, projectedResidualMm, workUnits) };
    if (iteration === problem.maxIterations) break;
    x.set(next);
  }
  fail('FIELD_NOT_CONVERGED', 'Design solve did not reach its declared residual tolerance.', {
    iterations: problem.maxIterations, projectedResidualMm, toleranceMm: problem.toleranceMm,
    objectiveValue: objective, workUnits, commitState: 'notCommitted',
  });
}
