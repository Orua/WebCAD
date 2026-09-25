// Explicit portable/local test groups; never silently omit an unclassified test.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const groups = {
  contracts: [
    'tool-discovery', 'browser-logo-input', 'page-batch', 'page-api', 'browser-files', 'artifact-store', 'command-service', 'document-identity', 'logo-import-request', 'operation-registry',
    'parameter-calculator', 'named-parameters', 'recovery-isolation', 'selection-contract',
    'tool-state', 'viewport-transform', 'dfam-inspection', 'profile-fitting', 'text-commands',
  ],
  kernel: [
    'advanced-integration', 'advanced-kernel', 'advanced-loft', 'curve-sweep',
    'curved-logo', 'fitted-surface', 'geometry-query', 'group-explode',
    'hardware-templates', 'igs-tools', 'igs30-slot', 'igs30-templates', 'multi-pocket', 'multi-boss', 'dwg-ring-bar', 'dwg-rounded-frame', 'dwg-compact-rect', 'dwg-chamfered-section', 'dwg-compact-slider', 'dwg-figure-eight-capsule', 'dwg-u-end-hole-plate', 'dwg-twin-window-plate', 'dwg-small-twin-window', 'dwg-spline-twin-window', 'dwg-ellipse-bar', 'dwg-ellipse-open-wire', 'dwg-ellipse-u-wire', 'dwg-analytic-arc-profile', 'dwg-profile-loop', 'dwg-capsule-wire', 'dwg-arc-band-plate', 'dwg-ellipse-section-ring', 'dwg-flat-washer', 'dwg-polar-hole-ring', 'dwg-bowed-twin-window', 'dwg-arched-twin-window', 'dwg-d-flat-frame', 'dwg-gable-open-frame', 'dwg-ellipse-section-rect',
    'incremental-rebuild', 'kernel', 'logo-draft', 'logo-kernel', 'logo-model',
    'position-tools', 'reference-curves', 'reference-integration', 'reference-profiles',
    'surface-repair', 'vector-profile', 'extract-shell-kernel', 'query-planar-spline',
    'planar-thickness-invariant', 'round-edit-preferences', 'rounding-modes', 'smooth-transition',
  ],
  mcp: ['bridge-cancellation', 'mcp-bridge', 'mcp-v2', 'document-assets', 'agent-cli'],
  'local-fixtures': ['iges-import', 'iges-roundtrip'],
};
const fixturePaths = [
  ['WEBCAD_IGES_IMPORT_FIXTURE', process.env.WEBCAD_IGES_IMPORT_FIXTURE || 'G:/TEXT-TO-CAD/工程图3D_20260914/0/gc15372.igs'],
  ['WEBCAD_IGES_ROUNDTRIP_FIXTURE', process.env.WEBCAD_IGES_ROUNDTRIP_FIXTURE || 'G:/TEXT-TO-CAD/工程图3D_20260914/GC/HS13006.igs'],
];

function stop(status, message, code) {
  console.error(`[${status}] ${message}`);
  process.exit(code);
}

const browserGroups={'page-browser':'page-api-browser','parameters-browser':'page-parameters-browser','products-browser':'page-products-browser','page-boundaries':'page-boundaries-browser','page-ui':'page-ui-browser','trial-browser':'trial-browser','reference-browser':'reference-profiles-browser'};
const group = process.argv[2] || 'portable';
if (process.argv.length > 3 || !['portable', 'e2e', 'e2e-m2a', 'e2e-m2a-portable', 'ui-m2a', ...Object.keys(browserGroups), ...Object.keys(groups)].includes(group)) {
  stop('FAIL', 'Usage: node scripts/test.mjs [portable|contracts|kernel|mcp|e2e|e2e-m2a|ui-m2a|local-fixtures|trial-browser]', 1);
}
const expected = Object.values(groups).flat().map(name => `${name}.test.mjs`);
const found = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.mjs'));
const unclassified = found.filter(name => !expected.includes(name));
const missing = expected.filter(name => !found.includes(name));
if (new Set(expected).size !== expected.length || unclassified.length || missing.length) {
  stop('FAIL', `Test manifest mismatch; unclassified=${unclassified.join(',') || 'none'}; missing=${missing.join(',') || 'none'}. Update scripts/test.mjs explicitly.`, 1);
}
if (group === 'local-fixtures') {
  const absent = fixturePaths.filter(([, source]) => {
    try { return !fs.statSync(path.resolve(root, source)).isFile(); } catch { return true; }
  });
  if (absent.length) stop('BLOCKED', `Local IGES samples are missing: ${absent.map(([key, source]) => `${key}=${source}`).join('; ')}. Supply the matching original fixtures; no tests were skipped or counted as passed.`, 2);
}

let args;
if(group==='reference-browser') {
  args=['scripts/run-reference-browser.mjs'];
} else if (Object.hasOwn(browserGroups,group)) {
  if(!process.env.WEBCAD_PLAYWRIGHT_CLI||!fs.existsSync(process.env.WEBCAD_PLAYWRIGHT_CLI))stop('BLOCKED','Set WEBCAD_PLAYWRIGHT_CLI and open an isolated webcad-page-api Chrome session; serve dist with scripts/serve-static.mjs.',2);
  args=[process.env.WEBCAD_PLAYWRIGHT_CLI,'-s=webcad-page-api','run-code','--filename',`tests/${browserGroups[group]}.js`];
} else if (group === 'e2e-m2a-portable') {
  args = ['tests/m2a-portability.mjs'];
} else if (group === 'e2e-m2a') {
  args = ['tests/m2a-e2e.mjs'];
} else if (group === 'ui-m2a') {
  if (!process.env.WEBCAD_PLAYWRIGHT_CLI || !fs.existsSync(process.env.WEBCAD_PLAYWRIGHT_CLI)) stop('BLOCKED', 'Set WEBCAD_PLAYWRIGHT_CLI to the installed Playwright CLI JavaScript entrypoint; open the isolated webcad-m2a session first.', 2);
  args = [process.env.WEBCAD_PLAYWRIGHT_CLI, '-s=webcad-m2a', 'run-code', '--filename', 'tests/m2a-ui.js'];
} else if (group === 'e2e') {
  console.log('[e2e] Requires a task-owned isolated service and exactly one empty ready WebCAD test page. The test refuses an existing design. WEBCAD_TEST_URL defaults to http://127.0.0.1:17667/mcp.');
  args = ['tests/m1-e2e.mjs'];
} else {
  const names = group === 'portable' ? [...groups.contracts, ...groups.kernel, ...groups.mcp] : groups[group];
  console.log(`[${group}] ${names.length} test files; serial execution. Local fixtures and browser E2E are separate explicit targets.`);
  args = ['--test', '--test-concurrency=1', ...names.map(name => `tests/${name}.test.mjs`)];
}
const result = spawnSync(process.execPath, args, { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
if (result.error) stop('FAIL', result.error.message, 1);
if (result.signal) stop('FAIL', `Test process terminated by ${result.signal}.`, 1);
const code = result.status ?? 1;
console.log(`[${code === 0 ? 'PASS' : 'FAIL'}] ${group}; exit=${code}`);
process.exit(code);
