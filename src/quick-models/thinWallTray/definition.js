// Editable catalog metadata for thinWallTray.
export default Object.freeze({
  "label": "双空心柱薄壁壳",
  "labelEn": "Open tray with two hollow bosses",
  "description": "单一熔接实体，XY 居中、底面 Z=0、顶部敞口。内腔净宽=外宽−2×壁厚，净深=外深−2×壁厚，净高=总高−底厚。两柱沿 X 对称，柱高从内底面起算，孔贯穿柱和底板。仅直壁、直角、无拔模/圆角/螺纹；不是装配体。",
  "descriptionEn": "One fused solid, centered in XY, bottom at Z=0, open top. Clear cavity width/depth = outer width/depth minus twice wall thickness; clear height = height minus floor thickness. Two X-symmetric bosses rise from the inner floor; bores pass through bosses and floor. Straight walls/corners only; no draft, fillets, threads or assembly relationships.",
  "defaults": {
    "outerWidth": 60,
    "outerDepth": 36,
    "height": 14,
    "wallThickness": 2,
    "floorThickness": 2,
    "bossSpacing": 30,
    "bossOuterDiameter": 8,
    "boreDiameter": 3,
    "bossHeight": 8
  },
  "fields": [
    {
      "key": "outerWidth",
      "label": "外宽 X",
      "labelEn": "Outer width X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerDepth",
      "label": "外深 Y",
      "labelEn": "Outer depth Y",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "height",
      "label": "壳体总高",
      "labelEn": "Total height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "wallThickness",
      "label": "侧壁厚",
      "labelEn": "Wall thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "floorThickness",
      "label": "底板厚",
      "labelEn": "Floor thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossSpacing",
      "label": "两柱中心距 X",
      "labelEn": "Boss center spacing X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossOuterDiameter",
      "label": "柱外径",
      "labelEn": "Boss outer diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "boreDiameter",
      "label": "贯穿孔径",
      "labelEn": "Through-bore diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossHeight",
      "label": "内底面以上柱高",
      "labelEn": "Boss height above inner floor",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
