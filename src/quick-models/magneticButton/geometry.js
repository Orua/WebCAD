import {dispose} from '../installation-geometry.js';

// Meridians of the reference turned faces. Radius is given at Ø20;
// axial coordinates below the mating face are fractions of disc thickness.
const maleRim = [[9.45,0],[9.75,0.07/1.8],[9.94,0.25/1.8],[10,0.49/1.8],
  [10,1.29/1.8],[9.94,1.54/1.8],[9.76,1.73/1.8],[9.48,1]];
const femaleRim = [[9.4,0],[9.68,.07/4.3],[9.89,.28/4.3],[10,.59/4.3],
  [10,3.65/4.3],[9.93,3.95/4.3],[9.74,4.17/4.3],[9.45,1]];
const stud = [[3.05,0],[2.95,.04],[2.9,.15],[2.9,1.65],[2.85,1.83],[2.69,1.98],[2.43,2.04]];
const socket = [[3.4,0],[3.23,-.07],[3.12,-.23],[3.12,-1.99],[3.04,-2.13],[2.9,-2.2]];

function polygon(cad, points) {
  const drawing = cad.draw(points[0]);
  for (const point of points.slice(1)) drawing.lineTo(point);
  return drawing.close();
}

export function buttonBody(cad, p, male) {
  const thickness = male ? p.maleThickness : p.femaleThickness;
  const axial = male ? p.studHeight / 2.04 : p.socketDepth / 2.2;
  const rim = (male ? maleRim : femaleRim).map(([r,h]) => [r*p.scale,h*thickness]);
  const center = (male ? stud : socket).map(([r,z]) => [r*p.scale,thickness+z*axial]);
  const profile = [[0,0], ...rim, ...center, [0,center.at(-1)[1]]];
  let body = polygon(cad,profile).sketchOnPlane('XZ').revolve([0,0,1],{origin:[0,0,0]});
  const tip = [[2.25,0],[2.25,7.8],[2.12,8.25],[1.7,8.7],[1.05,9]];
  const outline = [...tip,...tip.toReversed().map(([w,z])=>[-w,z])]
    .map(([w,z])=>[w*p.scale,-z*p.legLength/9]);
  try {
    for (const x of [-p.pitch/2,p.pitch/2]) {
      const leg = polygon(cad,outline).sketchOnPlane('YZ',x-.25*p.scale).extrude(.5*p.scale);
      try {
        const joined = body.fuse(leg);
        body.delete();
        body = joined;
      } finally { dispose(leg); }
    }
    const result = body;
    body = null;
    return result;
  } finally { dispose(body); }
}

export function backingPlate(cad, p) {
  const slot = x => cad.drawRoundedRectangle(1.15*p.scale,5.05*p.scale,.35*p.scale).translate(x,0);
  const outline = cad.drawCircle(p.plateOD/2).cut(cad.drawCircle(2.1*p.scale))
    .cut(slot(-p.pitch/2)).cut(slot(p.pitch/2));
  return outline.sketchOnPlane().extrude(p.plateThickness);
}
