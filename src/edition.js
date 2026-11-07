// Edition is fixed by the build, never by URL, deployment globals or browser storage.
export const EDITION = typeof __WEBCAD_EDITION__ === 'string' ? __WEBCAD_EDITION__
  : (typeof process === 'object' && process.env?.WEBCAD_EDITION) || 'integrated';
if (!['public', 'integrated'].includes(EDITION)) throw new Error('Invalid WebCAD edition');
export const PUBLIC_EDITION = EDITION === 'public';
export const EDITION_CAPABILITIES = Object.freeze({edition:EDITION, localPageApi:true,
  agentWorkspace:!PUBLIC_EDITION, hostChannels:!PUBLIC_EDITION,
  servicesPolicy:PUBLIC_EDITION?'explicit-same-origin-visitor-session':'explicit-configuration',
  publicDistribution:'pending-license-gate'});
export function requireIntegratedCapability(){
  if(PUBLIC_EDITION)throw Object.assign(new Error('此版本不提供 Agent 工作台。本地建模和文件导出仍可使用。'),{code:'CAPABILITY_UNAVAILABLE'});
}
