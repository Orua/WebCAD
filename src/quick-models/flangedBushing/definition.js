// Editable catalog metadata for flangedBushing.
export default Object.freeze({
  "label": "法兰轴套",
  "labelEn": "Flanged bushing",
  "description": "同轴法兰与圆筒轴套，直孔贯穿全长。通用参数化实体，不含螺纹或原产品特征复刻。",
  "descriptionEn": "A coaxial flange and cylindrical bushing with a straight bore through the full length. Generic parametric geometry, with no threads or source-product feature reconstruction.",
  "defaults": {
    "bodyDiameter": 12,
    "flangeDiameter": 20,
    "boreDiameter": 6,
    "bodyHeight": 10,
    "flangeThickness": 3
  },
  "fields": [
    {
      "key": "bodyDiameter",
      "label": "轴套外径",
      "labelEn": "Bushing body diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "flangeDiameter",
      "label": "法兰外径",
      "labelEn": "Flange diameter",
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
      "key": "bodyHeight",
      "label": "筒体高度",
      "labelEn": "Body height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "flangeThickness",
      "label": "法兰厚度",
      "labelEn": "Flange thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
