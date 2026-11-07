import '../host-control.css';
import '../agent/assistant-panel.css';
export {createHostControl,installHostInteractionGuard,hostControlAllowed} from '../host-control.js';
export {createAssistantPanel} from '../agent/assistant-panel.js';
import {createHostAdapter} from '../agent/host-adapter.js';
import {uploadChunked,uploadArtifact,createBrokerUploadClient} from '../transfer/chunked-upload.js';
import {AGENT_CONTRACT} from '../agent/protocol.js';
export const agent=Object.freeze({contract:AGENT_CONTRACT,createHostAdapter,uploadChunked,uploadArtifact,createBrokerUploadClient});
export async function connectLegacyAI(...args){const {connectAI}=await import('../ai-bridge.js');return connectAI(...args);}
