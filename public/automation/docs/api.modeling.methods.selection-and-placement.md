# api.modeling.methods.selection-and-placement

# 选择目标与定位

先确定部件再确定面/边。使用法向、轴线、位置、曲线类型、半径/长度和邻接关系表达选择意图，例如“板顶平面”“距中心12的两个完整圆孔边”。不能写“第0面就是顶面”。queryGeometry返回当前revision绑定的候选与指纹；加工后重新查询，旧数字和token不能跨revision或内核复用。

queryGeometry默认要求唯一。预期选多条时显式requireUnique:false与expectedCount；如果不符先查原因，不拿前几个凑数。孔口上下各有一条圆边，两孔通常有四条边；同半径的外轮廓圆角也会被radius筛选命中。检查圆周长接近2πr、中心、Z层和邻面，区分完整圆孔与四分之一圆角。

定位先核对工具原点和部件基准，再用显式placement或transform。相对平移与绝对包围盒中心含义不同；旋转轴必须明确世界/局部及中心，不从欧拉角名字猜局部轴。planAlignment/queryReferences可提供当前精确参考，歧义要消除；不能把有孔面的面积重心直接当可靠落面点。

将零件放到另一个面上时验证轴向、法向、接触/间隙与预期方向。包围盒接触不代表实体接触，两个体最短距为0也不能区分接触和穿透；使用measureRelation/inspectFit等实际支持的检查。WebCAD没有据此获得text-to-cad的原生joint/运动学能力，只能按已确认的定位和配合工具处理。

