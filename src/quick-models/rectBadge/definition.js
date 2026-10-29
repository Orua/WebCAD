export default Object.freeze({
  label: '牌仔（牌子／方牌）',
  labelEn: 'Rectangular badge plate',
  defaultInsertionAnchor: 'bottom-center',
  description: '牌仔、牌子、方牌：按长 X、宽 Y、厚 Z 生成单一实体。轮廓圆角 R=0 为直角矩形。正面（Z=厚度）和反面（Z=0）分别设置 45° 等距倒角，0 为不倒角；可单面或双面，倒角尺寸可不同。两面倒角之和须小于厚度，每面倒角须小于短边的一半。尺寸均为 mm；不自动添加孔、柱或文字。',
  descriptionEn: 'One rectangular badge plate, centered in XY with its back at Z=0. Length X, width Y, thickness Z, and optional planar corner radius (0 = square corners). Independent front (+Z) and back (-Z) 45-degree equal-distance chamfers; 0 disables either side. Chamfer sum must be less than thickness; each must be less than half the shorter side. No holes, posts or lettering.',
  defaults: { length: 40, width: 20, cornerRadius: 2, thickness: 3, frontChamfer: 0.5, backChamfer: 0.5 },
  fields: [
    {key:'length',label:'长 X',labelEn:'Length X',type:'number',unit:'mm',min:0.1,max:1000,step:0.1},
    {key:'width',label:'宽 Y',labelEn:'Width Y',type:'number',unit:'mm',min:0.1,max:1000,step:0.1},
    {key:'cornerRadius',label:'轮廓圆角 R（0 为直角）',labelEn:'Outline corner radius (0 = square)',type:'number',unit:'mm',min:0,max:500,step:0.1},
    {key:'thickness',label:'厚度 Z',labelEn:'Thickness Z',type:'number',unit:'mm',min:0.1,max:1000,step:0.1},
    {key:'frontChamfer',label:'正面倒角（0 为不倒）',labelEn:'Front chamfer (0 = none)',type:'number',unit:'mm',min:0,max:500,step:0.1},
    {key:'backChamfer',label:'反面倒角（0 为不倒）',labelEn:'Back chamfer (0 = none)',type:'number',unit:'mm',min:0,max:500,step:0.1},
  ],
});
