// Small exact solids and Boolean cutters. Independent of the UI and worker.
const field = (key, label, labelEn) => ({key, label, labelEn, type:'number', min:0.1, step:0.1});
const check = (condition, message) => { if (!condition) throw new Error(message); };
const dispose = object => { try { object?.delete(); } catch {} };

export const HARDWARE_TEMPLATES = Object.freeze({
  thinWallTray: {
    label:'双空心柱薄壁壳', labelEn:'Open tray with two hollow bosses',
    description:'单一熔接实体，XY 居中、底面 Z=0、顶部敞口。内腔净宽=外宽−2×壁厚，净深=外深−2×壁厚，净高=总高−底厚。两柱沿 X 对称，柱高从内底面起算，孔贯穿柱和底板。仅直壁、直角、无拔模/圆角/螺纹；不是装配体。',
    descriptionEn:'One fused solid, centered in XY, bottom at Z=0, open top. Clear cavity width/depth = outer width/depth minus twice wall thickness; clear height = height minus floor thickness. Two X-symmetric bosses rise from the inner floor; bores pass through bosses and floor. Straight walls/corners only; no draft, fillets, threads or assembly relationships.',
    defaults:{outerWidth:60,outerDepth:36,height:14,wallThickness:2,floorThickness:2,bossSpacing:30,bossOuterDiameter:8,boreDiameter:3,bossHeight:8},
    fields:[
      field('outerWidth','外宽 X','Outer width X'), field('outerDepth','外深 Y','Outer depth Y'),
      field('height','壳体总高','Total height'), field('wallThickness','侧壁厚','Wall thickness'),
      field('floorThickness','底板厚','Floor thickness'), field('bossSpacing','两柱中心距 X','Boss center spacing X'),
      field('bossOuterDiameter','柱外径','Boss outer diameter'), field('boreDiameter','贯穿孔径','Through-bore diameter'),
      field('bossHeight','内底面以上柱高','Boss height above inner floor'),
    ],
  },
  tube: {
    label:'圆筒（C件默认）', labelEn:'Tube (C-part default)',
    description:'同轴圆筒，外径 13.4、内径 12.4、高度 3 为用户 C 件默认值。',
    descriptionEn:'Coaxial tube; defaults 13.4 outer diameter, 12.4 inner diameter and 3 height for the user C-part.',
    defaults:{outerDiameter:13.4, innerDiameter:12.4, height:3},
    fields:[field('outerDiameter','外径','Outer diameter'), field('innerDiameter','内径','Inner diameter'), field('height','高度','Height')],
  },
  counterboreTool: {
    label:'沉孔／沉头孔刀具', labelEn:'Counterbore / countersink tool',
    description:'这是刀具实体：入口在 Z=0，沿 +Z；移动定位到工件表面，必要时旋转 180°，先选主体再选刀具相减。',
    descriptionEn:'Tool solid: entry at Z=0, extending along +Z. Position at the workpiece surface, rotate 180 degrees if needed, then select the body first and subtract the tool.',
    defaults:{holeDiameter:4, depth:8, headDiameter:8, headDepth:2, style:'bore'},
    fields:[
      field('holeDiameter','孔直径','Hole diameter'), field('depth','总深','Total depth'),
      field('headDiameter','头径','Head diameter'), field('headDepth','头深','Head depth'),
      {key:'style', label:'类型', labelEn:'Style', type:'select', options:[
        {value:'bore',label:'沉孔',labelEn:'Counterbore'},
        {value:'sink',label:'沉头孔',labelEn:'Countersink'},
      ]},
    ],
  },
});

export function buildHardwareTemplate(params, cad) {
  check(Object.hasOwn(HARDWARE_TEMPLATES,params.kind),'未知五金模板');
  const p = {...HARDWARE_TEMPLATES[params.kind].defaults, ...params};
  const number = key => {
    const value = Number(p[key]);
    check(Number.isFinite(value),`${key} 必须为有限数值`);
    return value;
  };
  const resources = [], hold = object => { resources.push(object); return object; };
  let result = null;
  try {
    if (p.kind === 'thinWallTray') {
      const width=number('outerWidth'), depth=number('outerDepth'), height=number('height');
      const wall=number('wallThickness'), floor=number('floorThickness');
      const spacing=number('bossSpacing'), diameter=number('bossOuterDiameter'), bore=number('boreDiameter'), bossHeight=number('bossHeight');
      check(width>0&&depth>0&&height>0,'壳体外宽、外深和总高必须为正');
      check(wall>0&&wall<Math.min(width,depth)/2,'侧壁厚须为正且小于外宽、外深一半');
      check(floor>0&&floor<height,'底厚须为正且小于总高');
      check(diameter>0&&bore>0&&bore<diameter,'柱尺寸须满足 0 < 贯穿孔径 < 柱外径');
      check(bossHeight>0&&floor+bossHeight<=height,'柱高须为正，柱顶不得高于壳口');
      const innerWidth=width-2*wall, innerDepth=depth-2*wall, clearance=1e-6;
      check(spacing>diameter+clearance,'柱中心距必须大于柱外径，两柱不得相切或重叠');
      check(spacing+diameter<innerWidth-2*clearance&&diameter<innerDepth-2*clearance,'柱外缘必须严格位于内腔中，与侧壁保持正间隙');
      const blank=hold(cad.makeBox([-width/2,-depth/2,0],[width/2,depth/2,height]));
      const cavity=hold(cad.makeBox([-innerWidth/2,-innerDepth/2,floor],[innerWidth/2,innerDepth/2,height+1]));
      result=blank.cut(cavity);
      for(const x of [-spacing/2,spacing/2]) {
        // Begin at Z=0 so the boss overlaps the floor, not only a coincident face.
        const boss=hold(cad.makeCylinder(diameter/2,floor+bossHeight,[x,0,0]));
        const builder=hold(new (cad.getOC().BRepAlgoAPI_Fuse)(result.wrapped,boss.wrapped));
        builder.Build(); const previous=result; result=cad.cast(builder.Shape()); dispose(previous);
      }
      for(const x of [-spacing/2,spacing/2]) {
        const cutter=hold(cad.makeCylinder(bore/2,floor+bossHeight+2,[x,0,-1]));
        const previous=result; result=previous.cut(cutter); dispose(previous);
      }
    } else if (p.kind === 'tube') {
      const outerDiameter=number('outerDiameter'), innerDiameter=number('innerDiameter'), height=number('height');
      check(outerDiameter>0 && innerDiameter>0 && innerDiameter<outerDiameter && height>0,'圆筒须满足 0 < 内径 < 外径，且高度 > 0');
      const blank=hold(cad.makeCylinder(outerDiameter/2,height));
      const bore=hold(cad.makeCylinder(innerDiameter/2,height+2,[0,0,-1]));
      result=blank.cut(bore);
    } else {
      const holeDiameter=number('holeDiameter'), depth=number('depth');
      const headDiameter=number('headDiameter'), headDepth=number('headDepth');
      check(holeDiameter>0 && headDiameter>holeDiameter && depth>0 && headDepth>0 && headDepth<depth,'刀具须满足孔径 > 0、头径 > 孔径、0 < 头深 < 总深');
      check(['bore','sink'].includes(p.style),'刀具类型必须为 bore 或 sink');
      const shaft=hold(cad.makeCylinder(holeDiameter/2,depth,[0,0,0]));
      let head;
      if (p.style==='bore') {
        head=hold(cad.makeCylinder(headDiameter/2,headDepth,[0,0,0]));
      } else {
        const bottomPlane=hold(new cad.Plane([0,0,0],[1,0,0],[0,0,1]));
        const topPlane=hold(new cad.Plane([0,0,headDepth],[1,0,0],[0,0,1]));
        const bottomDrawing=hold(cad.drawCircle(headDiameter/2)), topDrawing=hold(cad.drawCircle(holeDiameter/2));
        const bottom=hold(bottomDrawing.sketchOnPlane(bottomPlane)), top=hold(topDrawing.sketchOnPlane(topPlane));
        head=hold(cad.loft([bottom.wire,top.wire]));
      }
      const builder=hold(new (cad.getOC().BRepAlgoAPI_Fuse)(shaft.wrapped,head.wrapped));
      builder.Build();
      result=cad.cast(builder.Shape());
    }
    const complete=result;
    result=null;
    return complete;
  } finally {
    dispose(result);
    resources.reverse().forEach(dispose);
  }
}
