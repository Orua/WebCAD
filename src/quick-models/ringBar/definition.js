// Editable catalog metadata for ringBar.
export default Object.freeze({
  "label": "圆环内接横杆",
  "labelEn": "Ring with fixed crossbar",
  "description": "同心圆恒截面框与一根沿 X 的圆杆融合为单一实体。横杆可沿 Y 及厚度 Z 微调；不包含活动杆、铰链或精确接头过渡。",
  "descriptionEn": "A constant-section circular frame fused to one round X-axis crossbar. The bar has editable Y and depth Z offsets. Moving bars, hinges and exact joint transitions are excluded.",
  "defaults": {
    "section": "round",
    "innerDiameter": 20,
    "sectionSize": 3,
    "sectionRadius": 0.3,
    "sectionChamfer": 0.6,
    "barDiameter": 2,
    "barOffset": 0,
    "barDepthOffset": 0
  },
  "fields": [
    {
      "key": "innerDiameter",
      "label": "环内径",
      "labelEn": "Ring inner diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "section",
      "label": "截面",
      "labelEn": "Section",
      "type": "select",
      "options": [
        {
          "value": "round",
          "label": "圆线",
          "labelEn": "Round wire"
        },
        {
          "value": "square",
          "label": "圆角方线",
          "labelEn": "Rounded square"
        },
        {
          "value": "chamferedSquare",
          "label": "倒角方线",
          "labelEn": "Chamfered square"
        }
      ]
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionRadius",
      "label": "方线截面 R（圆线忽略）",
      "labelEn": "Square section corner R",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "sectionChamfer",
      "label": "方线截面倒角 C（仅倒角方线）",
      "labelEn": "Square section chamfer C",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "barDiameter",
      "label": "横杆直径",
      "labelEn": "Bar diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "barOffset",
      "label": "横杆 Y 偏移",
      "labelEn": "Bar Y offset",
      "type": "number",
      "min": -100,
      "step": 0.1
    },
    {
      "key": "barDepthOffset",
      "label": "横杆 Z 错层",
      "labelEn": "Bar Z depth offset",
      "type": "number",
      "min": -100,
      "step": 0.1
    }
  ]
});
