const n=(key,label,labelEn,min=0)=>({key,label,labelEn,type:'number',min,step:.1,unit:'mm'});
export default Object.freeze({
  label:'安装鸡眼',labelEn:'Mounting frame eyelet',defaultInsertionAnchor:'model-origin',
  description:'圆形或圆角方形面框、恒壁厚短颈口、对称安装柱及普通直孔，一次生成单件。颈口和柱沿本地+Z；面框底面Z=0。孔深0为通孔，正值为从柱顶向下的盲孔。安装柱数量0/2/4，2柱沿Y布置。可将颈口/柱高度设0作背片。不含牙槽、锥孔、压铆、饰面及三维边圆角；按原图再加工。圆形模式内外宽高必须分别相等，角R仅用于方形。',
  descriptionEn:'One exact circular or rounded rectangular frame with an optional constant-wall collar, symmetric mounting posts and plain straight holes. Collar and posts extend along local +Z from a flange at Z=0. Hole depth 0 means through; positive depth is blind from the post top. 0/2/4 posts; two posts lie on Y. Zero collar/post heights make a backplate. No threads, taper, riveting, decoration or 3D edge blends. Circular mode requires matching width/height pairs; corner radii apply only to rectangular mode.',
  defaults:{shape:'roundedRect',outerWidthMm:25.6,outerHeightMm:30,outerRadiusMm:3.5,boreWidthMm:12,boreHeightMm:16.5,boreRadiusMm:1.2,flangeThicknessMm:1.5,collarProjectionMm:3,collarWallMm:.3,mountingCount:4,pitchXMm:6,pitchYMm:22.6,bossDiameterMm:4,bossHeightMm:3.5,holeDiameterMm:2.6,holeDepthMm:2},
  fields:[{key:'shape',label:'面框形状',labelEn:'Frame shape',type:'select',options:[{value:'round',label:'圆形',labelEn:'Circular'},{value:'roundedRect',label:'圆角方形',labelEn:'Rounded rectangle'}]},
    n('outerWidthMm','外宽/外径','Outer width/diameter',.01),n('outerHeightMm','外高（圆形=外宽）','Outer height (circular=width)',.01),n('outerRadiusMm','方形外角R','Outer rectangular corner R'),
    n('boreWidthMm','内孔宽/径','Bore width/diameter',.01),n('boreHeightMm','内孔高（圆形=内宽）','Bore height (circular=width)',.01),n('boreRadiusMm','方形内角R','Bore rectangular corner R'),
    n('flangeThicknessMm','面框厚度','Flange thickness',.01),n('collarProjectionMm','颈口伸出长（0=无）','Collar projection (0=none)'),n('collarWallMm','颈口壁厚','Collar wall thickness',.01),
    {key:'mountingCount',label:'安装柱数量（0/2/4）',labelEn:'Post count (0/2/4)',type:'number',min:0,max:4,step:2,unit:'1'},
    n('pitchXMm','四柱横向中心距','Four-post X pitch'),n('pitchYMm','纵向中心距','Y pitch'),n('bossDiameterMm','安装柱外径','Post diameter',.01),n('bossHeightMm','安装柱伸出长（0=无柱）','Post height (0=none)'),n('holeDiameterMm','普通孔径（0=实柱）','Plain hole diameter (0=solid)'),n('holeDepthMm','孔深（0=通孔）','Hole depth (0=through)')],
});
