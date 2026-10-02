// This module evaluates measured BRep evidence; it does not measure geometry.
// In particular, a candidate's success flag is not a substitute for evidence.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const unique = values => Array.isArray(values) && new Set(values).size === values.length;
const edgeId = value => Number.isInteger(value) && value >= 0;

function reject(check, message, details = {}, code = 'GEOMETRY_INVALID') {
  throw Object.assign(new Error(message), {
    code,
    recoveryAction: 'CORRECT_PARAMETERS',
    report: {qualityGate: 'rounding-measured-evidence-v1', failedCheck: check, ...details}
  });
}

function nonnegative(value, check, field) {
  if (!finite(value) || value < 0) reject(check, `${field} 缺少有效量测`, {[field]: value}, check === 'material' ? 'MATERIAL_CHECK_FAILED' : 'GEOMETRY_INVALID');
  return value;
}

// An ordinary open fillet may finish sharply on the original, unselected cap.
// Distance to a source endpoint alone never authorizes a sharp new boundary.
export function isNaturalRoundingTermination(provenance) {
  return !!provenance && edgeId(provenance.sourceFaceId) &&
    provenance.sourceTerminal === true && provenance.unselected === true &&
    provenance.preservedSupport === true &&
    ['identity', 'underlying-surface'].includes(provenance.geometryMatch);
}

function ids(values, check, field) {
  if (!unique(values) || values.some(value => !edgeId(value))) {
    reject(check, `${field} 必须是完整且不重复的当前拓扑编号`, {[field]: values});
  }
  return values;
}

/**
 * Common v2 candidate gate. All lengths are mm and all angles are degrees.
 *
 * Evidence must come from the finished, trimmed/sewn result, rather than the
 * untrimmed construction surface. The adapter must enumerate every generated
 * face boundary and every required source/patch endpoint before calling this.
 * Sampling is reported as sampling, never as a global G1 or G2 proof.
 */
export function assertRoundingQualityEvidence(evidence, options = {}) {
  return assertQualityEvidence(evidence, options, false);
}

// V3 is automatic local polishing. The source planner declares the material
// intent and dependency region before construction. Size is observed geometry,
// not a requested circular radius. Original caps do not exempt new sharp seams.
export function assertAutomaticPolishingQualityEvidence(evidence, options = {}) {
  try {return assertQualityEvidence(evidence, options, true);}
  catch (error) {
    if (error?.report?.qualityGate) error.report.qualityGate = 'automatic-polishing-measured-evidence-v3';
    throw error;
  }
}

function assertQualityEvidence(evidence, {
  angleToleranceDeg = .1,
  positionToleranceMm = 1e-5,
  volumeToleranceMm3 = 1e-7,
  volumeBalanceToleranceMm3 = 1e-6,
  minimumSeamSamples = 5,
  endpointStationTolerance = .001,
  minimumAdaptiveScaleRatio = .1
} = {}, polishing) {
  for (const [field, value] of Object.entries({angleToleranceDeg, positionToleranceMm, volumeToleranceMm3, volumeBalanceToleranceMm3})) {
    if (!finite(value) || value <= 0) reject('policy', `${field} 无效`);
  }
  if (!Number.isInteger(minimumSeamSamples) || minimumSeamSamples < 5 ||
      !finite(endpointStationTolerance) || endpointStationTolerance <= 0 || endpointStationTolerance >= .1 ||
      !finite(minimumAdaptiveScaleRatio) || minimumAdaptiveScaleRatio <= 0 || minimumAdaptiveScaleRatio > 1) {
    reject('policy', '接缝采样策略无效');
  }
  let selectedSourceEdgeIds;
  if (polishing) {
    if (evidence?.request?.dimensionKind !== 'automatic-local-scale' ||
        !['remove', 'add'].includes(evidence.request.materialIntent)) {
      reject('request', '自动打磨缺少自动尺度语义及来源预声明材料意图');
    }
    selectedSourceEdgeIds = ids(evidence.request.selectedSourceEdgeIds, 'request', 'selectedSourceEdgeIds');
    const scope = evidence.scope;
    const sourceEdgeIds = ids(scope?.sourceEdgeIds, 'scope', 'sourceEdgeIds');
    if (!selectedSourceEdgeIds.length || !sourceEdgeIds.length || scope.declaredBeforeConstruction !== true ||
        !finite(scope.marginMm) || scope.marginMm <= 0 || selectedSourceEdgeIds.some(id => !sourceEdgeIds.includes(id))) {
      reject('scope', '自动打磨缺少完整且预声明的来源依赖及局部影响区', {scope});
    }
    if (scope.constructionContours !== undefined) {
      const contours = scope.constructionContours;
      if (!Array.isArray(contours) || !contours.length || !unique(contours.map(contour => contour.id)) ||
          contours.filter(contour => contour.role === 'primary').length !== 1 ||
          contours.some(contour => typeof contour.id !== 'string' || !contour.id || !['primary', 'conditioning'].includes(contour.role) ||
            !unique(contour.sourceEdgeIds) || !contour.sourceEdgeIds.length ||
            contour.sourceEdgeIds.some(id => !edgeId(id) || !sourceEdgeIds.includes(id))) ||
          selectedSourceEdgeIds.some(id => !contours.find(contour => contour.role === 'primary').sourceEdgeIds.includes(id))) {
        reject('scope', '自动打磨主轮廓与辅助轮廓义务没有完整预声明', {scope});
      }
    }
  } else if (!evidence || !finite(evidence.request?.sizeMm) || evidence.request.sizeMm <= 0 ||
      !['exact-radius', 'rounding-scale'].includes(evidence.request.dimensionKind)) {
    reject('request', '质量检查缺少请求大小及真实尺寸语义');
  }
  const solid = evidence.solid;
  if (solid?.valid !== true || solid.solidCount !== 1 ||
      !finite(solid.sourceVolumeMm3) || solid.sourceVolumeMm3 <= volumeToleranceMm3 ||
      !finite(solid.resultVolumeMm3) || solid.resultVolumeMm3 <= volumeToleranceMm3) {
    reject('solid', '圆润结果没有有效单实体量测', {solid});
  }

  const material = evidence.material;
  if (!material || !['remove', 'add', 'mixed'].includes(material.direction)) {
    reject('material', '圆润缺少来自支撑面的凹凸材料语义', {material}, 'MATERIAL_CHECK_FAILED');
  }
  if (polishing && (material.direction !== evidence.request.materialIntent ||
      material.plannedIntent !== evidence.request.materialIntent)) {
    reject('material', '自动打磨材料意图没有来自构造前声明或与量测方向不符', {material}, 'MATERIAL_CHECK_FAILED');
  }
  const removed = nonnegative(material.removedVolumeMm3, 'material', 'removedVolumeMm3');
  const added = nonnegative(material.addedVolumeMm3, 'material', 'addedVolumeMm3');
  const volumeBalanceErrorMm3 = Math.abs((solid.resultVolumeMm3 - solid.sourceVolumeMm3) - (added - removed));
  const volumePolicy = {volumeBalanceErrorMm3, volumeToleranceMm3, volumeBalanceToleranceMm3};
  if (removed + added <= volumeToleranceMm3) {
    reject('material', '圆润未产生可量测的材料变化', {material}, 'MATERIAL_CHECK_FAILED');
  }
  if ((material.direction === 'remove' && added > volumeToleranceMm3) ||
      (material.direction === 'add' && removed > volumeToleranceMm3)) {
    reject('material', '圆润的材料变化与支撑面凹凸方向不符', {material, ...volumePolicy}, 'MATERIAL_CHECK_FAILED');
  }
  // Independent Boolean differences can resplit the BRep representation. This
  // balance policy only reconciles their volumes with the input/output volumes;
  // zero change, wrong direction and locality still use volumeToleranceMm3.
  if (!finite(volumeBalanceErrorMm3) || volumeBalanceErrorMm3 > volumeBalanceToleranceMm3) {
    reject('material', '材料差集量测与实体体积变化不一致', {material, solid, ...volumePolicy}, 'MATERIAL_CHECK_FAILED');
  }
  if (material.direction === 'mixed') {
    const regions = material.regions;
    if (!Array.isArray(regions) || !regions.length || regions.some(region =>
      !['remove', 'add'].includes(region.direction) || region.authorized !== true ||
      !finite(region.removedVolumeMm3) || region.removedVolumeMm3 < 0 ||
      !finite(region.addedVolumeMm3) || region.addedVolumeMm3 < 0 ||
      (region.direction === 'remove' && region.addedVolumeMm3 > volumeToleranceMm3) ||
      (region.direction === 'add' && region.removedVolumeMm3 > volumeToleranceMm3))) {
      reject('material', '混合凹凸圆润缺少逐局部区的材料方向量测', {material}, 'MATERIAL_CHECK_FAILED');
    }
    if (Math.abs(regions.reduce((sum, region) => sum + region.removedVolumeMm3, 0) - removed) > volumeToleranceMm3 ||
        Math.abs(regions.reduce((sum, region) => sum + region.addedVolumeMm3, 0) - added) > volumeToleranceMm3) {
      reject('material', '逐局部区材料变化没有覆盖全部差集', {material}, 'MATERIAL_CHECK_FAILED');
    }
  }

  const generatedFaceIds = ids(evidence.generatedFaceIds, 'coverage', 'generatedFaceIds');
  const boundaryEdgeIds = ids(evidence.boundaryEdgeIds, 'coverage', 'boundaryEdgeIds');
  if (!generatedFaceIds.length || !boundaryEdgeIds.length) reject('coverage', '没有完整的生成面及其边界清单');
  const generated = new Set(generatedFaceIds);
  if (!Array.isArray(evidence.seams) || !Array.isArray(evidence.exemptBoundaries)) reject('coverage', '生成边界检查清单缺失');
  const inspected = new Set(), smoothSeams = new Set(), naturalSeams = [], angles = [], gaps = [];
  for (const seam of evidence.seams) {
    if (!edgeId(seam?.edgeId) || inspected.has(seam.edgeId) || !boundaryEdgeIds.includes(seam.edgeId)) {
      reject('coverage', '接缝编号不在完整生成边界中或重复', {seam});
    }
    inspected.add(seam.edgeId);
    const adjacent = ids(seam.adjacentFaceIds, 'coverage', 'adjacentFaceIds');
    const generatedCount = adjacent.filter(id => generated.has(id)).length;
    if (adjacent.length !== 2 || generatedCount < 1 ||
        !['support-contact', 'patch-contact', 'endpoint-contact', 'natural-termination'].includes(seam.kind) ||
        (seam.kind === 'patch-contact' && generatedCount !== 2) ||
        (['support-contact', 'natural-termination'].includes(seam.kind) && generatedCount !== 1)) {
      reject('coverage', '生成接缝的实际邻接面和接触类别不一致', {seam});
    }
    if (seam.kind === 'natural-termination' && !isNaturalRoundingTermination(seam.provenance)) {
      reject('natural-termination', '锐终止边没有原始未选端面出处证明', {seam});
    }
    if (polishing && seam.kind === 'natural-termination') {
      reject('seams', '自动打磨不豁免新边界；原端面必须纳入联动并验证光顺', {seam});
    }
    if (!Array.isArray(seam.samples) || seam.samples.length < minimumSeamSamples ||
        seam.samples.some(sample => !finite(sample?.t) || sample.t < 0 || sample.t > 1 ||
          !finite(sample.angleDeg) || sample.angleDeg < 0 || sample.angleDeg > 180 ||
          !finite(sample.gapMm) || sample.gapMm < 0)) {
      reject('seams', '生成接缝缺少有限的完整法向及位置采样', {seam});
    }
    const stations = seam.samples.map(sample => sample.t).sort((a, b) => a - b);
    if (!unique(stations) || stations[0] > endpointStationTolerance ||
        stations.at(-1) < 1 - endpointStationTolerance ||
        Math.max(...stations.slice(1).map((value, i) => value - stations[i])) > .35) {
      reject('seams', '接缝采样没有覆盖两端或中间存在过大空档', {edgeId: seam.edgeId, stations});
    }
    if (polishing && (!Array.isArray(seam.trueEndpointSamples) || seam.trueEndpointSamples.length !== 2 ||
        ![0, 1].every(t => seam.trueEndpointSamples.some(sample => sample.t === t)) ||
        seam.trueEndpointSamples.some(sample => !finite(sample.angleDeg) || sample.angleDeg < 0 || sample.angleDeg > 180 ||
          !finite(sample.gapMm) || sample.gapMm < 0))) {
      reject('endpoints', '自动打磨生成接缝的真实两端尚未量测', {seam});
    }
    const checkedSamples = polishing ? [...seam.samples, ...seam.trueEndpointSamples] : seam.samples;
    const maxAngle = Math.max(...checkedSamples.map(sample => sample.angleDeg));
    const maxGap = Math.max(...checkedSamples.map(sample => sample.gapMm));
    gaps.push(maxGap);
    if (maxGap > positionToleranceMm) reject('seams', '生成接缝的位置间隙超出容差', {edgeId: seam.edgeId, maxGapMm: maxGap});
    if (seam.kind === 'natural-termination') naturalSeams.push(seam.edgeId);
    else {
      angles.push(maxAngle);
      smoothSeams.add(seam.edgeId);
      if (maxAngle > angleToleranceDeg) reject('seams', '生成接触缝或片间缝未接顺', {edgeId: seam.edgeId, maxAngleDeg: maxAngle,
        ...(polishing ? {trueEndpointSamples: seam.trueEndpointSamples} : {})});
    }
  }
  for (const boundary of evidence.exemptBoundaries) {
    if (!edgeId(boundary?.edgeId) || inspected.has(boundary.edgeId) || !boundaryEdgeIds.includes(boundary.edgeId) ||
        !['periodic-seam', 'degenerate'].includes(boundary.kind) || boundary.verified !== true) {
      reject('coverage', '周期或退化边界没有内核事实证明', {boundary});
    }
    inspected.add(boundary.edgeId);
  }
  if (inspected.size !== boundaryEdgeIds.length) {
    reject('coverage', '部分生成面边界尚未检查', {uncheckedBoundaryEdgeIds: boundaryEdgeIds.filter(id => !inspected.has(id))});
  }
  const representedFaces = new Set(evidence.seams.flatMap(seam => seam.adjacentFaceIds));
  if (generatedFaceIds.some(id => !representedFaces.has(id))) {
    reject('coverage', '部分生成面没有实际接触边界证据', {unrepresentedGeneratedFaceIds: generatedFaceIds.filter(id => !representedFaces.has(id))});
  }
  if (!smoothSeams.size) reject('seams', '圆润缺少已核对的实际光顺接触缝');

  if (!unique(evidence.requiredEndpointIds) || evidence.requiredEndpointIds.some(id =>
    !(typeof id === 'string' && id.length > 0 || finite(id))) || !Array.isArray(evidence.endpoints)) {
    reject('endpoints', '必检端部清单缺失或重复');
  }
  const endpointIds = new Set();
  for (const endpoint of evidence.endpoints) {
    if (!evidence.requiredEndpointIds.includes(endpoint?.id) || endpointIds.has(endpoint.id) ||
        !['smooth', 'natural-termination'].includes(endpoint.kind) ||
        !finite(endpoint.gapMm) || endpoint.gapMm < 0 || endpoint.gapMm > positionToleranceMm ||
        !Array.isArray(endpoint.checkedSeamEdgeIds) || !endpoint.checkedSeamEdgeIds.length ||
        endpoint.checkedSeamEdgeIds.some(id => !smoothSeams.has(id))) {
      reject('endpoints', '端部位置或与光顺接触缝的连接尚未完整核对', {endpoint});
    }
    if (polishing && endpoint.kind !== 'smooth') reject('endpoints', '自动打磨端部必须实际光顺，不能使用原天然终止豁免', {endpoint});
    if (endpoint.kind === 'smooth' && (!finite(endpoint.angleDeg) || endpoint.angleDeg < 0 || endpoint.angleDeg > angleToleranceDeg)) {
      reject('endpoints', '要求光顺的端部法向未接顺', {endpoint});
    }
    if (endpoint.kind === 'natural-termination' && !isNaturalRoundingTermination(endpoint.provenance)) {
      reject('endpoints', '端部锐终止没有原始未选端面出处证明', {endpoint});
    }
    endpointIds.add(endpoint.id);
  }
  if (endpointIds.size !== evidence.requiredEndpointIds.length) {
    reject('endpoints', '部分必检端部尚未验证', {uncheckedEndpointIds: evidence.requiredEndpointIds.filter(id => !endpointIds.has(id))});
  }

  const scale = evidence.scale;
  if (!scale || typeof scale.method !== 'string' || !scale.method || !Array.isArray(scale.samplesMm) ||
      !scale.samplesMm.length || scale.samplesMm.some(value => !finite(value) || value <= 0)) {
    reject('scale', '圆润实际尺度缺少几何量测', {scale});
  }
  const actualMinimumMm = Math.min(...scale.samplesMm), actualMaximumMm = Math.max(...scale.samplesMm);
  const requested = evidence.request.sizeMm;
  if (polishing) {
    // The measured scale is recorded without a requested R or ratio envelope.
  } else if (evidence.request.dimensionKind === 'exact-radius') {
    if (Math.max(...scale.samplesMm.map(value => Math.abs(value - requested))) > positionToleranceMm) {
      reject('scale', '宣称精确 R 的候选与实测半径不符', {requestedSizeMm: requested, scale});
    }
  } else {
    // Adaptive bounds are the candidate's explicit scale contract; this gate
    // does not invent an approved product deviation or silently shrink size.
    if (!finite(scale.minRatio) || !finite(scale.maxRatio) || scale.minRatio < minimumAdaptiveScaleRatio ||
        scale.minRatio > 1 || scale.maxRatio < 1 || scale.maxRatio < scale.minRatio) {
      reject('scale', '非恒 R 候选缺少明确的尺度意图界限', {scale});
    }
    if (actualMinimumMm < requested * scale.minRatio - positionToleranceMm ||
        actualMaximumMm > requested * scale.maxRatio + positionToleranceMm) {
      reject('scale', '非恒 R 实际尺度不符合本候选明示的大小界限', {requestedSizeMm: requested, scale});
    }
  }

  let selectedEffects;
  if (polishing) {
    if (!Array.isArray(evidence.selectedEdgeEffects) || evidence.selectedEdgeEffects.length !== selectedSourceEdgeIds.length) {
      reject('selected-edge-effect', '原选边的实际打磨效果没有完整量测');
    }
    const seen = new Set(), requiredStations = [.0005, .01, .1, .25, .5, .75, .9, .99, .9995];
    selectedEffects = evidence.selectedEdgeEffects.map(effect => {
      if (!selectedSourceEdgeIds.includes(effect?.sourceEdgeId) || seen.has(effect.sourceEdgeId) ||
          typeof effect.method !== 'string' || !effect.method || !Array.isArray(effect.samples) ||
          effect.samples.some(sample => !finite(sample?.t) || sample.t <= 0 || sample.t >= 1 ||
            !finite(sample.distanceMm) || sample.distanceMm < 0) ||
          requiredStations.some(t => !effect.samples.some(sample => Math.abs(sample.t - t) <= 1e-10)) ||
          !unique(effect.samples.map(sample => sample.t)) ||
          !Array.isArray(effect.sourceEndpointSamples) || effect.sourceEndpointSamples.length !== 2 ||
          ![0, 1].every(t => effect.sourceEndpointSamples.some(sample => sample.t === t)) ||
          effect.sourceEndpointSamples.some(sample => !finite(sample.distanceMm) || sample.distanceMm < 0)) {
        reject('selected-edge-effect', '原选边缺少九站完整距离量测或真实端点记录', {effect});
      }
      seen.add(effect.sourceEdgeId);
      const interior = effect.samples.filter(sample => sample.t >= .01 && sample.t <= .99);
      const minimumInteriorDistanceMm = Math.min(...interior.map(sample => sample.distanceMm));
      if (minimumInteriorDistanceMm <= positionToleranceMm) {
        reject('selected-edge-effect', '原选边内部仍有位置未产生超过几何精度的实测打磨效果', {sourceEdgeId: effect.sourceEdgeId, minimumInteriorDistanceMm, effect});
      }
      return {sourceEdgeId: effect.sourceEdgeId, measuredStationCount: effect.samples.length,
        minimumInteriorDistanceMm, maximumInteriorDistanceMm: Math.max(...interior.map(sample => sample.distanceMm)),
        sourceEndpointSamples: effect.sourceEndpointSamples,
        limitations: ['Interior displacement is sampled. Source endpoints may remain in place; all generated seam endpoints are independently required to be G0/G1.']};
    });
  }

  const locality = evidence.locality;
  if (locality?.verified !== true || typeof locality.method !== 'string' || !locality.method ||
      !Number.isInteger(locality.preservedCheckCount) || locality.preservedCheckCount < 1 ||
      locality.checkedPreservedCount !== locality.preservedCheckCount ||
      !finite(locality.maxOutsideDeviationMm) || locality.maxOutsideDeviationMm < 0 ||
      locality.maxOutsideDeviationMm > positionToleranceMm ||
      !finite(locality.outsideChangedVolumeMm3) || locality.outsideChangedVolumeMm3 < 0 ||
      locality.outsideChangedVolumeMm3 > volumeToleranceMm3) {
    reject('locality', '局部影响区以外的保留区尚未核对或发生改变', {locality});
  }
  return {
    status: 'passed', method: polishing ? 'automatic-polishing-measured-evidence-v3' : 'rounding-measured-evidence-v1',
    solid: 'valid-single-solid', materialDirection: material.direction,
    sourceVolumeMm3: solid.sourceVolumeMm3, resultVolumeMm3: solid.resultVolumeMm3,
    removedVolumeMm3: removed, addedVolumeMm3: added,
    ...volumePolicy,
    generatedFaceCount: generatedFaceIds.length, checkedBoundaryCount: inspected.size,
    seams: 'G1-contact-and-patch-end-sampled', smoothSeamCount: smoothSeams.size,
    maxContactAngleDeg: Math.max(...angles), maxContactGapMm: Math.max(...gaps),
    naturalTerminationEdgeIds: naturalSeams, endpoints: 'all-required-measured',
    checkedEndpointCount: endpointIds.size, dimensionKind: evidence.request.dimensionKind,
    ...(polishing ? {materialIntent: evidence.request.materialIntent, selectedEdgeEffects: selectedEffects,
      selectedEdgeEffectCount: selectedEffects.length, dependencySourceEdgeIds: evidence.scope.sourceEdgeIds,
      endpointPolicy: 'all-generated-seam-true-endpoints-required-smooth',
      scaleSemantics: 'Observed geometric displacement; no requested R or scale-ratio requirement.'} :
      {requestedSizeMm: requested, actualMinimumRatio: actualMinimumMm / requested, actualMaximumRatio: actualMaximumMm / requested}),
    actualMinimumMm, actualMaximumMm,
    scaleMethod: scale.method, localityMethod: locality.method,
    preservedCheckCount: locality.preservedCheckCount,
    maxOutsideDeviationMm: locality.maxOutsideDeviationMm,
    outsideChangedVolumeMm3: locality.outsideChangedVolumeMm3,
    tolerances: {angleDeg: angleToleranceDeg, positionMm: positionToleranceMm,
      volumeMm3: volumeToleranceMm3, volumeBalanceMm3: volumeBalanceToleranceMm3,
      ...(!polishing ? {minimumAdaptiveScaleRatio} : {})}
  };
}
