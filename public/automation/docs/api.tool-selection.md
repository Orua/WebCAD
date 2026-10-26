# api.tool-selection

工具选择：相同或近似叫法可能属于不同结构、输入、结果或操作阶段。先读候选的 selectionGuide，比较输入几何、路径与截面、参数量纲、加减料/只读/提交的区别；再读取候选完整合同。不得按名称第一命中直接选型，不把预览/规划/文件生成冒充提交/写盘。用户纠正时核对并编辑、撤销或删除本次误建项，保留其它工程内容。此说明不新增执行限制。

## 运行诊断与日志
- getDebugReport：只读获取当前状态、操作过程和错误字段，供分析/复制/保存；不是工程导出或服务器磁盘日志。
- setDebugPanel：只打开或关闭独立Debug窗口，不取消编辑草稿、不停止计算、不修改工程。

## 密度与估算重量
- getMaterials：读取工程密度、默认材料和对象材料，参考值不等于实际合金检测。
- measureMass：测量当前对象体积并按密度计算克重；无体积返回null，不是电镀外观设置。
- document.materials：写入工程密度和对象材料；不修改几何或镀色，可撤销并保存。

## 基础实体与参数模型
- box：用宽、深、高创建长方体；不是空壳或带孔板。
- cylinder：用半径、高度创建实心直圆柱；圆筒用内外径模板。
- cone：用两端半径和高度创建圆锥或圆台。
- sphere：单一半径的球；三轴半径独立时用 ellipsoid。
- ellipsoid：三个独立半轴的精确椭球；不是球的显示拉伸。
- torus：中心线大半径与截面小半径定义的圆截面闭环。
- quickModel：参数模板的执行入口；先比较 template.* 具体结构，再传 kind；不是任意形状生成器。

## 环、环片及开口圈
- template.washer：平面环片；径向宽度与轴向高度独立，不是圆线环。
- template.ring：同心圆路径的单层恒截面圈；截面、线径和底部平切缝独立。
- template.openArcRing：按开口角度截取的圆弧 C 环；与按线性缝宽切口不同。
- template.ellipseOpenWire：内孔真椭圆、圆线截面及底部平切缝；不是外轮廓真椭圆。
- template.ellipseSectionRing：圆形路径、椭圆截面；正面料宽和侧面深度独立，不能把截面椭圆当路径椭圆。
- template.keyRing：双层扁线绕卷与跨层过渡；内外径及整个双层总厚度定义，不是单层闭环或圆线直径。
- template.ovalBuckle：四段相切圆弧组成的旦形环；不是数学椭圆或两端半圆的跑道圈。
- template.capsuleWire：跑道路径（两端半圆、两条直边）的圆线闭环。
- template.profileLoop：跑道路径的方/扁线截面；正面料宽、侧面厚度、截面 R 独立。

## 矩形框与截面
- template.flatFrame：平板矩形框，内外轮廓和板厚独立；可形成跑道孔。
- template.roundedFlatFrame：平面框加三维棱边圆角；内外平面 R 与棱边 R 不同。
- template.rectBuckle：恒截面圆角矩形线框，按线径/截面沿中心线路径扫掠。
- template.ellipseSectionRectFrame：圆角矩形路径加椭圆截面；孔角 R 不是截面深度或截面 R。

## D形、U形与开口框
- template.dFlatFrame：平板 D 框；板厚、内外平面轮廓与底部切口独立。
- template.dBuckle：半圆冠、直腿和底弯组成的恒截面 D 框；内高量到横杠上沿。
- template.dBarBuckle：方线 U 主体与固定圆横杆融合；主框和横杆截面不同。
- template.archedBridge：圆线直腿加半圆冠的开口拱桥，可选端部轴向光孔。
- template.squareArchedBridge：平顶方线 U 桥；内外转角、前后厚度及棱边 R 独立。
- template.uEndHolePlate：单片平板 U 轮廓，两腿末端沿板厚贯穿孔；不是圆杆拱桥。
- template.gableOpenFrame：斜肩屋顶轮廓的开口平板框；肩高和峰高独立，不是半圆冠。
- template.arcBandPlate：同心圆弧带板与两端孔；按角度截取的环段，不是两腿 U 框。

## 双窗与带横杆框
- template.twinWindowPlate：平板一体对称双窗；中横条是板的一部分。
- template.sliderBuckle：圆线矩形框加固定圆横杆；横杆可偏移，不是平板双窗。
- template.ringBar：圆形恒截面框加固定圆杆；杆沿 X，可按 Y/Z 偏移。
- template.ellipseBar：内孔真椭圆的圆线框加居中固定圆杆。
- template.archedTwinWindowPlate：双窗板沿圆筒薄壁形成侧向拱弯；径向厚度不同于平板厚度。
- template.bowedTwinWindowPlate：正视鼓弧侧边与跑道形孔的平板双窗；不是侧视圆筒拱弯。

## 孔板、凸柱板与薄壁壳
- template.mountingPlate：平板上两个对称贯穿光孔；孔中心距独立。
- template.fourHolePlate：平板四角贯穿光孔；边距与外角 R 独立。
- template.bossPlate：平板上两根空心柱；孔贯穿柱和底板，不是普通孔板。
- template.thinWallTray：顶部敞口的直角薄壁托壳及双空心柱；内高、壁厚、底厚不同。
- template.roundedBossTray：圆角矩形敞口薄壁壳及双空心柱；外角 R、壁厚、底厚独立。
- template.roundBadge：圆形牌体、边框与背柱组合；不是只有两个通孔的底片。
- template.ironFoot：顶片、安装孔与下折脚的一体支架；总高含顶片，不是平板或 U 形尾夹。
- template.uStrapClip：恒壁厚开口 U 夹，前后片可不同高；内净距及内外弯角定义，不是封闭帽套。

## 面框与两件式鸡眼
- template.frameEyelet：单件面框、短颈与安装柱及直孔；不是两件套或内螺纹。
- template.twoPieceEyelet：薄壁翻边长脚件与底片两件套；平面/弧面可选，不模拟压铆变形。
- template.alloyEyelet：实体合金面框与底片两件套；独立实体与套接间距，不是薄皮翻边结构。

## 钉、针与独立连接件
- template.domedPin：单件平底凸面钉头，直径与拱高独立。
- template.nippleStud：头、颈、底座及配套槽头杆的两件组合；名义孔/杆不代表真实牙型。
- template.mushroomRivet：蘑菇盖空心套筒及腰形钉脚两件套，可装配或拉开展示。
- template.buckleTongue：独立环头扁针，长度从轴心到针尖；不含扣框。
- template.pullCoreBar：独立活动芯，中间扁带连接两端开放卷眼；不与扣框融合。
- template.hangingRod：水平圆杆与上方收窄 U 吊环融合；不是独立扁针或卷眼芯。

## 筒、螺纹与弹簧模板
- template.tube：同轴光孔圆筒，用内外径与高度定义；无凸缘或牙型。
- template.flangedBushing：带法兰的光孔轴套，孔贯穿；不是内螺纹丝筒。
- template.threadedSleeve：支持名义 M 粗牙的内螺纹筒；面端朝本地 -Z。
- template.screw：螺钉头与真实 V 槽牙杆；头在下端、杆朝本地 +Z；不包含配合公差。
- template.spring：参数化圆线螺旋弹簧；半径为中心线半径、螺距须大于线径。
- template.counterboreTool：用于后续布尔切削的沉孔/沉头孔刀具实体；创建刀具本身不等于已在目标上打孔。

## 链环的空间结构
- template.oChain：平面椭圆孔圆线链环；外宽外长不是内孔尺寸。
- template.twistedChain：链环具有对角高低起伏及扭转曲面；不是平面圈整体旋转。
- template.groundChain：扭链上下平磨，保留圆线侧面；磨后总厚不是原线径，也不是压扁。

## 轮廓创建、提取与修复
- sketchProfile：保存可编辑解析图元与稳定 entity ID 的二维线框/平面面。
- vectorProfile：从闭合矢量区域及孔环直接生成面或实体，不创建图元约束。
- arcProfile：由明确的 XY 直线/圆弧闭边界及孔拉伸；不是自由曲面或像素追踪。
- faceBoundary：提取已有面的外环或全部边界线框；选 outer 会排除内孔。
- planeSection：取实体与指定平面的真实交线；不是表面边界或剖切显示。
- profileOffset：对闭合平面来源做等距偏移或带状轮廓，不改变实体全部表面。
- profileRepair：在明确最大位移内移动指定端点修复来源；不是自动修补任意坏轮廓。
- profileConstraints：求解已保存直线/圆的尺寸及关系，产生派生轮廓；不是只读诊断。
- readVector：读取已登记矢量资源/文本并解析来源，尚未创建实体。
- connectVector：将显式解析图元连接成闭环；不读取文件，不猜缺失边。
- fitProfile：从显式采样点拟合直线或圆，读回误差；不是保真复用原始精确曲线。
- traceTwinWindow：根据明确轮廓控制数据追踪双窗轮廓；不等于完成三维建模。
- projectProfile：将当前选定边投影为派生解析轮廓，保留来源关系。
- prepareProfileEdit：计算修剪/延伸/圆角等轮廓编辑候选；须再按回执提交修改。

## 拉伸与旋转成型
- extrude：按参数定义的闭合轮廓及所选平面法向拉伸。
- referenceExtrude：复用已有闭合精确线框/平面面，按世界向量拉伸，保留来源；带孔须用面。
- profileExtrude：对已保存定位轮廓拉伸，明确新建、并、减或交材料结果。
- faceExtrude：推拉已有实体的一张平面面，沿其法向改体；不是独立轮廓拉伸。
- revolve：旋转参数闭合轮廓，按工具定义的轴及角度创建。
- profileRevolve：绕显式世界轴旋转已有精确截面，保留来源并指定材料运算。

## 扫掠、放样及导向曲面
- sweep：参数截面沿显式三维折线路径扫掠；折线路径不同于精确曲线来源。
- curveSweep：沿解析/曲线脊线扫掠恒截面或有序自定义截面，可用旋转最小标架。
- profileSweep：复用已保存截面及精确路径；保留面孔，显式决定新建/加减料。
- loft：平行 XY 参数轮廓间的直纹放样。
- referenceLoft：复用 2–12 个有序精确单外环截面，保留来源；不支持截面内孔。
- profileLoft：2–12 个已保存精确截面依次成型，明确新建/材料运算。
- advancedLoft：手工定义 XY 截面序列，生成实体或开放壳。
- guidedLoft：显式截面标架、边界导向与来源 G1/G2 信息；不是仅靠截面插值。

## 曲面、壳与厚度
- fittedSurface：由结构化点阵拟合单张 B 样条面；不会自动生成封闭实体。
- subdBody：由细分控制笼生成缝合 B 样条体；不是点阵拟合或显示细分。
- extractFaces：复制明确选定面，保留孔及来源；不自动缝合或补洞。
- extractShell：按当前 shellIndex 复制一个壳；闭壳也不自动填为实体。
- sewFaces：按公差缝合已有面；makeSolid 要求闭合有效，不补缺面。
- thickenFace：一张来源面沿法向加厚成新实体。
- offsetSurface：复制一张面并做法向偏移，结果仍是面，保留源对象。
- offsetSolid：整体偏移一个实体的所有边界面；不是只移单面或抽空。
- shell：从实体移除指定面并抽壳；不是独立面的加厚。
- surfaceTrim：用实体刀具修剪指定面，按内部/外部保留；不是任意曲线剪面。

## 布尔、分割与组合
- union：融合实体并去除重叠内部；与只分组不同。
- cut：从首个目标实体减去后续刀具；目标/刀具顺序有意义。
- intersect：保留输入实体公共体积，不是切除或分组。
- meshBoolean：三角网格布尔；不能冒充精确 BRep 布尔或精确 STEP。
- group：组合为复合体但不融合；各实体重叠不会消除。
- split：用显式世界平面分割实体；不是拆出已有独立 solid。
- extractSolid：从复合体按索引提取一个已有实心体。
- body.explode：将多实心体组合一次拆为独立对象；不是布尔分割。
- refineShape：合并同域面和冗余分割边；不改变成型目标或修补任意坏体。
- remove：兼容发现入口；当前页面删除用 feature.remove 的明确 bodyIds，不通过 add 创建。
- feature.remove：删除指定当前实体的历史操作；不是隐藏，也不是取消未提交预览。
- body.visibility：仅改显隐，几何与依赖保留；不是删除。

## 实体、相机与对齐
- transform：按约定顺序缩放/绕原点旋转/平移已有实体；不是移动相机或插入锚点。
- copy：复制实体后施加变换，原件保留；不是直接移动。
- mirror：关于指定坐标平面及偏置镜像；不是绕轴旋转。
- linearPattern：按直线方向和间距阵列，显式复合或融合。
- circularPattern：按中心轴和角度圆周阵列，显式复合或融合。
- body.align：执行沿世界轴的实体平移对齐，提交几何历史。
- planAlignment：只计算对齐位移方案；需 body.align 才执行。
- copySelection：复制当前明确实体到页面剪贴板；尚未新增对象。
- pasteSelection：将页面剪贴板实体粘贴进当前工程；不是读取磁盘文件。
- resolvePlacement：只解析来源锚点到目标定位的变换；尚未添加或移动实体。

## 孔、槽、凸台与车削
- hole：从世界坐标起点沿方向切圆孔。
- faceHole：从指定平面面向内打孔，定位依据当前面。
- holeWizard：直接生成普通孔、圆柱沉孔或锥形沉头孔，支持指定盲孔钻尖。
- multiHole：在多个世界起点依次切圆孔；不是孔向导的孔型选择。
- slot：切两半圆加两直边的胶囊形槽。
- faceGroove：在指定平面面上铣矩形凹槽。
- multiPocket：多个矩形/圆角矩形口袋切除，不是胶囊槽或圆孔阵列。
- multiBoss：向实体融合多个实心圆柱凸台，是加料。
- innerTurn：在指定平面截面处移除内圆柱材料形成内孔。
- outerTurn：在指定深度内去除给定直径以外材料形成外车。
- draftFaces：受限四侧平面棱柱拔模，固定底平面。
- draftByPlane：绕明确中性平面对选定解析面拔模；不默认扩大为全体。
- tap：从平面面垂直攻盲螺纹孔，需遵守具体牙型合同。
- thread：在已有圆柱材料面切真实对称 V 形螺旋槽；不是创建整颗标准螺钉。
- helix：创建精确螺旋线框，本身不是弹簧实心体。
- coil：沿精确螺旋线扫掠圆截面成单个弹簧实体。

## 圆角、端头与平滑过渡
- fillet：按精确 R 对选边、面边界或整件尖边倒圆。
- rodJunction：对等径直圆杆的垂直 T 接头设置独立三维 R；与日字扣定 R 共用滚球算法。不是任意面圆角，不支持异径、斜交或 X 接头。
- autoRound：按明确 R 一次处理整件所有尖边；失败不自动缩小或跳过目标。
- round：统一圆润入口，区分边缘与杆件端头；先读识别结果及明确范围。
- roundEnd：按杆件截面重建自由端头；不等于普通固定 R 倒圆。
- rounding：既有自动打磨操作，选边及半径策略以当前合同为准，不等同端头重建。
- smoothTransition：多相邻面联合处理公共尖缝，生成真实过渡面。
- chamfer：直线切角，支持等距/双距/角度；不是弧形圆角。
- probeBlendRadius：只探测指定范围内可行半径并返回证据；不提交倒圆。
- inspectRound：只读检查当前倒圆选择/范围；不是执行或自动缩小半径。
- badge：把指定平面面加厚成带边缘圆角的牌体。
- bumpSet：向目标加球形/椭球形凸点并处理接缝；不是高度图整体浮雕。

## LOGO、矢量浮雕与网格精修
- logo：已审阅矢量LOGO：单面法向等深，或跨相连面投影凹刻；后者depth沿投影方向，保持轮廓、尺寸和孔。
- curvedLogo：旧曲面 LOGO 兼容入口，新建用统一 logo 的定位合同。
- relief：精确分层矢量/开放刻线/平滑高度曲面浮雕；不同于三角网格成品。
- meshHeightfieldRelief：高度图生成三角网格浮雕；图像亮度须先解释成设计高度。
- meshReliefPlate：创建网格浮雕底板，不是修高既有浮雕。
- meshReliefEdit：对已有网格浮雕局部修高；不生成精确 BRep 曲面。
- reliefShoulder：已登记的浮雕肩部过渡几何；不是任意倒圆或整体造型。
- reliefSculpt：精确浮雕精修发现入口；用 feature.edit 更新原浮雕，不是独立 add。
- heightfieldSculpt：高度图精修发现入口；用 feature.edit 更新原特征。
- prepareReliefSculpt：准备有明确 domain/mask 的精修草稿，尚未应用。
- prepareReliefTopologyUpgrade：评估/准备浮雕拓扑升级；不等同已提交升级成功。
- reliefDesignReference：绑定已登记原图的真实字节到当前设计草稿，完整解码校验并随工程持久化；原图不是高度。get读元数据，resource读实际原件，attach/detach需当前草稿修订。
- prepareReliefDesignRelief：把当前拟合结果绑定到当前选中的真实平面、明确放置与基线，只读生成relief预览参数；预览/应用仍走preview.start/commit，不自动提交。
- reliefDesignFit：将当前已解毫米设计场拟合为保留常值边缘、孔缘与保护区的B样条控制高度；明确控制数和采样误差，只返回数值候选与证书，不生成BRep或修改工程。
- reliefDesignField：从当前工程人工毫米约束求解有界可取消数值场，读回真实残差和保守孔/保护掩码；只为支持范围生成显式网格候选，不从原图猜高度。
- sampleReliefHeight：读取浮雕参数/草稿指定点的控制高度，不是修改高度。
- sampleMeshRelief：按输入网格指纹及支撑条件采样来源高度；不是直接套用照片灰度。
- readRelief：读取已登记高度图资源及采样定义，尚未创建浮雕实体。
- planPatternMachining：根据明确意图选择恒深/浮雕等加工路线；规划不等于几何提交。

## 测量、拓扑与质量检查
- measure：读取一个体/面/边的尺寸面积体积，或明确点间距离。
- measureRelation：读取两个目标的最短距、中心距、平行度、轴关系等相互关系。
- queryGeometry：按面/边类型和几何条件查询当前拓扑，取得当前编号；不是仅按名称选面。
- queryReferences：查询点、轴、标架等几何参考；不直接修改工作锚点。
- inspectDesign：按显式验收要求检查尺寸、材料点或实体数等；不猜产品合格标准。
- inspectFit：检查两体干涉/配合关系；不是单体壁厚。
- inspectThickness：沿明确射线测局部厚度；不代表整件最小壁厚证明。
- inspectDraft：按指定脱模方向检查拔模；不是修改斜度。
- inspectPrintability：按过程合同检查打印相关几何；不能替代一般产品验收。
- inspectProfile：只读解析轮廓的闭合、交点等情况，不修复图元。
- inspectConstraints：只读已有轮廓约束及自由度；求解修改用 profileConstraints。

## 历史、编辑与恢复
- getHistory：列出保留状态 ID；不是完整几何文件，也不会撤销。
- history.undo：撤销最近一次已提交操作；不是删除任意历史状态。
- history.redo：重做刚被撤销的操作；新编辑可能清空重做栈。
- history.restore：恢复明确保留状态 ID 的工程状态，并作为可撤销操作提交；不是清空历史。
- feature.edit：修改已有特征参数及依赖重建；使用该特征原 op 的版本/hash。
- feature.add：按操作卡新增一个几何特征；不是执行页面方法或 template.* ID。
- feature.addMany：一个事务提交多特征计划，保留各特征关系；不是多个独立 run 步骤。
- document.parameters：设置命名参数/表达式并联动尺寸；不是显示精度设置。
- document.refresh：重建当前工程历史，不回到更早状态、不重启内核。
- recoverKernel：重启失效 Worker 并恢复最后已提交工程；不丢弃工程或重放未知写入。

## 未提交预览生命周期
- preview.start：新建几何/原特征编辑/文件插入草稿，尚未提交工程。
- preview.update：更新同一个 previewId 的当前代次草稿，旧代次不可应用。
- preview.commit：将指定当前草稿应用为一次历史操作。
- preview.cancel：丢弃未提交草稿，不删除已提交实体、不增加几何修订。

## 插入锚点与对象参考
- reference.setWorkFrame：设置后续插入的工作锚点位置/方向，不移动已有实体。
- reference.resetWorkFrame：只重置指定的位置、方向或全部工作锚点。
- reference.setLocked：锁定工作锚点的自动避让，仍为可撤销参考元数据。
- reference.saveFrame：将明确标架保存为具名参考，不等于激活。
- reference.activateFrame：将具名标架快照复制到当前工作锚点，不修改历史已冻结定位。
- reference.renameFrame：只改具名标架名称，须用当前标架版本。
- reference.deleteFrame：删除具名标架记录，已冻结特征不受影响。
- reference.setBodyAnchor：在指定实体上创建/更新对象锚点；不同于全局插入锚点。
- reference.deleteBodyAnchor：删除对象锚点元数据，不删除实体。

## 名称、外观与显示
- document.reliefDesign：保存人工毫米设计约束草稿；支撑/孔/保护/高度点，随工程撤销重开，不求解高度场或生成加工几何。
- document.rename：只改工程名，不改每个实体名称。
- feature.rename：只改指定历史步骤及同 ID 实体名称。
- body.appearance：指定实体颜色/材质覆盖，保存于工程且可撤销。
- document.appearance：工程材质默认覆盖，仅作用于无单独覆盖的实体。
- markLocation：拾取可见模型表面的近似世界坐标，插入AI对话草稿；只用于指出位置，不自动发送、不修改几何。
- getMetalMaterials：读取金属材质及渲染方式参数列表和默认配置，不修改外观。
- setMetalMaterials：配置镜面、哑光、HDR及自定义材质的安全参数，新增/修改/删除自定义材质；不重建几何。
- setDisplayPreferences：浏览器全局默认颜色、材质、照明与交互精度偏好；不改已有显式几何参数。
- setView：相机、投影、显示、选择及剖切视图；不移动几何或执行切割。
- setRenderQuality：调整显示网格质量，不改变精确几何精度。
- redraw：重绘当前显示，不重建特征历史。
- selectRectangle：按屏幕矩形选择，window/crossing 含义不同；不是世界坐标建模矩形。
- capture：生成当前已渲染画面的截图资源，不导出三维几何。
- getEvidenceImage：按明确工程修订取可复用的隔离轴测/正交三视图，不改变用户相机；缓存图不是精确尺寸量测或工程存档。
- getUILayout：读界面区域及动作映射，不代表当前几何状态。

## 连接、目录与文档
- connect：握手取得版本、能力、当前上下文及候选工具；不等于执行建模。
- info：读页面版本、能力与显示修订，不返回完整工程。
- getState：读当前工程摘要、特征、实体与请求上下文；不是静态工具契约。
- createRequestContext：从当前或给定身份生成写入上下文，不修改 revision。
- searchTools：按名称/用途检索候选摘要；排名第一不等于选型正确。
- getTool：取一个工具完整合同；不执行该工具。
- getTools：批量取具体 ID 的完整卡并检查静态哈希，不是搜索。
- readDocs：按登记 docId 读工作流说明；多页须按 cursor 读取。
- getModelLibrary：读可用模型库条目及版本，不插入实体。
- updateModelLibrary：修改支持的显示排序/恢复等库设置；不是修改模型源码。
- resolveModelLibrary：解析指定库项及参数到可执行定义，尚未创建。
- getQuickModelUsage：只读本浏览器已成功创建次数，非产品覆盖率。

## 执行、批次与异步作业
- getBatchReceipt：用原 idempotencyKey 和 documentInstanceId 只读查批次回执；不重发几何，不等同 getJob 查询异步作业。
- execute：提交一个明确 action 的命令；不接收任意脚本。
- run：按顺序执行有界批次；非原子，前面成功项保留；错误项按原回执处理。
- invoke：公开方法的结构化调用封装；不是任意函数/代码执行。
- executeText：执行受限文本命令语法或 dryRun；不是自然语言建模或 JS。
- submit：提交一个具有 jobId 的异步页面作业，须追踪原 job。
- getJob：只读页面异步作业原回执；未知写入先查，不重复提交。
- awaitJob：等待同一个页面 job 结束；超时返回当前状态，不取消或重提。
- waitFor：等待指定修订变化或 job 变化；不是持续执行建模。
- cancelJob：请求取消指定页面作业；是否停止/提交以最终回执为准。

## 统一服务与远程作业
- getServices：读统一 Services 配置及授权状态，不代表服务支持全部操作。
- setServices：设置统一服务地址、凭证与模式；配置不等于能力验收。
- clearServicesCredential：清除当前服务授权，不删除工程或服务器任务。
- getServicesCapabilities：读已配置后端实际协议与能力，不能用工具名猜支持。
- getServicesRouting：读实际分流规则和最近决策；不是强制把所有操作转远程。
- feature.compileServices：按当前后端能力编译匹配特征并验证导回；服务器成功不等于页面已提交。
- getServicesJob：读远程 Services job；与页面 getJob 的作业域不同。
- getServicesRequest：按原幂等键查询远程接收记录，用于断线未知结果对账。
- cancelServicesJob：对指定远程 job 请求受控停止，不等于暂停内核。
- decideServicesWait：对等待中的原 job 继续或停止；继续不会重新提交计算。
- recoverServicesJob：按明确批准与确认信息恢复远程作业；不能另造 jobId 规避状态。
- getLogoConverter：旧配置读取兼容入口，委托统一 Services；不是独立授权。
- setLogoConverter：已弃用的旧 setter，不能建立影子 URL/Key；配置用 setServices。
- readLogo：从已登记的图片或矢量文件取得待复核的闭合轮廓；JPG/PNG描摹需要实际毫米宽度和明确上传授权，不把照片光影当作深度。
- reviewLogo：校对本页logoId的毫米轮廓草稿、确认和生成可读取中间文件；不需要打开界面，也不提交雕刻几何。
- logoWizard：读取或控制已打开的LOGO分步向导；与用户共享来源参数、轮廓草稿和确认，不能代替目标面的实际雕刻。
- convertLogoPdf：通过已授权转换能力把指定 PDF 来源转矢量资源；不是直接刻字或字体替代。

## 助手面板
- getAgentPanel：读助手面板配置与显示状态，不发起建模任务。
- configureAgentPanel：配置助手页面地址，不代表已经连接或控制当前工程。
- setAgentPanel：按已有配置显示/断开助手面板；与几何 API 操作分离。

## 文件登记、打开与导入
- files.capabilities：读文件格式、大小与宿主写入能力，不证明某文件已读到。
- files.register：登记获授权原始字节，返回资源 ID；尚未打开/导入。
- files.new：新建空工程并替换当前设计；不默默丢弃未保存更改。
- files.open：替换整个当前设计，原工程文件可带历史；不是合并插入。
- files.import：把已登记模型插入当前工程，原对象保留；交换文件不恢复源 CAD 特征树。
- import：旧文件选择兼容操作；Agent 用 files.register/open/import 的显式资源，不依赖原生选择器。
- import.iges：当前静态版不可用的 IGES 入口；不能宣称直接导入成功。
- import.vector-server：当前静态版不可用的旧服务端矢量入口；应查当前 readVector/Services 实际能力。

## 工程保存、导出与送达
- files.save：生成保留配方/历史/源资产的原生工程；生成资源不等于写盘。
- files.export：生成指定 STEP/STL/BREP/PNG 交换产物，不保存全部原生历史。
- files.read：读取现有资源字节/Blob，不重新计算或证明磁盘写入。
- files.download：发起浏览器下载生成资源，只证明下载动作已启动。
- files.write：通过已授权文件句柄写盘；结果仍须按合同回读核验。
- files.confirmWritten：核验客户端实际写入并回读的大小/hash确认，不是让页面代写磁盘。
- files.reattach：把尚未过期的同一产物重新附加送达，不重算几何。
- files.release：释放临时资源；不删除工程实体或已下载磁盘文件。
- createDrawing：按当前几何创建投影、剖视和尺寸工程图定义。
- exportDrawing：导出已有drawingId工程图，或readLogo返回的logoId原轮廓DXF/JSON；不必创建三维实体或写脚本。

Context policy: none = no document context; identity = sessionId/documentId/documentInstanceId (revision ignored); revision = sessionId/documentId/documentInstanceId plus current expectedRevision. For writes use api.createRequestContext(), connect().requestContext or the last successful receipt nextContext/requestContext. getState().context contains revision; do not pass it unchanged as a revision-protected write context.
getDebugReport: contextPolicy=none
setDebugPanel: contextPolicy=identity
getMetalMaterials: contextPolicy=none
setMetalMaterials: contextPolicy=identity
getMaterials: contextPolicy=none
measureMass: contextPolicy=identity
reliefDesignFit: contextPolicy=revision
prepareReliefDesignRelief: contextPolicy=revision
reliefDesignReference: contextPolicy=revision
reliefDesignField: contextPolicy=revision
readLogo: contextPolicy=identity
reviewLogo: contextPolicy=identity
logoWizard: contextPolicy=identity
getBatchReceipt: contextPolicy=none
probeBlendRadius: contextPolicy=identity
recoverKernel: contextPolicy=revision
sampleMeshRelief: contextPolicy=identity
getModelLibrary: contextPolicy=none
updateModelLibrary: contextPolicy=revision
resolveModelLibrary: contextPolicy=identity
planPatternMachining: contextPolicy=identity
decideServicesWait: contextPolicy=none
recoverServicesJob: contextPolicy=none
prepareReliefTopologyUpgrade: contextPolicy=identity
sampleReliefHeight: contextPolicy=identity
prepareReliefSculpt: contextPolicy=identity
readRelief: contextPolicy=identity
getHistory: contextPolicy=none
planAlignment: contextPolicy=identity
selectRectangle: contextPolicy=identity
createDrawing: contextPolicy=revision
exportDrawing: contextPolicy=revision
getQuickModelUsage: contextPolicy=none
copySelection: contextPolicy=revision
pasteSelection: contextPolicy=revision
createRequestContext: contextPolicy=none
getUILayout: contextPolicy=none
setRenderQuality: contextPolicy=identity
invoke: contextPolicy=none
submit: contextPolicy=none
getJob: contextPolicy=none
cancelJob: contextPolicy=none
waitFor: contextPolicy=none
awaitJob: contextPolicy=revision
connect: contextPolicy=none
info: contextPolicy=none
getState: contextPolicy=none
searchTools: contextPolicy=none
getTools: contextPolicy=none
getTool: contextPolicy=none
readDocs: contextPolicy=none
queryGeometry: contextPolicy=identity
queryReferences: contextPolicy=identity
resolvePlacement: contextPolicy=identity
execute: contextPolicy=revision
measure: contextPolicy=identity
measureRelation: contextPolicy=identity
inspectDesign: contextPolicy=identity
inspectPrintability: contextPolicy=identity
inspectProfile: contextPolicy=identity
prepareProfileEdit: contextPolicy=identity
inspectConstraints: contextPolicy=identity
projectProfile: contextPolicy=identity
inspectFit: contextPolicy=identity
inspectThickness: contextPolicy=identity
inspectDraft: contextPolicy=identity
inspectRound: contextPolicy=identity
readVector: contextPolicy=identity
connectVector: contextPolicy=none
fitProfile: contextPolicy=identity
traceTwinWindow: contextPolicy=identity
executeText: contextPolicy=revision
setDisplayPreferences: contextPolicy=identity
getAgentPanel: contextPolicy=none
configureAgentPanel: contextPolicy=revision
setAgentPanel: contextPolicy=revision
markLocation: contextPolicy=revision
getServices: contextPolicy=none
setServices: contextPolicy=revision
getServicesCapabilities: contextPolicy=none
getServicesRouting: contextPolicy=none
clearServicesCredential: contextPolicy=revision
getServicesJob: contextPolicy=none
getServicesRequest: contextPolicy=none
cancelServicesJob: contextPolicy=revision
getLogoConverter: contextPolicy=none
setLogoConverter: contextPolicy=revision
convertLogoPdf: contextPolicy=revision
setView: contextPolicy=identity
redraw: contextPolicy=identity
capture: contextPolicy=identity
getEvidenceImage: contextPolicy=revision
run: contextPolicy=revision
files.capabilities: contextPolicy=none
files.register: contextPolicy=none
files.new: contextPolicy=none
files.open: contextPolicy=revision
files.import: contextPolicy=revision
files.save: contextPolicy=revision
files.export: contextPolicy=revision
files.reattach: contextPolicy=none
files.read: contextPolicy=none
files.download: contextPolicy=none
files.write: contextPolicy=none
files.confirmWritten: contextPolicy=none
files.release: contextPolicy=none
