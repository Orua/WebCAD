// Editable catalog metadata for counterboreTool.
export default Object.freeze({
  "label": "沉孔／沉头孔刀具",
  "labelEn": "Counterbore / countersink tool",
  "description": "这是刀具实体：入口在 Z=0，沿 +Z；移动定位到工件表面，必要时旋转 180°，先选主体再选刀具相减。",
  "descriptionEn": "Tool solid: entry at Z=0, extending along +Z. Position at the workpiece surface, rotate 180 degrees if needed, then select the body first and subtract the tool.",
  "defaults": {
    "holeDiameter": 4,
    "depth": 8,
    "headDiameter": 8,
    "headDepth": 2,
    "style": "bore"
  },
  "fields": [
    {
      "key": "holeDiameter",
      "label": "孔直径",
      "labelEn": "Hole diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "depth",
      "label": "总深",
      "labelEn": "Total depth",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "headDiameter",
      "label": "头径",
      "labelEn": "Head diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "headDepth",
      "label": "头深",
      "labelEn": "Head depth",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "style",
      "label": "类型",
      "labelEn": "Style",
      "type": "select",
      "options": [
        {
          "value": "bore",
          "label": "沉孔",
          "labelEn": "Counterbore"
        },
        {
          "value": "sink",
          "label": "沉头孔",
          "labelEn": "Countersink"
        }
      ]
    }
  ]
});
