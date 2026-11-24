import { invertedButtonFoot } from '../button-geometry.js';
import femaleFoot from './femaleFoot.js';

export default function maleFoot(cad, variant) {
  return invertedButtonFoot(cad, femaleFoot(cad, variant), variant === 'domed' ? 7.02 : 6.25);
}
