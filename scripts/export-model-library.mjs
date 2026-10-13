// Host authoring helper; this script is never required by the browser application.
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {defaultModelLibrary,validateLibraryEntry} from '../src/model-library.js';

const [modulePath, outputPath] = process.argv.slice(2);
if (!modulePath || !outputPath) throw Error('Usage: node scripts/export-model-library.mjs <trusted-definition.mjs> <output.json>');
const supplied = (await import(pathToFileURL(resolve(modulePath)).href)).default;
const entries = (typeof supplied === 'function' ? await supplied(defaultModelLibrary()) : supplied).map(validateLibraryEntry);
if (entries.length > 200 || new Set(entries.map(entry => entry.id)).size !== entries.length) throw Error('Expected up to 200 unique model entries');
await writeFile(resolve(outputPath), JSON.stringify({format:'webcad-model-library',version:1,entries},null,2),'utf8');
console.log('Exported ' + entries.length + ' model definitions to ' + resolve(outputPath));
