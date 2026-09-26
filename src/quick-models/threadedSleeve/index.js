import {hardwareDefinitions,buildHardwareModel} from '../hardware-models.js';
export default Object.freeze({kind:'threadedSleeve',definition:hardwareDefinitions.threadedSleeve,iconUrl:new URL('./icon.svg',import.meta.url).href,build:(params,cad,options)=>buildHardwareModel('threadedSleeve',params,cad,options.oc||cad.getOC())});
