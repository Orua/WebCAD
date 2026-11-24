import { tubularButtonFoot } from '../button-geometry.js';

export default function femaleFoot(cad, variant) {
  return tubularButtonFoot(cad, variant, {
    flatRadius: 7.5, shankRadius: 2.05, crownHeight: 2.41, crownRise: 0.94,
    height: variant === 'domed' ? 6.41 : 4.25,
  });
}
