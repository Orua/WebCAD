
export const READING_MAP = `# 分层取得工具
1. 恢复入口：首次握手下载并校验知识包。压缩后保留本机工具、路由、项目文件；宿主支持时用 webcad_docs recovery 找回索引。已读记录不代表完整说明仍在模型上下文中，忘记参数就重读所需卡。
2. 找方向：按任务查询 agent-routing.json；返回的是候选路线，不是执行计划。先看 readFirst 和 readPlan。精确 UI 动作用 routes.json；已知工具 ID 直接 getTools，不必重新搜索。
建模方法：首次建模读 api.modeling.start 和 api.modeling.guide，按 modeling.* 路线只读相应工作流；明确构造分支后才取完整卡。失败先读 api.modeling.problems.diagnosis 再选诊断工具，整库只存宿主磁盘。
3. 做选择：看搜索摘要、selectionGuide.chooseWhen 与相似工具区别；只读一个命中专题，不加载所有候选专题。来源、截面、路径、支撑面、精确实体/网格结果不清时，先补对应证据。
4. 取契约：getTools({ids:[所需ID]}) 一次取得少量完整卡。readingGuide 指向阅读说明；按 selectionGuide、preconditions、inputSchema、refsSchema、units、limits、minimalExample、sideEffects、verification、errors 的顺序核对。调用入口以卡内 usage 和示例为准，discovery-only 不代表可直接执行。inputSchema/refsSchema/units/limits/minimalExample 才是参数依据，摘要不能代替契约。需要时按 nextCursor 读完专题，不能截断 schema。
5. 执行：取得当前文档引用和 revision，按 run 或专用接口提交；逐项核对回执。minimalExample 只解释请求结构，不证明当前来源适用或几何必然成功。
6. 出错：读 error.code/path/stage 和 error.recovery，先区分参数错误、来源缺失、能力不支持、计算失败、结果未知；按错误建议只读核对。unknown/partial 不能通过换键、换工具或重建全部来恢复。
缓存规则：仅当完整内容仍可用时才传 knownHash/knownHashes；仅记得哈希或读过的ID时不传。工具版本变更重新读取卡；活文档状态和拓扑编号永不当静态缓存使用。
未命中：缩小到一个明确能力词，或按 ID/工具组查找。无合适工具时返回能力缺口和缺少的来源，不重复搜索同一个词，不猜测不存在的工具。
`;

export const COMPLEX_GUIDES = {
  'api.guide.sweep-loft': `# 扫掠与放样
选型：扫掠由截面加路径控制；放样由有序截面控制。curveSweep 用曲线脊线；profileSweep 复用已保存截面和精确路径；advancedLoft 是手工 XY 截面序列；referenceLoft 复用精确截面；guidedLoft 还要求明确的导引及接合条件。
准备：核对截面顺序、闭合性、内外环、截面标架、路径方向与尺寸单位。referenceLoft 的已公布范围为 2–12 个单外环截面，不支持截面内孔；不能从其它放样工具推断它支持孔。来源只读，引用来自当前工程。
操作：先 inspectProfile/readVector/queryGeometry 取得所需证据，再读选定工具完整卡和 api.run。按卡片要求提供 refs 与 params；截面点、路径点、截面站不是可互换字段。不要把 stations/sections 等相似名称在工具间照搬。
检查：确认产生的是实体还是开放壳、截面尺寸与端部位置、孔是否保留。没有闭合实心体的回执，不声称得到可直接加工实体。
失败：按路径定位缺失/反向/自交截面，核对来源与导引兼容性；G1/G2 不成立不能用近似曲面冒充。先查原回执，不盲换截面顺序或反复改数值。详见 api.mechanical、api.references、api.feature-plan。`,
  'api.guide.rounding': `# 圆角、倒角与端部圆润
选型：二维轮廓圆角、截面半径、三维边混接和端部重建是不同操作。先比较 round/fillet/rounding/roundEnd/chamfer 的 selectionGuide；不能凭名称中带“圆”就替换。
准备：取得当前实体、边/面拓扑及用户要求的 R，区分需要处理的边与仅作参考的边。几何修改后旧边编号失效，重新 queryGeometry；不要把旧索引换到新对象。
操作：读 api.smooth-transition 和目标卡；用现有 probeBlendRadius 等只读工具检查适用性。探测建议不构成修改 R 的授权，执行仍保留要求的半径。仅对当前已验证来源执行。
检查：核对实际作用边、R、实体有效性、相邻孔/薄壁及剩余对象。显示更新不是几何有效性证明。
失败：区分选边过期、半径不可行、内核/服务不可用和未知提交。定位到具体来源/阶段，不自动减小 R，不反复换内核，不删除细节以换取成功。未知结果查询原 job/request；已有部分提交先保留。`,
  'api.guide.pattern': `# LOGO、连续浮雕与网格
第一步分清结果：恒深凹线/凹字/凸字走矢量 LOGO；连续起伏走已制作的高度数据或相应精确浮雕工具；网格输出与精确 BRep 不能互相冒充。普通照片亮度不是可靠的高度。
准备：明确真实尺寸、凹凸方向/深度、目标实体与支撑面，取得来源轮廓/高度数据；核对孔、细节与坐标标架。资源ID不是磁盘路径，来源必须由当前宿主支持的文件链路获取，不限定某个下载工具。
路线：先读 api.pattern-machining，调用 planPatternMachining；根据返回的 blockers/候选能力读 api.logo、api.relief-taxonomy 或 api.mesh-relief-edit，再读目标卡。规划返回可行方向，不证明计算已成功。
阶段：来源解析 → 轮廓/高度审阅 → 定位与适用范围核对 → 预览或计算 → 明确提交 → 核对结果 → 用户需要时导出。readLogo/prepare/preview 的返回值不能当最终加工回执。外部上传仍遵守来源授权。
限制：读取当前卡和 getServicesCapabilities 的适用面、精度、来源复杂度与输出类型；不将平面成功外推到柱面/自由曲面。meshBoolean 不会自动得到精确 STEP。
失败：区分来源没取得、轮廓不闭合、孔解释错误、支撑面不兼容、服务请求失败和未知提交。保留来源与诊断；不删细节/孔洞、不用粗网格、不改变深度来掩盖失败。`,
  'api.guide.boolean': `# 布尔与局部修补
明确目标实体与刀具体，选择 union/cut/intersect；名称、位置和材料意图须一致。复制/组合显示不等于布尔融合。
读当前目标卡中的 refs 顺序、消耗/保留输入、结果数量与副作用，不能假定所有工具都保留刀具。用 queryGeometry/measure 核对交叠及有效性后提交。
按返回的新实体与 replacements 更新引用；不要继续使用已被替换的实体/边编号。核对被切除/保留区域、孔、连接和对象数。
没有相交、相切退化、无效实体和结果未知是不同问题。若未提交，可针对明确原因修正来源；partial 保留成功部分；unknown 查原回执，不重复切削，不重建全部。相关 api.run。`,
  'api.guide.source': `# 来源重建与多部件计划
先取得用户给定来源的原件和身份、版本、尺寸单位，再区分原始文件、解析记录、图纸图像和产品照片；得到文本摘要不代表看过图像。下载方式由当前宿主能力决定，不能写死路径或产品工具。
列出目标部件、参考部件、已知尺寸和未解决关系，按 api.product-source/api.reconstruction 核对证据。名称/产品类型不能代替截面、孔、背面和尺寸。
先选结构，再读命中的轮廓/扫掠/放样/加工工具卡。feature.addMany 用完整计划与引用关系；普通 run 是有上限的非原子批次，不能把两者的回滚语义混同。
按子目标分批构建，链式使用回执的新 context；只读必要记录，格式解析和大文件筛选留在宿主，避免逐页把整份文件塞进对话。
用 inspectDesign/measure 等按来源尺寸核对。假设、猜测轮廓或通过一个小样，不构成完整实件验收。来源不足时说明缺哪项，保留已完成工程。`,
  'api.guide.files': `# 文件、保存点与交付
files.capabilities → 宿主提供真实字节并 register → open/import 或处理 → save/export → read → 宿主持久化 → 校验大小和 SHA256。严格区分浏览器资源ID、本机文件路径和附件ID。
open 替换当前工程；import 向当前工程导入，具体格式和语义以卡片为准。dirty/计算/预览/未确认写入时，遵守现有替换保护，不用刷新页面解决。
.webcad 保存最终几何、外观等工程状态，不承诺保留建模配方和整段撤销历史。STEP、STL 与截图的用途不同；网格不冒充精确 BRep。
generated 仅证明字节已生成；download_initiated 仅证明下载开始；write_verified/agent_write_verified 才是对应宿主的校验落盘回执。旧 revision 的保存不能清除新修改的 dirty。
压缩/重连后，用宿主的项目索引找到原始路径、哈希和最后保存点，再按 fileId 解析；没有保存点的旧对话不能凭文字恢复历史画布。浏览器资源过期时从持久化原件重新登记，不重复计算源几何。详见 recipe.file-workflow、api.file-errors。`,
  'api.guide.errors': `# 先判断失败在哪一层
参数错误：读 code/path 和完整 inputSchema，修正已确认的字段或单位；不要逐个猜参数。
来源/引用错误：确认原件是否取得、解析是否完成、资源是否过期及拓扑 revision 是否匹配；只读核对相应来源。
不支持：核对工具卡和当前能力；明确缺口。不得把权限、未支持能力和几何不可行混为一谈。
计算失败：保留 stage/report/requestId，判断有无已提交步骤；只针对可证实原因制定下一步，不自动改尺寸或换工具重算。
unknown/queued/running：先查原 job/batch/request 回执；超时不代表失败，更不代表可以换幂等键重放。
partial：逐步列出成功和未完成项，只规划剩余工作，不能声称已整体回滚。
向用户说清“什么失败、已确认保留什么、下一步查什么”。缺少提交证据时说尚未确认，不说已保存/未改变。具体 error.recovery 优先于此分类概览。`,
};

const familyDocs={ 'sweep-loft':'api.guide.sweep-loft', 'rounding':'api.guide.rounding', 'booleans-organize':'api.guide.boolean' };
export function withReadingGuide(card){
  const family=card.selectionGuide?.groupId;
  const specialized=familyDocs[family] || (/logo|relief|heightfield|meshBoolean|PatternMachining/i.test(card.id)?'api.guide.pattern':card.id.startsWith('files.')?'api.guide.files':null);
  return {...card,readingGuide:specialized||'api.reading-map'};
}
