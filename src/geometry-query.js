import * as cad from 'replicad';
import { topologyDetails } from './smooth-transition.js';
import { planarFace } from './reference-profile-wires.js';
import {halfLengthPoint} from './arc-length.js';

const dispose = value => { try { value?.delete(); } catch {} };
const surfaceTypes={plane:'plane',cylinder:'cylindre',cylindre:'cylindre',cone:'cone',sphere:'sphere',torus:'torus',bezier:'bezier_surface',bspline:'bspline_surface',revolution:'revolution_surface',extrusion:'extrusion_surface',offset:'offset_surface',other:'other_surface'};
const curveTypes={line:'line',circle:'circle',ellipse:'ellipse',hyperbola:'hyperbola',parabola:'parabola',bezier:'bezier_curve',bspline:'bspline_curve',offset:'offset_curve',other:'other_curve'};
const knownType=(types,value)=>Object.hasOwn(types,value)||Object.values(types).includes(value);
function invalid(path, message) {
  throw Object.assign(new Error(message), { code: 'PARAM_SCHEMA_INVALID', path, recoveryAction: 'READ_TOOL_AND_CORRECT_PARAMS' });
}
function object(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, '筛选必须为对象');
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(`${path}.${key}`, `不支持的筛选字段 ${key}`);
}
function number(value, path, min = 0, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(path, '需要范围内的有限数值');
  return value;
}
function range(value, path) {
  object(value, ['min', 'max'], path);
  if (value.min === undefined && value.max === undefined) invalid(path, '范围至少需要 min 或 max');
  if (value.min !== undefined) number(value.min, `${path}.min`);
  if (value.max !== undefined) number(value.max, `${path}.max`);
  if (value.min !== undefined && value.max !== undefined && value.min > value.max) invalid(path, 'min 不能大于 max');
  return { ...value };
}

// onFaceId is internal only: the command boundary resolves a current face token.
export function normalizeGeometryFilter(kind, filter = {}) {
  if (!['face', 'edge'].includes(kind)) invalid('kind', 'kind 必须为 face 或 edge');
  object(filter, kind === 'face' ? ['surfaceType', 'normal', 'atExtreme','bounds'] : ['curveType', 'lengthRangeMm', 'radiusRangeMm', 'onFaceId','bounds','adjacentSurfaceTypes','loopIndex'], 'filter');
  const result = { ...filter };
  if(filter.bounds!==undefined){
    object(filter.bounds,['min','max','mode','toleranceMm'],'filter.bounds');
    for(const key of ['min','max'])if(!Array.isArray(filter.bounds[key])||filter.bounds[key].length!==3||filter.bounds[key].some(n=>typeof n!=='number'||!Number.isFinite(n)))invalid('filter.bounds.'+key,'边界需要三个有限世界坐标');
    if(filter.bounds.min.some((n,i)=>n>filter.bounds.max[i]))invalid('filter.bounds','min 不得大于 max');
    if(filter.bounds.mode!==undefined&&!['contained','intersects'].includes(filter.bounds.mode))invalid('filter.bounds.mode','选择 contained 或 intersects');
    result.bounds={...filter.bounds,mode:filter.bounds.mode??'contained',toleranceMm:number(filter.bounds.toleranceMm??1e-6,'filter.bounds.toleranceMm')};
  }
  if (kind === 'face') {
    if (filter.surfaceType !== undefined && !knownType(surfaceTypes,filter.surfaceType)) invalid('filter.surfaceType', 'Unknown surface type; read api.query-geometry');
    if (filter.surfaceType !== undefined) result.surfaceType=surfaceTypes[filter.surfaceType]||filter.surfaceType;
    if (filter.normal !== undefined) {
      object(filter.normal, ['direction', 'sameDirection', 'angleToleranceDeg'], 'filter.normal');
      const direction = filter.normal.direction;
      if (!Array.isArray(direction) || direction.length !== 3 || direction.some(v => typeof v !== 'number' || !Number.isFinite(v))) invalid('filter.normal.direction', '法向需要三个有限数值');
      const magnitude = Math.hypot(...direction);
      if (!Number.isFinite(magnitude) || magnitude < 1e-12) invalid('filter.normal.direction', '法向不可为零向量');
      const sameDirection = filter.normal.sameDirection ?? true;
      if (typeof sameDirection !== 'boolean') invalid('filter.normal.sameDirection', 'sameDirection 必须为布尔值');
      result.normal = { direction: direction.map(v => v / magnitude), sameDirection, angleToleranceDeg: number(filter.normal.angleToleranceDeg ?? 0.1, 'filter.normal.angleToleranceDeg', 0, 180) };
    }
    if (filter.atExtreme !== undefined) {
      object(filter.atExtreme, ['axis', 'side', 'toleranceMm'], 'filter.atExtreme');
      if (!['X', 'Y', 'Z'].includes(filter.atExtreme.axis)) invalid('filter.atExtreme.axis', 'axis 必须为 X/Y/Z');
      if (!['min', 'max'].includes(filter.atExtreme.side)) invalid('filter.atExtreme.side', 'side 必须为 min/max');
      result.atExtreme = { ...filter.atExtreme, toleranceMm: number(filter.atExtreme.toleranceMm ?? 0.01, 'filter.atExtreme.toleranceMm') };
    }
  } else {
    if (filter.curveType !== undefined && !knownType(curveTypes,filter.curveType)) invalid('filter.curveType', 'Unknown curve type; read api.query-geometry');
    if (filter.curveType !== undefined) result.curveType=curveTypes[filter.curveType]||filter.curveType;
    for (const key of ['lengthRangeMm', 'radiusRangeMm']) if (filter[key] !== undefined) result[key] = range(filter[key], `filter.${key}`);
    if (filter.onFaceId !== undefined && (!Number.isInteger(filter.onFaceId) || filter.onFaceId < 0)) invalid('filter.onFaceId', '需要已解析的有效面索引');
    if(filter.loopIndex!==undefined&&(!Number.isInteger(filter.loopIndex)||filter.loopIndex<0||filter.onFaceId===undefined))invalid('filter.loopIndex','边界环序号需要当前面选择，且为非负整数');
    if(filter.adjacentSurfaceTypes!==undefined){
      if(!Array.isArray(filter.adjacentSurfaceTypes)||!filter.adjacentSurfaceTypes.length||filter.adjacentSurfaceTypes.length>2||filter.adjacentSurfaceTypes.some(t=>!knownType(surfaceTypes,t)))invalid('filter.adjacentSurfaceTypes','提供一到两个相邻曲面类型');
      result.adjacentSurfaceTypes=filter.adjacentSurfaceTypes.map(t=>surfaceTypes[t]||t);
    }
  }
  return result;
}

function vectorTuple(value) {
  try { return value.toTuple(); } finally { dispose(value); }
}
function faceSummary(face, id, oc) {
  const item = { kind: 'face', topologyId: id, faceId: id, geomType: face.geomType, surfaceType: face.geomType.toLowerCase(), areaMm2: cad.measureArea(face), center: vectorTuple(face.center) };
  const wires=face.wires;
  try { item.wireCount=wires.length; } finally { wires.forEach(dispose); }
  // IGES commonly stores exact planes as BSpline patches. Keep the encoding
  // visible while making geometric plane filters useful for those references.
  item.planar = planarFace(face, cad);
  if (item.planar) {
    const normal = vectorTuple(face.normalAt());
    const magnitude = Math.hypot(...normal);
    item.normal = normal.map(v => v / magnitude);
    item.normalConvention = 'world_topological_orientation';
    // A shell's topology direction is defined, but not necessarily an outward side.
    item.outwardGuaranteed = false;
  }
  if(item.geomType==='BSPLINE_SURFACE'){
    let adaptor,spline;
    try {adaptor=new oc.BRepAdaptor_Surface(face.wrapped,false);spline=adaptor.BSpline();
      item.spline={degreeU:spline.UDegree(),degreeV:spline.VDegree(),poleCountU:spline.NbUPoles(),poleCountV:spline.NbVPoles(),knotCountU:spline.NbUKnots(),knotCountV:spline.NbVKnots(),continuityAssessment:'not_computed'};
    }finally{[spline,adaptor].forEach(dispose);}
  }
  if(item.geomType==='CYLINDRE'){
    let adaptor,cylinder,location,axis,direction;
    try{adaptor=new oc.BRepAdaptor_Surface(face.wrapped,false);cylinder=adaptor.Cylinder();location=cylinder.Location();axis=cylinder.Axis();direction=axis.Direction();item.cylinder={radiusMm:cylinder.Radius(),origin:[location.X(),location.Y(),location.Z()],axis:[direction.X(),direction.Y(),direction.Z()]};}
    finally{[direction,axis,location,cylinder,adaptor].forEach(dispose);}
  }
  return item;
}
function edgeSummary(edge, id, oc) {
  const item = { kind: 'edge', topologyId: id, edgeId: id, geomType: edge.geomType, curveType: edge.geomType.toLowerCase(), lengthMm: cad.measureLength(edge) };
  item.startPoint=vectorTuple(edge.startPoint);
  item.endPoint=vectorTuple(edge.endPoint);
  item.lengthMidpoint=halfLengthPoint(edge,oc,item.lengthMm);
  if (item.geomType === 'BSPLINE_CURVE') {
    let adaptor,spline;
    try {adaptor=new oc.BRepAdaptor_Curve(edge.wrapped);spline=adaptor.BSpline();item.spline={degree:spline.Degree(),poleCount:spline.NbPoles(),knotCount:spline.NbKnots(),continuityAssessment:'not_computed'};}
    finally{[spline,adaptor].forEach(dispose);}
  }
  if (item.geomType === 'CIRCLE') {
    const adaptor = new oc.BRepAdaptor_Curve(edge.wrapped);
    let circle, center, axis, direction;
    try {
      circle = adaptor.Circle(); center = circle.Location(); axis = circle.Axis(); direction = axis.Direction();
      item.radiusMm = circle.Radius();
      item.center = [center.X(), center.Y(), center.Z()];
      item.axis = [direction.X(), direction.Y(), direction.Z()];
    } finally { [direction, axis, center, circle, adaptor].forEach(dispose); }
  }
  return item;
}
function inRange(value, constraint) {
  return !constraint || (value !== undefined && (constraint.min === undefined || value >= constraint.min) && (constraint.max === undefined || value <= constraint.max));
}
function matchesFace(item, filter, bounds) {
  if (filter.surfaceType === 'plane' && !item.planar) return false;
  if (filter.surfaceType && filter.surfaceType !== 'plane' && item.surfaceType !== filter.surfaceType) return false;
  if (filter.normal) {
    if (!item.normal) return false;
    let dot = item.normal.reduce((sum, v, i) => sum + v * filter.normal.direction[i], 0);
    if (!filter.normal.sameDirection) dot = Math.abs(dot);
    if (dot < Math.cos(filter.normal.angleToleranceDeg * Math.PI / 180) - 1e-12) return false;
  }
  if (filter.atExtreme) {
    if (!item.normal) return false;
    const index = ['X', 'Y', 'Z'].indexOf(filter.atExtreme.axis);
    // atExtreme means a supporting principal-axis plane, not a face whose
    // mesh or bounding rectangle happens to touch the body extremum.
    if (Math.abs(Math.abs(item.normal[index]) - 1) > 1e-12) return false;
    const extreme = bounds[filter.atExtreme.side === 'min' ? 0 : 1][index];
    if (Math.abs(item.center[index] - extreme) > filter.atExtreme.toleranceMm + 1e-9) return false;
  }
  return true;
}

/** Query B-Rep topology once; pagination and snapshot identity belong to main. */
export function queryShapeGeometry(shape, oc, kind, filter = {}) {
  const normalized = normalizeGeometryFilter(kind, filter);
  const topology=topologyDetails(shape,{connectivityOnly:kind==='face'});
  const parts = shape[kind === 'face' ? 'faces' : 'edges'];
  let box, faces, boundary,wires,loopEdges=[];
  try {
    let bounds;
    if (normalized.atExtreme) { box = shape.boundingBox; bounds = box.bounds; }
    if (normalized.onFaceId !== undefined) {
      faces = shape.faces;
      if (normalized.onFaceId >= faces.length) invalid('filter.onFaceId', '面索引不属于当前实体');
      wires=faces[normalized.onFaceId].wires;
      loopEdges=wires.map(wire=>wire.edges);
      if(normalized.loopIndex!==undefined&&normalized.loopIndex>=wires.length)invalid('filter.loopIndex','边界环序号不属于当前面');
      boundary = normalized.loopIndex===undefined?faces[normalized.onFaceId].edges:wires[normalized.loopIndex].edges;
    }
    if(kind==='edge'&&!faces)faces=shape.faces;
    const items = [];
    parts.forEach((part, id) => {
      if (boundary && !boundary.some(edge => edge.isSame(part))) return;
      const item = kind === 'face' ? faceSummary(part, id, oc) : edgeSummary(part, id, oc);
      if(kind==='edge'){
        Object.assign(item,topology[id]);item.midpoint=item.lengthMidpoint;
        item.adjacentSurfaceTypes=item.adjacentFaceIds.map(faceId=>faces[faceId].geomType.toLowerCase());
        if(normalized.adjacentSurfaceTypes){const remaining=[...item.adjacentSurfaceTypes];for(const type of normalized.adjacentSurfaceTypes){const index=remaining.indexOf(type);if(index<0)return;remaining.splice(index,1);}}
        if(wires)item.boundaryLoopIndices=loopEdges.flatMap((edges,index)=>edges.some(e=>e.isSame(part))?[index]:[]);
      }
      else item.edgeIds=topology.filter(edge=>edge.adjacentFaceIds.includes(id)).map(edge=>edge.edgeId);
      if(normalized.bounds){
        let bb;try{bb=part.boundingBox;item.bounds=bb.bounds;}finally{dispose(bb);}
        const b=normalized.bounds,t=b.toleranceMm;
        if(![0,1,2].every(i=>b.mode==='contained'?item.bounds[0][i]>=b.min[i]-t&&item.bounds[1][i]<=b.max[i]+t:item.bounds[1][i]>=b.min[i]-t&&item.bounds[0][i]<=b.max[i]+t))return;
      }
      if (kind === 'face') {
        if (!matchesFace(item, normalized, bounds)) return;
      } else {
        if (normalized.curveType && item.curveType !== normalized.curveType) return;
        if (!inRange(item.lengthMm, normalized.lengthRangeMm) || !inRange(item.radiusMm, normalized.radiusRangeMm)) return;
      }
      items.push(item);
    });
    return { kind, matchCount: items.length, items };
  } finally { [...parts, ...(faces || []), ...(boundary || []),...loopEdges.flat(),...(wires||[]), box].forEach(dispose); }
}
