// Editable catalog metadata for sliderBuckle.
export default Object.freeze({
  "label": "日字扣",
  "labelEn": "Slider buckle",
  "description": "外框整体内高；固定圆杆偏移上正下负，不支持开缝。闭合圆线框可用内短边≥2.5倍线径的紧凑双窗，且每侧孔高至少为线径。",
  "descriptionEn": "The inner height spans the full frame; the fused round bar has an editable vertical offset and no opening. Compact round-wire frames require an inner short side at least 2.5 wire diameters and each window at least one wire diameter high.",
  "defaults": {
    "section": "round",
    "sectionSize": 3,
    "sectionRadius": 0.3,
    "sectionChamfer": 0.6,
    "gapWidth": 0,
    "innerWidth": 30,
    "innerHeight": 24,
    "innerRadius": 3,
    "barDiameter": 2.5,
    "barOffset": 0
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
      "label": "框内 R",
      "labelEn": "Frame inner radius",
      "type": "number",
      "min": 0.1,
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
      "label": "横杆偏移（上正下负）",
      "labelEn": "Bar offset (+up)",
      "type": "number",
      "min": -100,
      "step": 0.1
    }
  ]
});
