import definition from './definition.js';
import { build } from './build.js';

export default Object.freeze({
  kind: 'thinWallTray',
  definition,
  iconUrl: new URL('./icon.svg', import.meta.url).href,
  build,
});
