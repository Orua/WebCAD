import { recessButtonFlange, smoothMeridian, turnButtonProfile } from '../button-geometry.js';

export default function stud(cad) {
  let outline = cad.draw([4.19, 0]).lineTo([4.60, 0]);
  outline = smoothMeridian(outline, [
    [4.60, 0], [5, 0.51], [4.68, 1.5],
  ], [1, 0], [0, 1]).lineTo([4.68, 2.96]);
  outline = smoothMeridian(outline, [[4.68, 2.96], [5.24, 3.50]], [0, 1], [1, 0])
    .lineTo([6.95, 3.50]).lineTo([6.95, 3.75]).lineTo([5.22, 3.75]);
  outline = smoothMeridian(outline, [[5.22, 3.75], [4.43, 2.99]], [-1, 0], [0, -1])
    .lineTo([4.43, 1.49]);
  outline = smoothMeridian(outline, [
    [4.43, 1.49], [4.75, 0.52], [4.56, 0.25],
  ], [0, -1], [-1, 0]).lineTo([4.21, 0.25]);
  outline = smoothMeridian(outline, [
    [4.21, 0.25], [3.94, 0.48], [3.85, 1.93], [3.56, 2.94], [2.69, 3.51],
  ], [-1, 0], [-1, 0]).lineTo([2.15, 3.51]).lineTo([2.15, 3.26]).lineTo([2.66, 3.26]);
  outline = smoothMeridian(outline, [
    [2.66, 3.26], [3.34, 2.81], [3.60, 1.89], [3.69, 0.44], [4.19, 0],
  ], [1, 0], [1, 0]);
  const body = turnButtonProfile(outline);
  return recessButtonFlange(cad, body, {
    count: 12, direction: 15, inner: 5.4, outer: 6.4, width: 0.16, z: 3.46, depth: 0.18,
  });
}
