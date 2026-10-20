/** Explicit authored constraints -> preview design data. No default artistic guess. */
import { buildDesignProblem } from './domain.mjs';
import { FIELD_LIMITS, validateGridShape, copyMask, createBilinearObservation, solveHeightField } from './field-solver.mjs';
import { applyLocalEdit } from './local-edit.mjs';

function fail(code, message, details = {}) { const e = new Error(message); e.code = code; e.details = details; throw e; }

/**
 * Section heights are explicitly supplied in millimetres. Resampling only linearly
 * interpolates that authored profile. weight is the TOTAL profile weight, shared
 * among the sampled points, so increasing sample density does not multiply it.
 */
export function sectionObservations(grid, profiles) {
  const geometry = validateGridShape(grid);
  const active = copyMask(grid.active, geometry.count, 'active');
  if (!Array.isArray(profiles) || profiles.length > 256) fail('PROFILE_CAPACITY', 'At most 256 profiles.');
  const result = [], ids = new Set();
  let domainChecks = 0;
  const checkLocation = (xMm, yMm, profileId) => {
    if (++domainChecks > 1_000_000) fail('PROFILE_CAPACITY', 'Profile domain-check budget exceeded.');
    const row = createBilinearObservation(geometry, { id: 'domain-check', xMm, yMm, valueMm: 0 });
    if (row.indices.some(i => !active[i])) fail('PROFILE_OUTSIDE', 'A section crosses an inactive interpolation cell.', { profileId, xMm, yMm });
  };
  for (const profile of profiles) {
    if (!profile || typeof profile.id !== 'string' || !profile.id.length || profile.id.length > 96 || ids.has(profile.id)
        || !Array.isArray(profile.points) || profile.points.length < 2 || profile.points.length > 1024
        || !Number.isFinite(profile.spacingMm) || profile.spacingMm <= 0
        || !Number.isFinite(profile.weight) || profile.weight <= 0) fail('PROFILE_INVALID', 'A profile needs a unique id, points, spacingMm, and positive total weight.');
    ids.add(profile.id);
    const points = profile.points;
    const lengths = [], counts = [];
    for (const p of points) if (!p || ![p.xMm, p.yMm, p.valueMm].every(Number.isFinite))
      fail('PROFILE_INVALID', 'Profile coordinates and heights must be finite mm.');
    for (let i = 0; i + 1 < points.length; i++) {
      const length = Math.hypot(points[i + 1].xMm - points[i].xMm, points[i + 1].yMm - points[i].yMm);
      if (!(length > 0) || !Number.isFinite(length)) fail('PROFILE_INVALID', 'Profile segments must have positive finite planar length.');
      lengths.push(length); counts.push(Math.ceil(length / profile.spacingMm));
      // Check every crossed grid cell, even if authored sampling spacing is coarse.
      // Crossing parameters split the segment into pieces each inside one cell.
      const a = points[i], b = points[i + 1], crossings = [0, 1];
      for (const [axis, halfSpan, step, count] of [
        ['xMm', geometry.widthMm / 2, geometry.dxMm, geometry.columns],
        ['yMm', geometry.heightMm / 2, geometry.dyMm, geometry.rows],
      ]) if (a[axis] !== b[axis]) for (let k = 1; k + 1 < count; k++) {
        const t = (-halfSpan + k * step - a[axis]) / (b[axis] - a[axis]);
        if (t > 0 && t < 1) crossings.push(t);
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k < crossings.length; k++) {
        const t = crossings[k];
        checkLocation(a.xMm + t * (b.xMm - a.xMm), a.yMm + t * (b.yMm - a.yMm), profile.id);
        if (k) {
          const midpoint = (crossings[k - 1] + t) / 2;
          checkLocation(a.xMm + midpoint * (b.xMm - a.xMm), a.yMm + midpoint * (b.yMm - a.yMm), profile.id);
        }
      }
    }
    const sampleCount = counts.reduce((a, b) => a + b, 1);
    if (!Number.isSafeInteger(sampleCount) || sampleCount > 4096 || result.length + sampleCount > FIELD_LIMITS.maxObservations)
      fail('PROFILE_CAPACITY', 'Profile sampling exceeds the fixed observation budget.');
    let ordinal = 0;
    for (let segment = 0; segment < lengths.length; segment++) for (let k = segment ? 1 : 0; k <= counts[segment]; k++) {
      const t = k / counts[segment], a = points[segment], b = points[segment + 1];
      const row = createBilinearObservation(grid, {
        id: `section:${profile.id}:${ordinal++}`, xMm: a.xMm + t * (b.xMm - a.xMm), yMm: a.yMm + t * (b.yMm - a.yMm),
        valueMm: a.valueMm + t * (b.valueMm - a.valueMm), weight: profile.weight / sampleCount,
      });
      if (row.indices.some(i => !active[i])) fail('PROFILE_OUTSIDE', 'A section sample crosses an inactive cell.', { profileId: profile.id, sample: k });
      result.push(row);
    }
  }
  return result;
}

export function compileDesignField(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('PIPELINE_INVALID', 'Pipeline options must be an object.');
  const { domain, points = [], profiles = [], solver = {}, edits = [] } = options;
  if (!solver || typeof solver !== 'object' || Array.isArray(solver)) fail('PIPELINE_INVALID', 'Solver options must be an object.');
  const problem = buildDesignProblem(domain);
  if (!Array.isArray(points) || points.length > FIELD_LIMITS.maxObservations || !Array.isArray(edits) || edits.length > 256)
    fail('PIPELINE_CAPACITY', 'Too many points or edits.');
  const observations = points.map(p => createBilinearObservation(problem, p));
  observations.push(...sectionObservations(problem, profiles));
  // Explicit allow-list: a solver option may never replace the derived masks/bounds.
  for (const key of Object.keys(solver)) if (!['smoothWeight', 'maxIterations', 'toleranceMm', 'shouldCancel'].includes(key))
    fail('PIPELINE_OPTION_UNSUPPORTED', `Unknown solver option: ${key}`);
  const solved = solveHeightField({ ...problem, observations, ...solver });
  let field = { ...problem, heightsMm: solved.heightsMm };
  const editReports = [];
  for (const edit of edits) {
    if (solver.shouldCancel?.()) fail('PIPELINE_CANCELLED', 'Cancelled before the next local edit.');
    const applied = applyLocalEdit(field, { ...edit, shouldCancel: solver.shouldCancel });
    field = { ...field, heightsMm: applied.heightsMm }; editReports.push(applied.report);
  }
  return {
    field,
    report: {
      domain: problem.domainReport, solver: solved.report, edits: editReports,
      solverResidualAppliesTo: edits.length ? 'field-before-local-edits' : 'returned-field',
      authoredConstraintSource: 'explicit-mm-points-and-sections',
      geometryKind: 'design-height-field', stage: 'numerical-preview', commitState: 'notCommitted',
      needsArtReview: true, needsGeometryValidation: true, needsManufacturingReview: true,
    },
  };
}
