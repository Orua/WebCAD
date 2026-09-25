// Editable catalog metadata for bossPlate.
export default Object.freeze({
  "label": "双空心柱安装板",
  "labelEn": "Two hollow-boss mounting plate",
  "description": "圆角板上两根对称空心圆柱凸台，孔贯穿凸台与板。参数化通用实体，不代表螺纹、沉孔或原产品复刻。",
  "descriptionEn": "A rounded plate with two symmetric hollow cylindrical bosses; each bore passes through both boss and plate. Generic parametric geometry, not a threaded, counterbored, or source-product reconstruction.",
  "defaults": {
    "width": 40,
    "depth": 16,
    "thickness": 3,
    "cornerRadius": 3,
    "bossSpacing": 24,
    "bossOuterDiameter": 8,
    "boreDiameter": 4,
    "bossHeight": 6
  },
  "fields": [
    {
      "key": "width",
      "label": "板宽 X",
      "labelEn": "Plate width X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "depth",
      "label": "板深 Y",
      "labelEn": "Plate depth Y",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "板厚",
      "labelEn": "Plate thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "cornerRadius",
      "label": "板角 R",
      "labelEn": "Plate corner radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "bossSpacing",
      "label": "凸台中心距",
      "labelEn": "Boss center spacing",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossOuterDiameter",
      "label": "凸台外径",
      "labelEn": "Boss outer diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "boreDiameter",
      "label": "通孔直径",
      "labelEn": "Through-bore diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossHeight",
      "label": "凸台高度（板下）",
      "labelEn": "Boss height (below plate)",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
