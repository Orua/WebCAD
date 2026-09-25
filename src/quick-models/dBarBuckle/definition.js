// Editable catalog metadata for dBarBuckle.
export default Object.freeze({
  "label": "独立圆横杆 D 扣",
  "labelEn": "D buckle with round bar",
  "description": "圆角方线 U 主体与固定圆杆融合；杆底与脚底齐平。",
  "defaults": {
    "section": "square",
    "sectionSize": 6,
    "sectionRadius": 0.6,
    "sectionChamfer": 0.6,
    "gapWidth": 0,
    "innerWidth": 32,
    "innerHeight": 24,
    "barDiameter": 4.5
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
      "key": "barDiameter",
      "label": "固定横杆直径",
      "labelEn": "Bar diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
