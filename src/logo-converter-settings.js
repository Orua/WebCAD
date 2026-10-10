import {getServicesConfig,serviceError} from './services/settings.js';
// Deprecated adapter; old LOGO endpoint and key never authorize Services.
export function getLogoConverterConfig(){const value=getServicesConfig();return {...value,hasKey:value.hasCredential,deprecated:true};}
export function setLogoConverterConfig(){throw serviceError('SERVICES_MIGRATION_REQUIRED','旧 LOGO URL/Key 不再使用，请在唯一 Services 设置中重新验证地址和授权');}
