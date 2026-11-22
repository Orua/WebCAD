// Fixed-order BRepGProp quadrature can reverse the apparent material loss on
// trimmed BSpline faces. Keep the signed, span-aware adaptive integral and its
// native relative error estimate together; never turn orientation errors positive.
export function measureSignedVolume(shape, cad, {
  relativeTolerance = 1e-8
} = {}) {
  const oc = cad.getOC(),
    properties = new oc.GProp_GProps();
  try {
    const relativeError = oc.BRepGProp.VolumePropertiesGK(shape.wrapped, properties, relativeTolerance, true, true, false, false, false);
    const volumeMm3 = properties.Mass();
    if (!Number.isFinite(volumeMm3) || !Number.isFinite(relativeError) || relativeError < 0 || relativeError > 1e-6) throw new Error('自适应有向体积积分未收敛');
    return {
      volumeMm3,
      relativeError,
      relativeTolerance,
      method: 'OCCT-BRepGProp-VolumePropertiesGK-span-aware'
    };
  } finally {
    properties.delete();
  }
}
