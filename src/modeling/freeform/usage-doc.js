export const FREEFORM_USAGE_DOC = `# 异形件建模与验收

## 入口和顺序

先打开当前工程，调用 connect 发现工具，确认 canExecute 与 blockers。读取本版本完整工具卡和 api.run 或 feature.add。所有坐标、位置容差和厚度用毫米。数字型 edgeId、faceId 由 queryGeometry 当前读回；每次换面、修面、撤销、开档或改上游后重新读取。refs 是有序的当前对象 ID，refIndex 从 0 开始。空间操作使用世界坐标。

| 工作 | 工具 | 输入与实际结果 |
| --- | --- | --- |
| 画瓣脊、截面与空间边界 | spatialSpline | points 按曲线行进顺序输入 XYZ 或 {refIndex,edgeId,nearMm}。顶点吸附到一条精确边的端点。开放曲线可选择 interpolate 或 fit，闭合曲线使用 interpolate，首点只输入一次。回读精确边及过点偏差。 |
| 按纵横多条线建面 | networkSurface | 各组 2–6 条开放精确边，uEdges 按横向位置排列，vEdges 亦按另一方向位置排列。跨组各有一个交点，首尾交点到达所选边端点。计算双向插值和交点修正，回读 uDeviationMm、vDeviationMm。 |
| 按外圈和导向建面 | surfaceFill | 单闭环由空间坐标、顶点或精确边确定。points 控制内点，guideEdges 可直接选 spatialSpline 结果。G1/G2 边绑定所属邻面。输出独立曲面或带符号厚度的实体。 |
| 局部调整已生成的面 | surfaceSculpt | 选当前非周期 B 样条面，指定一个点或闭合区域、方向、位移和影响范围。锁定完整剪裁边界及孔圈。读取位移回执并检查合用的后续面。 |
| 在面上敷线和分区 | projectCurveOnFace | target 指定当前精确面，curves 指定 1–8 条精确边。direction 给世界方向，reach=forward 或 both，output=curves 或 faces。分面结果覆盖原目标面，源保留；可用 extractFaces 提取所需面片。 |
| 接顺两张面 | surfaceBridge | a/b 指定开放边及其同对象邻面，给定 G0、G1 或 G2。pairing=direct 连接同参数端点，reverse 连接相反端点。tension 控制侧边接入尺度。回读最终接缝的法向和曲率采样误差。 |
| 单独修回旧件 | replaceSurfacePatch | refs[0] 是要换面的单一实体，其余 refs 是已做好的新面来源。removeFaceIds 与 patches 分别指定旧面和新面，核对外缘和全部自由边界后缝合为一个闭合 BRep。结果单独生成，原实体可用于比较。 |
| 修顺原 STEP 的高频起伏 | surfaceFairing | 使用原坐标导入且身份匹配的 STEP 和绑定的高度位移场。保留外轮廓、共边、孔圈与来源的附属结构。 |
| 成体 | thickenFace / sewFaces | 已有一张有效面时可沿法向增厚。有完整封闭外壳时用 sewFaces 且 makeSolid=true。检查实际 solidCount、封闭结果与版本。 |

## 曲率、接缝和壁厚回读

surfaceAnalysis({context,mode,bodyId,...}) 使用当前修订号。zebra 在视图中按法向生成反光条纹，zebraDirection 为 vertical 或 horizontal，stripes 为 6–36。comb 指定 edgeId，可用 8–64 点取样，返回实际采样位置、曲率和曲率向量。thickness 指定 1–4 张当前 faceIds、每方向采样数 grid 及可选的 thresholdMm 和世界方向 direction；总候选点不超过 100。使用每个点首次离开连续材料的厚度，回读 thinnest、belowThreshold、outside 和 unresolved。按已测出的点着色，最薄值以实际测点为范围。showInView:false 仅返回数据，mode=clear 清除临时覆盖。进入预览或更新几何后重新检查。

## 提交、故障和示例

预览和应用使用当前工具卡的 opVersion/schemaHash、明确 refs 与 params。预览只产生当前候选几何。复核 preview.scope 的拟合偏差或接缝数据后，用返回的 previewId 和 generation 提交。getState 可读回 bodies[].freeformReport、surfaceFillReport 或 surfaceSculptReport；measure、queryGeometry 和 surfaceAnalysis 对已提交的几何独立复核。指定公差、自由边或连续性失败时，当前工程保持原提交版本。检查断口、端点对应、来源面和冲突约束，再调整候选。

例如先用 spatialSpline 画瓣脊，在 surfaceFill.guideEdges 指向该边，生成瓣面并预览，再用 surfaceSculpt 在瓣腹推抬，查询新的周边与孔圈。已有花瓣轮廓时，可用两组曲线做 networkSurface，再用 projectCurveOnFace 把叶脉投影到瓣面。旧件需要换面时先核对原剪裁环，新面在这些边界验收通过后缝回。最后用斑马纹看光顺，增厚后用壁厚色图查瓣尖及孔柱附近。
`;
