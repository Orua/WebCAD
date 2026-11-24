import { dispose } from './installation-geometry.js';

const Z = [0, 0, 1];

export function turnButtonProfile(drawing, angle = 360) {
  return drawing.close().sketchOnPlane('XZ').revolve(Z, { origin: [0, 0, 0], angle });
}

// Interpolate a sparse meridian with cubic segments sharing the same tangent
// at each station. End tangents let the curves meet the adjacent plane or
// cylinder without a normal jump.
export function smoothMeridian(drawing, points, startTangent, endTangent) {
  const unit = ([x, y]) => {
    const length = Math.hypot(x, y);
    return [x / length, y / length];
  };
  const chords = points.slice(1).map((point, i) => point.map((n, j) => n - points[i][j]));
  const directions = chords.map(unit);
  const tangents = [
    unit(startTangent),
    ...directions.slice(1).map((direction, i) => unit(direction.map((n, j) => n * directions[i][j] > 0 ? n + directions[i][j] : 0))),
    unit(endTangent),
  ];
  for (const [i, chord] of chords.entries()) {
    const length = Math.hypot(...chord) / 3;
    const first = points[i].map((n, j) => n + length * tangents[i][j]);
    const second = points[i + 1].map((n, j) => n - length * tangents[i + 1][j]);
    drawing = drawing.cubicBezierCurveTo(points[i + 1], first, second);
  }
  return drawing;
}

const cornerMid = 1 - Math.SQRT1_2;

// A hollow rivet foot. The rim and the roots of the shank are curved on
// both sides of the shell; the open end remains a flat mating face.
export function tubularButtonFoot(cad, variant, { flatRadius, shankRadius, height, crownHeight, crownRise }) {
  const wall = 0.25;
  const root = 0.50;
  const inner = shankRadius - wall;
  const domed = variant === 'domed';
  const radius = variant === 'cut' ? 3 : domed ? 7.5 : flatRadius;
  const deck = domed ? crownHeight : wall;
  let outline;
  if (domed) {
    const faceRadius = crownRise ? 1.75 : 6.85;
    const start = [faceRadius, 0];
    outline = cad.draw([0, 0]).lineTo(start);
    outline = smoothMeridian(outline, [
      start, [6.85, crownRise], [radius, (deck + crownRise) / 2], [6.90, deck],
    ].filter((point, i) => i !== 1 || crownRise), [1, 0], [-1, 0]);
    outline = outline.lineTo([shankRadius + root, deck]);
  } else {
    outline = cad.draw([radius, 0]).lineTo([radius, wall]).lineTo([shankRadius + root, deck]);
  }
  outline = outline
    .threePointsArcTo([shankRadius, deck + root], [shankRadius + root * cornerMid, deck + root * cornerMid])
    .lineTo([shankRadius, height]).lineTo([inner, height]);
  if (domed) {
    const faceRadius = crownRise ? 1.75 : 6.85;
    const deckInside = deck - wall;
    const innerRoot = root + wall;
    outline = outline.lineTo([inner, deckInside + innerRoot])
      .threePointsArcTo([inner + innerRoot, deckInside], [inner + innerRoot * cornerMid, deckInside + innerRoot * cornerMid])
      .lineTo([6.88, deckInside]);
    outline = smoothMeridian(outline, [
      [6.88, deckInside], [radius - wall, (deck + crownRise) / 2],
      [6.85, crownRise + wall], [faceRadius, wall],
    ].filter((point, i) => i !== 2 || crownRise), [1, 0], [-1, 0]);
    outline = outline.lineTo([0, wall]);
  } else {
    const innerRoot = root + wall;
    outline = outline.lineTo([inner, innerRoot])
      .threePointsArcTo([inner + innerRoot, 0], [inner + innerRoot * cornerMid, innerRoot * cornerMid]);
  }
  return turnButtonProfile(outline);
}

export function invertedButtonFoot(cad, foot, height) {
  let inverted;
  try {
    inverted = foot.rotate(180, [0, 0, 0], [1, 0, 0]);
    return inverted.translate([0, 0, height]);
  } finally {
    dispose(inverted);
    dispose(foot);
  }
}

export function recessButtonFlange(cad, shape, { count, direction = 0, inner, outer, width, z, depth }) {
  const cutters = [];
  let tool;
  try {
    for (let index = 0; index < count; index++) {
      const slot = cad.drawRoundedRectangle(outer - inner, width, Math.min(width / 2, 0.08))
        .translate((inner + outer) / 2, 0).sketchOnPlane('XY', z).extrude(depth);
      try {
        cutters.push(index === 0 && !direction ? slot.clone() : slot.rotate(direction + 360 * index / count, [0, 0, 0], Z));
      } finally {
        dispose(slot);
      }
    }
    tool = cad.makeCompound(cutters);
    return shape.cut(tool);
  } finally {
    dispose(tool);
    cutters.forEach(dispose);
    dispose(shape);
  }
}