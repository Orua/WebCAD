// Independent structured-grid fixture. Boundary edges generate the outer wall
// and the clockwise hole wall; no production relief creator is called.
export function reliefHoleFixture(){
 const nx=40,ny=24,step=.25,row=nx+1,count=row*(ny+1),positions=new Float64Array(count*6),indices=[],edgeUses=new Map();
 for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){const u=-5+x*step,v=-3+y*step,h=Math.max(0,1-((u+2)/1.2)**2-v*v)*.8,id=y*row+x;positions.set([u,v,h],id*3);positions.set([u,v,-2],(count+id)*3);}
 const face=(a,b,c)=>{indices.push(a,b,c,count+a,count+c,count+b);for(const [u,v]of [[a,b],[b,c],[c,a]]){const key=u<v?`${u}:${v}`:`${v}:${u}`;if(edgeUses.has(key))edgeUses.delete(key);else edgeUses.set(key,[u,v]);}};
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const u=-5+(x+.5)*step,v=-3+(y+.5)*step;if(u>1.5&&u<2.5&&Math.abs(v)<.5)continue;const a=y*row+x;face(a,a+1,a+row+1);face(a,a+row+1,a+row);}
 for(const [a,b]of edgeUses.values())indices.push(a,count+a,count+b,a,count+b,b);
 return {positions,indices:new Uint32Array(indices)};
}
