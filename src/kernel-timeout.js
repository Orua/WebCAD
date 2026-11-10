// Ordinary committed rebuilds (fillet, chamfer, shell, boolean, loft …) get a
// terminating deadline. The soft reminder at localTimeoutMs stays; the hard
// deadline terminates the Worker, rejects with KERNEL_TIMEOUT/not_committed and
// rebuild() restores the last committed document. Rounding postconditions
// (validateRoundingResult) are untouched: a timed-out candidate never commits.
export const REBUILD_HARD_TIMEOUT = Object.freeze({ minimumMs: 180000, multiplier: 3, maximumMs: 900000 });

export function rebuildHardTimeoutMs(localTimeoutMs = 60000) {
  const local = Number.isFinite(localTimeoutMs) && localTimeoutMs > 0 ? localTimeoutMs : 60000;
  return Math.min(REBUILD_HARD_TIMEOUT.maximumMs, Math.max(REBUILD_HARD_TIMEOUT.minimumMs, local * REBUILD_HARD_TIMEOUT.multiplier, local));
}

// Timer plan for one kernel request: soft reminder (never terminates) and an
// optional hard stop that is never extended by progress messages.
export function kernelRequestTimers(type, { localTimeoutMs = 60000, hardTimeoutMs } = {}) {
  if (type === 'ready') return { softMs: null, startMs: 45000, hardMs: null };
  const hardMs = Number.isFinite(hardTimeoutMs) && hardTimeoutMs > 0 ? hardTimeoutMs : null;
  return { softMs: hardMs !== null && hardMs <= localTimeoutMs ? null : localTimeoutMs, startMs: null, hardMs };
}
