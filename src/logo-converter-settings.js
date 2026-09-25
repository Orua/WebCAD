const STORAGE_KEY = 'webcad.logoConverter.v1';

const configError = (message, code = 'CONVERTER_CONFIG_FAILED') => Object.assign(new Error(message), { code });

function storage() {
  try {
    const value = globalThis.localStorage;
    if (!value) throw new Error('unavailable');
    return value;
  } catch {
    throw configError('浏览器不允许保存本地配置。请允许此站点使用本地存储。', 'CAPABILITY_UNAVAILABLE');
  }
}

export function getLogoConverterConfig() {
  let saved;
  try {
    saved = storage().getItem(STORAGE_KEY);
  } catch (error) {
    if (error.code) throw error;
    throw configError('读取本地转换配置失败', 'CAPABILITY_UNAVAILABLE');
  }
  if (!saved) return { configured: false, url: '', key: '', hasKey: false, storage: 'localStorage' };
  let config;
  try { config = JSON.parse(saved); } catch { throw configError('本地转换配置已损坏，请重新保存。'); }
  const url = typeof config?.url === 'string' ? config.url : '';
  const key = typeof config?.key === 'string' ? config.key : '';
  return { configured: Boolean(url && key), url, key, hasKey: Boolean(key), storage: 'localStorage' };
}

export function setLogoConverterConfig(input) {
  let url;
  try { url = new URL(input?.url); } catch { throw configError('请输入有效的转换 URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || !url.searchParams.has('userid'))
    throw configError('转换 URL 须为含 userid 的 HTTP(S) 地址');
  if (input.key !== undefined && typeof input.key !== 'string') throw configError('Key 格式无效');
  const key = input.key || getLogoConverterConfig().key;
  if (!key || key.length > 512) throw configError('请填写有效的转换 Key');
  try { storage().setItem(STORAGE_KEY, JSON.stringify({ url: url.href, key })); }
  catch { throw configError('保存失败：浏览器不允许本地存储', 'CAPABILITY_UNAVAILABLE'); }
  const saved = getLogoConverterConfig();
  if (saved.url !== url.href || saved.key !== key) throw configError('保存后回读不一致，请重新尝试');
  return saved;
}
