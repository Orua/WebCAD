const smooth=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
const cap=(x,width)=>1-smooth(Math.abs(x)/width);
// A single joint height surface with a shared root, two valleys and three tips.
// It is never assembled from separate closed bodies or a max-height union.
export function branchTarget(x,y){
 const t=smooth(y/3),end=smooth((6-y)/1.5),front=smooth(y+1),width=.05+.65*end;
 return front*end*(.6*(1-t)*cap(x,3)+.9*t*[-1,0,1].reduce((h,k)=>h+cap(x-k*1.8*t,width),0));
}
export function branchField(){return {originMm:[-5.25,-3.25],sizeMm:[10.5,10.5],heightsMm:Array.from({length:169},(_,j)=>Array.from({length:169},(_,i)=>branchTarget(-5.25+i*.0625,-3.25+j*.0625))) };}
