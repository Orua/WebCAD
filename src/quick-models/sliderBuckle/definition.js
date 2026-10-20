// Editable catalog metadata for sliderBuckle.
export default Object.freeze({
  "label": "日字扣",
  "labelEn": "Slider buckle",
  "description": "按图片选择接头，生成日字扣时一起完成。定 R 接头的三维滚球半径与线径分别设置；轮廓圆润接头调整平面 R；顺滑接头保留模型3的偏置和鼓起。新接头要求等径圆线、不开缝，并在横杆与框角之间留出完整接头空间。原比例接头仅用于旧工程兼容。",
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
    "barOffset": 0,
    "jointStyle": "intersection",
    "jointRadius": 1
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
      "key": "jointStyle",
      "label": "中梁接头",
      "labelEn": "Bar junction",
      "type": "select",
      "options": [
        {"value":"intersection","label":"相交接缝（原方式）","labelEn":"Intersection"},
        {"value":"sourceFixedR","label":"定 R 接头（旧版比例）","labelEn":"Legacy proportional source junction"},
        {"value":"rollingBall","label":"定 R 接头（独立半径）","labelEn":"Independent rolling-ball R"},
        {"value":"profileRound","label":"轮廓圆润接头","labelEn":"Profile-rounded junction"},
        {"value":"sourceFree","label":"顺滑接头","labelEn":"Smooth source junction"}
      ]
    },
    {
      "key": "jointRadius",
      "label": "接头 R（mm）",
      "labelEn": "Junction R (mm)",
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
