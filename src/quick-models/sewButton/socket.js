import { dispose } from '../installation-geometry.js';
import { smoothMeridian, turnButtonProfile } from '../button-geometry.js';

export default function socket(cad) {
  let outline = cad.draw([2.15, 0]).lineTo([4.65, 0]);
  outline = smoothMeridian(outline, [[4.65, 0], [5.25, 0.57]], [1, 0], [0, 1])
    .lineTo([5.25, 1.01]);
  outline = smoothMeridian(outline, [
    [5.25, 1.01], [5.55, 1.29], [6.32, 1.53], [6.70, 2.34],
  ], [0, 1], [0, 1]).lineTo([6.70, 3.05]);
  outline = smoothMeridian(outline, [
    [6.70, 3.05], [6.45, 3.74], [5.70, 4.08], [5.36, 3.83],
  ], [0, 1], [0, -1]).lineTo([5.36, 3.42]);
  outline = smoothMeridian(outline, [[5.36, 3.42], [5.63, 3.06]], [0, -1], [0, -1])
    .lineTo([5.63, 2.64]);
  outline = smoothMeridian(outline, [
    [5.63, 2.64], [5.13, 2.40], [4.96, 2.05],
  ], [0, -1], [0, -1]);
  outline = smoothMeridian(outline, [
    [4.96, 2.05], [4.90, 0.98], [4.22, 0.25],
  ], [0, -1], [-1, 0]).lineTo([2.15, 0.25]);
  const shell = turnButtonProfile(outline);
  let spring;
  try {
    spring = turnButtonProfile(cad.draw([5.36, 2.86])
      .threePointsArcTo([4.90, 2.86], [5.13, 3.09])
      .threePointsArcTo([5.36, 2.86], [5.13, 2.63]), 327);
    return cad.makeCompound([shell, spring]);
  } finally {
    dispose(spring);
    dispose(shell);
  }
}
