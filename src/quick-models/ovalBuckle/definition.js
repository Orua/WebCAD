// Editable catalog metadata for ovalBuckle.
export default Object.freeze({
  "label": "四圆弧旦扣",
  "labelEn": "Four-arc oval buckle",
  "description": "四段相切圆弧，不是椭圆或跑道圈；缝在右端正中。",
  "defaults": {
    "section": "round",
    "sectionSize": 3,
    "sectionRadius": 0.3,
    "sectionChamfer": 0.6,
    "gapWidth": 0,
    "innerWidth": 28,
    "innerHeight": 16,
    "innerRadius": 5.6
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
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
      "key": "innerRadius",
      "label": "端部内 R",
      "labelEn": "End inner radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "gapWidth",
      "label": "右端实际缝宽（0 闭合）",
      "labelEn": "Right gap (0 = closed)",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ]
});
