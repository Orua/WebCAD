// Keep text-editing shortcuts native while routing canvas shortcuts to WebCAD.
export function webcadShortcut(event, { editing = false, dialogOpen = false } = {}) {
  if (event.isComposing || event.altKey) return null;
  const key = String(event.key || '').toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  if (editing || dialogOpen) return mod && key === 's' ? 'save' : null;
  if (mod) {
    if (key === 'a') return 'selectAll';
    if (key === 'c') return 'copySelection';
    if (key === 'v') return 'pasteSelection';
    if (key === 's') return 'save';
    if (key === 'o') return 'open';
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
    if (key === 'y') return 'redo';
    return null;
  }
  if (key === 'delete') return 'remove';
  if (key === 'f') return 'fit';
  return null;
}
