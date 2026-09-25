// Editable catalog metadata for roundedBossTray.
export default Object.freeze({
  "label": "圆角双柱薄壁壳",
  "labelEn": "Rounded tray with two hollow bosses",
  "description": "圆角矩形薄壁壳，顶部敞口，内底带两根空心柱。外圆角、壁厚、底厚和柱尺寸均可调；直壁无拔模，不包含卡扣、文字或表面花纹。",
  "descriptionEn": "Open rounded-rectangle tray with two hollow bosses on the inner floor. Outer corner radius, wall/floor thickness and boss dimensions are editable. Straight walls only; no draft, clips, lettering or texture.",
  "defaults": {
    "outerWidth": 60,
    "outerDepth": 38,
    "height": 12,
    "cornerRadius": 6,
    "wallThickness": 2,
    "floorThickness": 2,
    "bossSpacing": 30,
    "bossOuterDiameter": 7,
    "boreDiameter": 3,
    "bossHeight": 7
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
      "key": "cornerRadius",
      "label": "外轮廓圆角 R",
      "labelEn": "Outer corner radius",
      "type": "number",
      "min": 0,
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
