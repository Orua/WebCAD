const dispose = value => { try { value?.delete?.(); } catch {} };

function validate(params) {
  const points = params?.points;
  if (!Array.isArray(points) || points.length < 3 || points.length > 12) throw new Error('points must contain 3–12 rows');
  const cols = points[0]?.length;
  if (!Number.isInteger(cols) || cols < 3 || cols > 12 || points.some(row => !Array.isArray(row) || row.length !== cols)) throw new Error('points must be a rectangular 3–12 column grid');
  const seen = new Set();
  points.forEach((row, i) => row.forEach((point, j) => {
    if (!Array.isArray(point) || point.length !== 3 || point.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error(`points[${i}][${j}] must be finite [x,y,z]`);
    const key = point.join(','); if (seen.has(key)) throw new Error('duplicate points are not allowed'); seen.add(key);
  }));
  const tolerance = params.tolerance ?? 0.01;
  if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 1e-5 || tolerance > 0.5) throw new Error('tolerance 必须在 1e-5 到 0.5 mm 之间');
  return { points, rows: points.length, cols, tolerance };
}

export function buildFittedSurface(params, cad) {
  const { points, rows, cols, tolerance } = validate(params);
  const oc = cad?.getOC?.();
  if (!oc) throw new Error('OpenCascade runtime is not initialized');
  let array, fitter, surface, maker, face, wrapped, result; const handles = [];
  try {
    array = new oc.NCollection_Array2_gp_Pnt(1, rows, 1, cols);
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const [x, y, z] = points[i][j];
      const point = new oc.gp_Pnt(x, y, z); handles.push(point); array.SetValue(i + 1, j + 1, point);
    }
    const degree = Math.min(3, rows - 1, cols - 1);
    fitter = new oc.GeomAPI_PointsToBSplineSurface(array, 1, degree, oc.GeomAbs_Shape.GeomAbs_C2, tolerance);
    if (!fitter.IsDone()) throw new Error('BSpline surface fitting failed');
    surface = fitter.Surface();
    maker = new oc.BRepBuilderAPI_MakeFace(surface, tolerance);
    if (!maker.IsDone()) throw new Error('fitted surface face construction failed');
    face = maker.Face();
    const checker = new oc.BRepCheck_Analyzer(face, true);
    try { if (!checker.IsValid()) throw new Error('fitted surface face is invalid'); } finally { dispose(checker); }
    wrapped = cad.cast(face);
    face = null; // cad.cast owns the TopoDS handle from this point onward.
    result = cad.makeCompound([wrapped]);
    wrapped = null; // makeCompound consumes its input wrappers.
    if(!(cad.measureArea(result)>1e-9))throw new Error('点阵退化，无法生成有面积的曲面');
    const residuals = [];
    for (const row of points) for (const xyz of row) {
      const vertex = cad.makeVertex(xyz);
      try { residuals.push(cad.measureDistanceBetween(result, vertex)); } finally { dispose(vertex); }
    }
    if (residuals.some(distance => !Number.isFinite(distance) || distance > tolerance + 1e-6)) throw new Error('点阵拟合残差超过 tolerance');
    const complete=result;result=null;return complete;
  } finally { dispose(result);handles.forEach(dispose); dispose(wrapped); dispose(face); dispose(maker); dispose(surface); dispose(fitter); dispose(array); }
}

export { validate as validateFittedSurfaceParams };
