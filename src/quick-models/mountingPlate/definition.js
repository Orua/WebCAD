// Editable catalog metadata for mountingPlate.
export default Object.freeze({
  "label": "双孔圆角安装板",
  "labelEn": "Two-hole rounded mounting plate",
  "description": "孔沿 X 对称，中心距单独定义；孔为贯穿光孔，不含螺纹、沉头或沉孔。",
  "descriptionEn": "Two symmetric X-axis holes with independent center spacing. Plain through holes only; no threads, countersinks or counterbores.",
  "defaults": {
    "width": 40,
    "depth": 16,
    "thickness": 3,
    "cornerRadius": 3,
    "holeDiameter": 4,
    "holeSpacing": 24
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
      "label": "厚度",
      "labelEn": "Thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "cornerRadius",
      "label": "外角 R",
      "labelEn": "Outer corner radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "holeDiameter",
      "label": "孔径",
      "labelEn": "Hole diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "holeSpacing",
      "label": "两孔中心距",
      "labelEn": "Hole center spacing",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
