import { makeCatmullClarkSampler, validateSubdCage } from './subd-catmark.js';
import { sewFaces } from './surface-repair.js';

const dispose = value => { try { value?.delete?.(); } catch {} };
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function validateCageOrientation(cage) {
  const directed = new Map();
  for (const face of cage.faces) for (let i = 0; i < 4; i++) {
    const a = face[i], b = face[(i + 1) % 4], k = a < b ? `${a}:${b}` : `${b}:${a}`;
    const list = directed.get(k) ?? []; list.push(`${a}:${b}`); directed.set(k, list);
  }
  for (const [edge, uses] of directed) if (uses.length !== 2 || uses[0] === uses[1]) throw new Error(`faces must be consistently oriented at edge ${edge}`);
  const signed = cage.faces.reduce((sum, f) => {
    const a = cage.vertices[f[0]], b = cage.vertices[f[1]], c = cage.vertices[f[2]], d = cage.vertices[f[3]];
    return sum + dot(a, cross(b, c)) / 6 + dot(a, cross(c, d)) / 6;
  }, 0);
  if (signed < 0) throw new Error('faces must have outward orientation (positive signed cage volume)');
}

function referenceIntegrals(sampler, faceCount, divisions = 32) {
  let area = 0, volume = 0;
  for (let fi = 0; fi < faceCount; fi++) {
    const grid = Array.from({ length: divisions + 1 }, (_, i) => Array.from({ length: divisions + 1 }, (_, j) => sampler.sample(fi, i / divisions, j / divisions)));
    for (let i = 0; i < divisions; i++) for (let j = 0; j < divisions; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      for (const [p, q, r] of [[a, b, c], [a, c, d]]) {
        const pq = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], pr = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
        area += Math.hypot(...cross(pq, pr)) / 2;
        volume += dot(p, cross(q, r)) / 6;
      }
    }
  }
  return { area, volume: Math.abs(volume), divisions };
}

function fitFaceSamples(points, cad, tolerance) {
  const oc = cad.getOC(), rows = points.length, cols = points[0].length;
  let array, fitter, surface, maker, face, wrapped;
  const handles = [];
  try {
    array = new oc.NCollection_Array2_gp_Pnt(1, rows, 1, cols);
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const p = new oc.gp_Pnt(...points[i][j]); handles.push(p); array.SetValue(i + 1, j + 1, p);
    }
    fitter = new oc.GeomAPI_PointsToBSplineSurface(array, 1, 3, oc.GeomAbs_Shape.GeomAbs_C2, tolerance);
    if (!fitter.IsDone()) throw new Error('Catmull–Clark limit patch B-spline fitting failed');
    surface = fitter.Surface(); maker = new oc.BRepBuilderAPI_MakeFace(surface, tolerance);
    if (!maker.IsDone()) throw new Error('Catmull–Clark B-spline face construction failed');
    face = maker.Face(); wrapped = cad.cast(face); face = null;
    const output = wrapped; wrapped = null; return output;
  } finally { handles.forEach(dispose); dispose(wrapped); dispose(face); dispose(maker); dispose(surface); dispose(fitter); dispose(array); }
}

/** Build a real sewn OCCT solid from Catmull–Clark limit samples; never emits a display mesh. */
export function buildSubdBRep(params, cad) {
  const cage = validateSubdCage(params?.cage ?? params);
  validateCageOrientation(cage);
  if (!cad?.getOC?.()) throw new Error('OpenCascade runtime is not initialized');
  const sampleDepth = params?.sampleDepth ?? 5;
  const fitGrid = params?.fitGrid ?? 9;
  const referenceGrid = params?.referenceGrid ?? 32;
  const sewingTolerance = params?.sewingTolerance ?? 0.02;
  const fittingTolerance = params?.fittingTolerance ?? 0.02;
  if(!Number.isInteger(referenceGrid)||referenceGrid<4||referenceGrid>64)throw new Error('referenceGrid须为4–64整数');
  if(cage.faces.length*4**(sampleDepth+1)>200000)throw Object.assign(new Error('细分求值含额外一层精度对照：cage.faces.length * 4 ** (sampleDepth + 1) 超过200000面预算，请降低控制笼密度或采样层级'),{code:'SIZE_LIMIT'});
  if (!Number.isInteger(sampleDepth) || sampleDepth < 3 || sampleDepth > 6) throw new Error('sampleDepth must be an integer in [3,6]');
  if (!Number.isInteger(fitGrid) || fitGrid < 5 || fitGrid > 17) throw new Error('fitGrid must be an integer in [5,17]');
  if (!(sewingTolerance > 0 && sewingTolerance <= .5) || !(fittingTolerance > 0 && fittingTolerance <= .5)) throw new Error('BRep tolerances must be in (0,0.5] mm');
  const sampler = makeCatmullClarkSampler(cage, sampleDepth);
  const faces = [];
  let solid;
  try {
    for (let fi = 0; fi < cage.faces.length; fi++) {
      const points = Array.from({ length: fitGrid }, (_, i) => Array.from({ length: fitGrid }, (_, j) => sampler.sample(fi, i / (fitGrid - 1), j / (fitGrid - 1))));
      faces.push(fitFaceSamples(points, cad, fittingTolerance));
    }
    solid = sewFaces({ faces, tolerance: sewingTolerance, makeSolid: true }, cad);
    const area = cad.measureArea(solid), volume = cad.measureVolume(solid);
    const reference = referenceIntegrals(sampler, cage.faces.length, referenceGrid);
    const volumeRelativeError = Math.abs(volume - reference.volume) / Math.max(reference.volume, 1e-12);
    const areaRelativeError = Math.abs(area - reference.area) / Math.max(reference.area, 1e-12);
    const fineSampler = makeCatmullClarkSampler(cage, sampleDepth + 1);
    let maxLimitSampleError = 0;
    for (let fi = 0; fi < cage.faces.length; fi++) for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      maxLimitSampleError = Math.max(maxLimitSampleError, distance(sampler.sample(fi, i / 4, j / 4), fineSampler.sample(fi, i / 4, j / 4)));
    }
    if (volumeRelativeError >= .02) throw new Error(`SubD BRep volume differs from the refined limit-surface reference by ${(volumeRelativeError * 100).toFixed(3)}% (limit 2%)`);
    const result = solid; solid = null;
    Object.defineProperty(result, 'subdApproximation', { value: { sampleDepth, fitGrid, fittingTolerance, sewingTolerance, area, volume, referenceArea: reference.area, referenceVolume: reference.volume, areaRelativeError, volumeRelativeError, maxLimitSampleError, limitSampleGrid: 5, referenceGrid: reference.divisions, patchCount: faces.length, creaseCount: cage.sharpness.size, representation: 'sewn-occt-bspline-faces' }, enumerable: true });
    return result;
  } finally { dispose(solid); faces.forEach(dispose); }
}

export { referenceIntegrals as integrateSubdLimitReference };
