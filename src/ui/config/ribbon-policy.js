// Layout-only policy. Geometry/tool implementations do not decide menu folding.
export function ribbonGroupPolicy(layout,tab,actions,options={}){
  const config={...layout.ribbon,...tab.ribbon,...options};
  const visibleActions=Math.max(1,Math.floor(config.visibleActions??3));
  const minOverflow=Math.max(2,Math.floor(config.minOverflow??2));
  const unfolded=options.unfolded??tab.unfolded??false;
  return {visibleActions,folded:!unfolded&&actions.length-visibleActions>=minOverflow,
    overflowLabel:config.overflowLabel??'更多 ▾',overflowMenuWidth:config.overflowMenuWidth??210};
}
