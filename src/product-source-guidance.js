// Generic structural knowledge only. Private product numbers and source files
// stay with the host; a category suggests candidates, never measured geometry.
const family=(id,title,typeIds,tools,evidence,workflow)=>({id,title,typeIds,docId:`product.${id}`,tools,evidence,workflow});
export const PRODUCT_FAMILIES=Object.freeze([
 family('wire-loop','恒截面线环',[1,3,13,20,21,41],['profileSweep','inspectProfile'],['中心路径/内外曲线','实测截面','真实接缝/出货状态'],'核内外轮廓是否真实偏置，再原路径扫掠。仅真同心圆或两端半圆加直段且截面吻合时，可读单张template.ring或template.profileLoop卡走快路；自由多弧环不能套长圈。长圈不默认是真椭圆；二维R与三维圆角分开。'),
 family('flat-loop','平板或扁带框',[1,3,13,20,21,41,45],['sketchProfile','profileExtrude','inspectProfile'],['内外轮廓','侧厚和侧弯','独立内外R'],'平面恒厚时面域拉伸；侧弯、非等宽、变截面另用原截面路线。不能用圆线模板覆盖。'),
 family('variable-loop','变截面及空间弯框',[1,3,13,20,21,41],['profileSweep','profileLoft','planeSection'],['各段剖面','侧视空间弯曲','连接和厚度变化'],'保留源截面与空间路径；放样/扫掠按真实证据选，不能凭照片反光给厚度。'),
 family('prong','针框及可选滚筒',[10,34],['profileSweep','profileRevolve','holeWizard','inspectFit'],['框与舌针截面','针槽/轴孔','滚筒和转动间隙'],'框、舌针、轴、滚筒分件。先框和针槽，再卷眼/弯针，再滚筒，最后字位。'),
 family('pull-core','框与独立芯杆',[22],['profileSweep','profileExtrude','holeWizard','inspectFit'],['框和芯杆截面','卷钩/上下夹片','穿带净空'],'线框+钩芯、上下夹片、弹簧销套分族；不能只画主框或把芯杆融合。'),
 family('bridge','桥体与安装脚',[12],['profileSweep','profileExtrude','holeWizard','inspectFit'],['桥下净空','脚座与底片','螺钉规格/孔位置'],'桥体、独立脚/底座、底片和螺钉分件。脚长不等于桥高，装饰面牌仅复用安装接口。'),
 family('rivet','公母铆件',[7],['profileRevolve','profileExtrude','inspectFit'],['公杆与母帽剖面','中空孔与咬合长度','料厚/目标零件范围'],'公母杆帽回转，异形饰面另拉伸。B/C字母不固定等于公母件；螺钉连接款切换连接机制。'),
 family('stud','奶嘴钉及底螺钉',[8],['profileRevolve','holeWizard','thread','inspectFit'],['头/颈/底法兰剖面','攻牙与底杆规格','皮厚净距'],'球头、锥头或平头按原剖面回转；底螺钉独立。M2.6攻牙不自动改成M2或M2.5螺杆。'),
 family('eyelet','鸡眼与背件',[16],['profileRevolve','profileExtrude','holeWizard','inspectFit'],['A/B剖面或方眼脚仔','翻边前后状态','脚片/螺钉连接'],'薄壁翻边两件先读template.twoPieceEyelet；圆/圆角方形恒厚面框、恒壁颈口及对称柱/直孔先读template.frameEyelet和api.quick-installation。椭圆、锥口、自由饰面和变壁厚保留原剖面路线。翻边、脚仔、螺钉固定分别处理，直孔不能冒充螺纹或锥孔。'),
 family('gate','铰门弹簧圈或狗扣',[2,9],['profileSweep','profileExtrude','holeWizard','inspectFit'],['主框和活动门','轴与弹簧腔','转接环/开闭状态'],'主框、门、轴、簧、转接环分件，不融合。圆圈和椭圆圈外形不同但铰门关系相似。'),
 family('sliding-clasp','纵向滑栓狗扣',[9],['profileSweep','profileRevolve','holeWizard','inspectFit'],['滑栓方向/止口','压簧腔','转接座和端帽'],'先钩身与滑孔，再滑栓、簧和转环。别把压簧拉栓当铰门；粘胶端帽不能遗漏。'),
 family('insert-lock','插舌锁',[35],['profileExtrude','holeWizard','inspectFit'],['插入方向','舌/锁壳侧剖','弹簧/轴/底片'],'按背装图拆面牌、舌、锁壳、簧、底片和螺钉；外饰轮廓不能决定锁壳内部。'),
 family('flap-lock','翻片拍锁',[46],['profileExtrude','holeWizard','inspectFit'],['活动舌轴线','止口/弹簧腔','底片脚和开闭状态'],'面牌、翻片、轴、簧和底壳分件。方向与运动间隙先于Logo。'),
 family('turn-lock','拧制转锁',[11],['profileExtrude','profileRevolve','holeWizard','inspectFit'],['窗口和转头','轴/压簧/止位','开闭方向和底片'],'面窗、转头、转轴、定位件、簧分件。闭合投影重合不代表可以融合。'),
 family('magnetic','磁钮壳与公母配套',[33],['profileRevolve','profileExtrude','holeWizard','inspectFit'],['公母角色与外购规格','磁芯/壳套','脚片/螺钉'],'饰面、磁芯、壳套、脚片分件；型号与N等级依文字，几何模型不验证磁力。'),
 family('snap','急钮和饰面配套',[18,19],['profileRevolve','profileExtrude','inspectFit'],['单脚/钮珠/弹弓/面帽角色','外购规格号','目标饰面或整套'],'不要混用1号/4号/8050配套。只建用户指定的饰面或部件，不擅自扩成整套。'),
 family('hinge','铰及轴管',[32],['profileSweep','profileExtrude','profileRevolve','inspectFit'],['轴线与耳/管分段','活动或无功能备注','销/螺杆/弹簧'],'两侧耳管与销分件，保持轴向/径向间隙。无功能备注优先于类别名。'),
 family('keeper','穿带介子',[45],['profileExtrude','profileSweep','inspectFit'],['内窗与截面','侧拱/皮厚','封口螺钉/铰件'],'本地介子主要指穿带框，不能默认垫圈。螺母、方珠、球珠和任意装饰牌不进此族。'),
 family('handle','手挽环和固定基座',[38,43],['profileSweep','profileExtrude','holeWizard','inspectFit'],['环/拉片轮廓与截面','转轴或固定夹座','底片/螺钉/方向'],'拉头不默认拉链Y形滑块；先环/拉片、轴或卷眼、夹座、底片，再装饰。'),
 family('end-cap','U槽尾夹',[28],['profileExtrude','profileSweep','holeWizard','inspectFit'],['U槽剖面/开口','带厚','夹紧件/螺钉/连接环'],'恒厚开口U夹、前后片高和后孔已明确时，先读template.uStrapClip及api.quick-installation；半圆底和内直角仍按真实剖面设置。封闭帽套、字珠、面牌和自由侧面不套U夹；仅复用已核夹持接口，螺钉独立。'),
 family('split-ring','双平层匙圈',[31],['profileSweep','planeSection','inspectFit'],['圆/扁线截面','双层和局部跨层','端帽/接缝'],'双层匙圈不自动变成均匀螺旋；链、狗扣、开口锁壳属于独立装配。'),
 family('tbar','中眼吊杆',[40],['profileSweep','profileExtrude','holeWizard','inspectFit'],['横杆截面','中央环耳/孔','端座/独立连接圈'],'先杆与环耳，再孔和独立圈。自由装饰挂钩、长杆端座另取原轮廓，不硬套T杆。'),
 family('multi-window','梯扣多窗口',[5],['sketchProfile','profileExtrude','profileSweep','inspectFit'],['窗口和独立横杆','侧阶/空间折弯','防滑纹/销轴'],'横杆数量、不同截面和台阶分别恢复；齿纹后做。梯扣分类混入三角环和铰件须改族。'),
 family('cord-lock','索绳扣孔位机构',[48],['profileExtrude','profileRevolve','holeWizard','inspectFit'],['绳孔与按件对孔','压簧与止口','绳径/装配状态'],'壳、按件、弹簧分件；先确定松开/锁紧孔位。无弹簧通孔珠不是活动索绳机构。'),
 family('headed-fastener','饰头紧固件',[30],['profileRevolve','profileExtrude','holeWizard','inspectFit'],['螺纹/铆脚连接机制','面头与杆/背片','安装料厚及出货范围'],'先从接口判断螺钉、铆脚或外购钉。任意饰面不统一成尖杆或撞钉；回转头杆与异形面头分开。'),
 family('bar-heads','双端头杆件',[37],['profileRevolve','profileExtrude','holeWizard','inspectFit'],['主杆及两端截面','牙长/粘胶端','包皮/木柱/底片及目标范围'],'两端头不一定相同，杆长不等于牙长；一端预装另一端客户自装属于交付状态，不能直接融合。'),
 family('hollow-cap','空心绳端帽',[27],['profileRevolve','profileExtrude','holeWizard','inspectThickness'],['帽空腔及壁厚','侧螺钉/端孔','与环链的连接'],'稳定帽族用原轴向剖面回转或原面域构造；整串饰件和珠件只学帽接口，不套统一外形。'),
 family('chain','重复链节与端扣',[17],['profileSweep','transform','inspectFit'],['单节真实截面/空间扭转','节距/交替方向/节数','端钩/接圈和出货开口'],'先一节，再明确交替方向与间距装配。投影椭圆不等于平面圆环；外购链长度和节数按图纸/订单，不凭照片数圈。'),
 family('pull-tab','拉牌与连接环',[26],['profileExtrude','profileSweep','holeWizard','inspectFit'],['源轮廓和侧厚/侧拱','顶孔/卷眼/独立环','销/开口出货态'],'先拉牌轮廓和侧剖，再卷眼/独立环/销，文字最后。大圆拉环和皮绳不强套薄片牌。'),
 family('plate-mount','牌仔安装接口',[24],['profileExtrude','profileSweep','holeWizard','inspectFit'],['面牌轮廓/侧厚','脚仔或螺钉孔位置','背片对孔/安装态'],'复用安装关系，不复用任意字牌外形。弧牌须保留侧弯；锁牌走锁机构族；凹凸文字和自由饰面后做。'),
]);
export const PRODUCT_FAMILY_DOCS=Object.fromEntries(PRODUCT_FAMILIES.map(f=>[f.docId,`${f.title}\n适用候选TypeID: ${f.typeIds.join(',')}，类别仅提供候选。\n先取证：${f.evidence.join('；')}。\n方向：${f.workflow}\n这是结构方向筛选，未证明尺寸、有效版本、3D或产品覆盖。工具能力以当前完整卡为准。`]));
export const PRODUCT_SOURCE_GUIDANCE=`陌生图的结构简表与本地路由（宿主helper，不是页面建模命令）
首次下载知识包后，await client.planSource(brief,{includeKnowledge:true,maxChars:32000}) 可在一次校验的静态快照中同时取族和完整所需卡，省去再读一次磁盘与解析。默认includeKnowledge:false只返回路由；预算1000..64000，knowledge.items明确read/omitted/error，不能将省略卡当已读。brief仅保存在调用方；路由结果不缓存源图、货号或当前ID，不修改工程。
brief:{schemaVersion:1,typeId:官方正整数,familyId?:明确结构族id,scope:'part'|'assembly',targetPartIds?:['B'],source:{kind:'dwg'|'photo',reference:'源文件hash/图框/视图等',version:'resolved'|'unresolved',geometry:'complete'|'partial'|'unreadable',units:'mm'|'cm'|'m'|'in'|'unresolved'},parts:[{id:'A',role:'main'|'moving'|'fastener'|'backplate'|'purchased'|'decoration',reference:'零件证据',section:'resolved'|'unresolved'}],unknowns:['缺少孔深']}
最多32个零件、32个未知项，id唯一且targetPartIds必须存在；单件scope必须明确目标。空parts允许先筛选，但返回待补项。photos即使标complete也不能证明工程尺寸。
返回status:'needs_evidence'|'needs_family'|'planning_ready'、canPlan、blockers、candidateFamilies和选中docIds/toolIds。未明确族不自动选模板。源版本未定、几何残缺、照片、单位未确认、目标件截面缺失、未知项均保留阻碍；单件任务只要求目标件截面，参照配件仍返回。planning_ready只表示调用方简表满足规划门槛，sourceEvidenceVerified:false，不代表3D或装配验收；此helper不执行CAD，也不拦截绕过它的页面run。
source.units为提交几何和尺寸的单位；缺失或unresolved保持待核，cm/m/in返回转换要求。原单位和实际转换依据须记在source.reference，转换后才能提交units:mm；不得把字段改成mm代替真正换算。路由不会修改源图或代做单位转换。
TypeID为本地系统分类线索，不当结构真值。明确familyId可跨品类选择已核结构，返回categoryHintOverridden:true；候选列表仍按官方TypeID提供。杂类不训练统一模板；同类存在多个稳定族时逐族选。A/B/C字母不能代替零件职责；主件、活动件、底片、外购件分清后，再加载选中的完整卡，依据原尺寸做feature计划。尺寸、剖面、轴孔配合与开闭/出货状态应在规划时附来源；Logo最后。
目录由结构抽样经验形成，非模型权重训练、非完整产品验证。原始业务图纸与照片留在本地，不随公共知识包下载。`;
