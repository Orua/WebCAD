import {QUICK_LABELS,QUICK_GROUPS,QUICK_HIDDEN_KINDS} from './presentation.js';
// Edit this one ordered list to publish, hide, or reorder installed models.
import uEndHolePlate from './uEndHolePlate/index.js';
import ellipseSectionRing from './ellipseSectionRing/index.js';
import arcBandPlate from './arcBandPlate/index.js';
import gableOpenFrame from './gableOpenFrame/index.js';
import ellipseSectionRectFrame from './ellipseSectionRectFrame/index.js';
import dFlatFrame from './dFlatFrame/index.js';
import archedTwinWindowPlate from './archedTwinWindowPlate/index.js';
import bowedTwinWindowPlate from './bowedTwinWindowPlate/index.js';
import flatFrame from './flatFrame/index.js';
import roundedFlatFrame from './roundedFlatFrame/index.js';
import twinWindowPlate from './twinWindowPlate/index.js';
import mountingPlate from './mountingPlate/index.js';
import fourHolePlate from './fourHolePlate/index.js';
import bossPlate from './bossPlate/index.js';
import flangedBushing from './flangedBushing/index.js';
import openArcRing from './openArcRing/index.js';
import roundedBossTray from './roundedBossTray/index.js';
import roundBadge from './roundBadge/index.js';
import thinWallTray from './thinWallTray/index.js';
import tube from './tube/index.js';
import counterboreTool from './counterboreTool/index.js';
import ring from './ring/index.js';
import ringBar from './ringBar/index.js';
import ellipseBar from './ellipseBar/index.js';
import ellipseOpenWire from './ellipseOpenWire/index.js';
import profileLoop from './profileLoop/index.js';
import capsuleWire from './capsuleWire/index.js';
import dBuckle from './dBuckle/index.js';
import dBarBuckle from './dBarBuckle/index.js';
import rectBuckle from './rectBuckle/index.js';
import sliderBuckle from './sliderBuckle/index.js';
import ovalBuckle from './ovalBuckle/index.js';
import washer from './washer/index.js';
import spring from './spring/index.js';
import screw from './screw/index.js';
import threadedSleeve from './threadedSleeve/index.js';
import domedPin from './domedPin/index.js';
import buckleTongue from './buckleTongue/index.js';
import pullCoreBar from './pullCoreBar/index.js';
import keyRing from './keyRing/index.js';
import hangingRod from './hangingRod/index.js';
import archedBridge from './archedBridge/index.js';
import squareArchedBridge from './squareArchedBridge/index.js';
import mushroomRivet from './mushroomRivet/index.js';
import nippleStud from './nippleStud/index.js';
import twoPieceEyelet from './twoPieceEyelet/index.js';
import alloyEyelet from './alloyEyelet/index.js';
import frameEyelet from './frameEyelet/index.js';
import uStrapClip from './uStrapClip/index.js';

import {chainDefinitions,buildChain} from './chain-models.js';
import {ironFootDefinition,buildIronFoot} from './iron-foot.js';
import {buildModelScript} from './model-script.js';
const chainEntries=Object.entries(chainDefinitions).map(([kind,definition])=>({kind,definition,build:buildChain,iconUrl:new URL('./ring/icon.svg',import.meta.url).href}));
const installed = [
  ...chainEntries,
  {kind:'ironFoot',definition:ironFootDefinition,build:buildIronFoot,iconUrl:new URL('./uStrapClip/icon.svg',import.meta.url).href},
  ring, washer, tube, domedPin, spring, screw, threadedSleeve, alloyEyelet,
  roundBadge, mountingPlate, fourHolePlate, flatFrame, roundedFlatFrame,
  dBuckle, rectBuckle, ovalBuckle, sliderBuckle, dBarBuckle,
  flangedBushing, bossPlate, thinWallTray, roundedBossTray,
  openArcRing, counterboreTool, twinWindowPlate,
  uEndHolePlate,
  ellipseSectionRing,
  arcBandPlate,
  gableOpenFrame,
  ellipseSectionRectFrame,
  dFlatFrame,
  archedTwinWindowPlate,
  bowedTwinWindowPlate,
  ringBar,
  ellipseBar,
  ellipseOpenWire,
  profileLoop,
  capsuleWire,
  buckleTongue,
  pullCoreBar,
  keyRing,
  hangingRod,
  archedBridge,
  squareArchedBridge,
  mushroomRivet,
  nippleStud,
  twoPieceEyelet,
  frameEyelet,
  uStrapClip,
];
const groupOf=new Map(QUICK_GROUPS.flatMap(group=>group.kinds.map(kind=>[kind,group])));
const byInstalled=new Map(installed.map(entry=>[entry.kind,entry]));
const kinds=[...QUICK_GROUPS.flatMap(group=>group.kinds),...QUICK_HIDDEN_KINDS];
if(new Set(kinds).size!==installed.length||kinds.some(kind=>!byInstalled.has(kind)))throw Error('Published quick groups must cover every installed kind once');
const entries=kinds.map(kind=>{const entry=byInstalled.get(kind),group=groupOf.get(kind);return {...entry,definition:{...entry.definition,label:QUICK_LABELS[kind]||entry.definition.label,category:group?.id||'legacy',categoryLabel:group?.label||'旧工程兼容'}};});
const hiddenFromPicker=new Set(QUICK_HIDDEN_KINDS);
const byKind = Object.fromEntries(entries.map(entry => [entry.kind, entry]));
if (Object.keys(byKind).length !== entries.length) throw new Error('Duplicate quick model kind');
for (const kind of hiddenFromPicker) if (!Object.hasOwn(byKind, kind)) throw new Error('Unknown hidden quick model: ' + kind);
if (hiddenFromPicker.size === entries.length) throw new Error('Quick model picker needs at least one visible model');
for (const entry of entries) {
  if (!entry.definition?.label || !entry.iconUrl || typeof entry.build !== 'function') throw new Error('Incomplete quick model: ' + entry.kind);
  for (const field of entry.definition.fields || []) if (!Object.hasOwn(entry.definition.defaults, field.key)) throw new Error('Missing default for ' + entry.kind + '.' + field.key);
}
export const QUICK_MODEL_ENTRIES = Object.freeze(byKind);
// Each template declares a stable insertion semantic. The catalog uses its
// source modeling origin until that template defines and tests a richer anchor.
export const QUICK_MODELS = Object.freeze(Object.fromEntries(entries.map(entry => [entry.kind, Object.freeze({...entry.definition,defaultInsertionAnchor:entry.definition.defaultInsertionAnchor||'model-origin'})])));
export const QUICK_MODEL_VISIBLE_KINDS = Object.freeze(entries.map(entry => entry.kind).filter(kind => !hiddenFromPicker.has(kind)));
export function buildQuickModel(params, cad, options = {}) {
  if(params?.modelScript){const {modelScript,...values}=params;return buildModelScript(modelScript,values,cad,options,QUICK_MODELS,buildQuickModel);}
  const entry = QUICK_MODEL_ENTRIES[params?.kind];
  if (!entry) throw new Error('未知快速模型');
  return entry.build(params, cad, options, { definitions: QUICK_MODELS, buildNested: buildQuickModel });
}
