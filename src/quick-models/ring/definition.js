// Editable catalog metadata for ring.
export default Object.freeze({
  "label": "圆圈",
  "labelEn": "Ring",
  "description": "同心圆恒截面单圈；开缝为底部正中平行平切。",
  "defaults": {
    "section": "round",
    "sectionSize": 3,
    "sectionRadius": 0.3,
    "sectionChamfer": 0.6,
    "gapWidth": 0,
    "innerDiameter": 24
  },
  "fields": [
    {
      "key": "innerDiameter",
      "label": "内径",
      "labelEn": "Inner diameter",
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
      "key": "gapWidth",
      "label": "底部实际缝宽（0 闭合）",
      "labelEn": "Bottom gap (0 = closed)",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ]
});
