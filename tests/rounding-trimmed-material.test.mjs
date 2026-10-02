import test from 'node:test';
import assert from 'node:assert/strict';
import {measureTrimmedFaceInwardRay} from '../src/modeling/rounding/geometry-quality.js';

// These tests exercise the side-selection algorithm with a known finite
// domain. They do not initialize WASM or claim a real BRep geometry result.
function fixture(kind, ambiguous = false) {
  class Coordinates {
    constructor() {this.values = [0, 0, 0];}
    SetCoord(...values) {this.values = values;}
    X() {return this.values[0];} Y() {return this.values[1];} Z() {return this.values[2] || 0;}
    delete() {}
  }
  const coordinate = values => {const result = new Coordinates(); result.SetCoord(...values); return result;};
  class Curve {
    FirstParameter() {return 0;} LastParameter() {return 2 * Math.PI;}
    D1(parameter, point, derivative) {
      if (kind === 'annulus') {point.SetCoord(Math.cos(parameter), Math.sin(parameter)); derivative.SetCoord(-Math.sin(parameter), Math.cos(parameter));}
      else {point.SetCoord(parameter, 2); derivative.SetCoord(1, 0);}
    }
    delete() {}
  }
  class Surface {
    Value(u, v) {return coordinate(kind === 'annulus' ? [u, v, 0] : [Math.cos(u), Math.sin(u), v]);}
    D1(u, v, point, du, dv) {
      point.SetCoord(...(kind === 'annulus' ? [u, v, 0] : [Math.cos(u), Math.sin(u), v]));
      du.SetCoord(...(kind === 'annulus' ? [1, 0, 0] : [-Math.sin(u), Math.cos(u), 0]));
      dv.SetCoord(...(kind === 'annulus' ? [0, 1, 0] : [0, 0, 1]));
    }
    delete() {}
  }
  class Query {
    SetDeflection() {} LoadS1(vertex) {this.point = vertex.point;} LoadS2(face) {this.face = face;}
    Perform() {
      const location = kind === 'annulus' ? Math.hypot(this.point[0], this.point[1]) : this.point[2];
      const low = kind === 'annulus' ? 1 : 0, high = 2;
      this.gap = ambiguous ? 0 : Math.max(low - location, location - high, 0);
    }
    IsDone() {return true;} NbSolution() {return 1;} Value() {return this.gap;}
    SupportOnShape2() {
      const face = this.face, inside = this.gap === 0;
      return {ShapeType: () => inside ? 'FACE' : 'EDGE', IsSame: value => value === face, delete() {}};
    }
    delete() {}
  }
  const oc = {BRepAdaptor_Curve2d: Curve, BRepAdaptor_Surface: Surface,
    gp_Pnt2d: Coordinates, gp_Vec2d: Coordinates, gp_Pnt: Coordinates, gp_Vec: Coordinates,
    BRepExtrema_DistShapeShape: Query, BRep_Tool: {Tolerance: () => 1e-7}, TopAbs_ShapeEnum: {TopAbs_FACE: 'FACE'}};
  const cad = {getOC: () => oc, makeVertex: point => ({wrapped: {point}, delete() {}})};
  const edge = {wrapped: {}, length: 2 * Math.PI, tangentAt(t) {
    return {toTuple: () => [-Math.sin(t * 2 * Math.PI), Math.cos(t * 2 * Math.PI), 0], delete() {}};
  }};
  const face = {wrapped: {}, get center() {throw new Error('whole-face centroid must not be used');}};
  return {cad, edge, face};
}

test('trimmed annulus inner boundary chooses the material side outside the hole', () => {
  const {edge, face, cad} = fixture('annulus'), t = .2;
  const measured = measureTrimmedFaceInwardRay(edge, face, t, .2, cad);
  const expected = [Math.cos(t * 2 * Math.PI), Math.sin(t * 2 * Math.PI), 0];
  assert(Math.hypot(...measured.ray.map((value, i) => value - expected[i])) < 1e-9);
  assert.equal(measured.acceptedSign, -1);
  assert.equal(measured.insideDistanceMm, 0);
  assert(measured.outsideDistanceMm > measured.classificationToleranceMm * 4);
});

test('closed cylindrical wall top boundary chooses the local axial interior', () => {
  const {edge, face, cad} = fixture('cylinder');
  const measured = measureTrimmedFaceInwardRay(edge, face, .5, .2, cad);
  assert(measured.ray.every((value, i) => Math.abs(value - [0, 0, -1][i]) < 1e-12));
  assert.equal(measured.acceptedSign, -1);
  assert.match(measured.method, /trimmed-face/);
});

test('two inside perturbations remain ambiguous and do not select a centroid-based side', () => {
  const {edge, face, cad} = fixture('annulus', true);
  assert.throws(() => measureTrimmedFaceInwardRay(edge, face, .5, .2, cad), error =>
    error.code === 'MATERIAL_CHECK_FAILED' && error.report.failedCheck === 'material' && error.report.trials.length === 3);
});
