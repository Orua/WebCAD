// Editable catalog metadata for arcBandPlate.
export default Object.freeze({
  "label": "双孔弧形带板",
  "labelEn": "Two-hole annular band plate",
  "description": "同心圆弧带板，角度、厚度、两端孔距与沉孔独立输入；用于分体环段，螺纹和装配件须另建。",
  "descriptionEn": "Annular band segment with editable sweep, plate thickness, symmetric end-hole inset and optional counterbores. Threads and mating parts are separate.",
  "defaults": {
    "outerRadius": 20,
    "innerRadius": 15,
    "centerAngle": 270,
    "spanAngle": 111.2807337553,
    "thickness": 5,
    "holeInsetAngle": 8.4521160504,
    "holeDiameter": 2.3,
    "recessDiameter": 3.3,
    "recessDepth": 0
  },
  "fields": [
    {
      "key": "outerRadius",
      "label": "外弧半径",
      "labelEn": "Outer radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerRadius",
      "label": "内弧半径",
      "labelEn": "Inner radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "centerAngle",
      "label": "弧中心角（°）",
      "labelEn": "Arc center angle",
      "type": "number",
      "min": -360,
      "step": 1
    },
    {
      "key": "spanAngle",
      "label": "弧跨度（°）",
      "labelEn": "Arc sweep angle",
      "type": "number",
      "min": 1,
      "step": 1
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
      "key": "holeInsetAngle",
      "label": "两端孔退让角（°）",
      "labelEn": "Hole inset from each end",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "holeDiameter",
      "label": "通孔直径",
      "labelEn": "Through-hole diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "recessDiameter",
      "label": "上表面沉孔直径",
      "labelEn": "Top recess diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "recessDepth",
      "label": "上表面沉孔深度",
      "labelEn": "Top recess depth",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ]
});
