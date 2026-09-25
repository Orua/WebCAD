import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { infoMetadata } from '../src/page-api-docs.js';
import { listOperations } from '../src/operation-registry.js';
import { assertPlacementCoverage } from '../src/placement-policy.js';
import { UI_API_ROUTES } from '../src/ui-api-coverage.js';

const root = resolve(import.meta.dirname, '..');
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const metadata = infoMetadata();
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',cwd:root}).trim();
const dirty=!!execFileSync('git',['status','--porcelain'],{encoding:'utf8',cwd:root}).trim();
const buildId=`${commit}${dirty?'-working':''}`;
const [index, manifest, report] = await Promise.all([
  json('dist/automation/index.json'), json('dist/automation/manifest.json'),
  json('agent/output/API_REFERENCE_COVERAGE.json'),
]);
assertPlacementCoverage();
for (const [label, actual] of [['index', index.metadata], ['manifest', manifest], ['coverage', report]]) {
  for (const key of ['catalogHash', 'docsHash']) {
    if (actual[key] !== metadata[key]) throw new Error(`${label} ${key} differs from runtime`);
  }
}
if (manifest.version !== metadata.pageApiVersion || report.pageApiVersion !== metadata.pageApiVersion)
  throw new Error('Page API version differs across release artifacts');
if (index.metadata.buildId !== buildId || manifest.buildId !== buildId)
  throw new Error('Build ID differs across page and static discovery artifacts');
const cards = new Map(index.cards.map(card => [card.id, card]));
for (const op of listOperations()) {
  const id = ['import', 'remove'].includes(op.id) ? (op.id === 'import' ? 'files.import' : 'feature.remove') : op.id;
  if (!cards.has(id)) throw new Error(`Operation ${op.id} has no discoverable route`);
  if (!report.operations.some(item => item.id === op.id && item.placementPolicy))
    throw new Error(`Operation ${op.id} absent from coverage`);
}
for (const [id, route] of Object.entries(UI_API_ROUTES)) {
  if (!report.uiRoutes.some(item => item.id === id)) throw new Error(`UI route ${id} absent from coverage`);
  for (const tool of route.tools) if (!cards.has(tool)) throw new Error(`UI route ${id} misses ${tool}`);
}
const expected = new Set(manifest.tools.map(item => item.id + '.json'));
const actual = (await readdir(resolve(root, 'dist/automation/tools'))).filter(name => name.endsWith('.json'));
if (actual.length !== expected.size || actual.some(name => !expected.has(name)))
  throw new Error('Stale or missing generated tool card');
for (const path of ['dist/docs/USER-GUIDE.zh-CN.md', 'dist/automation/frame-placement.js',
  'dist/automation/quickstart.md', 'dist/automation/knowledge.md', 'dist/automation/tool-library.mjs',
  'dist/llms.txt']) await readFile(resolve(root, path));
console.log(`Release gate passed: ${report.operations.length} operations, ${report.executeActions.length} actions, ${report.uiRoutes.length} UI routes`);
