import { QUICK_MODEL_ENTRIES } from './quick-models/catalog.js';

export function quickModelIcon(kind) {
  const entry = QUICK_MODEL_ENTRIES[kind];
  if (!entry) throw new Error('未知快捷模型图标：' + kind);
  const icon = document.createElement('span');
  icon.className = 'tool-icon quick-model-icon';
  icon.style.maskImage = `url("${entry.iconUrl}")`;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

export const quickModelIconKinds = Object.freeze(Object.keys(QUICK_MODEL_ENTRIES));
