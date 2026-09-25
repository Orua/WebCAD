// Editable catalog metadata for tube.
export default Object.freeze({
  "label": "圆筒（C件默认）",
  "labelEn": "Tube (C-part default)",
  "description": "同轴圆筒，外径 13.4、内径 12.4、高度 3 为用户 C 件默认值。",
  "descriptionEn": "Coaxial tube; defaults 13.4 outer diameter, 12.4 inner diameter and 3 height for the user C-part.",
  "defaults": {
    "outerDiameter": 13.4,
    "innerDiameter": 12.4,
    "height": 3
  },
  "fields": [
    {
      "key": "outerDiameter",
      "label": "外径",
      "labelEn": "Outer diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerDiameter",
      "label": "内径",
      "labelEn": "Inner diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "height",
      "label": "高度",
      "labelEn": "Height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
