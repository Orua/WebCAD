import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const scopes = new Set(['public-web', 'integrated-web', 'agent-host', 'services', 'dev-only']);
const states = new Set(['verified', 'needs-review', 'blocked']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const generatedPublicFiles = new Set([
  'llms.txt', 'vector-dwg-worker.js', 'web.config', 'docs/USER-GUIDE.zh-CN.md',
  ...['agent-bundle.zip','agent-kit.json','agent-knowledge.json','agent-routing.json','agent-start.html',
    'agent-start.json','clevis-practice.js','frame-placement.js','hardware-practice.js','index.html','index.json',
    'index.md','install-agent.ps1','knowledge.md','manifest.json','page-api-plate.js','quickstart.md',
    'remote-agent.json','routes.json','runtime-uuid.js','tool-library.mjs'].map(path => 'automation/' + path),
]);
export const isGeneratedPublicMaterial = path => generatedPublicFiles.has(path) ||
  /^automation\/tools\/[^/]+\.json$/.test(path) || /^automation\/docs\/[^/]+\.md$/.test(path) ||
  path === 'automation/webcad-page-api/SKILL.md';

const safeRelative = path => typeof path === 'string' && path && !/[\\:]/.test(path) && !path.startsWith('/') &&
  !path.split('/').some(part => !part || part === '.' || part === '..');

// Scope labels describe possible use. The actual candidate decides which of
// those records apply; an installed but tree-shaken dependency is not bundled.
export function licenseRecordApplies(record, context) {
  if (!context.inventoryKnown) return true;
  if (record.id === 'application-rights') return true;
  if (record.packageName) return context.packages.some(pkg => pkg.name === record.packageName);
  if (record.activationModules) return record.activationModules.some(path => context.moduleFiles.some(file => file.path === path));
  if (record.activationArtifacts) return record.activationArtifacts.some(path => context.artifactPaths.includes(path));
  if (record.pathPrefixes) return context.copiedFiles.some(file => record.pathPrefixes.some(prefix => file.path.startsWith(prefix)));
  if (record.files) return context.copiedFiles.some(file => record.files.some(source => source.path === file.path));
  return true;
}
const sameFileEvidence = (source, file) => source.path === file.path && ((source.sha256 && source.sha256 === file.sha256) ||
  (source.normalizedSha256 && source.normalizedSha256 === file.normalizedSha256));

// A build integrity check is distinct from permission to distribute it.
export function evaluateLicensePolicy(policy, {scope, packages = [], copiedFiles = [], moduleFiles = [], artifactPaths = [], inventoryKnown = false}) {
  if (!scopes.has(scope)) throw Error(`Unknown distribution scope: ${scope}`);
  if (policy.schemaVersion !== 1 || !Array.isArray(policy.records) || !policy.records.length) throw Error('Invalid license policy');
  const ids = new Set();
  for (const record of policy.records) {
    if (!record.id || ids.has(record.id)) throw Error(`Duplicate or missing license record: ${record.id}`);
    ids.add(record.id);
    if (!states.has(record.evidenceStatus) || !record.distributionScopes?.length ||
        record.distributionScopes.some(s => !scopes.has(s))) throw Error(`Invalid license record: ${record.id}`);
    for (const key of ['path', 'component', 'originType', 'aiAssisted', 'sourceUrl', 'commit', 'version',
      'licenseExpression', 'noticePath', 'copyrightHolder', 'modified', 'patchEvidence', 'evidence']) {
      if (!(key in record)) throw Error(`Missing ${key}: ${record.id}`);
    }
  }
  const relevant = policy.records.filter(r => r.distributionScopes.includes(scope) &&
    licenseRecordApplies(r, {packages, copiedFiles, moduleFiles, artifactPaths, inventoryKnown}));
  const blockers = relevant.filter(r => r.evidenceStatus !== 'verified').map(r => `${r.id}: ${r.evidenceStatus}`);
  for (const record of relevant.filter(r => r.evidenceStatus === 'verified')) {
    if (!record.licenseExpression || !record.noticePath || typeof record.evidence !== 'string' || !record.evidence.trim() ||
        typeof record.copyrightHolder !== 'string' || !record.copyrightHolder.trim() || record.copyrightHolder === 'pending')
      blockers.push(`${record.id}: approval lacks supporting evidence`);
  }
  for (const pkg of packages) {
    const match = relevant.find(r => r.packageName === pkg.name && r.version === pkg.version);
    if (!match) blockers.push(`Unmapped package: ${pkg.name}@${pkg.version}`);
    else if (match.licenseExpression !== pkg.declaredLicense) blockers.push(`License changed: ${pkg.name}`);
  }
  for (const file of copiedFiles) {
    const match = relevant.find(r => sameFileEvidence(r, file) || r.files?.some(source => sameFileEvidence(source, file)));
    if (!match) blockers.push(`Unapproved copied file or changed bytes: ${file.path}`);
  }
  return {scope, allowed: blockers.length === 0, blockers};
}

export function auditLicensePolicy(root, inventory, scope) {
  if (!['public-web', 'integrated-web'].includes(scope))
    throw Error('Static inventory supports public-web or integrated-web only; other deployment scopes need their own inventory');
  const policy = JSON.parse(readFileSync(resolve(root, 'docs/compliance/source-license-map.json'), 'utf8'));
  if (!policy.records.some(r => r.id === 'application-rights' && r.distributionScopes.includes(scope)))
    throw Error('Application authorization record missing for distribution scope');
  for (const file of inventory.artifacts) {
    if (!safeRelative(file.path)) throw Error('Invalid distribution artifact path');
  }
  const copiedFiles = inventory.artifacts.filter(file => existsSync(resolve(root, 'public', file.path)))
    // These text outputs are generated from repository source. Their integrity is
    // already checked by verifyOpenSource; media and examples are never exempted.
    .filter(file => !isGeneratedPublicMaterial(file.path))
    .map(file => {
      const bytes = readFileSync(resolve(root, 'public', file.path));
      return {path:'public/' + file.path, sha256:file.sha256,
        // Only accept normalized notice evidence when the inventory actually
        // describes the copied source bytes; it cannot mask changed output.
        ...(digest(bytes) === file.sha256 && /\.(?:txt|md)$/.test(file.path) ?
          {normalizedSha256:digest(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n')))} : {})};
    });
  const packages = inventory.packages.filter(p => p.scope.includes('browser-bundled'));
  const context = {scope, packages, copiedFiles, inventoryKnown:true,
    artifactPaths:inventory.artifacts.map(file => file.path),
    moduleFiles:packages.flatMap(pkg => pkg.modules.map(file => ({...file, path:`node_modules/${pkg.name}/${file.path}`})))};
  for (const record of policy.records.filter(r => r.distributionScopes.includes(scope) && licenseRecordApplies(r, context))) {
    if (!safeRelative(record.noticePath)) throw Error(`Invalid notice path: ${record.id}`);
    const bytes = readFileSync(resolve(root, record.noticePath));
    if (record.noticeNormalizedSha256 && digest(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'))) !== record.noticeNormalizedSha256)
      throw Error(`Reviewed notice changed: ${record.id}`);
    for (const file of record.sourceFiles || []) {
      if (!safeRelative(file.path)) throw Error(`Invalid source evidence path: ${record.id}`);
      const bytes = readFileSync(resolve(root, file.path));
      const actual = file.normalizedSha256 ? digest(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'))) : digest(bytes);
      if (actual !== (file.normalizedSha256 || file.sha256)) throw Error(`Reviewed source changed: ${record.id}/${file.path}`);
    }
  }
  return evaluateLicensePolicy(policy, context);
}

export function checkLicensePolicy(root, outputDirectory, scope) {
  const inventory = JSON.parse(readFileSync(resolve(outputDirectory, 'open-source/inventory.json'), 'utf8'));
  const result = auditLicensePolicy(root, inventory, scope);
  if (!result.allowed) throw Error(`Distribution blocked (${scope}):\n${result.blockers.join('\n')}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [scope, outputDirectory] = process.argv.slice(2);
    if (!outputDirectory) throw Error('Usage: node scripts/license-policy.mjs <scope> <dist-directory>');
    console.log(JSON.stringify(checkLicensePolicy(resolve(import.meta.dirname, '..'), resolve(outputDirectory), scope)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
