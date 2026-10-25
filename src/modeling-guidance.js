// Canonical runtime modeling guidance, adapted from webcad-skills 0.3.0.
// Self-contained source: no G: path, junction, old cards or historical receipts required.
import {INTERLOCKED_ASSEMBLY_GUIDANCE} from './interlocked-assembly-guidance.js';
export const MODELING_DOCS = Object.freeze({
  'api.modeling.methods.interlocked-assembly': INTERLOCKED_ASSEMBLY_GUIDANCE,
  "api.modeling.methods.staged-assembly": "# 分批建模与交付\n\n**多配件建模与分批交付**\n>\n用户要求建立多个配件、装配体或复杂产品时，先提交可核对的建模规划，再进入建模轮次。已有明确且获用户确认的规划应直接沿用；单个简单件不强制增加规划确认。\n>\n**规划轮次：**读取足以判断结构与关键尺寸的来源，分清组件种类、各类数量、独立活动件及制造件。用简表列出配件名称/编号、数量、来源与关键尺寸、相互连接与方位、计划批次和本批验收点。区分已知、可推导、用户允许假设和未解决项。确定统一基准、轴向、装配方向；未知项只阻塞受影响的配件。先形成简短规划，不为未开始的细节遍历工具、批量裁图或生成全套脚本。\n>\n将规划作为本轮正式回复提交，明确首批将完成哪一个或哪几个配件、暂不包含哪些细节及需要用户决定的事项，并等待确认。保存规划时核对文件写入回执；文件保存失败仍可在回复中交付完整规划，但不能声称已写入。规划确认前不创建、删除或重排几何；不把内部思考或一句“接下来开始”算成规划交付。\n>\n**执行轮次：**确认后只执行当前约定批次，通常是一个配件，或几个依赖简单、能一起核对的小配件；重复件先完成一件并确认尺寸/姿态，再按已确认的数量和间距复制。首批优先形成有用且可验收的工程成果。未经用户同意，不为赶进度用粗略模板替代要求中的真实轮廓、截面、孔槽、活动结构或文字。\n>\n工具只读取当前批次所需完整卡。复用已验证来源、静态知识、当前有效状态和成功回执；跨轮次从最新规划与工程状态续做，避免重新分析整张图。尺寸或方法已明确时，使用现有有界批处理；需要中间拓扑或用户判断的地方才拆开。遵守部分提交与原子事务各自的规则。\n>\n**批次交付：**至少报告本轮实际新增/修改的配件、工程提交状态与revision、关键尺寸/方位检查、缺失或尚未验证的细节、下一批内容。对本批做一次相关画面检查；已有充分的量测/回执不反复查询。截图失败不重复建模，说明视觉确认待补。只在宿主已确认暂存时报告恢复点；几何成功、画面确认、文件生成、写盘、附件交付分别表述。\n>\n正常批次结束后等待用户确认或“继续”。用户已明确授权按规划连续推进时，沿用该授权，每批仍回报实际成果；不因格式修正、只读检查或正常重连反复请求确认。用户改变尺寸、配件范围或方位时，只更新受影响规划和依赖部分。\n>\n**无进展与阻塞：**不能长时间只说“准备、分析、马上开始”。如果当前批次持续没有新增工程成果，先判断是缺来源、模型尚未形成方案、参数错误、页面连接阻塞，还是原作业仍在运行。一次有依据的修正后仍无新证据，就交付已完成部分及明确阻塞，结束本轮等待后续决定。原作业在运行时保留原jobId并报告等待，不另起计算。unknown/queued/running先核对原回执；绝不换key重复写入。\n\n规划模板建议保留一张小表：`配件/数量｜关键尺寸及来源｜位置与连接｜批次｜本批验收点｜未确认项`。默认每批1–3个逻辑配件是调度建议，不是API上限，也不是把一次切孔、设颜色或重命名算成一个已完成配件。\n\n复用同一对话的最新规划、已确认范围、当前工程与原回执；下一轮只续做未完成批次。人工编辑或工程重开后先核对当前身份和对象，不将历史bodyId用于写入。规划约1–2分钟交付、简单批次约2–3分钟出现成果或明确阻塞是体验目标，不是结束合法长作业的硬时限。",
  "api.modeling.guide": "# AI怎样在WebCAD完成一个三维模型\n\n多个配件、装配体或复杂产品先读[分批建模与交付](api.modeling.methods.staged-assembly)，先交规划，按实际确认或已授权范围分批执行。单个简单件不增加固定确认轮次。\n\n这份指导负责建模判断。工具卡负责精确参数，两者不能互相替代。先读当前用户需求，按以下闭环推进；简单件可以几句话完成，不强迫用户填写大表。\n\n## 一、把形容词变成结构与约束\n\n先确定是复刻源件、按尺寸新设计、修改已有模型，还是只检查/导出。识别独立制造的部件、连续材料、孔洞、配合面、截面和预期输出。源图先定位正确产品/零件/版本和视图；照片补结构，标注控制尺寸；缺一个视图未必缺几何证据，多一个视图也不能解决相互冲突。\n\n把关键量分成已标注、源实体测得、约束推导、用户允许假设、未知五类。推导量用公式计算，不凭感觉写坐标、半径或重量。直径与半径、总高与端面高度、轮廓R与截面R、实心与中空分别确认。不会影响本次结果的未知不拦住任务，会改变模型的未知必须解决。\n\n## 二、选择能直接表达控制尺寸的构造\n\n依据[构造选择](api.modeling.methods.construction-choice)判断等截面、旋转体、路径截面、多截面过渡。已有标准件先查可追溯模型，结构完全匹配时用具体模板；不能为了少调用工具把复杂结构改成近似形状。\n\n把模型分为主体、去料/加料、定位组合、局部收边、图案。每项写清输入、依赖和检查点。例如带孔板是外形/厚度→孔型/孔位/深度→当前选边→R/C，不是先随便拉一块再靠试切得到近似。先在草图里包含准确内外轮廓也可能更稳，顺序由几何决定。\n\n## 三、先建立可核查基准，再操作\n\n以安装面、对称中线、轴线、端面或真实路径起点作为功能基准。说明原点、轴向、局部/世界坐标与长度/角度单位。外观网格、精确实体、工程配方和导出物各有用途；不把显示旋转当实体定位，不把材质颜色当物理材料。\n\n通过授权页面通道connect当前文档，检查blockers和卡片；模板只读目标template卡。写入带新鲜context、明确refs和幂等键。用同批次回执引用后续对象，改形后重查拓扑。确定性坐标/阵列/单位换算交给脚本，AI负责来源、路线与歧义判断。\n\n## 四、每种特征用对应证据验收\n\n外形查bounds；孔查当前圆边/孔壁、中心、层位和贯穿/盲底；连接查材料和实体数；局部R/C查目标范围和真实几何；改动查不变量。几何正确、画面匹配、字节生成、写盘和部署分别报告。无相应测量接口的要求标未验证，不能把总量或视觉作为局部证明。\n\n## 五、失败时选择诊断工具，不轮流试工具\n\n先定位第一个失败步骤及当前已提交状态，再读[诊断表](api.modeling.problems.diagnosis)。参数错读卡/核单位；孔不见查相交/方向/深度；圆角失败查边归属、小面与余量；扫掠/放样失败查截面/路径/对应关系；断线先查原回执。每个真实候选共享一次基线加一次有机制证据的替代，不能换key无限重跑。\n\n修复应保留用户尺寸、孔数、字形和材料要求。若必须改变设计才能完成，说明变更及原因，等待设计决定。原工程仍可用时保留，不以重建清空、不支持的自动展开或第二内核掩盖失败。\n\n## 六、按用途交付\n\n工程继续编辑、精确STEP交换、网格打印、切割轮廓和工程图是不同交付。读取实际导出文件而非生成器自报；带条件给出尺寸/制造结论。外部查询/下载属于宿主能力，切片/打印/供应商下单属于另一个授权动作，不能因完成模型就自动执行。\n\n按任务选分册（agent-routing.json 的 modeling.* 路线）：源图复刻→source-reconstruction；轮廓→profiles-2d；工程图→drawings；制造检查→manufacturing；打印→printability；标准件/重复件→part-reuse；材质/克重→material-properties。路线候选来自catalog，不等于机器已理解所有几何。方法来源与接入边界见 api.modeling.sources。\n",
  "api.modeling.methods.artifacts-and-dependencies": "# 来源、当前工程与派生结果\n\n参考text-to-cad的模型契约/项目组织/迁移资料，先区分可编辑来源和派生物。在它的体系中Python通常是生成源；在WebCAD中当前页面文档和真实特征/导入形体才是执行依据。不能要求用户准备Python，也不能把导出的STEP当作自动保留原参数历史的工程。\n\n用户给的STEP/BREP是只读来源；模型库模板、图案源与已保存工程各自有版本和身份。files.import的参数、单位与定位按当前卡，mesh导入尤其须显式单位与幂等键。导入后检查实际尺寸/姿态，而不是仅相信源文件名或模板名称。已有源配方时修改源；只剩最终形体时核实可执行的局部加工，不能调用不存在的feature.edit。\n\n依赖改变后检查受影响下游：例如板加厚会改变顶面Z，基于旧顶面坐标的孔入口/LOGO落点不能不经核对继续复用。只修改一个子部件不意味着所有上游组合和缓存结果已经更新。通过当前状态、特征绑定和回执判断，而不是根据上一次显示或缓存ID猜测。\n\n保存工程、导出交换文件和模型资源是三种交付。用户还要继续改尺寸时说明当前工程保存语义和实际可编辑性；导出文件用于交换，不承诺保存undo、配方、装配约束或制造标注。旧输出被重命名后仍可能留存，只有明确属于本任务且已核验的旧派生文件才可清理，原始来源始终保留。\n\n遇到版本/Schema不兼容，读当前页面契约和具体错误，更新受影响知识或走已有兼容入口；不能手改版本号、伪造哈希或忽略丢失的外观/数据。源码版本、页面buildId、几何revision、文件SHA256分别记录，任何一个相同都不能替代其余一致性证据。\n\n正常例：将板厚3改4后重查顶面及孔入口和LOGO依赖。边界例：重新导入STEP仅得到最终形体，没有旧撤销历史，保留来源并选择支持的加工，不能声称恢复了源配方。\n",
  "api.modeling.methods.brief-and-datums": "# 从需求得到可建模的问题\n\n先用一句话回答：这是单件连续材料、可分离零件组合，还是只要曲面/展示网格？“钉”“圈”“底片”只是名称，不能确定截面、连接方式或尺寸。输出范围也要区分可编辑工程、精确STEP与展示网格。\n\n从图纸读单位、版本、各视图和剖面，再把标注落到坐标。显式尺寸优先于照片比例；同一部位标注冲突应停止推断。照片可给外观比例，不能证明孔径/壁厚/配合。4X孔、盲孔底、沉孔、螺纹和背面结构单独列入验收项。能由约束确定的量直接计算，例如对称孔中心x=±孔距/2；不能由外宽减出未知内宽。\n\n选择功能基准：板件以安装平面和孔距中线，轴件以轴线和端面，弯线件以路径起点和截面法向。写明坐标系、厚度方向、局部原点和部件间关系。WebCAD的box从角点到宽深高，cylinder以Z为轴、底面Z=0；模板常以中心布置，必须读卡确认，不共享想当然的原点。\n\n一个有用的建模输入只保留：已确认尺寸与来源、需要的结构、必须保持的不变量、未知项、检查方式。简单零件不强制填大表。缺失会改变几何的厚度/孔位/截面/加工深度应补充；显示颜色等非关键选择可按用户已授权默认，不能从测试例子借尺寸。\n\n已有模型先判断是否有可编辑特征；本项目新工程重开可能只保留最终形体，不能默认源配方还在。用当前getState/getHistory核实后选择feature.edit或新增明确加工，禁止以重建猜测替换原模型。\n",
  "api.modeling.methods.construction-choice": "# 用形状和控制尺寸选择构造路线\n\n先问“哪个表达能直接控制关键尺寸”，不要从熟悉的工具反推形状。\n\n|几何证据|优先表达|为何选择|转向条件|\n|---|---|---|---|\n|固定截面沿直线延伸|简单体、闭合轮廓拉伸|宽/厚/轮廓直接受控|截面沿长向变化则看放样|\n|绕一条轴旋转不变|圆柱、圆筒模板或截面旋转|直径、轴向台阶和内腔容易核对|偏心凸台/横孔为后续加工，不能塞入旋转截面|\n|同一截面沿空间路径|扫掠|保留路径与截面含义|截面尺寸在站位变化则看放样|\n|多个不同截面连接|放样/已支持的引导放样|每个控制截面可独立表达|无源截面/轨迹时不能臆造自由曲面|\n|规则重复结构且模板完全同构|具体template卡|减少确定性构造步骤|孔数、截面、沉头、装配结构不同则退回显式构造|\n|已有精确体局部去料或加料|孔、槽、布尔/面加工|保留原件未指定结构|目标是mesh则不能套BRep路线|\n\n同样叫D扣：圆线截面与扁带截面是不同问题；一个通用D形模板不能替代源件。圆片可用cylinder；带中心通孔的垫圈可用tube；偏心孔圆片仍需圆片加孔。铆钉若有钉头/台阶/盲孔，单个cylinder只代表其中一段。\n\n决定轮廓画法时优先保留真实直线、圆弧和孔环。由采样拟合代替已知圆弧会丢失源几何；只有用户允许且误差标准明确时才谈近似。圆角可晚做以减少拓扑干扰，也可在二维轮廓里直接构造同样外形；后者必须证明截面、半径和连接关系等价，不能当作通用替代。\n\n模板路线与显式路线均可正确。记录一个选择理由和转向条件即可，不强制所有零件都经过长方体→布尔→圆角，也不要求AI重新推导程序能确定的坐标。\n",
  "api.modeling.methods.external-handoff": "# 模型、制造资料与外部执行的交接\n\n参考Gcode、Bambu、SendCutSend、机器人消费端验证与模型存储边界。模型合格、切片完成、打印发送、机器开始、供应商可接单是不同结果；几何成功不授予后续动作权限。\n\nWebCAD交接先确认所需格式、实际模型revision、单位/原点、实体/零件结构、已测项及未测项。需文件时通过真实资源API导出并由宿主读字节/落盘；自包含性不能依靠本机热缓存或临时URL。不要把渲染截图、未取字节资源或过期下载链接当长期模型交付。\n\n切片需要真实打印机/喷嘴/材料/层高与完整有效预设；不能猜温度、床尺寸或套一个同名预设。WebCAD当前没有切片或打印机控制工具；用户明确要求后才交给实际可用的宿主/外部工具流程，不能构造不存在的print/run接口。未配置就说明缺口，不自动安装或联系打印机。\n\n供应商文件检查使用实际上传候选文件与当前材料/规格/工艺/服务规则；精确SKU/规格身份是关联门槛，近似名字不足。来源字段缺失、N/A或矛盾不变成0或pass。局部弯线、切口、支撑问题保留独立原因，不以一句“法兰短”掩盖所有问题。用户未要求上传/下单时只交付资料。\n\n当模型导向仿真/规划等其他消费者，结构校验与消费者实际加载/行为测试分开。已有权威模型应派生输出，不重新手写另一套空间关系造成漂移。WebCAD当前不能验证机器人关节、IK或Gazebo插件；可迁移的是坐标/资产身份/证据边界，不是这些执行能力。\n\n检查失败留存仍可用的模型和具体缺失资料。可选环境未安装属于未做该项，不自动把几何判失败；用户明确要求必须的消费端验证缺失，则任务该部分未完成。不要用“打开应用”冒充“打印/制造已经开始”。\n",
  "api.modeling.methods.feature-order": "# 安排步骤与依赖\n\n先形成决定外形的主要结构，再加工依赖它的孔/槽，最后处理需要当前面边的局部特征。LOGO通常放在主体和收边之后，减少它使面边碎化对选取的干扰；这不是禁止早做LOGO。若轮廓中已经准确包含R角，可先拉伸该轮廓，避免不必要的3D收边。\n\n把计划写成部件和特征依赖：主体→孔；主体→柱脚定位→明确融合；当前目标面→LOGO。独立制造或移动的零件保留独立对象，不因外观接触而union。融合后原部件可能不再有独立对象身份，角色意图应保留在命名和验证要求中。\n\n重复同规格孔先算所有中心点，用multiHole等原子操作；异孔径/不同底型分别加工。多个不相交刀具可按支持能力合批；重叠刀具或依赖前一结果时允许分段。加长刀具只为覆盖目标材料，长度根据目标厚度与方向确定，不能贯穿并误伤后面的装配件。\n\nWebCAD的addMany仅用于其当前允许的操作：读api.feature-plan和feature.addMany卡，不自行把LOGO/选边加工塞进去。需要先查询拓扑的步骤必须分段：执行→获得新revision→查询→选择→加工。run本身atomic=false，前序成功不会随失败自动回滚。\n\n提交后检查点按风险设置：基础简单体只读关键尺寸；拓扑加工前后检查目标和保留结构；不要每一步都做全件重测。一个相关回归足够，出现具体失败再补对应检查。\n",
  "api.modeling.methods.output-quality-and-process": "# 输出精度与制造条件\n\n参考text-to-cad的supported-exports、migrations及DFM资料，输出格式先由用途决定：精确交换用已有BRep导出能力；STL用于网格交付；需要继续编辑时另考虑工程文件。文件后缀不赋予几何新的精确度。\n\n显示精度、导出离散精度和建模几何精度是不同控制。text-to-cad某些网格误差参数使用部件包围对角线的相对比例；不能把这个数值移植成WebCAD的mm阈值。WebCAD的setRenderQuality是显示重网格化，不能由它推断STL导出公差或STEP精度；具体输出参数按当前files.export和相关契约。\n\n检查网格交付时，把用户要求的精度与实际格式/分辨率分别记录。不知道导出离散规则时标未验证；不能通过把显示调成ultra就宣布加工公差合格。外观颜色/金属材质也不能证明真实合金、强度、板厚或制造工艺。\n\n制造风险应先选工艺：冲压/钣金关注弯曲、避空与展开，CNC关注刀具可达、内角与深腔，模具关注脱模方向、倒扣和相应壁厚条件。只有现有工具能测、且有当前工厂/供应商规则时，才给带适用条件的数值判定。没有测量用review，没有适用规则或证据用unverified，不把通用参考升级为批准。\n\n正常例：用户要STL用于展示，检查实际字节与网格形状，并说明未给加工公差。边界例：用户要精确STEP但手头只有三角网格，说明不能从网格自动恢复原解析曲面，不以改扩展名交付。\n",
  "api.modeling.methods.parts-and-repetition": "# 复用标准件与重复结构，而不丢失身份\n\n参考step-parts、项目模型样例和预设继承脚本。先确认要的是用户源件、已命名标准件、完整匹配模板还是概念占位体。已知标准/品牌型号时，优先查用户提供或宿主能访问的可追溯模型；不能直接画一个近似盒子称真实标准件。\n\n检索可用确切型号、标准号、常见别名和关键尺寸；多个相似候选要比较轴径、长度、接口、材料/版本，不只看名字。网络不可达只说明未查到服务，不等于零件不存在。外部搜索/下载由已授权宿主负责，本库没有向WebCAD注册step.parts工具，也不把其API描述当页面API。\n\n使用已选模型时记录来源ID/版本、单位、原点、实际文件字节和可用哈希；下载后核对，导入后测实际尺寸与接口。不要覆盖原始供应商文件。只能用占位体时必须注明包络/简化/未验证接口，不能让占位体进入精确配合验收。\n\n重复结构由确定性坐标生成：等距阵列用linearPattern，共轴周向用circularPattern，非规则可copy/transform。先说明重复的是独立实体、独立孔还是连续材料，合并与否按设计决定。count、间距/总角、首末项是否重复、局部轴/世界轴和相位均核对；全圆阵列不要首尾重复成count+1。\n\n同一个模型的不同参数变体不是新的独立产品覆盖证据。重复件可以复用经核验静态构造，但实体ID、面边编号和当前状态不得复用。模板只有完整结构匹配才进入执行分支；原点/截面/孔数/内腔不一致时退回显式构造。\n\n预设/参考的同名不代表同源，参数继承必须解析父链并核对实际有效值；缺父链、循环或同名多个来源要报冲突。这一思路用于识别当前WebCAD模板默认与显式用户参数的差异，不要求引入Orca预设系统。\n",
  "api.modeling.methods.process-aware-modeling": "# 按制造结构理解模型，按证据选择检查\n\n参考DFM、DfAM与SendCutSend的测量/规则分离方法。这里迁移的是判断流程，不移植供应商阈值、Python测量引擎或外部下单权限。\n\n先问零件是机加工、钣金/冲压、注塑/压铸还是打印；材料、工艺、基准、孔和配合需求不明时不强行给生产结论。相同几何可能用不同工艺制造，一种刀具不可达不等于所有工艺不可行。用户/实际工厂规则优先；规则必须带材料、版本、单位和适用条件。\n\nCNC：区分型腔平面内角与底壁交界，平底刀能形成某些锐底角，不要一律要求根部R。刀径能进腔还需查刀柄/深度/装夹；深孔、螺纹啮合、钻尖余量和偏心加工分开理解。WebCAD可用queryGeometry、measure、inspectThickness、inspectFit等取得局部事实，但没有刀具/夹具包络和路径验证就不能声称可加工、节拍或报价准确。需要松公差/改R时先确认功能允许。\n\n钣金/冲压：确认真实等厚、内R/外R、法兰、孔槽、避空和折弯方向。孔到弯线的中心距、边距、切线距不同。局部切口可能截断法兰有效支撑，不能用整件最远外包络判断每一段足够；同轴分段弯线、重线和跨弯切割分别记录。只有受支持且已验证的展开才是坯料，不从投影推展开尺寸。\n\n模具：先确认拉模方向与分型假设，再用inspectDraft按用户阈值检查已支持事实。面法向角不是完整倒扣证据；还涉及遮挡和完整退出路径。顶/底面不应因与拔模方向垂直就当零拔模壁；曲面切向小带也不能直接当整片直壁。按独立物理零件判断，不让装配中的另一个盖子成为底座“倒扣”。均匀壁、肋/柱交汇、顶出/侧抽与冷却是不同检查项；当前没测就报未核。\n\n打印：先确认实际导出网格的单位、封闭性、法向/体积与打印工艺；inspectPrintability只证明它的当前返回项，不能照搬外部脚本的壁厚/支撑完整能力。粉末自支撑工艺与需支撑工艺不同，封闭腔的排粉/排液仍需检查。方向改变会影响支撑与高度，但不能把改变用户功能姿态当几何修复。\n\n测量失败/partial/null不是0，也不是“无发现”。采样最小壁厚不是全件极小值；装配间隙可能被射线误记成壁厚，应按实际体分别测。采样/离散不确定度跨过阈值时标unverified。支撑体积粗估是成本信号，不能当准确切片耗材。\n\n输出采用四类：有适用规则且测量满足→pass；有测量违反该规则→fail；仅定性风险→review；缺测量/规则/环境→unverified。每一项列对象/位置、事实、规则及具体下一步；不由工具success或模型自报给整件生产批准。\n",
  "api.modeling.methods.profiles-and-drawings": "# 从二维轮廓到三维与工程图\n\n参考dxf、engineering-drawing及金大福投影方法。先分清：二维切割轮廓、三维建模截面、三视图、剖切、带标注工程图、弯曲展开。它们目的不同，不能以一张投影替代全部。\n\n建模轮廓先确认单位、平面、比例、闭合与内孔。保留真实直线/圆弧，不为方便拟合成大量短线。剪裁/层筛选后检查断点、自交、重复和零长实体；可用readVector获取支持来源，再sketchProfile/inspectProfile。profileRepair只在来源允许的最大端点移动内修指定问题，不能用扩大容差合并真实开口。偏移/带状轮廓用profileOffset，不能手工平移每个点来冒充等距偏移。\n\n切割层必须按实际用途闭合；折弯线、刻线等允许开放的线不能被误补成材料。文字加工要审核字形轮廓和内孔，不依赖CAM再次挑字体。缩放前确认原单位，照片比例与实际矢量单位不是同一证据。\n\n若已有可靠3D几何，二维信息优先从该几何推导，避免手工重画公式漂移。WebCAD真实工程图入口是createDrawing({context,bodyIds,projection,sections,hiddenLines})与exportDrawing；受当前卡中的实体/面数/截面数、权限和revision限制。图纸来源应与被交付模型一致，改形后旧drawingId需要更新。PDF、JPG、DXF、SVG按实际支持导出；不声称DWG可用。\n\n三视图是可见/隐藏线投影，剖切是切面，不能互换。投影器的局部XY输出不能再错误取YZ/XZ，否则侧视会塌成线。正/第三角法、看向、up向及排版一致；对称轮廓也要核对左右/上下，不能靠包围盒通过。保留内部真实可见线，不能为了补外轮廓清掉全部内部结构。发现漏线先区分显示/投影问题，不能直接改三维模型。\n\n带标注图应让尺寸落在真实几何上：孔中心与直径、通孔/深度、沉孔/沉头、剖面、投影法和单位明确。缺公差来源就只报名义值，不凭常用ISO字样生成制造批准。读回实际PDF/图像检查遮挡与标注重叠；漂亮截图不是工程图验收。\n\n弯件的正投影不是展开料。没有经过验证的展开、折弯表/K因子和当前工具支持时，明确不能输出生产平面坯料；不把直观压平当作等价几何。\n",
  "api.modeling.methods.representations-units-and-mass": "# 区分几何、显示、基准与物理量\n\n参考CAD、URDF、SRDF、SDF的空间语义和假设账本，将通用方法转为WebCAD指导；不因此宣称支持机器人XML、IK、动力学、碰撞矩阵或动画插件。\n\n同一部件可能有精确BRep、显示网格、导出网格、简化检测包络和工程元数据。用途和来源要标明；不能以简化包络证明真实孔槽，以显示材质证明合金，以相机旋转纠正实体坐标。若简化表示用于某项检测，说明其误差和未涵盖结构。\n\n每个位置/方向说明在哪个坐标系。锚点冻结与当前工作基准不是同一东西；保存后重开也不能假设历史存在。局部原点、实际材料重心、包围盒中心和装配接口可能不同。变换顺序会改变结果，镜像会改变左右/轴向，不能只用一个视角看起来正确来验收。\n\nWebCAD长度mm、角度按当前卡（通常degrees）；机器人参考中的m/rad不能直接搬过来。密度g/cm³与体积mm³换算：质量g=体积mm³×密度g/cm³÷1000。用getMaterials读取明确材料设置，以measureMass及其实际测量体积核对。均匀密度、未建倒角/孔或占位简化都会影响估重，必须注明。外观电镀与基体密度分开。\n\n派生数值程序计算：直径转半径、坐标变换、阵列坐标、单位转换、体积与质量。用户只给总质量时不能由几何猜材料密度作为事实。质心/惯量若没有当前可核验工具或源数据就报缺口，不从渲染图自由手写精确矩阵，也不把惯量公式附在本库就说WebCAD已经支持。\n\n身份和关联从当前实际对象清单取，不从相似名称记忆补齐。对象/源文件/工件版本变化后，相关位置、测量、配合与输出都需确认是否仍有效；画面能显示只证明一部分。复杂任务保留紧凑记录：来源、单位/标架、部件角色、控制量、假设、不变量和未测项，不强制简单件填机器人式大表。\n",
  "api.modeling.methods.selection-and-placement": "# 选择目标与定位\n\n先确定部件再确定面/边。使用法向、轴线、位置、曲线类型、半径/长度和邻接关系表达选择意图，例如“板顶平面”“距中心12的两个完整圆孔边”。不能写“第0面就是顶面”。queryGeometry返回当前revision绑定的候选与指纹；加工后重新查询，旧数字和token不能跨revision或内核复用。\n\nqueryGeometry默认要求唯一。预期选多条时显式requireUnique:false与expectedCount；如果不符先查原因，不拿前几个凑数。孔口上下各有一条圆边，两孔通常有四条边；同半径的外轮廓圆角也会被radius筛选命中。检查圆周长接近2πr、中心、Z层和邻面，区分完整圆孔与四分之一圆角。\n\n定位先核对工具原点和部件基准，再用显式placement或transform。相对平移与绝对包围盒中心含义不同；旋转轴必须明确世界/局部及中心，不从欧拉角名字猜局部轴。planAlignment/queryReferences可提供当前精确参考，歧义要消除；不能把有孔面的面积重心直接当可靠落面点。\n\n将零件放到另一个面上时验证轴向、法向、接触/间隙与预期方向。包围盒接触不代表实体接触，两个体最短距为0也不能区分接触和穿透；使用measureRelation/inspectFit等实际支持的检查。WebCAD没有据此获得text-to-cad的原生joint/运动学能力，只能按已确认的定位和配合工具处理。\n",
  "api.modeling.methods.source-reconstruction": "# 从图纸和实物复刻，避免“形似但结构错”\n\n从text-to-cad的cad/brief与本机金大福重构技能迁移方法，不复制具体货号尺寸或旧cadgen命令。先绑定产品、零件角色、修订和所用图框；整图含旧版/相邻产品/模具排布时不能按最低Y或文件名自动选。必要时对已确认图框局部读图，不能在看不清的缩略图上判无信息。\n\n将正视、侧视、剖面和照片对应到同一部件与高度；照片可能倒置。侧视的圆可能是杆端面而非孔，正视带宽不能证明方截面。圆线证据要同时解释成对内外曲线、侧/剖面及明确线径说明。若不同视图的数据不一致，保留冲突，不自动平均成一个方便的直径。\n\n源实体能提供解析曲线时保留LINE/ARC/闭合环及其来源。成对且同心的内外弧，才可用半径均值推导中心线、半径差推导径向厚度；非同心不套公式。LWPOLYLINE的bulge代表圆弧，不当折线；解析映射还须核对OCS/平面和闭合末段。WebCAD使用当前readVector/sketchProfile等公开能力；原始DWG读取若无受支持宿主通道，明确缺口，不虚构DWG页面工具。\n\n区别图上显示值、DIMENSION实际measurement和引出点距离。内孔“高度”可能指两标注点，而不是曲线最大包络；记录标注落点和真实极值的差别。源实体与标注确实冲突时说明用途限制，不能移动轮廓凑四舍五入数字。\n\n重构验收同义对比：源可见轮廓对实体真实投影，源剖面对实体剖切，标注对相应几何。双向比较内外轮廓，LINE/ARC都采样；仅采端点可能漏整条横杆，需在关键部位加材料/间隙检查。生成器计算的期望值不能独自证明生成器；保留能让错误旧模型失败的反例。\n\n缺第三视图不一定阻塞：若源约束已唯一确定截面和路径，可以继续并验收；反过来不能因模板方便就忽略变截面、横杆或开口。内核失败属于实现问题，不能改写成源图证据不足。\n",
  "api.modeling.methods.verification": "# 检查的是设计要求，不是成功字样\n\n建立几个可判定的不变量：外形尺寸、截面、孔径/孔位/孔数、实体数、连接或间隙、局部深度/R、未指定结构。测量选择应对应标注：包围盒只证明外包络，不能证明孔径、壁厚或局部R；总体积正确也可能是错位去料抵消。\n\n|要求|最小有效证据|不能替代它的信号|\n|---|---|---|\n|长宽高|measure的exact-brep bounds|画面看着差不多|\n|孔径/孔距/孔数|当前圆边/孔壁的半径、中心、层位与数量；必要时材料点|单一体积差|\n|通孔与盲孔底|目标方向贯穿证据/孔底Z、截面或材料检查|开孔工具返回committed|\n|连续实体/分体件|solidCount及目标连接证据|bodyCount一个或包围盒相交|\n|固定R或倒角C|当前目标边/面几何及对应参数；不支持独立检查时标人工复核|体积减少或视觉平滑|\n|修改保留结构|前后关键尺寸/孔位/数量对比|新结果有效|\n|精确导出|生成资源、读取真实STEP字节；需要时导回重测|文件名.step或mesh外观|\n\nmeasure未暴露通用拓扑有效性报告时，不能声称已运行BRepCheck或自交全检。inspectDesign仅证明列出的来源/断言；未标注来源或assumption不能作为工厂批准。小数误差阈值是当前测试约定，制造公差须用户/工厂另行提供。\n\n几何提交、匹配revision的渲染、资源生成、宿主写盘、生产部署分别报告。画面检查用于发现方向、遮挡、错位；不能覆盖精确检查。只做用户要求的导出/保存，不用额外文件制造完成感。模型请求/Token/端到端耗时无证据即null；工具内核毫秒不算Agent总耗时。\n",
  "api.modeling.methods.visual-review": "# 用合适视图检查形状\n\n参考text-to-cad的snapshot-review，迁移的是选择视图的判断方法；不迁移cadgen截图CLI、固定分辨率或其Viewer。WebCAD使用当前setView和capture。普通改动按本项目规则做一轮受影响检查，只有具体发现才增加视图，不强制四视图或截图循环。\n\n检查板上孔阵列选沿板法向的正交视图，检查背面柱脚选能看见背面的视图，内部盲孔或壁厚可用当前setView.section能力查看剖切。透视投影可辅助理解空间关系，不用于直接量孔距。装配件隐藏或透明操作只改变显示时，也要记录实际被检查的部件和姿态。\n\ncapture需新鲜context；检查display中的revision与近似/细化状态。视图中看不到孔，先判断遮挡、相机和当前显示状态，不立即重新加工或改尺寸。圆柱周期缝、剖切显示边和真实裂缝不同：结合queryGeometry/measure的精确来源判定。setRenderQuality只改变显示网格，不修复BRep。\n\n截图是辅助证据：能看见错位、反向、遮挡或轮廓异常，不能证明局部R、孔深、最小壁厚或全表面无自交。精确几何检查已通过但图像尚未查看时分别记录；不写视觉验收通过。截图生成、宿主保存和模型收到图像也是不同阶段。\n\n正常例：两孔板顶视图辅助检查对称/位置，再用精确圆边中心确认孔距。边界例：底面朝向视图遮住盲孔入口，换至目标面或剖切，不重复钻孔。纯导出且几何未变不为凑检查另外建模。\n",
  "api.modeling.methods.webcad-execution": "# 将建模计划落到当前WebCAD\n\ntext-to-cad编辑Python并重建保存文件；WebCAD经window.webcad.api操作页面当前文档。不要要求安装cadgen、另开Viewer、MCP或终端服务。宿主提供了什么授权脚本通道必须现场确认；网页有API不代表宿主能调用它。没有通道明确说明，不回退JSON面板。\n\nconnect({queries:[本次能力]})或connect({toolIds:[已选ID]})获得当前状态、完整卡和requestContext。检查canExecute/blockers，不只看ready。首次遵循onboarding.knowledge在宿主落盘、按大小/SHA256验证有限知识包；按来源URL和catalog/docs哈希缓存。缓存不能放工程ID、bodyId或面边编号。\n\n先选方法再拿工具卡；版本与参数以当前页面为准。模板卡template.tube等是具体结构视图，执行使用卡中minimalExample的op:quickModel及params.kind，不能把template ID当op，也不能把子卡schemaHash当父操作schemaHash。api.run的add适配器填当前操作版本/哈希。\n\n几何调用结构：api.run({context:新鲜requestContext,idempotencyKey:本次唯一键,steps:[{id,method:'add',args:{op,params,refs,name?,placement?}}]})。独立创建显式refs:[]；后续用当前回执的{$ref:'part.createdBodyIds.0'}。显式world/model-origin是测试约定；用户工程按确认的工作锚点/快照定位。长等待、人工编辑或REVISION_CONFLICT后重读状态。\n\n批次完成不等于每个设计要求通过。检查逐步status、progress、partial/unknown和实际几何。unknown先读getBatchReceipt/原job与状态，不重做已成功部件。幂等键是确认同一请求的手段，不是继续执行或绕过失败的开关。\n\n普通创建/加工/变换/模板按当前执行策略走本地WASM。复杂圆角等只有页面实际Services配置/能力和确定分流规则满足才走服务器；不能凭慢就改内核，服务器成功后还须页面接受结果。具体以当前getServicesRouting回读为准；本库不复制分流算法。\n",
  "api.modeling.workflows.axisymmetric": "# 柱件、轴套与旋转体\n\n工作流axisymmetric · 长度mm、角度degrees。示例尺寸只用于测试。\n\n目的：以同一轴为基准表达直径、台阶、轴向尺寸与内腔。\n\n所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。\n\n方案选择：单段实心直柱用cylinder；同轴直圆筒用template.tube；完整台阶截面用profileRevolve。横孔、偏心凸台作为后续加工。\n\n容易走错：不能把钉头/倒锥/盲孔遗漏后称铆钉完成；内外径约束先核对；分体件不因共轴而融合。\n\n如何验收：轴线、外/内径、端面位置、通孔/盲孔；尺寸错先查半径和直径、Z方向和原点。\n\n失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。\n\n工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。\n",
  "api.modeling.workflows.cut-features": "# 开孔、挖槽与布尔去料\n\n工作流cut-features · 长度mm、角度degrees。示例尺寸只用于测试。\n\n目的：根据孔型、入口、方向、底型和去料范围选方法。\n\n所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。\n\n方案选择：普通单孔用hole；重复同规格孔用multiHole；通孔/沉头/沉孔/斜底等按holeWizard卡；任意刀具明确target第一、tools其后再cut。\n\n容易走错：通孔应跨越目标材料，盲孔要明确定义深度与底部。刀具不能误伤其他部件；半径=直径/2；沉头和沉孔不能用普通孔替代。\n\n如何验收：孔径、中心、数量与贯穿/盲底；queryGeometry多圆边要核对层位及完整圆周；没孔先查相交和方向，不凭committed放行。\n\n失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。\n\n工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。\n",
  "api.modeling.workflows.drawings": "# 工程图与三视图\n\n路线drawings，来源是整库方法的WebCAD改写，非新增产品能力。完整判断过程见[方法正文](api.modeling.methods.profiles-and-drawings)。\n\n先确定输入源、单位/基准、实际几何角色、要保持的结构和输出用途，再根据正文选择分支。agent-routing.json中对应modeling.*路线的branches列工具候选；外部检索、切片、打印、展开、机器人等能力有明确边界，不编造页面工具或参数。\n\n工具卡和文档只证明调用契约；实际任务必须按正文检查独立结果。正常与边界推理例见[整库例题](api.modeling.examples.whole-library-cases)；真实几何执行范围见独立库的历史测试记录（不随运行知识分发，不代表本次任务验收），未运行的功能不标通过。\n",
  "api.modeling.workflows.editing": "# 修改已有模型与恢复\n\n工作流editing · 长度mm、角度degrees。示例尺寸只用于测试。\n\n目的：先判断原特征是否仍可编辑，明确修改项和不变量。\n\n所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。\n\n方案选择：读取getState/getHistory；有真实可编辑特征时feature.edit，纯最终形体则选择受支持的新增加工。未知结果先getBatchReceipt/原任务对账。\n\n容易走错：不能默认重开工程仍有配方与undo；不能清空重建用户未指定结构；依赖下游拓扑的特征需刷新选择。\n\n如何验收：前后外形/孔位/数量/外观不变量；失败保留最后提交态。history.undo只用于可确认的本任务末位操作。\n\n失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。\n\n工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。\n",
  "api.modeling.workflows.finishing": "# 圆角与倒角\n\n工作流finishing · 长度mm、角度degrees。示例尺寸只用于测试。\n\n目的：先确认R圆角还是C倒角，以及哪些当前边应改变。\n\n所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。\n\n方案选择：读当前queryGeometry，按位置/邻面筛选目标；固定R用fillet.radius数值，C用chamfer.distance；如需不同倒角模式另读卡。\n\n容易走错：allEdges仅在用户明确要求所有边时使用；不要把固定R变自动范围，也不要以C代R。二维轮廓内构造等价R可减少3D拓扑问题，但必须保留设计。\n\n如何验收：核对选边范围、原孔和关键尺寸。失败查缝边、小面和局部空间，再考虑等价顺序；不得自动减R或漏边。\n\n失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。\n\n工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。\n",
  "api.modeling.workflows.handoff": "# 切片制造等外部交接\n\n路线handoff，来源是整库方法的WebCAD改写，非新增产品能力。完整判断过程见[方法正文](api.modeling.methods.external-handoff)。\n\n先确定输入源、单位/基准、实际几何角色、要保持的结构和输出用途，再根据正文选择分支。agent-routing.json中对应modeling.*路线的branches列工具候选；外部检索、切片、打印、展开、机器人等能力有明确边界，不编造页面工具或参数。\n\n工具卡和文档只证明调用契约；实际任务必须按正文检查独立结果。正常与边界推理例见[整库例题](api.modeling.examples.whole-library-cases)；真实几何执行范围见独立库的历史测试记录（不随运行知识分发，不代表本次任务验收），未运行的功能不标通过。\n",
  "api.modeling.workflows.inspection": "# 检查、保存与导出\n\n工作流inspection · 长度mm、角度degrees。示例尺寸只用于测试。\n\n目的：根据所需证据和输出格式分别检查。\n\n所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。\n\n方案选择：测尺寸选measure，关系选measureRelation，显式设计断言选inspectDesign；STEP精确BRep与STL网格分别导出，工程保存files.save。\n\n容易走错：导出格式不由关键词导出单独决定；未指定格式先补充。生成资源不等于落盘；导回与保存检查按任务需要执行。\n\n如何验收：精确来源、单位、当前revision、实际字节格式和哈希；没宿主落盘能力明确报告；不把当前显示网格称精确STEP。\n\n失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。\n\n工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。\n",
  "api.modeling.workflows.logo": "# 字母LOGO与图案加工\n\n工作流logo · 长度mm、角度degrees。示例尺寸只用于测试。\n\n目的：先确定原始轮廓、审核状态和恒深加工意图。\n\n所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。\n\n方案选择：有审核的闭合字形可logo恒深雕刻/凸字；PDF/图片先按现有读源/审核流程取得真实轮廓，再查当前目标面与世界落点。\n\n容易走错：不换字体或猜描边；孔环、深度、位置必须保持。图像浮雕高度场与恒深字形是不同构造，需要能力复核而非直接套用。\n\n如何验收：核对来源身份、轮廓孔洞、深度和定位；多面/曲面支持以实时卡为准；缺源或面歧义先停止。\n\n失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。\n\n工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。\n",
  "api.modeling.workflows.manufacturing": "# 工艺条件下的几何检查\n\n路线manufacturing，来源是整库方法的WebCAD改写，非新增产品能力。完整判断过程见[方法正文](api.modeling.methods.process-aware-modeling)。\n\n先确定输入源、单位/基准、实际几何角色、要保持的结构和输出用途，再根据正文选择分支。agent-routing.json中对应modeling.*路线的branches列工具候选；外部检索、切片、打印、展开、机器人等能力有明确边界，不编造页面工具或参数。\n\n工具卡和文档只证明调用契约；实际任务必须按正文检查独立结果。正常与边界推理例见[整库例题](api.modeling.examples.whole-library-cases)；真实几何执行范围见独立库的历史测试记录（不随运行知识分发，不代表本次任务验收），未运行的功能不标通过。\n",
  "api.modeling.workflows.material-properties": "# 物理材料与估重\n\n路线material-properties，来源是整库方法的WebCAD改写，非新增产品能力。完整判断过程见[方法正文](api.modeling.methods.representations-units-and-mass)。\n\n先确定输入源、单位/基准、实际几何角色、要保持的结构和输出用途，再根据正文选择分支。agent-routing.json中对应modeling.*路线的branches列工具候选；外部检索、切片、打印、展开、机器人等能力有明确边界，不编造页面工具或参数。\n\n工具卡和文档只证明调用契约；实际任务必须按正文检查独立结果。正常与边界推理例见[整库例题](api.modeling.examples.whole-library-cases)；真实几何执行范围见独立库的历史测试记录（不随运行知识分发，不代表本次任务验收），未运行的功能不标通过。\n",
  "api.modeling.workflows.part-reuse": "# 标准件、模板与重复结构\n\n路线part-reuse，来源是整库方法的WebCAD改写，非新增产品能力。完整判断过程见[方法正文](api.modeling.methods.parts-and-repetition)。\n\n先确定输入源、单位/基准、实际几何角色、要保持的结构和输出用途，再根据正文选择分支。agent-routing.json中对应modeling.*路线的branches列工具候选；外部检索、切片、打印、展开、机器人等能力有明确边界，不编造页面工具或参数。\n\n工具卡和文档只证明调用契约；实际任务必须按正文检查独立结果。正常与边界推理例见[整库例题](api.modeling.examples.whole-library-cases)；真实几何执行范围见独立库的历史测试记录（不随运行知识分发，不代表本次任务验收），未运行的功能不标通过。\n\n\n多配件、重复件或装配任务按[分批建模与交付](api.modeling.methods.staged-assembly)推进。",
  "api.modeling.workflows.path-section": "# 沿路径的线材或型材\n\n工作流path-section · 长度mm、角度degrees。示例尺寸只用于测试。\n\n目的：用截面和中心路径表达弯线、框环和连续型材。\n\n所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。\n\n方案选择：先识别截面是圆/方/扁带，路径是中心线还是外轮廓；保存两者，确认路径起点切向与截面法向后profileSweep。\n\n容易走错：圆截面转弯外轮廓不能直接当中心路径；方线D扣不能用圆线torus或通用D模板代替。\n\n如何验收：检查截面、路径尺寸、闭合连接和弯曲自交；失败先查源平面和路径断点，不盲目加密。\n\n失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。\n\n工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。\n",
  "api.modeling.workflows.placement": "# 部件定位与组合\n\n工作流placement · 长度mm、角度degrees。示例尺寸只用于测试。\n\n目的：保持功能基准、零件身份和明确连接关系。\n\n所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。\n\n方案选择：独立部件先按锚点/plane/axis定位，用transform或planAlignment；需连续材料且真实相交时union；分体安装保留独立体。\n\n容易走错：不能用包围盒中心代替轴心/接触基准；绝对定位和相对偏移区分；不假称具备原生joint或运动学。\n\n如何验收：轴/面方向、间隙/干涉、数量和连通；对齐失败读queryReferences，不换一个近似面。\n\n失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。\n\n工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。\n",
  "api.modeling.workflows.printability": "# 网格打印检查\n\n路线printability，来源是整库方法的WebCAD改写，非新增产品能力。完整判断过程见[方法正文](api.modeling.methods.process-aware-modeling)。\n\n先确定输入源、单位/基准、实际几何角色、要保持的结构和输出用途，再根据正文选择分支。agent-routing.json中对应modeling.*路线的branches列工具候选；外部检索、切片、打印、展开、机器人等能力有明确边界，不编造页面工具或参数。\n\n工具卡和文档只证明调用契约；实际任务必须按正文检查独立结果。正常与边界推理例见[整库例题](api.modeling.examples.whole-library-cases)；真实几何执行范围见独立库的历史测试记录（不随运行知识分发，不代表本次任务验收），未运行的功能不标通过。\n",
  "api.modeling.workflows.profiles-2d": "# 解析轮廓与二维建模\n\n路线profiles-2d，来源是整库方法的WebCAD改写，非新增产品能力。完整判断过程见[方法正文](api.modeling.methods.profiles-and-drawings)。\n\n先确定输入源、单位/基准、实际几何角色、要保持的结构和输出用途，再根据正文选择分支。agent-routing.json中对应modeling.*路线的branches列工具候选；外部检索、切片、打印、展开、机器人等能力有明确边界，不编造页面工具或参数。\n\n工具卡和文档只证明调用契约；实际任务必须按正文检查独立结果。正常与边界推理例见[整库例题](api.modeling.examples.whole-library-cases)；真实几何执行范围见独立库的历史测试记录（不随运行知识分发，不代表本次任务验收），未运行的功能不标通过。\n",
  "api.modeling.workflows.solid-section": "# 板件与固定截面\n\n工作流solid-section · 长度mm、角度degrees。示例尺寸只用于测试。\n\n目的：等截面沿直线延伸，优先直接控制轮廓和厚度。\n\n所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。\n\n方案选择：普通矩形用box；圆片用cylinder；解析闭合轮廓先sketchProfile再profileExtrude；只有图像则先确认比例/轮廓来源。\n\n容易走错：不要从box切掉所有东西来拟合已有准确轮廓；轮廓带孔必须保留内环；拉伸方向和基准由源图决定。\n\n如何验收：长宽/外形/厚度、孔环与单实体；开轮廓、自交或零厚度先inspectProfile定位，不加厚或闭合掩盖错误。\n\n失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。\n\n工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。\n",
  "api.modeling.workflows.source-reconstruction": "# 源图/实物复刻\n\n路线source-reconstruction，来源是整库方法的WebCAD改写，非新增产品能力。完整判断过程见[方法正文](api.modeling.methods.source-reconstruction)。\n\n先确定输入源、单位/基准、实际几何角色、要保持的结构和输出用途，再根据正文选择分支。agent-routing.json中对应modeling.*路线的branches列工具候选；外部检索、切片、打印、展开、机器人等能力有明确边界，不编造页面工具或参数。\n\n工具卡和文档只证明调用契约；实际任务必须按正文检查独立结果。正常与边界推理例见[整库例题](api.modeling.examples.whole-library-cases)；真实几何执行范围见独立库的历史测试记录（不随运行知识分发，不代表本次任务验收），未运行的功能不标通过。\n\n\n多配件、重复件或装配任务按[分批建模与交付](api.modeling.methods.staged-assembly)推进。",
  "api.modeling.workflows.transition": "# 多截面过渡\n\n工作流transition · 长度mm、角度degrees。示例尺寸只用于测试。\n\n目的：控制站位、截面顺序和对应关系。\n\n所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。\n\n方案选择：已知不同截面的有序站位用profileLoft；明确引导和支持前置条件时再读guidedLoft；普通两截面不因名字复杂就转服务器。\n\n容易走错：等点数不等于对应正确；先保留主要拐点语义，检查绕向、法向和闭合；ruled可作诊断但改变曲面须用户允许。\n\n如何验收：检查中间截面、扭转、连续性和端部；相邻两截面成功不证明全件；无源信息不编自由曲面。\n\n失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。\n\n工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。\n",
  "api.modeling.problems.diagnosis": "# 遇到问题先查什么，再选什么工具\n\n先找第一个失败步骤和原始错误、revision及已提交内容。以下是诊断选择，不是让Agent自动轮流试一遍。每个真实候选共享一次基线加一次有机制依据的替代；没有新证据不重算。\n\n|现象或错误|先验证的原因|查询/处理工具|依据充分后可做|必须停止的情况|\n|---|---|---|---|---|\n|PARAM_SCHEMA_INVALID / PARAM_RANGE_INVALID|单位、半径/直径、字段、必填、范围|getTool/getTools，来源标注|修正错误参数，只重做失败部分|关键尺寸未确认，不能用模板默认代替|\n|CAPABILITY_UNAVAILABLE / UNKNOWN_OPERATION|实际页版本、对象是mesh还是BRep、执行许可|getTool/connect/getServicesRouting|选已支持且同几何意义路线|没有等价支持；不安装第二引擎绕过|\n|REVISION_CONFLICT / STALE_REFERENCE|用户编辑/改形/重载导致旧引用|getState/queryGeometry/queryReferences|按当前几何重新识别目标|仍有歧义；不能沿用原数字面边|\n|AMBIGUOUS_SELECTION / SELECTION_COUNT_CHANGED|过滤太宽、孔上下口、同R外角|queryGeometry，中心/法向/长度/邻接|缩小几何条件或明确多选与expectedCount|无法区分用户所指目标|\n|孔或槽没有出现|刀具不相交、方向错、深度错、加工模式错|measure/queryGeometry/inspectDesign|修正有证据的定位/贯穿范围|无法确认材料位置或用户要求|\n|布尔失败/零厚度/多实体|共面/相切、交集为空、刀具过大|measure/inspectFit，当前轮廓和材料点|等价轮廓构造、合理刀具范围或有依赖分段|改变尺寸、加支撑、删孔才“成功”|\n|圆角/倒角失败|旧边、缝边、局部余量不足、相邻小面|queryGeometry/probeBlendRadius，当前工具卡|重选边/改等价操作顺序；固定R仍保持|只有减R/漏边/变C才可算时需设计决定|\n|扫掠失败/扭转|截面法向、路径连续、弯曲自交|inspectProfile/queryReferences，截面与路径|修正源平面/方向或真正断点|只靠加采样点或改截面凑形|\n|放样失败/起伏|截面顺序、缠绕、法向、连通|inspectProfile；必要时局部截面诊断|修正对应关系；局部成功不能放行整体|无来源允许改变曲面连续性|\n|尺寸/位置不对|mm与其他单位、直径当半径、原点/锚点语义|measure/queryReferences/当前params|按已确认基准重定位|不能确定应修改哪一项|\n|超时/断线/unknown|任务可能已经提交|getBatchReceipt/getJob/getState|对账原任务，明确未执行才续接|状态未知时不换key重发|\n|画面裂缝或黑边|可能圆柱缝边/显示网格问题|queryGeometry/measure/capture或显示视角|区分真实开口与显示缝|不能为隐藏缝旋转有约束零件|\n|导出生成但找不到文件|仅生成资源，宿主未取字节或落盘|files.read，宿主写入回执|读实际字节并写到用户路径，校验大小/哈希|无宿主权限就如实交付资源|\n\n失败操作不提交不等于整批回滚。通过progress只处理剩余步骤；history.undo只在能证明最后操作属于本任务且无人插入编辑时使用。重新打开的最终形体可能没有历史，不能承诺恢复不存在的配方。保留用户未指定结构、当前可用工程和最小失败记录。\n",
  "api.modeling.domain.hardware": "# 五金建模中的结构语义\n\n来源为用户源图、PROJECT.md与当前模板卡，不是已批准工艺标准。先区分连续铸件、冲压弯件、独立铆柱和分体装配；图中接触不自动等于材料融合。板厚、线材截面、内开口、轴径、头部和盲孔分开确认。外观图不能确定背面柱脚、隐藏孔深或螺纹。\n\n同名结构要比较：圆线圈不等于扁片圈，D形外轮廓不决定截面；实心底片不等于垫圈；铆钉/柱脚有头/颈/台阶时不能简化成圆柱；字母轮廓含孔环需保留；R为圆弧收边，C为平面倒角。需要相对运动的零件保留独立实体。\n\n材料密度、最小壁厚、拔模、间隙、公差、收缩和表面处理均须明确来源与适用工艺。本库不编数值阈值，不把模板默认值或几何通过当作可制造/强度/开模批准。检查工具存在也不代表高级制造审查已完成。\n",
  "api.modeling.examples.reasoned-cases": "# 从需求到方案的完整例题\n\n以下均是人为定义的测试条件，不能作为真实产品默认尺寸。tools/中有真实卡，scripts/recipes.mjs提供可检查调用；不是从这些尺寸推导工厂标准。\n\n## 例1：安装板上两通孔\n\n需求：矩形板40×20×3，XY角点原点；孔Ø4，中心(10,10)、(30,10)，沿Z贯穿。首先计算r=2、孔距20；原外形必须保持。若源件有圆角则另确认，不能沿用旧版安装板模板的R2。选择box+multiHole而非mountingPlate：后者带其自身中心原点/外轮廓参数，只有完全对应才用。\n\n计划：box明确world/model-origin→同回执body上multiHole，入口Z=3方向-1，深度3→测量。验收体积2400-24π，外形40×20×3，两个中心在指定坐标；圆孔上下口共四完整圆边。正常：体积和孔中心同时满足。边界：若只查radius=2，外R2也可能命中，须加完整圆长度/中心/层位；只有体积正确不能通过。\n\n## 例2：给已有板开盲孔\n\n条件：30×20×3精确板，顶面Z3，点(15,10)，孔Ø4，平底深1。选择hole(r2,depth1,z3,direction-1)，不选通孔向导through=true。必须保持底厚2及外形，验收体积1800-4π、底面Z2的圆边/平底证据和孔中心。\n\n如果孔不见：先查当前body、入口和方向，不增加深度“试试”。如果用户只说“开孔”未给深度或通孔含义，保留方案候选并询问，不能默认为贯穿。\n\n## 例3：一只轴套与带头铆钉\n\n轴套条件：外径12、内径8、高3且同轴直壁。tube可直接表达，验收体积60π和内孔r4上下边。内径大于外径是输入冲突，不自动交换。若需求变成带帽、腰槽、盲孔的铆钉，tube和直柱均不足；分解轴向截面，用profileRevolve或完整匹配模板，再补非轴对称特征。正常路线取决于结构，而非“铆钉”名称。\n\n## 例4：板件四条竖边C0.5\n\n条件：30×20×3矩形板，只倒四条竖边，其他边不变。queryGeometry用line、长度3、方向/端点确认，requireUnique:false、expectedCount:4；选择chamfer(distance0.5)，不使用fillet。验收外包络保留、所选四角切去材料以及原孔不变；R是否存在不能靠体积判定。固定R0.5则另选fillet分支，失败后不能悄悄用C0.5代替。\n\n## 例5：一段弯曲方线框\n\n来源给定中心路径和5×5方截面，框内宽/高及转弯R为已标注数据。选择profileSweep，因为控制量是路径和截面；若只提供外轮廓，先换算/确认中心路径，不能将外R直接作为中心R。截面起平面法向应平行路径起点切向。正常：截面尺寸、内开口、连接都符合来源。边界：若扭转先查截面法向/绕向与路径，不改成圆线或圆环模板。本例构造方法已映射真实工具，未以简单体回归冒充源件已验收。\n\n## 例6：已有模型加深孔后连接中断\n\n用户要求将深1盲孔改深1.5，底片和其他孔保持。先getState/getHistory确认原特征可编辑；若仅剩导入最终形体，就不能调用不存在的原feature。提交后断线，先getBatchReceipt查原key和当前revision，确认是否已提交；不要重开新key再钻一次。\n\n正常：深度1.5、底厚1.5，其余不变；未知结果不算失败也不算成功。若任务后来确知失败且原工程保持，可规划剩余加工。undo仅在明确末位操作归本任务时使用。\n\n## 例7：恒深字母与浮雕图像\n\n审核后的字形轮廓含内孔、明确大小与位置，要求凹0.2，走logo恒深轮廓路线；原图为渐变高度图时应先澄清是否要浮雕，不能将灰度阈值后的轮廓当等价源。先reviewLogo，再查当前平面与落点。保留字形、孔环、深度、底片；没有独立深度或源轮廓复核就标未验证。\n\n## 例8：导出选择\n\n“给精确STEP”先验证BRep，再files.export(format:step)，files.read取得真实字节；生成和宿主落盘分开。“导出STL”必须走stl分支，不能因导出两字进入STEP。未给格式时询问，mesh不能被文件后缀升级成精确曲面。导出检查按任务需要，不默认做保存/上传/部署。\n",
  "api.modeling.examples.whole-library-cases": "# 整库方法迁移后的例题与反例\n\n全部为方法测试条件，不是工厂默认尺寸。\n\n1. **源图D形方线件**：先定位正确图框/修订，交叉核对正视轮廓与侧剖面；只要已知5×5截面不代表四角R已知。保存源曲线、真实开口和横杆，选profileSweep或确实匹配模板。反例：换圆线模板后总包络相同，仍因截面错而失败。\n2. **带刻线的板件**：闭合外轮廓和孔用于材料，开放中心/刻线不闭合成孔。readVector后分意图建sketchProfile，再选择profileExtrude/LOGO。反例：闭合所有线让切割检查通过，制造了原图没有的材料。\n3. **工程图**：已有模型40×20×3两通孔，createDrawing取得与当前revision绑定的图，再exportDrawing；尺寸落在真实孔中心与边界，读回图纸。反例：用剖面圆冒充右视，宽厚对应错，漂亮PDF仍不通过。\n4. **型腔可加工性**：要求内平面R2，候选刀半径3，几何上该刀不能形成该内角；换更小刀仍需查深度/刀柄/装夹。不能据此要求所有底壁根部加R，也不能自动改用户R2。\n5. **拔模检查**：先给拉模方向和适用阈值，再inspectDraft；球面切向小带、顶底面和真实平行直壁分别解释。反例：给装配整体做遮挡，将盖子误算成底座倒扣，不能判模具失败。\n6. **壁厚与partial**：只测一个点/一条射线就只证明该处。若某事实族返回error或null，报告unverified；不是壁厚0，也不是无薄壁。装配间隙不能当壁厚。\n7. **标准件**：用户指定轴承型号，先核对可追溯源模型的内外径/宽/版本，宿主下载验哈希后import并复测。反例：服务断网就宣称没有该型号，并塞一个近似圆筒当真实配合件。\n8. **周向重复**：确认数量、中心轴、相位及全圆首尾语义，再circularPattern；独立螺钉不union。反例：分度点含0°和360°，多一个重复部件却只看截图放行。\n9. **估重**：确认真实实体体积1000mm³和用户确认密度8g/cm³，计算8g，并用measureMass设置来源核对。反例：选择金色外观后猜金合金密度，属于错误材料依据。\n10. **打印交接**：先确认模型单位与封闭网格和工艺，再交用户要求的STL；无切片工具时明确尚未切片。反例：将显示精度ultra当作切片/支撑验证通过。\n11. **空间变换**：供应商网格为mm、当前接口位置是局部端面。导入显式单位并按端面/轴定位，不能用相机旋转掩盖错误原点。反例：为让模型看起来大小合适，缩放但不更新孔距/配合证据。\n12. **版本关联**：板加厚后原顶面、孔入口、LOGO落点、工程图和文件输出可能过期。查询当前依赖并仅补受影响部分；旧图/旧资源仍能显示不证明对应新模型。\n",
  "api.modeling.start": "# 建模指导按需入口\n下载完成不等于把知识送入模型上下文。新建/复刻/修改模型时，首次读 api.modeling.guide 建立构造、基准、特征顺序和验收计划；简单检查或导出直接读匹配工作流。\n按 agent-routing.json 的 modeling.* 路线选择 readFirst；docs 是备用方法，不是必读清单。先明确几何与分支，再按 branches[].tools 读取所选少量完整卡；工具参数和能力始终以当前页面契约为准。正常建模不要自动加载诊断表。\n失败或结果异常时先读 api.modeling.problems.diagnosis，按现象选择只读诊断工具；unknown 先对账原回执，禁止换键盲重做。\n宿主 helper: route(query,{scope:'modeling'}) 返回候选路线（无正文/工具卡）；readLocal({docIds:[readFirst],maxChars:8000}) 只取所选全文。也可在当前页 readDocs({docId:readFirst}) 按 nextCursor 读完。\n方法与工作流按需加载；超过预算的完整项显式 omitted/CHAR_BUDGET，缩小选择后重读，不能截断工具参数。示例尺寸/编号不是当前工程状态。",
  "api.modeling.sources": "建模方法移植自本次 text-to-cad 全库参考整理的 0.3.0 指导：安装插件0.7.19的106个文件及本地参考仓库0.7.14的2895个跟踪文件已盘点分类；这不代表所有源码逐行审计或全部样例实际执行。运行包仅收录适用于WebCAD的方法、工作流、诊断和推理示例，不分发原仓库、历史测试回执、旧版工具卡或外部引擎。WebCAD当前页面/文档/CommandService/Worker仍是执行依据；制造、打印、仿真等外部交接不冒充页面已具备的能力。方法示例不代表当前任务几何验收，实际证据需逐项取得。"
});
export const MODELING_ROUTES = [
  {"id": "modeling.staged-assembly", "title": "多配件分批建模", "keywords": ["分批", "多配件", "多个配件", "分批建模", "装配体", "staged assembly"], "readFirst": "api.modeling.methods.staged-assembly", "docs": ["api.modeling.methods.staged-assembly", "api.modeling.methods.brief-and-datums"], "tools": [], "branches": []},
  {
    "id": "modeling.diagnosis",
    "title": "按建模失败原因选择诊断工具",
    "keywords": [
      "PARAM_SCHEMA_INVALID",
      "PARAM_RANGE_INVALID",
      "REVISION_CONFLICT",
      "STALE_REFERENCE",
      "AMBIGUOUS_SELECTION",
      "UNKNOWN_OUTCOME",
      "GEOMETRY_INVALID",
      "超时",
      "断线",
      "没出现",
      "不见了",
      "失败",
      "扭转",
      "零厚度"
    ],
    "readFirst": "api.modeling.problems.diagnosis",
    "docs": [
      "api.modeling.problems.diagnosis",
      "api.modeling.methods.verification"
    ],
    "tools": [],
    "readPlan": "Read diagnosis first; reconcile unknown outcomes before any retry. Read only the chosen diagnostic cards."
  },
  {
    "id": "modeling.solid-section",
    "title": "板件与固定截面",
    "keywords": [
      "板件",
      "矩形板",
      "安装板",
      "固定截面",
      "拉伸",
      "轮廓成体",
      "plate",
      "extrude"
    ],
    "readFirst": "api.modeling.workflows.solid-section",
    "docs": [
      "api.modeling.workflows.solid-section",
      "api.modeling.methods.construction-choice",
      "api.modeling.methods.feature-order"
    ],
    "tools": [],
    "branches": [
      {
        "id": "box",
        "tools": [
          "box",
          "measure"
        ]
      },
      {
        "id": "profile",
        "tools": [
          "sketchProfile",
          "inspectProfile",
          "profileExtrude",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.axisymmetric",
    "title": "柱件、轴套与旋转体",
    "keywords": [
      "轴套",
      "垫圈",
      "圆筒",
      "空心圆柱",
      "铆钉",
      "铆柱",
      "旋转体",
      "tube",
      "revolve"
    ],
    "readFirst": "api.modeling.workflows.axisymmetric",
    "docs": [
      "api.modeling.workflows.axisymmetric",
      "api.modeling.methods.construction-choice",
      "api.modeling.methods.feature-order"
    ],
    "tools": [],
    "branches": [
      {
        "id": "cylinder",
        "tools": [
          "cylinder",
          "measure"
        ]
      },
      {
        "id": "tube",
        "tools": [
          "template.tube",
          "measure"
        ]
      },
      {
        "id": "revolve",
        "tools": [
          "sketchProfile",
          "profileRevolve",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.path-section",
    "title": "沿路径的线材或型材",
    "keywords": [
      "扫掠",
      "线材",
      "方线",
      "弯线",
      "沿路径",
      "sweep"
    ],
    "readFirst": "api.modeling.workflows.path-section",
    "docs": [
      "api.modeling.workflows.path-section",
      "api.modeling.methods.construction-choice",
      "api.modeling.methods.feature-order"
    ],
    "tools": [],
    "branches": [
      {
        "id": "sweep",
        "tools": [
          "sketchProfile",
          "inspectProfile",
          "profileSweep",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.transition",
    "title": "多截面过渡",
    "keywords": [
      "放样",
      "多截面",
      "截面过渡",
      "loft"
    ],
    "readFirst": "api.modeling.workflows.transition",
    "docs": [
      "api.modeling.workflows.transition",
      "api.modeling.methods.construction-choice",
      "api.modeling.methods.feature-order"
    ],
    "tools": [],
    "branches": [
      {
        "id": "loft",
        "tools": [
          "inspectProfile",
          "profileLoft",
          "measure"
        ]
      },
      {
        "id": "guided",
        "tools": [
          "guidedLoft",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.cut-features",
    "title": "开孔、挖槽与布尔去料",
    "keywords": [
      "打孔",
      "钻孔",
      "通孔",
      "盲孔",
      "双孔",
      "两孔",
      "孔位",
      "沉头",
      "沉孔",
      "挖槽",
      "切除",
      "hole"
    ],
    "readFirst": "api.modeling.workflows.cut-features",
    "docs": [
      "api.modeling.workflows.cut-features",
      "api.modeling.methods.construction-choice",
      "api.modeling.methods.selection-and-placement"
    ],
    "tools": [],
    "branches": [
      {
        "id": "plain-hole",
        "tools": [
          "hole",
          "queryGeometry",
          "measure"
        ]
      },
      {
        "id": "multi-hole",
        "tools": [
          "multiHole",
          "queryGeometry",
          "measure"
        ]
      },
      {
        "id": "wizard",
        "tools": [
          "holeWizard",
          "queryGeometry",
          "measure"
        ]
      },
      {
        "id": "boolean",
        "tools": [
          "cut",
          "inspectFit",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.placement",
    "title": "部件定位与组合",
    "keywords": [
      "装配",
      "对齐",
      "定位",
      "拼合",
      "融合",
      "合并实体",
      "assembly"
    ],
    "readFirst": "api.modeling.workflows.placement",
    "docs": [
      "api.modeling.workflows.placement",
      "api.modeling.methods.construction-choice",
      "api.modeling.methods.selection-and-placement",
      "api.modeling.methods.representations-units-and-mass"
    ],
    "tools": [],
    "branches": [
      {
        "id": "align",
        "tools": [
          "queryReferences",
          "planAlignment",
          "transform",
          "measureRelation"
        ]
      },
      {
        "id": "join",
        "tools": [
          "union",
          "inspectFit",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.finishing",
    "title": "圆角与倒角",
    "keywords": [
      "倒角",
      "圆角",
      "R角",
      "fillet",
      "chamfer"
    ],
    "readFirst": "api.modeling.workflows.finishing",
    "docs": [
      "api.modeling.workflows.finishing",
      "api.modeling.methods.construction-choice",
      "api.modeling.methods.selection-and-placement"
    ],
    "tools": [],
    "branches": [
      {
        "id": "fillet",
        "tools": [
          "queryGeometry",
          "fillet",
          "probeBlendRadius",
          "measure"
        ]
      },
      {
        "id": "chamfer",
        "tools": [
          "queryGeometry",
          "chamfer",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.logo",
    "title": "字母LOGO与图案加工",
    "keywords": [
      "LOGO",
      "刻字",
      "字形",
      "标志",
      "engrave"
    ],
    "readFirst": "api.modeling.workflows.logo",
    "docs": [
      "api.modeling.workflows.logo",
      "api.modeling.methods.construction-choice",
      "api.modeling.methods.selection-and-placement"
    ],
    "tools": [],
    "branches": [
      {
        "id": "contours",
        "tools": [
          "readLogo",
          "reviewLogo",
          "queryGeometry",
          "logo",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.editing",
    "title": "修改已有模型与恢复",
    "keywords": [
      "修改",
      "加厚",
      "变薄",
      "改成",
      "撤销",
      "恢复",
      "edit"
    ],
    "readFirst": "api.modeling.workflows.editing",
    "docs": [
      "api.modeling.workflows.editing",
      "api.modeling.methods.construction-choice",
      "api.modeling.methods.feature-order",
      "api.modeling.methods.artifacts-and-dependencies"
    ],
    "tools": [],
    "branches": [
      {
        "id": "edit",
        "tools": [
          "feature.edit",
          "getHistory",
          "getState",
          "measure"
        ]
      },
      {
        "id": "unknown",
        "tools": [
          "getBatchReceipt",
          "getState"
        ]
      },
      {
        "id": "undo",
        "tools": [
          "history.undo",
          "getHistory",
          "getState"
        ]
      },
      {
        "id": "import",
        "tools": [
          "files.import",
          "getState",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.inspection",
    "title": "检查、保存与导出",
    "keywords": [
      "测量",
      "孔距",
      "验收",
      "导出",
      "保存",
      "STEP",
      "STL",
      "export"
    ],
    "readFirst": "api.modeling.workflows.inspection",
    "docs": [
      "api.modeling.workflows.inspection",
      "api.modeling.methods.construction-choice",
      "api.modeling.methods.feature-order",
      "api.modeling.methods.visual-review",
      "api.modeling.methods.output-quality-and-process"
    ],
    "tools": [],
    "branches": [
      {
        "id": "measure",
        "tools": [
          "measure",
          "measureRelation",
          "inspectDesign"
        ]
      },
      {
        "id": "step",
        "tools": [
          "measure",
          "files.export",
          "files.read"
        ]
      },
      {
        "id": "stl",
        "tools": [
          "files.export",
          "files.read"
        ]
      },
      {
        "id": "save",
        "tools": [
          "files.save",
          "files.read"
        ]
      },
      {
        "id": "visual",
        "tools": [
          "setView",
          "capture",
          "setRenderQuality"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.source-reconstruction",
    "title": "源图/实物复刻",
    "keywords": [
      "源图",
      "图纸重建",
      "实物重建",
      "复刻",
      "DWG",
      "reconstruction"
    ],
    "readFirst": "api.modeling.workflows.source-reconstruction",
    "docs": [
      "api.modeling.workflows.source-reconstruction",
      "api.modeling.methods.source-reconstruction"
    ],
    "tools": [],
    "branches": [
      {
        "id": "source",
        "tools": [
          "readVector",
          "inspectProfile",
          "sketchProfile",
          "queryGeometry",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.profiles-2d",
    "title": "解析轮廓与二维建模",
    "keywords": [
      "二维轮廓",
      "解析轮廓",
      "DXF",
      "轮廓修复",
      "断点修复",
      "轮廓偏移",
      "等距偏移"
    ],
    "readFirst": "api.modeling.workflows.profiles-2d",
    "docs": [
      "api.modeling.workflows.profiles-2d",
      "api.modeling.methods.profiles-and-drawings"
    ],
    "tools": [],
    "branches": [
      {
        "id": "read",
        "tools": [
          "readVector",
          "sketchProfile",
          "inspectProfile"
        ]
      },
      {
        "id": "repair",
        "tools": [
          "inspectProfile",
          "profileRepair"
        ]
      },
      {
        "id": "offset",
        "tools": [
          "profileOffset",
          "inspectProfile"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.drawings",
    "title": "工程图与三视图",
    "keywords": [
      "工程图",
      "三视图",
      "标注图",
      "投影图",
      "drawing"
    ],
    "readFirst": "api.modeling.workflows.drawings",
    "docs": [
      "api.modeling.workflows.drawings",
      "api.modeling.methods.profiles-and-drawings"
    ],
    "tools": [],
    "branches": [
      {
        "id": "drawing",
        "tools": [
          "createDrawing",
          "exportDrawing",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.manufacturing",
    "title": "工艺条件下的几何检查",
    "keywords": [
      "CNC",
      "型腔",
      "刀具",
      "机加工",
      "注塑",
      "压铸",
      "拔模",
      "倒扣",
      "钣金",
      "折弯",
      "冲压",
      "展开料"
    ],
    "readFirst": "api.modeling.workflows.manufacturing",
    "docs": [
      "api.modeling.workflows.manufacturing",
      "api.modeling.methods.process-aware-modeling"
    ],
    "tools": [],
    "branches": [
      {
        "id": "cnc",
        "tools": [
          "queryGeometry",
          "measure",
          "inspectThickness",
          "inspectFit"
        ]
      },
      {
        "id": "molding",
        "tools": [
          "inspectDraft",
          "queryGeometry",
          "inspectThickness"
        ]
      },
      {
        "id": "sheet",
        "tools": [
          "inspectThickness",
          "inspectProfile",
          "measureRelation"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.printability",
    "title": "网格打印检查",
    "keywords": [
      "打印检查",
      "可打印",
      "支撑检查",
      "悬垂",
      "printability"
    ],
    "readFirst": "api.modeling.workflows.printability",
    "docs": [
      "api.modeling.workflows.printability",
      "api.modeling.methods.process-aware-modeling"
    ],
    "tools": [],
    "branches": [
      {
        "id": "inspect",
        "tools": [
          "inspectPrintability",
          "inspectThickness",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.part-reuse",
    "title": "标准件、模板与重复结构",
    "keywords": [
      "标准件",
      "轴承",
      "供应商模型",
      "圆周阵列",
      "周向阵列",
      "分度",
      "线性阵列",
      "等距复制",
      "重复件"
    ],
    "readFirst": "api.modeling.workflows.part-reuse",
    "docs": [
      "api.modeling.workflows.part-reuse",
      "api.modeling.methods.parts-and-repetition"
    ],
    "tools": [],
    "branches": [
      {
        "id": "import",
        "tools": [
          "files.import",
          "measure"
        ]
      },
      {
        "id": "linear",
        "tools": [
          "linearPattern",
          "copy",
          "measureRelation"
        ]
      },
      {
        "id": "circular",
        "tools": [
          "circularPattern",
          "copy",
          "measureRelation"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.material-properties",
    "title": "物理材料与估重",
    "keywords": [
      "估重",
      "克重",
      "密度",
      "计算重量",
      "mass"
    ],
    "readFirst": "api.modeling.workflows.material-properties",
    "docs": [
      "api.modeling.workflows.material-properties",
      "api.modeling.methods.representations-units-and-mass"
    ],
    "tools": [],
    "branches": [
      {
        "id": "mass",
        "tools": [
          "getMaterials",
          "measureMass",
          "measure"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.handoff",
    "title": "切片制造等外部交接",
    "keywords": [
      "切片",
      "打印机",
      "制造交接",
      "供应商下单",
      "机器人仿真",
      "slicer"
    ],
    "readFirst": "api.modeling.workflows.handoff",
    "docs": [
      "api.modeling.workflows.handoff",
      "api.modeling.methods.external-handoff"
    ],
    "tools": [],
    "branches": [
      {
        "id": "artifacts",
        "tools": [
          "files.export",
          "files.read"
        ]
      }
    ],
    "readPlan": "Read readFirst only; load a relevant method if needed. Choose a geometry branch before fetching its complete live tool cards; never load every branch."
  },
  {
    "id": "modeling.plan",
    "title": "从需求建立三维建模计划",
    "keywords": [
      "怎么建模",
      "如何建模",
      "建立模型",
      "三维模型",
      "3D模型",
      "建模指导",
      "modeling plan"
    ],
    "readFirst": "api.modeling.guide",
    "docs": [
      "api.modeling.guide",
      "api.modeling.methods.brief-and-datums",
      "api.modeling.methods.construction-choice"
    ],
    "tools": [],
    "readPlan": "Read the modeling guide, then choose one workflow. Resolve structure and datums before tools."
  }
];
