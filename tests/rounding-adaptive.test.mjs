import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {getOperation, normalizeOperationPatch} from '../src/operation-registry.js';
import {CadKernel} from '../src/cad-kernel.js';
import {buildRounding} from '../src/modeling/rounding/index.js';
import {planConstantRounding} from '../src/modeling/rounding/planner.js';
import {nativeConstantFillet} from '../src/modeling/rounding/native-fillet.js';
import {topologyDetails} from '../src/modeling/rounding/topology.js';

// Exactly one WASM initialization. All geometry tests in this module run
// serially; document adapters also share this kernel and are disposed before
// creating the replay adapter. No browser or additional native process.
const oc = await init({wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url))});
cad.setOC(oc);
const serial = (name, callback) => test(name, {concurrency: false}, callback);
const dispose = value => { try { value?.delete?.(); } catch {} };
const request = (edgeIds, sizeMm = 0.3) => ({specVersion: 2, sizeMm, scope: {kind: 'edges', edgeIds}});
const ellipseSource = () => cad.drawEllipse(2, 0.6).sketchOnPlane('XY').extrude(1);
const topRows = rows => rows.filter(row => row.sharp && !row.degenerate && !row.periodicSeam
  && Math.abs(row.bounds[0][2] - 1) < 1e-5 && Math.abs(row.bounds[1][2] - 1) < 1e-5);
const topIds = source => {
  const ids = topRows(topologyDetails(source)).map(row => row.edgeId);
  assert(ids.length > 0, 'the source has the declared full top rim');
  return ids;
};

function preciseVolume(shape) {
  const properties = new oc.GProp_GProps();
  try {
    const integralError = oc.BRepGProp.VolumePropertiesGK(shape.wrapped, properties, 1e-9, true, true, false, false, false);
    assert(Number.isFinite(integralError) && integralError >= 0, 'adaptive BREP volume integration completed');
    return Math.abs(properties.Mass());
  } finally {dispose(properties);}
}

function assertCompleteMeasuredQuality(result, {sizeMm, material = 'remove', dimensionKind = 'rounding-scale', closed = true} = {}) {
  const report = result.roundingReport;
  const quality = report?.validation?.quality;
  const evidence = report?.qualityEvidence;
  assert.equal(quality?.status, 'passed', 'the common measured quality gate passed');
  assert.equal(report.dimensionKind, dimensionKind);
  assert.equal(quality.dimensionKind, dimensionKind);
  assert.equal(quality.requestedSizeMm, sizeMm);
  assert.equal(quality.endpoints, 'all-required-measured');
  assert.equal(quality.checkedEndpointCount, evidence.requiredEndpointIds.length);
  assert.equal(quality.materialDirection, material);
  assert.equal(evidence.solid.valid, true);
  assert.equal(evidence.solid.solidCount, 1);
  assert(quality.generatedFaceCount > 0 && quality.checkedBoundaryCount > 0);
  assert.equal(quality.checkedBoundaryCount, evidence.boundaryEdgeIds.length);
  assert.equal(evidence.seams.length + evidence.exemptBoundaries.length, evidence.boundaryEdgeIds.length);
  assert.deepEqual(new Set([...evidence.seams.map(seam => seam.edgeId), ...evidence.exemptBoundaries.map(seam => seam.edgeId)]), new Set(evidence.boundaryEdgeIds));
  if (closed) assert.deepEqual(quality.naturalTerminationEdgeIds, [], 'a closed rim needs no unselected-cap termination exception');
  for (const seam of evidence.seams) {
    assert(seam.samples.length >= 5);
    const stations = seam.samples.map(sample => sample.t);
    assert(Math.min(...stations) <= 0.001 && Math.max(...stations) >= 0.999, 'samples cover both seam ends');
    for (const sample of seam.samples) {
      assert(sample.gapMm <= 1e-5, 'finished BREP seam contacts agree in position');
      if (seam.kind !== 'natural-termination') assert(sample.angleDeg <= 0.1, 'all support and patch seams meet the declared G1 sampling tolerance');
    }
  }
  assert(quality.maxContactAngleDeg <= 0.1);
  assert(quality.maxContactGapMm <= 1e-5);
  if (material === 'remove') {
    assert(quality.removedVolumeMm3 > 1e-7);
    assert(quality.addedVolumeMm3 <= 1e-7);
    assert(quality.resultVolumeMm3 < quality.sourceVolumeMm3);
  }
  assert(quality.actualMinimumMm > 0);
  if (dimensionKind === 'rounding-scale') {
    assert(quality.actualMinimumMm >= sizeMm * 0.35 - 1e-5, 'adaptive result remains visibly within its declared scale interval');
    assert(quality.actualMaximumMm <= sizeMm * 1.0001 + 1e-5);
  } else {
    assert(Math.abs(quality.actualMinimumMm - sizeMm) <= 1e-5);
    assert(Math.abs(quality.actualMaximumMm - sizeMm) <= 1e-5);
  }
  assert.equal(evidence.locality.verified, true);
  assert.equal(evidence.locality.checkedPreservedCount, evidence.locality.preservedCheckCount);
  assert(evidence.locality.preservedCheckCount > 0);
  assert(quality.maxOutsideDeviationMm <= 1e-5 && quality.outsideChangedVolumeMm3 <= 1e-7);
  assert(evidence.locality.differenceChecks.every(check => check.contained === true));
  assert(quality.localityLimitations.length > 0, 'difference containment remains explicitly qualified as a locality measure');
  assert(Math.abs(preciseVolume(result) - quality.resultVolumeMm3) <= 1e-7);
  return quality;
}

function assertBrepRoundtrip(result, expectedVolume) {
  const restored = cad.deserializeShape(result.serialize());
  let analyzer;
  try {
    analyzer = new oc.BRepCheck_Analyzer(restored.wrapped, true);
    assert.equal(analyzer.IsValid(), true, 'serialized final BREP remains valid');
    const solids = restored.solids;
    try { assert.equal(solids.length, 1); } finally {solids.forEach(dispose);}
    assert(Math.abs(preciseVolume(restored) - expectedVolume) <= 1e-7, 'final BREP bytes preserve the measured solid volume');
  } finally {[analyzer, restored].forEach(dispose);}
}

serial('historical v2 size contract reports a genuine native constant-radius result', () => {
  const card = getOperation('rounding');
  assert.equal(card.version, '3.0.0');
  assert.deepEqual(Object.keys(card.historicalInputSchemas[2].properties), ['specVersion', 'sizeMm', 'scope']);
  const source = cad.makeCylinder(4, 8), saved = source.serialize();
  let result;
  try {
    const row = topologyDetails(source).find(candidate => candidate.sharp && Math.abs(candidate.midpoint[2] - 8) < 1e-5);
    assert(row);
    result = buildRounding(source, request([row.edgeId], 0.3));
    assert.equal(result.roundingReport.constructionKind, 'constant-radius');
    const quality = assertCompleteMeasuredQuality(result, {sizeMm: 0.3, dimensionKind: 'exact-radius'});
    assertBrepRoundtrip(result, quality.resultVolumeMm3);
    assert.equal(source.serialize(), saved);
  } finally {[result, source].forEach(dispose);}
});

serial('tight ellipse native R0.3 fails, then the same v2 command builds a measured nonconstant local transition', () => {
  const source = ellipseSource(), saved = source.serialize(), ids = topIds(source);
  let nativeInput, nativeResult, result;
  try {
    nativeInput = cad.deserializeShape(saved);
    const legacy = {specVersion: 1, mode: 'constant', radiusMm: 0.3, scope: {kind: 'edges', edgeIds: topIds(nativeInput)},
      propagation: 'selected-only', boundaryRequirement: 'standard', endpoints: {defaultMode: 'natural'}};
    assert.throws(() => {nativeResult = nativeConstantFillet(nativeInput, legacy, planConstantRounding(nativeInput, legacy));},
      error => ['KERNEL_BUILD_FAILED', 'GEOMETRY_INVALID', 'GEOMETRY_CONFLICT'].includes(error.code));
    assert.equal(source.serialize(), saved, 'the failed native probe used an independent source copy');
    result = buildRounding(source, request(ids, 0.3));
    const report = result.roundingReport;
    assert.equal(report.constructionKind, 'nonconstant-smooth');
    assert.equal(report.requestedSpec.sizeMm, 0.3);
    assert(report.candidateAttempts.some(attempt => attempt.strategy === 'native' && attempt.code === 'KERNEL_BUILD_FAILED'));
    assert(!Object.hasOwn(report.effectiveSpec, 'radiusMm'), 'adaptive contact width is not mislabeled as an exact R');
    assert(report.effectiveSpec.minimumContactWidthMm > 0 && report.effectiveSpec.maximumContactWidthMm <= 0.3 + 1e-5);
    const quality = assertCompleteMeasuredQuality(result, {sizeMm: 0.3});
    assertBrepRoundtrip(result, quality.resultVolumeMm3);
    assert.equal(source.serialize(), saved, 'successful automatic fallback preserves original source bytes');
  } finally {[result, nativeResult?.shape, nativeInput, source].forEach(dispose);}
});

serial('an independent four-Bezier smooth rim must pass the same nonconstant geometry gate', () => {
  // This independent positive regression intentionally fails until this family
  // is actually accepted; no mock geometry, artifact-derived skip, or weakened
  // seam tolerance turns an unsupported construction into a passing test.
  const source = cad.draw([2.2, 0])
    .cubicBezierCurveTo([0, 1.2], [2.2, 0.75], [0.9, 1.2])
    .cubicBezierCurveTo([-1.6, 0], [-0.9, 1.2], [-1.6, 0.55])
    .cubicBezierCurveTo([0, -0.8], [-1.6, -0.55], [-0.7, -0.8])
    .cubicBezierCurveTo([2.2, 0], [0.7, -0.8], [2.2, -0.5])
    .close().sketchOnPlane('XY').extrude(1);
  const saved = source.serialize(); let result;
  try {
    result = buildRounding(source, request(topIds(source), 0.3));
    assert.equal(result.roundingReport.constructionKind, 'nonconstant-smooth');
    const quality = assertCompleteMeasuredQuality(result, {sizeMm: 0.3});
    assertBrepRoundtrip(result, quality.resultVolumeMm3);
    assert.equal(source.serialize(), saved);
  } finally {[result, source].forEach(dispose);}
});

serial('oversized automatic rounding fails with candidate evidence and preserves ellipse source', () => {
  const source = ellipseSource(), saved = source.serialize();
  try {
    assert.throws(() => buildRounding(source, request(topIds(source), 100)), error => {
      assert(['KERNEL_BUILD_FAILED', 'GEOMETRY_INVALID', 'GEOMETRY_CONFLICT', 'MATERIAL_CHECK_FAILED'].includes(error.code));
      assert(Array.isArray(error.report?.candidateAttempts) && error.report.candidateAttempts.length > 0);
      return true;
    });
    assert.equal(source.serialize(), saved);
  } finally {dispose(source);}
});

serial('nonconstant imported-source history supports size edit and native JSON/BREP replay', async () => {
  const source = ellipseSource();
  const sourceBytes = source.serialize(); dispose(source);
  const imports = {ellipse: {format: 'brep', data: Buffer.from(sourceBytes).toString('base64')}};
  const importedFeature = {id: 'source', op: 'import', params: {key: 'ellipse'}, refs: []};
  let kernel = new CadKernel(oc);
  try {
    await kernel.rebuild({version: 1, features: [importedFeature], imports});
    const upstreamBytes = kernel.shapes.get('source').serialize();
    const edgeIds = topRows((await kernel.queryGeometry('source', 'edge', {})).items).map(row => row.edgeId);
    assert(edgeIds.length > 0);
    const roundedFeature = {id: 'rounded', op: 'rounding', params: request(edgeIds, 0.3), refs: ['source']};
    const document = {version: 1, features: [importedFeature, roundedFeature], imports};
    const first = await kernel.rebuild(document);
    assert.equal(first.bodies.length, 1);
    assert.equal(first.bodies[0].roundingReport.constructionKind, 'nonconstant-smooth');
    const firstVolume = assertCompleteMeasuredQuality(kernel.shapes.get('rounded'), {sizeMm: 0.3}).resultVolumeMm3;
    assert.equal(kernel.shapes.get('source').serialize(), upstreamBytes);
    roundedFeature.params = normalizeOperationPatch('rounding', roundedFeature.params, {sizeMm: 0.27});
    await kernel.rebuild(document);
    const edited = kernel.shapes.get('rounded');
    assert.equal(edited.roundingReport.constructionKind, 'nonconstant-smooth');
    const editedVolume = assertCompleteMeasuredQuality(edited, {sizeMm: 0.27}).resultVolumeMm3;
    assert(Math.abs(editedVolume - firstVolume) > 1e-5, 'size edit changes actual material removal');
    assert.equal(kernel.shapes.get('source').serialize(), upstreamBytes);
    const savedDocumentBytes = JSON.stringify(document);
    kernel.dispose(); kernel = null;
    kernel = new CadKernel(oc);
    const reopened = await kernel.rebuild(JSON.parse(savedDocumentBytes));
    assert.equal(reopened.bodies[0].roundingReport.constructionKind, 'nonconstant-smooth');
    const replayVolume = assertCompleteMeasuredQuality(kernel.shapes.get('rounded'), {sizeMm: 0.27}).resultVolumeMm3;
    assert(Math.abs(replayVolume - editedVolume) <= 1e-7, 'saved source bytes and history regenerate the edited result');
    assertBrepRoundtrip(kernel.shapes.get('rounded'), replayVolume);
  } finally {kernel?.dispose();}
});
