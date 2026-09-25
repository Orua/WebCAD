// Editable catalog metadata for roundBadge.
export default Object.freeze({
  "label": "双柱圆牌底座",
  "labelEn": "Round badge base with two posts",
  "description": "圆形牌面、正面环形凸边和背面两根安装柱组成一个实体。可选空心柱；不包含品牌图案、齿纹、拱面或生产尺寸。",
  "descriptionEn": "One solid combining a round badge plate, raised front rim and two rear mounting posts. Posts may be hollow. Brand artwork, knurling, doming and production dimensions are excluded.",
  "defaults": {
    "diameter": 40,
    "thickness": 2,
    "rimWidth": 2,
    "rimHeight": 0.8,
    "postSpacing": 18,
    "postDiameter": 4,
    "postHeight": 4,
    "postBoreDiameter": 0
  },
  "fields": [
    {
      "key": "diameter",
      "label": "牌面直径",
      "labelEn": "Badge diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "牌面厚度",
      "labelEn": "Plate thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "rimWidth",
      "label": "正面环边宽",
      "labelEn": "Front rim width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "rimHeight",
      "label": "正面环边高度",
      "labelEn": "Front rim height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "postSpacing",
      "label": "背柱中心距 X",
      "labelEn": "Rear post spacing X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "postDiameter",
      "label": "背柱直径",
      "labelEn": "Rear post diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "postHeight",
      "label": "背柱高度",
      "labelEn": "Rear post height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "postBoreDiameter",
      "label": "背柱孔径（0 为实心）",
      "labelEn": "Post bore diameter (0 = solid)",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ]
});
