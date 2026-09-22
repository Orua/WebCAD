// Small exact solids and Boolean cutters. Independent of the UI and worker.
const field = (key, label, labelEn) => ({key, label, labelEn, type:'number', min:0.1, step:0.1});
const check = (condition, message) => { if (!condition) throw new Error(message); };
const dispose = object => { try { object?.delete(); } catch {} };

export const HARDWARE_TEMPLATES = Object.freeze({
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
    if (p.kind === 'tube') {
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
