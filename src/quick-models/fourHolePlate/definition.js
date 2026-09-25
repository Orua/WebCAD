// Editable catalog metadata for fourHolePlate.
export default Object.freeze({
  "label": "四孔安装板",
  "labelEn": "Four-hole mounting plate",
  "description": "矩形板四角各一个贯穿光孔，孔中心到左右及前后边的距离分别可调；可选外角 R。不含螺纹或沉孔。",
  "descriptionEn": "Rectangular plate with four through holes. Set X/Y edge insets and optional outer corner radius; no threads or counterbores.",
  "defaults": {
    "width": 50,
    "depth": 30,
    "thickness": 3,
    "cornerRadius": 0,
    "holeDiameter": 4,
    "insetX": 5,
    "insetY": 5
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
      "key": "insetX",
      "label": "左右孔心边距",
      "labelEn": "Hole inset X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "insetY",
      "label": "前后孔心边距",
      "labelEn": "Hole inset Y",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
