import { dispose } from '../installation-geometry.js';
import { smoothMeridian, turnButtonProfile } from '../button-geometry.js';

export default function socket(cad) {
  let outline = cad.draw([2.1, 0]).lineTo([3.25, 0]);
  outline = smoothMeridian(outline, [[3.25, 0], [3.75, 0.5]], [1, 0], [0, 1])
    .lineTo([3.75, 1.8]).lineTo([7, 1.8]);
  outline = smoothMeridian(outline, [[7, 1.8], [7.5, 2.3]], [1, 0], [0, 1])
    .lineTo([7.5, 4.03]);
  outline = smoothMeridian(outline, [
    [7.5, 4.03], [7.05, 4.62], [4.50, 5.14], [3.35, 5.30],
  ], [0, 1], [-1, 0.12]).lineTo([3.35, 5.05]);
  outline = smoothMeridian(outline, [
    [3.35, 5.05], [4.46, 4.89], [6.96, 4.38], [7.25, 4.01],
  ], [1, -0.12], [0, -1]).lineTo([7.25, 2.32]);
  outline = smoothMeridian(outline, [[7.25, 2.32], [6.95, 2.05]], [0, -1], [-1, 0])
    .lineTo([3.50, 2.05]).lineTo([3.50, 0.53]);
  outline = smoothMeridian(outline, [[3.50, 0.53], [3.21, 0.25]], [0, -1], [-1, 0])
    .lineTo([2.1, 0.25]);
  const body = turnButtonProfile(outline);
  const cuts = [];
  let openings;
  try {
    for (const x of [-2.8, 2.8]) {
      cuts.push(cad.makeBox([x - 0.18, -6.6, 4.12], [x + 0.18, 6.6, 4.64]));
    }
    openings = cad.makeCompound(cuts);
    return body.cut(openings);
  } finally {
    dispose(openings);
    cuts.forEach(dispose);
    dispose(body);
  }
}
