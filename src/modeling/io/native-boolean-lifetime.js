// The matched OCCT binding's delete alone retains Boolean working data.
// Clear releases PaveFiller/history before disposing the native wrapper;
// result TopoDS handles own their topology independently.
export function releaseNativeBoolean(builder){
  if(!builder)return;
  try{builder.Clear();}finally{builder.delete();}
}

export function ownNativeBoolean(builder,own){
  own({delete:()=>releaseNativeBoolean(builder)});
  return builder;
}
