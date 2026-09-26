// Static connection guidance, never a document snapshot or a host capability claim.
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const AGENT_ONBOARDING = freeze({
  version: 1,
  entrypoint: 'window.webcad.api.connect',
  startUrl: 'automation/agent-start.html',
  bootstrapUrl: 'automation/agent-start.json',
  connectionDoc: 'api.connection',
  workflowDoc: 'api.workflow',
  localKit: {
    manifestUrl: 'automation/agent-kit.json',
    installerUrl: 'automation/install-agent.ps1',
    skillUrl: 'automation/webcad-page-api/SKILL.md',
    clientUrl: 'automation/webcad-page-api/scripts/page-client.mjs',
    routesUrl: 'automation/routes.json',
    installation: 'host-opt-in',
  },
  host: {
    documentation: 'current-host-first',
    transport: 'authorized-page-script',
    fallback: 'report-missing-capability',
  },
  steps: [
    {id:'bind-tab',action:'Bind the user-selected WebCAD tab using the current host documentation.',check:'Verify the actual tab identity; preserve its current document and do not reload it.'},
    {id:'list-capabilities',action:'Read tab.capabilities.list() when the current host provides it.',check:'DOM read access alone neither proves nor rules out an authorized page-script channel.'},
    {id:'read-cdp-docs',action:'If cdp is listed and authorized, read (await tab.capabilities.get("cdp")).documentation().',check:'Follow the current host API and permission limits; other hosts use their documented equivalent.'},
    {id:'runtime-evaluate',action:'Use documented Runtime.evaluate to call window.webcad.api.connect({queries:["task capability"],limit:2,includeContracts:true}) with awaitPromise:true and returnByValue:true where supported.',check:'Inspect exceptionDetails/result, then canExecute/blockers/requestContext. ready alone is insufficient; wait or request the required preview decision without changing the document.'},
    {id:'contracts',action:'Read returned contracts; use getTools({ids,expectedCatalogHash}) only for missing relevant cards.',check:'Use the live page version and hashes. Cache complete static cards only, never state or topology IDs.'},
    {id:'run',action:'Submit the authorized task with api.run({context:requestContext,idempotencyKey,steps}).',check:'Use explicit params/refs and prior-result $ref links; retain the existing bounded, non-atomic batch protocol.'},
    {id:'readback',action:'Read per-step receipts, current getState(), exact measurements and the matching rendered frame.',check:'Distinguish committed geometry from rendered display; unknown results require inspection before any retry.'},
  ],
  constraints: [
    'Current host documentation takes priority over examples in this metadata.',
    'A host transport failure does not prove that the WebCAD page API is unavailable.',
    'Do not reload or replace an existing document to establish a connection.',
    'Do not install a service, bridge or alternate transport to bypass host restrictions.',
    'The local kit is optional and installs only after host/user opt-in; it does not grant browser access.',
    'Do not use the manual JSON debug panel as an automatic connection fallback.',
  ],
});
