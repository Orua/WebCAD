# 浮雕阶段计划与试算门槛

用户 2026-10-02 要求先提交现状、先做图片运算验证、再开发工具；达到 Codex 剩余 1% 或北京时间 2026-10-03 01:00 前结束并交接提交。起始额度剩余 23%。阶段快照 e9d2cdd 已推送 origin/main。

用户补充：浮雕不是凸字，而是凹凸有层次的曲面，可分阶段实现。矢量平顶凸字试算不是最终功能的验收。

## 已完成计算验证（产品代码编写之前）

- 自制 medallion、letter、waves 三张真实 JPEG，System.Drawing 编码后重新解码，25×25 高度取样。
- 双一次 B 样条封顶 + 侧面 + 底面 → 缝合实体 → 与底板融合：三例有效单实体，来源字节不变，增加体积 387.637143 / 157.499159 / 73.307132 mm³；约 6.9–8.3 s、14.6–16.8 万三角面。
- 改为三次夹持 B 样条控制网格、同边界侧面：三例有效单实体，来源字节不变；增加体积 400.153267 / 176.347998 / 68.413086 mm³；含网格生成约 429 / 169 / 206 ms，13904 / 6368 / 12128 三角面。此算法是对高度样本的平滑近似，不能宣称精确穿过每个灰度样点。
- 另在页面 API 用既有 LOGO 试算带孔框与星形 SVG：成功提交、孔保留、display.status=rendered。仅验证矢量轮廓路径，不作为曲面浮雕成果。
- 临时程序 agent/temp/relief-probe.mjs；JPEG 与输入数据同目录；最新测量 agent/output/relief-probe-results.json。

## 第一阶段实施范围

- 新操作 relief：一个当前平面上的矩形高度场，三次 B 样条曲面、封闭实体、浮雕加料或凹雕减料；高度场与参数保存到工程，可预览、撤销、历史改参。
- JPG/PNG/SVG 在浏览器本地解码；SVG 灰度/渐变参与高度计算。提供灰度层次与单色图形柔和鼓起两种解释。照片灰度不等于真实三维深度，不引入云端推断或上传。
- 原图方向保持；透明背景为零高度；尺寸、深度、翻转明暗、采样密度、面内位置与角度显式。
- 当前仅平面；图像完整矩形必须落在选面边界内并避开孔；拒绝越界、空变化、多实体和无效几何。曲面贴合后续单独做。
- 面加工：锣槽/内外车、面孔/凸台、LOGO/浮雕；实体加工：孔槽螺纹、批量特征、布尔与切分。

## 参考资料（只参考算法，不复制源码）

- FreeCAD Lithophane，MIT： https://github.com/furti/FreeCAD-Lithophane ，lithophane_image.py 亮度转高、降采样；输出网格，本项目采用 OCCT BRep。
- OpenSCAD surface： https://github.com/openscad/openscad/blob/master/src/core/SurfaceNode.cc ，图片高度场与闭合底面。
- FreeCAD Curves Sketch on Surface： https://github.com/tomate44/CurvesWB/blob/main/freecad/Curves/Sketch_On_Surface.py ，曲面映射作为后续参考。

## 起始问题

contracts 基线失败 1 项：tests/document-identity.test.mjs 的 VM 没有注入 serializeBoundedDocument；测试依赖与实现升级不同步。修复测试上下文后重跑相关测试。

## 回滚

所有拟修改既有源码/测试/文档/生成文件已备份到 agent/backups/20261002-relief-start，保持原始相对路径。Git 阶段基线 e9d2cdd。
