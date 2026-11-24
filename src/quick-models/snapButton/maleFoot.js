import { smoothMeridian, turnButtonProfile } from '../button-geometry.js';

export default function maleFoot(cad, variant) {
  const domed = variant === 'domed';
  const cut = variant === 'cut';
  const radius = cut ? 3 : 7.5;
  const stem = cut ? 2 : 2.6;
  const neck = cut ? 1.76 : 2.35;
  const outerTop = cut ? 5.977 : 6;
  let outline = smoothMeridian(cad.draw([0, 0]), [
    [0, 0], [stem * 0.80, 0.42], [stem, 1.15],
  ], [1, 0], [0, 1]).lineTo([stem, 1.50]);
  outline = smoothMeridian(outline, [[stem, 1.50], [neck, 2.48], [stem, 3.46]], [0, 1], [0, 1])
    .lineTo([stem, 5.60]);
  outline = smoothMeridian(outline, [[stem, 5.60], [cut ? 2.31 : 3.12, outerTop]], [0, 1], [1, 0]);
  if (domed) {
    outline = outline.lineTo([6.85, outerTop]);
    outline = smoothMeridian(outline, [
      [6.85, outerTop], [radius, 6.58], [6.85, 7.48], [2.05, 8.30],
    ], [1, 0], [-1, 0]).lineTo([0, 8.30]).lineTo([0, 8.05]).lineTo([2.05, 8.05]);
    outline = smoothMeridian(outline, [
      [2.05, 8.05], [6.75, 7.24], [radius - 0.25, 6.60], [6.85, 6.25],
    ], [1, 0], [-1, 0]);
  } else {
    outline = outline.lineTo([radius, outerTop]).lineTo([radius, outerTop + 0.25]);
  }
  const root = cut ? 2.23 : 3.10;
  outline = outline.lineTo([root, outerTop + 0.25]);
  outline = smoothMeridian(outline, [
    [root, outerTop + 0.25], [stem - 0.25, 5.65],
  ], [-1, 0], [0, -1]).lineTo([stem - 0.25, 3.50]);
  outline = smoothMeridian(outline, [
    [stem - 0.25, 3.50], [neck - 0.25, 2.48], [stem - 0.25, 1.46],
  ], [0, -1], [0, -1]).lineTo([stem - 0.25, 1.15]);
  outline = smoothMeridian(outline, [
    [stem - 0.25, 1.15], [stem * 0.70, 0.60], [0, 0.25],
  ], [0, -1], [-1, 0]);
  return turnButtonProfile(outline);
}
