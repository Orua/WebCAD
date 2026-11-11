// Explicit File-menu recovery discovery; startup never invokes this module to restore a project.
export const RECOVERY_KEYS = Object.freeze({ hint: 'webcad.recovery.latest', dismissed: 'webcad.recovery.dismissed', latest: 'recovery:latest', indexPrefix: 'recovery-index:' });

export function recoveryHasContent(document) {
  return !!(document && ((document.features?.length || 0) > 0 || (document.reliefDesigns?.length || 0) > 0 || Object.keys(document.imports || {}).length > 0));
}

export function recoveryIndexEntry(row) {
  return { instanceId: row.instanceId, documentId: row.document?.documentId ?? null, name: row.document?.name ?? null, revision: row.revision, savedAt: row.savedAt, featureCount: row.document?.features?.length || 0 };
}

export function requestedDocumentId(search) {
  try { const id = new URLSearchParams(search || '').get('document'); return id && /^[A-Za-z0-9._:-]{1,128}$/.test(id) ? id : null; } catch { return null; }
}

const dismissedMatches = (dismissed, row) => !!dismissed && dismissed.instanceId === row.instanceId && dismissed.savedAt === row.savedAt;

// index: recovery-index rows; rows: {key -> full row} already fetched (latest, hinted, url match).
export function chooseRecovery({ urlDocumentId = null, hint = null, dismissed = null, index = [], rows = {} } = {}) {
  const valid = row => row?.document && Number.isFinite(row.savedAt);
  if (urlDocumentId) {
    const candidates = [...index.filter(entry => entry?.documentId === urlDocumentId).map(entry => rows[`recovery:${entry.instanceId}`]), rows[RECOVERY_KEYS.latest]]
      .filter(row => valid(row) && row.document.documentId === urlDocumentId)
      .sort((a, b) => b.savedAt - a.savedAt);
    if (candidates[0]) return { row: candidates[0], source: 'url-document', defaultChoice: 'recover', urlDocumentId };
    return { row: null, source: 'url-document-missing', urlDocumentId };
  }
  if (hint?.instanceId) {
    const own = rows[`recovery:${hint.instanceId}`];
    if (valid(own) && own.instanceId === hint.instanceId && !dismissedMatches(dismissed, own)) return { row: own, source: 'same-tab', defaultChoice: 'fresh' };
  }
  const latest = rows[RECOVERY_KEYS.latest];
  if (valid(latest) && recoveryHasContent(latest.document) && !dismissedMatches(dismissed, latest)) return { row: latest, source: hint?.instanceId === latest.instanceId ? 'same-tab' : 'last-interrupted', defaultChoice: 'fresh' };
  return { row: null, source: 'none' };
}

// Which full rows main.js needs to read for chooseRecovery (bounded: ≤3 gets).
export function recoveryRowKeys({ urlDocumentId = null, hint = null, index = [] } = {}) {
  const keys = new Set([RECOVERY_KEYS.latest]);
  if (hint?.instanceId) keys.add(`recovery:${hint.instanceId}`);
  if (urlDocumentId) {
    const newest = index.filter(entry => entry?.documentId === urlDocumentId && entry.instanceId).sort((a, b) => b.savedAt - a.savedAt)[0];
    if (newest) keys.add(`recovery:${newest.instanceId}`);
  }
  return [...keys];
}

export function recoveryPrompt(choice) {
  if (choice.source === 'url-document') return { title: '打开链接中的工程', message: `本机有该工程的恢复副本「${choice.row.document.name || choice.urlDocumentId}」（修订 ${choice.row.revision ?? '?'}，${new Date(choice.row.savedAt).toLocaleString()}）。是否恢复？` };
  if (choice.source === 'last-interrupted') return { title: '发现上次中断的工程', message: `本机保存了另一个标签或上次中断前的工程「${choice.row.document.name || ''}」（${new Date(choice.row.savedAt).toLocaleString()}）。如果它仍在其它标签打开，恢复会得到一份独立副本。是否恢复？` };
  return { title: '发现上次中断的工程', message: '是否恢复刷新或断线前暂存的模型？' };
}
