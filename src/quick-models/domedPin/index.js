import {hardwareDefinitions,buildHardwareModel} from '../hardware-models.js';
export default Object.freeze({kind:'domedPin',definition:hardwareDefinitions.domedPin,iconUrl:new URL('./icon.svg',import.meta.url).href,build:(params,cad,options)=>buildHardwareModel('domedPin',params,cad,options.oc||cad.getOC())});
