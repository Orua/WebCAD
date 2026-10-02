import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRoundingQualityEvidence, assertAutomaticPolishingQualityEvidence, isNaturalRoundingTermination} from '../src/modeling/rounding/quality-evidence.js';

const samples = (angleDeg = 0, gapMm = 0) => [0.00001, .2, .5, .8, .99999].map(t => ({t, angleDeg, gapMm}));
const natural = () => ({sourceFaceId: 8, sourceTerminal: true, unselected: true, preservedSupport: true, geometryMatch: 'underlying-surface'});
function measured() {
  return {
    request: {sizeMm: .2, dimensionKind: 'rounding-scale'},
    solid: {valid: true, solidCount: 1, sourceVolumeMm3: 100, resultVolumeMm3: 99},
    material: {direction: 'remove', removedVolumeMm3: 1, addedVolumeMm3: 0},
    generatedFaceIds: [10, 11], boundaryEdgeIds: [1, 2, 3], exemptBoundaries: [],
    seams: [
      {edgeId: 1, adjacentFaceIds: [0, 10], kind: 'support-contact', samples: samples()},
      {edgeId: 2, adjacentFaceIds: [1, 11], kind: 'support-contact', samples: samples()},
      {edgeId: 3, adjacentFaceIds: [10, 11], kind: 'patch-contact', samples: samples()}
    ],
    requiredEndpointIds: ['start', 'end'],
    endpoints: [
      {id: 'start', kind: 'smooth', gapMm: 0, angleDeg: 0, checkedSeamEdgeIds: [1, 2, 3]},
      {id: 'end', kind: 'smooth', gapMm: 0, angleDeg: 0, checkedSeamEdgeIds: [1, 2, 3]}
    ],
    scale: {method: 'BREP-normal-section-contact-width', samplesMm: [.19, .2, .21], minRatio: .75, maxRatio: 1.25},
    locality: {verified: true, method: 'BREP-region-difference', preservedCheckCount: 4, checkedPreservedCount: 4,
      maxOutsideDeviationMm: 0, outsideChangedVolumeMm3: 0}
  };
}
const failure = (value, check) => assert.throws(() => assertRoundingQualityEvidence(value), error =>
  error.code === (check === 'material' ? 'MATERIAL_CHECK_FAILED' : 'GEOMETRY_INVALID') && error.report.failedCheck === check);

test('common evidence gate accepts multiple generated patches with measured seams, ends, size and locality', () => {
  const report = assertRoundingQualityEvidence(measured());
  assert.equal(report.status, 'passed');
  assert.equal(report.generatedFaceCount, 2);
  assert.equal(report.smoothSeamCount, 3);
  assert.equal(report.checkedEndpointCount, 2);
  assert.equal(report.actualMinimumRatio, .95);
  assert.equal(report.dimensionKind, 'rounding-scale');
  assert.match(report.seams, /sampled/);
});

test('contact seams remain mandatory for an open selected-only chain and near its endpoints', () => {
  const value = measured();
  value.seams[0].samples[0].angleDeg = 5.288552;
  failure(value, 'seams');
  value.seams[0].samples = [.2, .5, .8].map(t => ({t, angleDeg: 0, gapMm: 0}));
  failure(value, 'seams');
});

test('a new sharp seam cannot be exempted merely for lying near a terminal', () => {
  const value = measured();
  value.seams[0].kind = 'natural-termination';
  value.seams[0].samples = samples(5.288552);
  value.seams[0].provenance = {distanceToTerminalMm: .01};
  failure(value, 'natural-termination');
  value.seams[0].provenance = {...natural(), unselected: false};
  failure(value, 'natural-termination');
  assert.equal(isNaturalRoundingTermination(natural()), true);
});

test('ordinary fillet may terminate sharply on a proven original unselected box cap', () => {
  const value = measured();
  value.boundaryEdgeIds.push(4);
  value.seams.push({edgeId: 4, adjacentFaceIds: [10, 8], kind: 'natural-termination', samples: samples(90), provenance: natural()});
  value.endpoints[0] = {id: 'start', kind: 'natural-termination', gapMm: 0, checkedSeamEdgeIds: [1, 2], provenance: natural()};
  const report = assertRoundingQualityEvidence(value);
  assert.deepEqual(report.naturalTerminationEdgeIds, [4]);
  assert.equal(report.maxContactAngleDeg, 0);
  assert.equal(report.checkedEndpointCount, 2);
});

test('all generated boundaries and required ends need explicit coverage', () => {
  const omittedBoundary = measured(); omittedBoundary.boundaryEdgeIds.push(4); failure(omittedBoundary, 'coverage');
  const omittedEnd = measured(); omittedEnd.endpoints.pop(); failure(omittedEnd, 'endpoints');
  const unknownEnd = measured(); delete unknownEnd.endpoints[0].angleDeg; failure(unknownEnd, 'endpoints');
  const wrongPatch = measured(); wrongPatch.seams[2].adjacentFaceIds = [0, 10]; failure(wrongPatch, 'coverage');
  const unknownPatch = measured(); unknownPatch.generatedFaceIds.push(12); failure(unknownPatch, 'coverage');
  const periodic = measured(); periodic.boundaryEdgeIds.push(4); periodic.exemptBoundaries.push({edgeId: 4, kind: 'periodic-seam', verified: true});
  assert.equal(assertRoundingQualityEvidence(periodic).checkedBoundaryCount, 4);
});

test('concave material addition is accepted while a convex candidate adding material is rejected', () => {
  const concave = measured(); concave.solid.resultVolumeMm3 = 101;
  concave.material = {direction: 'add', removedVolumeMm3: 0, addedVolumeMm3: 1};
  assert.equal(assertRoundingQualityEvidence(concave).materialDirection, 'add');
  concave.material.direction = 'remove'; failure(concave, 'material');
  const inconsistent = measured(); inconsistent.material.removedVolumeMm3 = .9; failure(inconsistent, 'material');
});

test('mixed material edits require accounting and permission for each local region', () => {
  const value = measured(); value.solid.resultVolumeMm3 = 100.5;
  value.material = {direction: 'mixed', removedVolumeMm3: .5, addedVolumeMm3: 1};
  failure(value, 'material');
  value.material.regions = [
    {direction: 'remove', authorized: true, removedVolumeMm3: .5, addedVolumeMm3: 0},
    {direction: 'add', authorized: true, removedVolumeMm3: 0, addedVolumeMm3: 1}
  ];
  assert.equal(assertRoundingQualityEvidence(value).materialDirection, 'mixed');
});

test('independent BRep volume reconciliation has a reported tolerance distinct from material direction and locality', () => {
  const value = measured();
  value.solid.resultVolumeMm3 += 5.21e-7;
  const report = assertRoundingQualityEvidence(value);
  assert.ok(report.volumeBalanceErrorMm3 > 5.2e-7 && report.volumeBalanceErrorMm3 < 5.22e-7);
  assert.equal(report.volumeToleranceMm3, 1e-7);
  assert.equal(report.volumeBalanceToleranceMm3, 1e-6);
  assert.equal(report.tolerances.volumeMm3, 1e-7);
  assert.equal(report.tolerances.volumeBalanceMm3, 1e-6);
  assert.equal(report.tolerances.positionMm, 1e-5);
  assert.equal(report.tolerances.angleDeg, .1);

  const inconsistent = measured(); inconsistent.solid.resultVolumeMm3 += 1e-5;
  assert.throws(() => assertRoundingQualityEvidence(inconsistent), error =>
    error.code === 'MATERIAL_CHECK_FAILED' && error.report.failedCheck === 'material' &&
    error.report.volumeBalanceErrorMm3 > 9.9e-6 && error.report.volumeBalanceToleranceMm3 === 1e-6 &&
    error.report.volumeToleranceMm3 === 1e-7);
});

test('balance tolerance does not authorize wrong-direction material, near-zero changes or outside-region changes', () => {
  const wrongDirection = measured(); wrongDirection.material.addedVolumeMm3 = 5e-7;
  wrongDirection.solid.resultVolumeMm3 += 5e-7;
  assert.throws(() => assertRoundingQualityEvidence(wrongDirection), error =>
    error.code === 'MATERIAL_CHECK_FAILED' && error.report.volumeBalanceErrorMm3 < 1e-7 &&
    error.report.volumeToleranceMm3 === 1e-7);
  const zeroChange = measured(); zeroChange.material.removedVolumeMm3 = 5e-8;
  zeroChange.solid.resultVolumeMm3 = 100 - 5e-8;
  failure(zeroChange, 'material');
  const changedOutside = measured(); changedOutside.locality.outsideChangedVolumeMm3 = 5e-7;
  failure(changedOutside, 'locality');
});

test('volume reconciliation policy rejects nonfinite or nonpositive tolerances', () => {
  for (const volumeBalanceToleranceMm3 of [NaN, Infinity, 0, -1]) {
    assert.throws(() => assertRoundingQualityEvidence(measured(), {volumeBalanceToleranceMm3}), error =>
      error.code === 'GEOMETRY_INVALID' && error.report.failedCheck === 'policy');
  }
});

test('adaptive scale is measured and bounded without applying a constant-radius requirement', () => {
  const value = measured(); assert.equal(assertRoundingQualityEvidence(value).actualMaximumMm, .21);
  value.scale.samplesMm = [1e-8]; failure(value, 'scale');
  value.scale.samplesMm = [.2]; delete value.scale.minRatio; failure(value, 'scale');
  const tinyContract = measured(); tinyContract.scale.minRatio = 1e-8; tinyContract.scale.samplesMm = [1e-8]; failure(tinyContract, 'scale');
  const exact = measured(); exact.request.dimensionKind = 'exact-radius'; failure(exact, 'scale');
  exact.scale.samplesMm = [.2, .2, .2]; assert.equal(assertRoundingQualityEvidence(exact).dimensionKind, 'exact-radius');
});

test('preserved region evidence cannot be missing, partial, displaced or changed', () => {
  const missing = measured(); delete missing.locality; failure(missing, 'locality');
  const partial = measured(); partial.locality.checkedPreservedCount = 3; failure(partial, 'locality');
  const displaced = measured(); displaced.locality.maxOutsideDeviationMm = .001; failure(displaced, 'locality');
  const changed = measured(); changed.locality.outsideChangedVolumeMm3 = .01; failure(changed, 'locality');
});

test('nonfinite or empty measurements cannot create a committable candidate', () => {
  const normal = measured(); normal.seams[0].samples[0].angleDeg = NaN; failure(normal, 'seams');
  const gap = measured(); gap.seams[0].samples[0].gapMm = Infinity; failure(gap, 'seams');
  const scale = measured(); scale.scale.samplesMm = [NaN]; failure(scale, 'scale');
  const solid = measured(); solid.solid.resultVolumeMm3 = Infinity; failure(solid, 'solid');
  const face = measured(); face.generatedFaceIds = []; failure(face, 'coverage');
});

const effectStations = [.0005, .01, .1, .25, .5, .75, .9, .99, .9995];
function polishing() {
  const value = measured();
  value.request = {dimensionKind: 'automatic-local-scale', materialIntent: 'remove', selectedSourceEdgeIds: [4]};
  value.scope = {declaredBeforeConstruction: true, sourceEdgeIds: [4, 5], marginMm: .3};
  value.material.plannedIntent = 'remove';
  value.material.relatedSourceDihedrals = [{sourceEdgeId: 5, role: 'conditioning-dependency', direction: 'add'}];
  value.seams.forEach(seam => {seam.trueEndpointSamples = [0, 1].map(t => ({t, angleDeg: 0, gapMm: 0}));});
  value.scale = {method: 'actual-source-edge-displacement', samplesMm: [.01, .02]};
  value.selectedEdgeEffects = [{sourceEdgeId: 4, method: 'actual-source-edge-to-all-final-faces',
    samples: effectStations.map(t => ({t, distanceMm: .01})),
    sourceEndpointSamples: [0, 1].map(t => ({t, distanceMm: 0}))}];
  return value;
}
const polishingFailure = (value, check) => assert.throws(() => assertAutomaticPolishingQualityEvidence(value), error =>
  error.report?.qualityGate === 'automatic-polishing-measured-evidence-v3' && error.report.failedCheck === check);

test('v3 records automatic measured scale without requested R or a ratio requirement', () => {
  const value = polishing(); value.scale.samplesMm = [2e-5, 1e-4];
  const report = assertAutomaticPolishingQualityEvidence(value);
  assert.equal(report.method, 'automatic-polishing-measured-evidence-v3');
  assert.equal(report.dimensionKind, 'automatic-local-scale');
  assert.equal(report.actualMinimumMm, 2e-5);
  assert.equal(report.actualMaximumMm, 1e-4);
  assert.equal(report.materialIntent, 'remove');
  assert.equal(report.selectedEdgeEffectCount, 1);
  assert.equal(report.selectedEdgeEffects[0].sourceEndpointSamples[0].distanceMm, 0);
  assert.equal('requestedSizeMm' in report, false);
  assert.equal('actualMinimumRatio' in report, false);
  assert.equal('minimumAdaptiveScaleRatio' in report.tolerances, false);
  assert.equal(report.tolerances.angleDeg, .1);
  assert.equal(report.tolerances.positionMm, 1e-5);
});

test('v3 declared removal permits related shallow concave conditioning without changing primary intent', () => {
  const report = assertAutomaticPolishingQualityEvidence(polishing());
  assert.equal(report.materialDirection, 'remove');
  assert.equal(report.removedVolumeMm3, 1);
  assert.equal(report.addedVolumeMm3, 0);
  const missingIntent = polishing(); delete missingIntent.material.plannedIntent;
  polishingFailure(missingIntent, 'material');
  const mixed = polishing(); mixed.material.direction = 'mixed'; polishingFailure(mixed, 'material');
});

test('v3 reports genuine concave addition and rejects wrong-direction amounts', () => {
  const concave = polishing(); concave.request.materialIntent = 'add';
  concave.material = {direction: 'add', plannedIntent: 'add', removedVolumeMm3: 0, addedVolumeMm3: 1};
  concave.solid.resultVolumeMm3 = 101;
  const report = assertAutomaticPolishingQualityEvidence(concave);
  assert.equal(report.addedVolumeMm3, 1);
  assert.equal(report.materialIntent, 'add');
  const wrong = polishing(); wrong.material.addedVolumeMm3 = 5e-7; wrong.solid.resultVolumeMm3 += 5e-7;
  polishingFailure(wrong, 'material');
});

test('v3 requires every selected edge to change at nine measured stations and records real endpoints', () => {
  const missing = polishing(); missing.selectedEdgeEffects = []; polishingFailure(missing, 'selected-edge-effect');
  const incomplete = polishing(); incomplete.selectedEdgeEffects[0].samples = incomplete.selectedEdgeEffects[0].samples.slice(1, -1);
  polishingFailure(incomplete, 'selected-edge-effect');
  const unchanged = polishing(); unchanged.selectedEdgeEffects[0].samples[4].distanceMm = 1e-6;
  polishingFailure(unchanged, 'selected-edge-effect');
  const nonfinite = polishing(); nonfinite.selectedEdgeEffects[0].samples[4].distanceMm = NaN;
  polishingFailure(nonfinite, 'selected-edge-effect');
  const missingEnd = polishing(); missingEnd.selectedEdgeEffects[0].sourceEndpointSamples.pop();
  polishingFailure(missingEnd, 'selected-edge-effect');
  const nearEnd = polishing(); nearEnd.selectedEdgeEffects[0].samples[0].distanceMm = 1e-7;
  assert.equal(assertAutomaticPolishingQualityEvidence(nearEnd).selectedEdgeEffectCount, 1);
});

test('v3 every new seam and true endpoint remains G0/G1; natural source caps do not exempt it', () => {
  const angle = polishing(); angle.seams[0].trueEndpointSamples[0].angleDeg = .101;
  polishingFailure(angle, 'seams');
  const gap = polishing(); gap.seams[0].trueEndpointSamples[1].gapMm = 2e-5;
  polishingFailure(gap, 'seams');
  const incomplete = polishing(); delete incomplete.seams[0].trueEndpointSamples;
  polishingFailure(incomplete, 'endpoints');
  const naturalCap = polishing(); naturalCap.seams[0].kind = 'natural-termination'; naturalCap.seams[0].provenance = natural();
  polishingFailure(naturalCap, 'seams');
  const naturalEnd = polishing(); naturalEnd.endpoints[0].kind = 'natural-termination'; naturalEnd.endpoints[0].provenance = natural();
  polishingFailure(naturalEnd, 'endpoints');
});

test('v3 local scope and material intent must be declared before construction', () => {
  const late = polishing(); late.scope.declaredBeforeConstruction = false; polishingFailure(late, 'scope');
  const omitted = polishing(); omitted.scope.sourceEdgeIds = [5]; polishingFailure(omitted, 'scope');
  const invalidMargin = polishing(); invalidMargin.scope.marginMm = NaN; polishingFailure(invalidMargin, 'scope');
  const unknownIntent = polishing(); delete unknownIntent.request.materialIntent; polishingFailure(unknownIntent, 'request');
  const wrongDimension = polishing(); wrongDimension.request.dimensionKind = 'automatic-scale'; polishingFailure(wrongDimension, 'request');
  const outside = polishing(); outside.locality.outsideChangedVolumeMm3 = 5e-7; polishingFailure(outside, 'locality');
  const invalidContour = polishing(); invalidContour.scope.constructionContours = [{id: 'main', role: 'primary', sourceEdgeIds: [5]}];
  polishingFailure(invalidContour, 'scope');
  const declaredContours = polishing(); declaredContours.scope.constructionContours = [
    {id: 'main', role: 'primary', sourceEdgeIds: [4]}, {id: 'auxiliary', role: 'conditioning', sourceEdgeIds: [5]}
  ];
  assert.equal(assertAutomaticPolishingQualityEvidence(declaredContours).selectedEdgeEffectCount, 1);
});
