import {hardwareDefinitions,buildHardwareModel} from '../hardware-models.js';
export default Object.freeze({kind:'screw',definition:hardwareDefinitions.screw,iconUrl:new URL('./icon.svg',import.meta.url).href,build:(params,cad,options)=>buildHardwareModel('screw',params,cad,options.oc||cad.getOC())});
