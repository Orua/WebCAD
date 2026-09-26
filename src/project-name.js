const prefix = 'webcad.projectNameSequence.v1.';

export function createProjectNamer(storage, now = () => new Date()) {
  const counters = new Map();
  return () => {
    const date = now();
    const day = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const key = prefix + day;
    let previous = counters.get(day) || 0;
    try {
      const raw = storage?.getItem(key);
      const saved = raw && /^\d+$/.test(raw) ? Number(raw) : 0;
      if (Number.isSafeInteger(saved) && saved >= 0) previous = Math.max(previous, saved);
    } catch { /* Keep this page's counter when browser storage is unavailable. */ }
    if (previous >= Number.MAX_SAFE_INTEGER) throw new Error('当天工程序号已达到上限');
    const sequence = previous + 1;
    counters.set(day, sequence);
    try { storage?.setItem(key, String(sequence)); } catch { /* In-memory fallback. */ }
    return `新建工程${day}-${String(sequence).padStart(3, '0')}`;
  };
}

let namer;
export function nextProjectName() {
  if (!namer) {
    let storage;
    try { storage = globalThis.localStorage; } catch { /* Restricted browser storage. */ }
    namer = createProjectNamer(storage);
  }
  return namer();
}
