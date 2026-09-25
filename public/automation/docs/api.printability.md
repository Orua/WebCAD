# api.printability

从 text-to-cad 的 dfam-check 迁移的浏览器几何事实检查。inspectPrintability({context,bodyId,angleLimitDeg?:45}) 接受当前实体 ID，角度须大于 0 小于 90 度。读取当前显示网格逐三角面计算表面积、六种轴向摆放的悬垂面积、面积占比、成型高度与支撑柱体粗估；距平台 0.1 mm 内的面视为已支撑。包围盒、体积与 solidCount 取内核 B-Rep 元数据。结果不改变工程 revision，不给合格判定。网格精度、材料、工艺、壁厚、孔径、粉末排出和切片支撑均需另行核验。
