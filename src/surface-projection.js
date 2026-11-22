const tuple = v => typeof v?.toTuple === 'function' ? v.toTuple() : [v.x, v.y, v.z];
export function projectPointToFace(face, cad, point, hold) {
  const anchor = hold(cad.makeVertex(point)),
    query = hold(new cad.DistanceQuery(face)),
    residualMm = query.distanceTo(anchor),
    p = hold(query.wrapped.PointOnShape1(1)),
    support = hold(cad.cast(query.wrapped.SupportOnShape1(1)));
  let uv, parametricResidualMm;
  if (support instanceof cad.Face) {
    const coordinates = query.wrapped.ParOnFaceS1(1),
      u = coordinates.u,
      v = coordinates.v;
    if (!Number.isFinite(u) || !Number.isFinite(v)) throw new Error('真实曲面投影缺少有限UV');
    const surface = hold(new(cad.getOC().BRepAdaptor_Surface)(face.wrapped, false)),
      evaluated = hold(new(cad.getOC().gp_Pnt)());
    surface.D0(u, v, evaluated);
    parametricResidualMm = Math.hypot(evaluated.X() - p.X(), evaluated.Y() - p.Y(), evaluated.Z() - p.Z());
    uv = [u, v];
  }
  return {
    point: [p.X(), p.Y(), p.Z()],
    residualMm,
    uv,
    parametricResidualMm
  };
}
export function normalAtFace(face, point, hold, uv, cad) {
  let vector;
  if (uv) {
    const oc = cad.getOC(),
      p = hold(new oc.gp_Pnt()),
      normal = hold(new oc.gp_Vec()),
      properties = hold(new oc.BRepGProp_Face(face.wrapped, false));
    properties.Normal(uv[0], uv[1], p, normal);
    vector = [normal.X(), normal.Y(), normal.Z()];
  } else vector = tuple(hold(face.normalAt(point)));
  const length = Math.hypot(...vector);
  if (length < 1e-10) throw new Error('无法构造稳定的沿面标架');
  return vector.map(x => x / length);
}
