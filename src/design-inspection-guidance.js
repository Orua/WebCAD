export const DESIGN_INSPECTION_GUIDE = `按源图要求核对 inspectDesign

用途：一次只读调用检查指定实体的世界XYZ包围尺寸、实体数，以及指定位置有材料/应留空。解决包围尺寸与单一solid通过后仍漏横杆、漏连接或封孔的风险。它不自动读懂图纸，也不替代截面、圆角连续性和用户验收。

调用 inspectDesign({context,requirements,requirePass?:false})。context 使用当前 requestContext。requirements 为1–64个对象，每项必须有唯一 id（字母开头，1–40位字母数字、下划线或连字符）、当前 bodyId、kind、evidence:{kind:'drawing'|'user'|'assumption',reference:1–500字符来源说明}。未知字段拒绝。

- kind:'bounds'：sizeMm:[X尺寸,Y尺寸,Z尺寸]，三个非负有限数；toleranceMm 必须明确给出，>0且<=1 mm。比较当前精确包围盒的轴向跨度，不证明位置、截面或轮廓相同。
- kind:'solidCount'：count 为1–1000整数。只比较精确实体数，不声称完整BRep有效性或正确装配。
- kind:'material'：points:[[世界x,y,z],...]，全请求总计不超过128点；expected:'inside'|'outside'。仅当前单一solid。toleranceMm 默认0.00001 mm，>0且<=0.01 mm。通过实体与点的精确common判定材料，边界距离在容差内返回boundary，matches=null、verdict=unverified；不能将模糊边界强行当材料或孔洞。

返回 status:read、readOnly:true、source:exact-brep、当前context、verdict:pass|fail|unverified、summary和逐项results。每项有expected、actual、matches、evidence。bounds的actual带sizeMm/deltaMm；材料actual.samples带point/classification/boundaryDistanceMm。任何明确不匹配为fail；边界样点或匹配的assumption为unverified。scope=specified-checks-only；sourceEvidenceVerified=false，因为来源标签由调用者提供，页面未独立验证图纸。不得把这份报告称作完整产品验收。

requirePass:true 时，只要有fail/unverified就返回status:failed及DESIGN_REQUIREMENTS_NOT_MET，并保留完整诊断。用于api.run中在导出前停止：早先建模步骤仍已提交，atomic=false，不能据此宣称整批回滚。只读失败commitState:not_committed仅指检查步骤没有修改模型。直接、invoke、run与submit入口一致；中途revision变化会拒绝结果。

先从最新有效图框、剖面、用户要求确定期望，不从生成模型反推期望。材料点应覆盖横杆内部、连接内部及保留孔位置；只检查端点会漏掉中间缺料。点采样不证明整段连续性或整个孔通透，需要时用现有inspectThickness/planeSection/inspectFit继续检查具体位置。二维轮廓R、截面R与三维倒圆分开核对。

示例（尺寸仅用于示例；实际bodyId来自前步回执）：
{method:'inspectDesign',args:{requirePass:true,requirements:[
 {id:'size',kind:'bounds',bodyId:{$ref:'part.createdBodyIds.0'},sizeMm:[40,20,2],toleranceMm:0.01,evidence:{kind:'user',reference:'当前用户要求40×20×2 mm'}},
 {id:'oneSolid',kind:'solidCount',bodyId:{$ref:'part.createdBodyIds.0'},count:1,evidence:{kind:'user',reference:'单件板'}},
 {id:'bridge',kind:'material',bodyId:{$ref:'part.createdBodyIds.0'},points:[[10,10,1]],expected:'inside',evidence:{kind:'drawing',reference:'有效图框横杆中部'}},
 {id:'opening',kind:'material',bodyId:{$ref:'part.createdBodyIds.0'},points:[[20,10,1]],expected:'outside',evidence:{kind:'drawing',reference:'有效图框通孔中心'}}
]}}

限制：只验证列出的检查，不自动证明完整连接、所有孔、截面形状、圆角G1/G2、标准螺纹或装配合格；渲染、文件生成及磁盘写入仍各自确认。`;

export const RECONSTRUCTION_WORKFLOW = `源图重建的快速流程（使用现有工具）：
0. 先取得并实际读取源文件，再进入下面的结构规划与绘制。宿主文件工具与页面建模工具是两个接口层，以当前工具清单和完整工具卡为准：
   - 已上传或前轮已下载的资料，优先用宿主会话文件能力取得原件；Goldenluck宿主若提供agent_session_file，可list后read文本或resolve磁盘原件。历史图片用实际提供的agent_session_image读取。不要把页面resourceId、宿主fileId和磁盘路径混用。
   - 需要从业务系统按产品编号下载原图时，使用宿主实际提供的、按当前用户授权的文件读取工具。Goldenluck宿主的goldenluck_product_file({number:实际编号,kind:'drawing'|'image'})分别取得DWG原件/解析数据和产品照片。其他宿主使用其已有授权附件或文件能力；没有相应能力时报告缺失的工具或访问权限。此工具属于宿主，不是window.webcad.api方法，不放入api.run。api.files.download只下载页面已登记资源，不负责查找业务系统图纸。
   - 核对返回的文件身份、hash/字节数、读取状态及分页。宿主返回nextCursor时沿用同一筛选条件继续；需要完整解析数据时按实际返回路径在宿主有界读取/聚合，原件保持只读。路径存在、下载成功与内容已读是不同证据，不能相互替代。
   - DWG图元/尺寸JSON、产品照片和图纸渲染图是不同输入。Goldenluck的drawing返回前两类中的DWG数据，image返回产品照片；它们不证明已看过整张图纸图像。需要视觉核对时，仅使用宿主实际具备的渲染/图片读取能力，并保留对应原件来源；未提供该能力时如实说明，不能把生成示意图当作原图。
   - 解析为partial、来源版本/单位未定或证据有缺口时，区分已读事实与未确认项；查看相关原始记录/视图后再判断是否阻塞。下载成功不等于结构已理解，尺寸索引不自动给出建模方案。结构规划按需读取api.product-source和api.feature-plan；工具完整卡决定实际可用的绘图参数。
1. 一次核对货号、最新有效图框、实物照片和零件角色。保留DWG原图元handle/原曲线及版本；照片判断形态，反光不直接作为高度场。
2. 建模前记录来源简表：内外尺寸、截面、空间坐标、开口/接缝、连接、孔槽、关键R和未知项。标注、原图测量、用户值与假设分开。模板不能覆盖变截面时改用原解析截面/扫掠/放样，而不是直接判图纸不可理解。
3. 主体与配件→切除/补料/加工→真实圆角→关键核对→Logo。box基点为[0,0,0]；不能套其他内核的居中坐标。变换明确relative/absolute，编辑后重新查询拓扑。只读相关template.*卡；常见形状复用参数模板，复杂形状按部件分批。
4. 用inspectDesign一次核对来源期望的尺寸、实体数和关键材料点；必要时用planeSection查截面、inspectThickness查连续材料、inspectFit查配件干涉/间隙。有效STEP和正确包围盒不足以证明完整产品。未知接缝、小R、Logo深度和孔深不得通过epsilon或改小参数偷偷补齐。
5. 每轮只做相关验证。具体失败先定位一个差异，再做一次有据修正。连续同机制失败且无新证据时记为未解决；新工具先修原始真实夹具，不为某货号硬编码，不枚举半径或放宽验收。
6. 在同一窗口继续工作；保存/导出仅按任务要求进行。区分离线内核、当前页面提交、匹配显示、生成文件与写盘。记录取证/生成/验证/截图/传输的阶段耗时，自动阶段耗时不能称为端到端耗时。
细节见readDocs({docId:'api.design-checks'})；材料检查的来源标签仍由调用者核对。`;
