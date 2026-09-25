// Browser-side geometric facts adapted from text-to-cad/skills/dfam-check.
// The triangles are the viewer tessellation; these estimates are not a slicer verdict.
const DIRECTIONS = [
  ['current_plus_z', 2, 1], ['flip_x_180', 2, -1],
  ['rotate_x_plus_90', 1, 1], ['rotate_x_minus_90', 1, -1],
  ['rotate_y_plus_90', 0, -1], ['rotate_y_minus_90', 0, 1],
];

export function inspectPrintabilityMesh(body, angleLimitDeg = 45) {
  if (!Number.isFinite(angleLimitDeg) || angleLimitDeg <= 0 || angleLimitDeg >= 90)
    throw Object.assign(new Error('angleLimitDeg must be between 0 and 90 degrees'), {code:'PARAM_RANGE_INVALID'});
  const {positions, indices, bounds} = body || {};
  if (!positions || !indices || !bounds || indices.length % 3 || !indices.length || indices.length > 6_000_000)
    throw Object.assign(new Error('Current body has no bounded triangle mesh'), {code:'CAPABILITY_UNAVAILABLE'});
  const dimension = bounds.max.map((value, axis) => value - bounds.min[axis]);
  if (dimension.some(value => !Number.isFinite(value) || value < 0))
    throw Object.assign(new Error('Invalid mesh bounds'), {code:'CAPABILITY_UNAVAILABLE'});
  const directions = DIRECTIONS.map(([id, axis, sign]) => ({id, axis, sign,
    buildHeightMm: dimension[axis], minBuild: sign > 0 ? bounds.min[axis] : -bounds.max[axis],
    overhangAreaMm2:0, supportPrismMm3:0, overhangTriangles:0}));
  let surfaceAreaMm2 = 0, degenerateTriangles = 0;
  const triangleCount = indices.length / 3;
  for (let i = 0; i < indices.length; i += 3) {
    const offsets = [indices[i], indices[i+1], indices[i+2]].map(index => index * 3);
    if (offsets.some(offset => !Number.isSafeInteger(offset) || offset + 2 >= positions.length))
      throw Object.assign(new Error('Mesh index out of range'), {code:'CAPABILITY_UNAVAILABLE'});
    const [a,b,c] = offsets.map(offset => [positions[offset],positions[offset+1],positions[offset+2]]);
    if ([...a,...b,...c].some(value => !Number.isFinite(value)))
      throw Object.assign(new Error('Non-finite mesh coordinate'), {code:'CAPABILITY_UNAVAILABLE'});
    const u=b.map((value,k)=>value-a[k]), v=c.map((value,k)=>value-a[k]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const twiceArea=Math.hypot(...cross);
    if (twiceArea < 1e-12) {degenerateTriangles++;continue;}
    const area=twiceArea/2, center=a.map((value,k)=>(value+b[k]+c[k])/3);
    surfaceAreaMm2 += area;
    for (const direction of directions) {
      const nz=cross[direction.axis]*direction.sign/twiceArea;
      const height=center[direction.axis]*direction.sign-direction.minBuild;
      // The source checker treats faces within 0.1 mm of the build plate as supported.
      if (nz >= -1e-6 || height < 0.1 || Math.acos(Math.min(1,Math.max(-1,-nz)))*180/Math.PI >= angleLimitDeg) continue;
      direction.overhangAreaMm2 += area;
      direction.supportPrismMm3 += area * -nz * height;
      direction.overhangTriangles++;
    }
  }
  const candidates=directions.map(({axis,sign,minBuild,...candidate})=>({
    ...candidate, overhangPercent:surfaceAreaMm2 ? 100*candidate.overhangAreaMm2/surfaceAreaMm2 : 0,
  }));
  return {
    bodyId:body.id, angleLimitDeg, units:{length:'mm',area:'mm^2',volume:'mm^3',angle:'degrees'},
    geometry:{bounds,dimensionsMm:dimension,solidCount:body.solidCount,exactVolumeMm3:body.volume},
    mesh:{triangleCount,degenerateTriangles,surfaceAreaMm2,source:'viewer-tessellation'},
    currentOrientation:candidates[0], orientations:candidates,
    scaleWarning:Math.hypot(...dimension)<1 ? 'Bounding-box diagonal is below 1 mm; verify units.' : null,
    unmeasured:['minimum wall thickness','minimum hole size','powder escape','material/process limits','actual slicer supports'],
  };
}
