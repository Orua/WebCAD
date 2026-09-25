// Editable catalog metadata for openArcRing.
export default Object.freeze({
  "label": "大开口 C 环",
  "labelEn": "Wide-gap C ring",
  "description": "恒截面圆弧环，开口角度可调，适合开口环、钩环和未闭合圆框的基础毛坯；不包含端头球、铰链或变截面。",
  "descriptionEn": "Constant-section circular arc with an adjustable opening angle for C rings, hook rings and open circular frames. End balls, hinges and variable sections are excluded.",
  "defaults": {
    "section": "round",
    "innerDiameter": 30,
    "sectionSize": 4,
    "sectionRadius": 0.4,
    "sectionChamfer": 0.6,
    "openingAngle": 70
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
      "key": "openingAngle",
      "label": "开口角度（°）",
      "labelEn": "Opening angle (degrees)",
      "type": "number",
      "min": 5,
      "step": 1
    }
  ]
});
