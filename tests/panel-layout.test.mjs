import test from 'node:test';
import assert from 'node:assert/strict';
import {isMobileInput,isMobileLayout} from '../src/agent/panel-layout.js';

const device=(userAgent,{touch=false,mobile,width=390}={})=>({
  navigator:{userAgent,...(mobile===undefined?{}:{userAgentData:{mobile}})},
  screen:{width,height:844},matchMedia:()=>({matches:touch})
});

test('Chrome desktop-site layout stays horizontal while phone Enter remains a newline',()=>{
  const desktopSite=device('Mozilla/5.0 (X11; Linux x86_64) Chrome/142.0.0.0 Safari/537.36',{touch:true,mobile:false});
  assert.equal(isMobileLayout(desktopSite),false);
  assert.equal(isMobileInput(desktopSite),true);
  const noHints=device(desktopSite.navigator.userAgent,{touch:true});
  assert.equal(isMobileLayout(noHints),false);
  assert.equal(isMobileInput(noHints),true);
});

test('normal phone layout and desktop sidebar input remain distinct',()=>{
  const android=device('Mozilla/5.0 (Linux; Android 14) Chrome/142 Mobile Safari/537.36',{touch:true,mobile:true});
  const iphone=device('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148',{touch:true});
  const pc=device('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/142',{width:1920});
  for(const phone of [android,iphone]){assert.equal(isMobileLayout(phone),true);assert.equal(isMobileInput(phone),true);}
  assert.equal(isMobileLayout(pc),false);
  assert.equal(isMobileInput(pc),false);
});
