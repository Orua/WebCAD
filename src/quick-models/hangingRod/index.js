import definition from './definition.js';
import {build} from './build.js';

export default Object.freeze({kind:'hangingRod',definition,build,iconUrl:new URL('./icon.svg',import.meta.url).href});
