import * as cad from 'replicad';
import {measureKernelEdgeFaceNormal} from './kernel-normal.js';

const dispose = value => { try { value?.delete(); } catch {} };
const fail = message => { throw Object.assign(new Error(message), {code:'GEOMETRY_INVALID'}); };
const tuple = value => { try { return value.toTuple(); } finally { dispose(value); } };
export const sharpAngleDeg = 1;
const legacyNormalStations = [.2, .5, .8];
const polishingNormalStations = Object.freeze(Array.from({length: 33}, (_, index) => index / 32));

// Evaluate the actual edge p-curve on each face. Projecting a 3D edge point
// onto a swept/trimmed surface can fail or choose a different surface branch.
function edgeFaceNormal(edge,face,t) {
  const oc=cad.getOC();let curve,uv,props,point,normal;
  try {
    curve=new oc.BRepAdaptor_Curve2d(edge.wrapped,face.wrapped);
    uv=curve.Value(curve.FirstParameter()+t*(curve.LastParameter()-curve.FirstParameter()));
    props=new oc.BRepGProp_Face(face.wrapped,false);point=new oc.gp_Pnt();normal=new oc.gp_Vec();
    props.Normal(uv.X(),uv.Y(),point,normal);
    const value=[normal.X(),normal.Y(),normal.Z()];
    if(value.some(v=>!Number.isFinite(v))||Math.hypot(...value)<1e-12)throw new Error('undefined p-curve normal');
    return value;
  } catch {
    return tuple(face.normalAt(tuple(edge.pointAt(t))));
  } finally {[curve,uv,props,point,normal].forEach(dispose);}
}

// Strict source classification follows the edge's actual p-curve and verifies
// the actual D1 tangent plane. No projection fallback or absolute normal-size
// cutoff is used: small UV derivatives can describe a regular surface.
function strictEdgeFaceNormal(edge, face, t, oc) {
  const actual = measureKernelEdgeFaceNormal(edge, face, t, oc, {positionToleranceMm: 1e-5});
  const measurement = actual.normalMeasurement;
  return {normal: actual.normal, parameter: actual.parameter, uv: actual.uv, gapMm: actual.gapMm,
    relativeJacobian: measurement.relativeJacobian, alignmentAbsDot: measurement.alignmentAbsDot,
    rawNormalMagnitude: measurement.rawNormalMagnitude, duMagnitude: measurement.duMagnitude,
    dvMagnitude: measurement.dvMagnitude, normalMeasurementMethod: measurement.method,
    ...(measurement.analyticSpherePoleCertificate ? {analyticSpherePoleCertificate: measurement.analyticSpherePoleCertificate} : {})};
}

function strictNormalSamples(edge, faces, adjacentFaceIds, stations, periodicSeam, oc) {
  const normalAngleSamples = [], normalMeasurementErrors = [];
  for (const t of stations) {
    const sides = adjacentFaceIds.map(faceId => {
      try {return {faceId, ...strictEdgeFaceNormal(edge, faces[faceId], t, oc)};}
      catch (error) {
        const diagnostic = {t, faceId, code: error?.code || 'GEOMETRY_INVALID',
          message: String(error?.message || error), details: error?.report || null};
        normalMeasurementErrors.push(diagnostic); return {faceId, error: diagnostic};
      }
    });
    if (sides.some(side => side.error)) {
      normalAngleSamples.push({t, status: 'measurement-failed', errors: sides.filter(side => side.error).map(side => side.error)});
      continue;
    }
    // A native periodic seam has one supporting face. Regularity is measured
    // before recording its native non-sharp seam fact, including true ends.
    const angleDeg = periodicSeam ? 0 : Math.acos(Math.min(1, Math.max(-1,
      sides[0].normal.reduce((sum, value, index) => sum + value * sides[1].normal[index], 0)))) * 180 / Math.PI;
    if (!Number.isFinite(angleDeg)) {
      const diagnostic = {t, code: 'GEOMETRY_INVALID', message: 'Actual oriented normal angle is nonfinite.'};
      normalMeasurementErrors.push(diagnostic); normalAngleSamples.push({t, status: 'measurement-failed', errors: [diagnostic]});
      continue;
    }
    normalAngleSamples.push({t, angleDeg, sides});
  }
  const measured = normalAngleSamples.filter(sample => Number.isFinite(sample.angleDeg));
  const maxMeasuredNormalAngleDeg = measured.length ? Math.max(...measured.map(sample => sample.angleDeg)) : null;
  return {normalAngleDeg: normalMeasurementErrors.length ? null : maxMeasuredNormalAngleDeg,
    normalAngleSamples, normalMeasurementErrors,
    normalSampling: {method: 'actual-pcurve-D1-regularity-and-oriented-BRep-normal', stations: [...stations],
      measuredStationCount: measured.length, failedStationCount: normalAngleSamples.length - measured.length,
      maxMeasuredNormalAngleDeg, partialMeasurementsAreDiagnosticOnly: normalMeasurementErrors.length > 0},
    normalMeasurementStatus: normalMeasurementErrors.length ? 'failed' : 'measured'};
}

// Exact BRep adjacency with sampled surface normals; rendering normals are never used.
// The default remains the legacy three-station, 1-degree behavior. Strict
// options are internal measurement controls, not user-visible tolerances.
export function topologyDetails(shape, { connectivityOnly = false, strictNativeNormals = false,
  normalStations = legacyNormalStations, sharpAngleToleranceDeg = sharpAngleDeg } = {}) {
  const faces=shape.faces, edges=shape.edges, boundaries=faces.map(face=>face.edges);
  try {
    if (!connectivityOnly && (typeof strictNativeNormals !== 'boolean' || !Array.isArray(normalStations) || !normalStations.length ||
        normalStations.some(t => !Number.isFinite(t) || t < 0 || t > 1) || new Set(normalStations).size !== normalStations.length ||
        !Number.isFinite(sharpAngleToleranceDeg) || sharpAngleToleranceDeg < 0 || sharpAngleToleranceDeg >= 180)) {
      fail('Invalid internal topology normal stations or sharp-angle threshold.');
    }
    // Hash buckets avoid comparing every source edge with every face edge.
    // isSame is still authoritative: hash collisions never imply adjacency.
    const buckets = new Map();
    edges.forEach((edge,id)=>{const key=edge.hashCode; if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);});
    const adjacency=edges.map(()=>new Set());
    boundaries.forEach((list,faceId)=>list.forEach(boundary=>{
      for(const id of buckets.get(boundary.hashCode)||[]) if(boundary.isSame(edges[id]))adjacency[id].add(faceId);
    }));
    return edges.map((edge,id)=>{
      const adjacentFaceIds=[...adjacency[id]];
      if(connectivityOnly)return {edgeId:id,adjacentFaceIds};
      const box=edge.boundingBox;
      const bounds=box.bounds;dispose(box);
      const degenerate=cad.getOC().BRep_Tool.Degenerated(edge.wrapped);
      const periodicSeam=adjacentFaceIds.length===1&&cad.getOC().BRep_Tool.IsClosed(edge.wrapped,faces[adjacentFaceIds[0]].wrapped);
      let normalAngleDeg=null, strictEvidence=null;
      if(periodicSeam)normalAngleDeg=0;
      if(strictNativeNormals&&(adjacentFaceIds.length===2||periodicSeam)) {
        strictEvidence = strictNormalSamples(edge, faces, adjacentFaceIds, normalStations, periodicSeam, cad.getOC());
        normalAngleDeg = strictEvidence.normalAngleDeg;
      } else if(adjacentFaceIds.length===2){
        try {
          normalAngleDeg=Math.max(...normalStations.map(t=>{
            const normals=adjacentFaceIds.map(i=>edgeFaceNormal(edge,faces[i],t));
            const lengths=normals.map(n=>Math.hypot(...n));
            if(lengths.some(n=>!Number.isFinite(n)||n<1e-12))throw new Error('undefined normal');
            const dot=normals[0].reduce((sum,n,i)=>sum+n*normals[1][i],0)/(lengths[0]*lengths[1]);
            return Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI;
          }));
        } catch { normalAngleDeg=null; }
      }
      if (strictNativeNormals && !strictEvidence) strictEvidence = {
        normalAngleSamples: [], normalMeasurementErrors: [], normalSampling: {
          method: 'actual-pcurve-D1-regularity-and-oriented-BRep-normal', stations: [...normalStations],
          measuredStationCount: 0, failedStationCount: 0, maxMeasuredNormalAngleDeg: null},
        normalMeasurementStatus: degenerate ? 'native-degenerate-boundary' : 'two-sided-normal-angle-unavailable',
        normalMeasurementReason: degenerate ? 'The kernel marks this boundary degenerate; no regular two-sided sharp-angle claim is made.' :
          `A regular two-sided normal angle requires two incident faces; actual incident face count is ${adjacentFaceIds.length}.`
      };
      const sharp = strictNativeNormals && strictEvidence.normalMeasurementErrors.length ? null :
        degenerate ? false : normalAngleDeg === null ? null : normalAngleDeg > sharpAngleToleranceDeg;
      return {edgeId:id, startPoint:tuple(edge.startPoint),endPoint:tuple(edge.endPoint),midpoint:tuple(edge.pointAt(.5)),bounds,
        adjacentFaceIds,degenerate,periodicSeam,normalAngleDeg,sharp,
        ...(strictNativeNormals ? {...strictEvidence, sharpAngleToleranceDeg} : {})};
    });
  } finally {boundaries.flat().forEach(dispose);faces.forEach(dispose);edges.forEach(dispose);}
}

/** Source topology for the current polishing decision: 33 actual stations,
 * including true 0/1, and the unchanged 0.1-degree G1 requirement. Unknown or
 * singular normals remain sharp:null with readable evidence, never tangent. */
export function polishingTopologyDetails(shape) {
  return topologyDetails(shape, {strictNativeNormals: true, normalStations: polishingNormalStations, sharpAngleToleranceDeg: .1});
}
