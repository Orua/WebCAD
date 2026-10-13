import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULT_THEME_COLOR,workspaceThemeTokens,contrastRatio} from '../src/ui/config/theme-colors.js';
import {applyWorkspaceTheme} from '../src/ui/settings/workspace-settings.js';
import {DISPLAY_DEFAULTS} from '../src/display-preferences.js';
import {UI_LAYOUT} from '../src/ui-layout.js';
import {QUICK_MODEL_ENTRIES} from '../src/quick-models.js';

test('Goldenluck default and saved custom colour use one shared theme token set',()=>{
  assert.equal(DEFAULT_THEME_COLOR,'#3a6eba');assert.equal(DISPLAY_DEFAULTS.themeColor,DEFAULT_THEME_COLOR);
  const props=new Map(),modalProps=new Map(),app={style:{setProperty:(key,value)=>props.set(key,value)},ownerDocument:{documentElement:{style:{setProperty:(key,value)=>modalProps.set(key,value)}}}};
  applyWorkspaceTheme(app,'#9333ea');assert.equal(props.get('--accent'),'#9333ea');assert(props.get('--accent-soft').includes('#9333ea'));
  applyWorkspaceTheme(app,'#0c827d');assert.equal(props.get('--accent'),'#0c827d');assert.notEqual(props.get('--accent-ink'),'#9333ea');assert.equal(modalProps.get('--accent'),'#0c827d');assert.equal(modalProps.get('--accent-contrast'),props.get('--accent-contrast'));
  assert.equal(workspaceThemeTokens('invalid')['--accent'],DEFAULT_THEME_COLOR);
  for(const color of ['#3a6eba','#0c827d','#9333ea']){const tokens=workspaceThemeTokens(color);assert.equal(tokens['--accent-ink'],color);assert.equal(tokens['--accent-dark'],color);}
});
test('theme text and primary foreground remain readable for configured bright and dark colours',()=>{
  for(const color of ['#3a6eba','#0c827d','#9333ea','#ea580c','#666666','#ffffff','#ffff00','#7f7f7f','#000000']){
    const tokens=workspaceThemeTokens(color);assert.equal(tokens['--accent'],color);
    assert(contrastRatio(tokens['--accent-ink'],'#ffffff')>=4.5,color+' text');
    assert(contrastRatio(tokens['--accent-contrast'],color)>=4.5,color+' primary');
  }
});
test('new workspaces contain no fixed palette and model icons share a single grid and stroke',async()=>{
  const css=await readFile(new URL('../src/workspace-upgrade.css',import.meta.url),'utf8');assert(!/#[0-9a-f]{3,8}\b/i.test(css));
  const svgs=[];
  for(const kind of Object.keys(QUICK_MODEL_ENTRIES)){
    const svg=await readFile(new URL('../src/quick-models/'+kind+'/icon.svg',import.meta.url),'utf8');
    assert(svg.includes('viewBox="0 0 24 24"'),kind);assert(svg.includes('stroke-width="1.6"'),kind);assert(svg.includes('stroke="currentColor"'),kind);assert(svg.includes('fill="none"'),kind);svgs.push(svg);
  }
  assert.equal(svgs.length,47);assert.equal(new Set(svgs).size,47);
  for(const tab of UI_LAYOUT.tabs)for(const [,actions]of tab.groups)for(const action of actions)assert(UI_LAYOUT.icons[action]?.length,action);
  assert.notDeepEqual(UI_LAYOUT.icons.servicesSettings,UI_LAYOUT.icons.logo);assert.notDeepEqual(UI_LAYOUT.icons.helix,UI_LAYOUT.icons.curveSweep);assert.notDeepEqual(UI_LAYOUT.icons.roundEnd,UI_LAYOUT.icons.fillet);
});
