import { QUICK_MODEL_ENTRIES } from './quick-models/catalog.js';

export function quickModelIcon(kind) {
  const entry = QUICK_MODEL_ENTRIES[kind];
  if (!entry) throw new Error('未知快捷模型图标：' + kind);
  const icon = document.createElement('img');
  icon.className = 'quick-model-icon';
  icon.src = entry.iconUrl;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

export const quickModelIconKinds = Object.freeze(Object.keys(QUICK_MODEL_ENTRIES));
