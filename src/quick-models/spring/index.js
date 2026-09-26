import {hardwareDefinitions,buildHardwareModel} from '../hardware-models.js';
export default Object.freeze({kind:'spring',definition:hardwareDefinitions.spring,iconUrl:new URL('./icon.svg',import.meta.url).href,build:(params,cad,options)=>buildHardwareModel('spring',params,cad,options.oc||cad.getOC())});
