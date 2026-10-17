const key = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const avg = values => scale(values.reduce(add, [0, 0, 0]), 1 / values.length);
const mix = (a, b, t) => add(scale(a, 1 - t), scale(b, t));
function childCoordinates(corner, u, v) {
  if (corner === 0) return [2 * u, 2 * v];
  if (corner === 1) return [2 * v, 2 * (1 - u)];
  if (corner === 2) return [2 * (1 - u), 2 * (1 - v)];
  return [2 * (1 - v), 2 * u];
}

function edgeKey(a, b) { return key(a, b); }

export function validateSubdCage(cage) {
  const vertices = cage?.vertices, faces = cage?.faces;
  const creases = cage?.creases ?? (cage?.sharpness instanceof Map ? [...cage.sharpness].map(([edge, sharpness]) => ({ edge: edge.split(':').map(Number), sharpness })) : []);
  if (!Array.isArray(vertices) || vertices.length < 4 || vertices.length > 1000000) throw new Error('vertices must contain 4–1000000 points');
  if (vertices.some(p => !Array.isArray(p) || p.length !== 3 || p.some(x => !Number.isFinite(x)))) throw new Error('vertices must be finite [x,y,z] triples');
  if (!Array.isArray(faces) || faces.length < 4 || faces.length > 1000000) throw new Error('faces must contain 4–1000000 quads');
  const edgeFaces = new Map(), vertexFaces = vertices.map(() => []), vertexEdges = vertices.map(() => new Set());
  const directedEdges = new Map();
  faces.forEach((face, fi) => {
    if (!Array.isArray(face) || face.length !== 4 || new Set(face).size !== 4 || face.some(i => !Number.isInteger(i) || i < 0 || i >= vertices.length)) throw new Error(`faces[${fi}] must reference four distinct vertices`);
    face.forEach((v, i) => {
      vertexFaces[v].push(fi);
      const k = edgeKey(v, face[(i + 1) % 4]);
      const directions = directedEdges.get(k) ?? []; directions.push(`${v}:${face[(i + 1) % 4]}`); directedEdges.set(k, directions);
      vertexEdges[v].add(k);
      const adjacent = edgeFaces.get(k) ?? [];
      adjacent.push(fi); edgeFaces.set(k, adjacent);
      if (adjacent.length > 2) throw new Error(`non-manifold edge ${k}`);
    });
  });
  for (const [k, adjacent] of edgeFaces) {
    if (adjacent.length !== 2) throw new Error(`control cage must be closed; edge ${k} has ${adjacent.length} incident face(s)`);
    const directions = directedEdges.get(k);
    if (directions[0] === directions[1]) throw new Error(`control cage faces must be consistently oriented at edge ${k}`);
  }
  if (vertexFaces.some(list => list.length < 3)) throw new Error('every cage vertex must have valence at least 3');
  const sharpness = new Map();
  for (const [i, c] of creases.entries()) {
    const e = c?.edge, s = c?.sharpness;
    if (!Array.isArray(e) || e.length !== 2 || e.some(v => !Number.isInteger(v) || v < 0 || v >= vertices.length) || e[0] === e[1]) throw new Error(`creases[${i}].edge must contain two distinct vertex indices`);
    if (!Number.isFinite(s) || s < 0 || s > 1) throw new Error(`creases[${i}].sharpness must be in [0,1]`);
    const k = edgeKey(e[0], e[1]); if (!edgeFaces.has(k)) throw new Error(`crease edge ${k} is not in the cage`);
    if (sharpness.has(k)) throw new Error(`duplicate crease edge ${k}`);
    if (s > 0) sharpness.set(k, s);
  }
  return { vertices: vertices.map(p => [...p]), faces: faces.map(f => [...f]), edgeFaces, vertexFaces, vertexEdges, sharpness };
}

/** One Catmull–Clark step with a persistent [0,1] crease weight. */
export function subdivideCatmullClark(input) {
  const cage = input.edgeFaces instanceof Map ? input : validateSubdCage(input);
  const { vertices, faces, edgeFaces, vertexFaces, vertexEdges, sharpness } = cage;
  const facePoints = faces.map(f => avg(f.map(i => vertices[i])));
  const edges = [...edgeFaces.keys()].map(k => k.split(':').map(Number));
  const edgeIndex = new Map(edges.map(([a, b], i) => [key(a, b), vertices.length + faces.length + i]));
  const points = [...vertices.map(p => [...p]), ...facePoints];
  for (const [i, [a, b]] of edges.entries()) {
    const adjacent = edgeFaces.get(key(a, b));
    const midpoint = mix(vertices[a], vertices[b], 0.5);
    const smooth = scale(add(add(vertices[a], vertices[b]), add(facePoints[adjacent[0]], facePoints[adjacent[1]])), 0.25);
    const s = sharpness.get(key(a, b)) ?? 0;
    points.push(mix(smooth, midpoint, s));
  }
  // The public weight is a persistent [0,1] crease strength. A value of 1
  // therefore stays a true sharp edge through every refinement level.
  const nextCreases = [];
  edges.forEach(([a, b], i) => {
    const s = sharpness.get(key(a, b)) ?? 0;
    if (s > 0) { const ei = edgeIndex.get(key(a, b)); nextCreases.push({ edge: [a, ei], sharpness: s }, { edge: [ei, b], sharpness: s }); }
  });
  const edgePointIndex = new Map(edges.map(([a, b], i) => [key(a, b), vertices.length + faces.length + i]));
  for (let v = 0; v < vertices.length; v++) {
    const incidentFaces = vertexFaces[v], incidentEdges = [...vertexEdges[v]];
    const n = incidentFaces.length;
    const f = avg(incidentFaces.map(fi => facePoints[fi]));
    const r = avg(incidentEdges.map(k => {
      const [a, b] = k.split(':').map(Number); return mix(vertices[a], vertices[b], 0.5);
    }));
    const smooth = scale(add(add(f, scale(r, 2)), scale(vertices[v], n - 3)), 1 / n);
    const sharpNeighbors = incidentEdges.map(k => ({ k, s: sharpness.get(k) ?? 0 })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
    let creasePoint = vertices[v], creaseWeight = 0;
    if (sharpNeighbors.length >= 3) { creaseWeight = sharpNeighbors[2].s; }
    else if (sharpNeighbors.length === 2) {
      const n0 = Number(sharpNeighbors[0].k.split(':').find(x => Number(x) !== v));
      const n1 = Number(sharpNeighbors[1].k.split(':').find(x => Number(x) !== v));
      creasePoint = add(scale(vertices[v], 0.75), scale(add(vertices[n0], vertices[n1]), 0.125));
      creaseWeight = Math.min(sharpNeighbors[0].s, sharpNeighbors[1].s);
    }
    const blend = Math.min(1, creaseWeight);
    points[v] = mix(smooth, creasePoint, blend);
  }
  const nextFaces = [];
  faces.forEach((face, fi) => {
    for (let corner = 0; corner < 4; corner++) {
      const prev = face[(corner + 3) % 4], cur = face[corner], next = face[(corner + 1) % 4];
      nextFaces.push([cur, edgePointIndex.get(key(cur, next)), vertices.length + fi, edgePointIndex.get(key(prev, cur))]);
    }
  });
  const refined = { vertices: points, faces: nextFaces, creases: nextCreases };
  return validateSubdCage(refined);
}

export function refineCatmullClark(cage, levels = 1) {
  if (!Number.isInteger(levels) || levels < 0 || levels > 8) throw new Error('levels must be an integer in [0,8]');
  let current = validateSubdCage(cage);
  for (let i = 0; i < levels; i++) current = subdivideCatmullClark(current);
  return current;
}

/** Evaluate a bounded Catmull–Clark limit sample by following the face's dyadic child. */
export function sampleCatmullClarkLimit(cage, faceIndex, u, v, levels = 6) {
  if (!Number.isInteger(levels) || levels < 0 || levels > 8) throw new Error('levels must be an integer in [0,8]');
  if (![u, v].every(x => Number.isFinite(x) && x >= 0 && x <= 1)) throw new Error('u and v must be in [0,1]');
  if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= cage.faces.length) throw new Error('faceIndex is out of range');
  let current = validateSubdCage(cage), fi = faceIndex, uu = u, vv = v;
  for (let level = 0; level < levels; level++) {
    const ix = uu >= 0.5 ? 1 : 0, iy = vv >= 0.5 ? 1 : 0;
    const corner = iy ? (ix ? 2 : 3) : (ix ? 1 : 0);
    const childFace = fi * 4 + corner;
    current = subdivideCatmullClark(current);
    fi = childFace;
    [uu, vv] = childCoordinates(corner, uu, vv);
  }
  const q = current.faces[fi];
  const [p0, p1, p2, p3] = q.map(i => current.vertices[i]);
  return add(add(scale(p0, (1 - uu) * (1 - vv)), scale(p1, uu * (1 - vv))), add(scale(p2, uu * vv), scale(p3, (1 - uu) * vv)));
}

export function makeCatmullClarkSampler(cage, levels = 5) {
  let current = validateSubdCage(cage), faceMaps = [current];
  for (let i = 0; i < levels + 1; i++) { current = subdivideCatmullClark(current); faceMaps.push(current); }
  const sample = (fi, u, v, depth = levels) => {
    if (!Number.isInteger(fi) || fi < 0 || fi >= cage.faces.length || ![u, v].every(x => Number.isFinite(x) && x >= 0 && x <= 1)) throw new Error('invalid face sample coordinates');
    let index = fi, uu = u, vv = v;
    for (let i = 0; i < depth; i++) {
      const ix = uu >= .5 ? 1 : 0, iy = vv >= .5 ? 1 : 0;
      index = index * 4 + (iy ? (ix ? 2 : 3) : (ix ? 1 : 0));
      [uu, vv] = childCoordinates(iy ? (ix ? 2 : 3) : (ix ? 1 : 0), uu, vv);
    }
    const q = faceMaps[depth].faces[index].map(i => faceMaps[depth].vertices[i]);
    return add(add(scale(q[0], (1 - uu) * (1 - vv)), scale(q[1], uu * (1 - vv))), add(scale(q[2], uu * vv), scale(q[3], (1 - uu) * vv)));
  };
  return { sample, levels, refinedLevels: faceMaps };
}

export { edgeKey };
