import { tubularButtonFoot } from '../button-geometry.js';

export default function femaleFoot(cad, variant) {
  return tubularButtonFoot(cad, variant, {
    flatRadius: 6.5, shankRadius: 2, crownHeight: 1.02, crownRise: 0,
    height: variant === 'domed' ? 7.02 : 6.25,
  });
}
