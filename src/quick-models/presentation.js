// Published names and default groups. Persistent geometry kind IDs never change.
export const QUICK_CATALOG_ORDER_VERSION='grouped-20261016-1';
export const QUICK_LABELS=Object.freeze({twistedChain:'钮链',mountingPlate:'双孔底片',fourHolePlate:'四孔底片',flatFrame:'扁线方扣',roundedFlatFrame:'方线方扣',dBuckle:'圆线D扣',rectBuckle:'圆线方扣',ovalBuckle:'椭圆旦扣',sliderBuckle:'圆线日字扣',dBarBuckle:'方线D扣圆横杆',flangedBushing:'圆柱轴套',bossPlate:'双圆柱底片',twinWindowPlate:'扁线日字扣',ellipseSectionRing:'椭圆截面圆圈',ellipseSectionRectFrame:'椭圆截面方扣',dFlatFrame:'方线D扣',archedTwinWindowPlate:'弧面扁线日字扣',bowedTwinWindowPlate:'椭圆孔扁线日字扣',ringBar:'圆圈日字扣',ellipseBar:'椭圆日字扣',ellipseOpenWire:'椭圆开口圈',profileLoop:'方线直边旦扣',capsuleWire:'圆线直边旦扣',buckleTongue:'针扣的针',pullCoreBar:'拉芯扣的芯',keyRing:'匙圈',hangingRod:'吊杆',twoPieceEyelet:'铜皮鸡眼',frameEyelet:'合金螺丝鸡眼面',uStrapClip:'U型尾夹'});
export const QUICK_GROUPS=Object.freeze([
 {id:'basic',label:'基础件',kinds:['washer','tube','domedPin','flangedBushing']},
 {id:'rings',label:'圈环',kinds:['ring','ellipseOpenWire','openArcRing','ellipseSectionRing','keyRing']},
 {id:'rect-buckles',label:'方扣',kinds:['flatFrame','roundedFlatFrame','rectBuckle','ellipseSectionRectFrame']},
 {id:'d-buckles',label:'D扣',kinds:['dFlatFrame','dBuckle','dBarBuckle']},
 {id:'oval-buckles',label:'旦扣',kinds:['ovalBuckle','capsuleWire','profileLoop']},
 {id:'sliders',label:'日字扣',kinds:['twinWindowPlate','sliderBuckle','ringBar','ellipseBar','archedTwinWindowPlate','bowedTwinWindowPlate']},
 {id:'plates',label:'底片',kinds:['mountingPlate','fourHolePlate','bossPlate']},
 {id:'installation',label:'安装及配件',kinds:['ironFoot','uStrapClip','frameEyelet','buckleTongue','pullCoreBar','hangingRod','archedBridge','squareArchedBridge']},
 {id:'fasteners',label:'连接件',kinds:['screw','threadedSleeve','spring','twoPieceEyelet','alloyEyelet','nippleStud','mushroomRivet']},
 {id:'chains',label:'链条',kinds:['oChain','twistedChain','groundChain']},
 {id:'cutters',label:'辅助刀具',kinds:['counterboreTool']},
]);
export const QUICK_HIDDEN_KINDS=Object.freeze(['roundBadge','thinWallTray','roundedBossTray','uEndHolePlate','arcBandPlate','gableOpenFrame']);
