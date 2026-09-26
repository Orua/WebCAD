// Layout-only policy. Geometry/tool implementations do not decide menu folding.
export function ribbonGroupPolicy(layout,tab,actions,options={}){
  const config={...layout.ribbon,...tab.ribbon,...options};
  const visibleActions=Math.max(1,Math.floor(config.visibleActions??3));
  const minOverflow=Math.max(2,Math.floor(config.minOverflow??2));
  const unfolded=options.unfolded??tab.unfolded??false;
  if(Array.isArray(options.overflowActions)){
    const overflowActions=actions.filter(action=>options.overflowActions.includes(action));
    return {visibleActions:actions.length-overflowActions.length,overflowActions,folded:overflowActions.length>0,
      overflowLabel:config.overflowLabel??'更多 ▾',overflowMenuWidth:config.overflowMenuWidth??210};
  }
  return {visibleActions,folded:!unfolded&&actions.length-visibleActions>=minOverflow,
    overflowLabel:config.overflowLabel??'更多 ▾',overflowMenuWidth:config.overflowMenuWidth??210};
}
