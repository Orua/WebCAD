import { recessButtonFlange, smoothMeridian, turnButtonProfile } from '../button-geometry.js';

export default function stud(cad) {
  let outline = smoothMeridian(cad.draw([0, 0]), [
    [0, 0], [2.35, 0.65], [3.09, 2.10], [2.74, 3.34], [3.31, 4],
  ], [1, 0], [1, 0]);
  outline = outline.lineTo([7, 4]).lineTo([7, 4.25]).lineTo([3.27, 4.25]);
  outline = smoothMeridian(outline, [
    [3.27, 4.25], [2.49, 3.34], [2.84, 2.10], [2.16, 0.84], [0, 0.25],
  ], [-1, 0], [-1, 0]);
  const button = turnButtonProfile(outline);
  return recessButtonFlange(cad, button, {
    count: 32, inner: 3.75, outer: 6.80, width: 0.13, z: 3.94, depth: 0.18,
  });
}
