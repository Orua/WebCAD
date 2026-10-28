import sourceCodes from '../contracts/error-recovery-codes.json' with {type:'json'};
import {parameterErrorMessage} from './parameter-error-message.js';
import {debugJournal} from './debug-journal.js';
import {formatServicesTransportFailure} from './services/transport-error.js';
// One recovery contract for UI, page receipts and hosts. This module never executes a retry,
// changes an argument, clears a guard, commits/undoes geometry, or cancels a job.
const rule=(id,codes,reason,next,tools=[],options={})=>({id,codes:new Set(codes.split(' ').filter(Boolean)),reason,next,tools,...options});
const rules=[
  rule('project-store','PROJECT_STORE_FAILED','当前工程的本地存储写入失败。','保留当前页面工程，先检查浏览器存储和原保存回执；不能宣称已保存或自动重算几何。',['getState'],{hardStop:true}),
  rule('relief-services-response','SERVICES_RESPONSE_INVALID','Services 浮雕响应与请求、哈希或误差不一致。','保留当前工程，核对原任务与返回产物；不提交、不自动重算或回退。',['getServicesJob','getState'],{hardStop:true}),
  rule('relief-services-required','RELIEF_DESIGN_SERVICES_REQUIRED','临时控制网需要 Services 完成首次拟合。','保留当前设计并检查 Services 能力；如需本地执行，由用户明确选择浏览器拟合后重新准备。',['reliefDesignFit','getServicesCapabilities'],{hardStop:true}),
  rule('design-fit-capacity','FIT_CAPACITY FIT_WORK_BUDGET FIT_UNDERSAMPLED','拟合的采样、控制网格或数值工作量超出当前范围。','核对显式控制数与原场采样及容量；保留设计，不自动降低精度、改变误差或重试耗尽任务。',['reliefDesignFit','getTool'],{hardStop:true}),
  rule('design-fit-constraints','FIT_SOURCE_INVALID FIT_CONSTRAINT_CONFLICT FIT_DIRECTION_CONFLICT FIT_DOMAIN_CONFLICT FIT_DOMAIN_EMPTY FIT_DOMAIN_UNSUPPORTED FIT_NO_FREEDOM FIT_PARAMETER_OUTSIDE','当前高度方向、支撑或保护约束与拟合条件不一致。','读取原设计、baseline及受保护极点报告；不能删孔、放松保护或翻转高度来通过。',['reliefDesignFit','reliefDesignField'],{hardStop:true}),
  rule('design-fit-quality','FIT_FAILED NUMERICAL_RESULT_MISMATCH FIT_DEVIATION FIT_PROTECTION_FAILED FIT_NOT_CONVERGED FIT_TIMEOUT FIT_WORKER_FAILED','本次拟合未达到明确误差、保护或求解条件。','保留原设计场和实际诊断，不提交为实体；先核对误差与约束，不能自动修改容差或换算法重算。',['reliefDesignFit'],{hardStop:true}),
  rule('design-fit-brep-binding','RELIEF_DESIGN_BINDING_INVALID RELIEF_DESIGN_SOURCE_CHANGED RELIEF_DESIGN_SUPPORT_INVALID RELIEF_DESIGN_MASK_BLOCKED','拟合与支撑面、放置或掩码的绑定不再一致。','重新读取当前工程，重新选择真实平面并重新准备；不沿用旧面编号，不放宽绑定或改用其他轮廓策略。',['prepareReliefDesignRelief','reliefDesignFit','getState'],{hardStop:true}),
  rule('design-fit-brep-native','RELIEF_DESIGN_NATIVE_REQUIRED','该拟合浮雕的控制网格复杂度需要尚未开放的Native平面B样条能力。','保留拟合与工程；减少显式控制网格后重新拟合，或等待Native验收；不降级本地执行。',['reliefDesignFit','prepareReliefDesignRelief'],{hardStop:true}),
  rule('design-fit-cancel','FIT_CANCELLED','数值拟合已停止。','原已解设计场保留；读取当前拟合状态，不自动重启。',['reliefDesignFit'],{hardStop:true}),
  rule('relief-reference','RELIEF_REFERENCE_INVALID RELIEF_REFERENCE_MISSING','浮雕原参考图不存在、已改变或未通过原件校验。','读取当前设计草稿与已登记原图资源；核对真实图片格式、SHA256、大小和解码结果。原图仅供参考，不能按照片明暗自动生成高度。',['reliefDesignReference','getState'],{hardStop:true}),
  rule('design-capacity','DOMAIN_CAPACITY FIELD_CAPACITY PIPELINE_CAPACITY','设计场的采样数量或求解工作量超过当前范围。','读取数值场工具的采样与迭代上限，保留草稿；不要自动降低用户要求的造型精度。',['reliefDesignField','getTool'],{hardStop:true}),
  rule('design-constraints','DOMAIN_CONSTRAINT_CONFLICT DOMAIN_EMPTY DOMAIN_HARD_POINT_NOT_ON_GRID DOMAIN_HARD_POINT_OUTSIDE DOMAIN_INVALID FIELD_CONSTRAINT_CONFLICT FIELD_EMPTY_DOMAIN FIELD_INPUT_INVALID FIELD_SAMPLE_OUTSIDE FIELD_UNANCHORED LOCAL_EDIT_BOUNDS LOCAL_EDIT_CONSTRAINT_CONFLICT LOCAL_EDIT_EMPTY_DOMAIN LOCAL_EDIT_INVALID LOCAL_EDIT_OUTSIDE PIPELINE_INVALID','毫米高度点、支撑、孔或保护区域的约束无法同时应用。','检查点位是否在有效支撑内并避开孔和保护区，核对最低/最高高度；只修订明确冲突的约束，不自动移动点或删除保护。',['reliefDesignField'],{hardStop:true}),
  rule('design-solve','FIELD_FAILED FIELD_NOT_CONVERGED FIELD_NUMERICAL FIELD_TIMEOUT FIELD_WORKER_FAILED','本次数值求解未取得满足停止条件的有效结果。','保留草稿，读取本次残差和工作量报告；先查具体约束或Worker故障，不将未收敛的场提交为模型。',['reliefDesignField'],{hardStop:true}),
  rule('design-cancel','FIELD_CANCELLED LOCAL_EDIT_CANCELLED PIPELINE_CANCELLED','本次数值求解或局部编辑已停止。','保留已保存设计；需要继续时先读取当前草稿和任务状态，不自动重新求解。',['reliefDesignField'],{hardStop:true}),
  rule('logo-render','LOGO_RENDERED_IMAGE_INVALID PDF_RENDER_FAILED','PDF页面渲染或渲染底图校验未通过。','保留原文件，核对页码、服务端渲染能力与原作业报告；可以提供同一图案的受支持矢量文件，不自动替换内容。',['getServicesCapabilities','getServicesJob','logoWizard'],{hardStop:true}),
  rule('design-height-range','RELIEF_DESIGN_HEIGHT_RANGE_UNSUPPORTED','设计的高低跨度超过当前网格高度范围。','保留原设计，核对当前工具的100毫米高度跨度上限；不要自动压缩高度来通过。',['getTool'],{hardStop:true}),
  rule('design-mask','RELIEF_DESIGN_MASK_INVALID','浮雕范围数据与当前采样网格不一致。','重新读取同一设计草稿并求解，保留孔与支撑边界；不要手工填补或丢弃掩码。',['reliefDesignField'],{hardStop:true}),
  rule('design-boundary','RELIEF_DESIGN_DOMAIN_NONMANIFOLD RELIEF_DESIGN_DOMAIN_EMPTY RELIEF_DESIGN_DOMAIN_TOPOLOGY_CHANGED RELIEF_DESIGN_HOLE_TOPOLOGY_CHANGED RELIEF_DESIGN_FEATURE_UNRESOLVED','当前采样尚不能完整保留支撑边界或贯穿孔。','查看采样间距与边界报告，在允许范围内提高采样分辨率；孔仍无法分离时保留草稿，不自动填孔或更换底板。',['reliefDesignField'],{hardStop:true}),
  rule('design-base','RELIEF_DESIGN_BASE_INTERSECTION','设计高度会穿过底板背面。','核对最低设计高度与底厚，明确修订后重新生成候选；不自动抬高或削平原设计。',['reliefDesignField'],{hardStop:true}),
  rule('authorization','UNAUTHORIZED AUTH_CONFIG_REQUIRED SERVICES_AUTH_REQUIRED UPLOAD_AUTH_REQUIRED RECOVERY_AUTH_REQUIRED PERMISSION_REQUIRED HOST_ACCESS_DENIED ORIGIN_FORBIDDEN HTTPS_REQUIRED IIS_STORAGE_FORBIDDEN LAN_ONLY AGENT_METHOD_DENIED action_not_allowed scope_denied method_not_allowed','当前授权或访问范围不允许这项操作。','先通过现有设置完成登录或取得所需授权，再核对原请求；不要绕过权限或擅自上传来源。',[],{hardStop:true}),
  rule('host-control','lease_revoked task_ended task_binding_mismatch','页面控制权或当前任务绑定已结束或改变，并不等于登录到期。','核对原任务、原命令和当前页面绑定；通过宿主重新连接原工程，结果未知时不得换键重画。',['getState','getJob','connect'],{hardStop:true}),
  rule('dispatch','COMMAND_EXPIRED','命令在进入CAD执行前已超过派发期限，尚未提交页面作业。','保留原命令回执，核对连接和当前工程状态；确认未提交并恢复连接后，才处理尚未执行的步骤。',['getState','getJob','connect'],{hardStop:true}),
  rule('binding','INSTANCE_MISMATCH DOCUMENT_MISMATCH REVISION_CONFLICT LIBRARY_REVISION_CONFLICT STALE_REFERENCE SELECTOR_CONTEXT_STALE SELECTOR_CONTEXT_REQUIRED LOGO_REVIEW_STALE SOURCE_HASH_MISMATCH RECOVERY_INPUT_CHANGED MACHINING_SOURCE_CONFLICT SOURCE_ANCHOR_INVALID COORDINATE_MODE_CONFLICT FRAME_SURFACE_MISMATCH TOPOLOGY_REFERENCE_STALE','请求引用的工程、版本、来源或定位已变化。','读取当前状态与来源，重新查询引用并重规划尚未完成的步骤；不要沿用旧面边编号。',['getState','queryGeometry','queryReferences'],{hardStop:true}),
  rule('idempotency','IDEMPOTENCY_KEY_REUSED idempotency_conflict','请求标识已绑定另一份参数。','先取原回执并核对是否已提交；只有明确修订后的剩余请求才使用新标识。',['getBatchReceipt','getJob','getState'],{hardStop:true}),
  rule('reconcile','SERVICES_CONNECTION_UNKNOWN OBSERVATION_CANCELLED PREVIOUS_ATTEMPT_UNKNOWN RESULT_UNKNOWN JOB_TIMEOUT JOB_NOT_FOUND REQUEST_NOT_FOUND JOB_RESULT_UNAVAILABLE receipt_unavailable RECOVERY_RESULT_UNRESOLVED HOST_TIMEOUT HOST_INTERRUPTED TIMEOUT SERVICE_STOPPING RESULT_NOT_READY','原任务的执行或提交结果尚未确认。','按原 jobId、请求键或批次标识查询状态并与当前工程对账；确认前不要重放、换键或另起计算。',['getJob','getBatchReceipt','getServicesJob','getServicesRequest','getState'],{hardStop:true,reconcile:true}),
  rule('budget','PREVIOUS_ATTEMPT_FAILED KNOWN_INPUT_FAILED','此前相同输入的任务未成功，本次未重新计算。','查看原任务的具体错误；LOGO 识别任务确认已停止后，可重新点击识别。其他建模任务须先核对失败原因和当前工程。',['getJob','getServicesJob','getServicesRequest'],{hardStop:true}),
  rule('recovery-active','RECOVERY_WORKER_ACTIVE','上一任务的计算进程仍在运行。','等待原任务完成，或停止原任务并确认结束后再操作。',['getServicesJob'],{hardStop:true}),
  rule('recovery-denied','RECOVERY_NOT_ALLOWED','此任务不能从中断位置恢复。','查看原任务状态和失败原因；已完成或已停止的任务不能当作可恢复任务继续。',['getServicesJob'],{hardStop:true}),
  rule('schema','PARAM_SCHEMA_INVALID PARAM_RANGE_INVALID INVALID_OPTIONS REQUEST_INVALID GATEWAY_REQUEST_INVALID NAME_INVALID BADGE_INVALID TYPE_MISMATCH FRAME_INVALID HOST_CONTROL_INVALID HOST_FRAME_INVALID INVALID_INPUT FIT_INPUT_INVALID','输入字段、类型、范围或坐标格式不符合当前工具契约。','读取对应完整工具卡，核对报错字段及实际单位后修正请求；保留原设计尺寸和加工意图。',['getTool'],{hardStop:true}),
  rule('units','PARAM_UNIT_MISMATCH MESH_UNITS_REQUIRED SIZE_REQUIRED MACHINING_INTENT_REQUIRED MACHINING_INTENT_CONFLICT INTENT_CONFLICT RELIEF_UPGRADE_STRATEGY_REQUIRED RECOVERY_REASON_REQUIRED MIXED_PLAN_REQUIRED SOURCE_PREPARATION_REQUIRED','尺寸单位、加工意图、来源准备或恢复依据尚未明确。','补齐来源支持的毫米尺寸、凸凹方向、深度与明确策略；混合图案先拆分明确加工计划，照片先准备受支持高度/矢量来源，不能从亮度、文件名或默认值猜测。',['getTool','planPatternMachining'],{hardStop:true}),
  rule('parameters','PARAM_CYCLE PARAM_EXPRESSION_INVALID PARAM_PATH_INVALID PARAM_UNDEFINED PARAMETER_BOUND','命名参数存在循环、无效表达式或绑定冲突。','检查参数依赖与引用路径，修改原参数定义；不要绕过绑定另写一个尺寸。',['getState','getTool'],{hardStop:true}),
  rule('selection','LOCATION_NO_HIT AMBIGUOUS_SELECTION AMBIGUOUS_REFERENCE AMBIGUOUS_CONTOUR ROUND_SELECTION_AMBIGUOUS RELIEF_SELECTION_AMBIGUOUS TAP_BORE_AMBIGUOUS ALIGN_UNDERCONSTRAINED SELECTION_CONFLICT SELECTION_COUNT_CHANGED SELECTOR_UNCERTAIN SELECTOR_EMPTY SELECTOR_INVALID RESELECT_TOPOLOGY NO_MATCH PROFILE_SELECTION_INVALID LOGO_SELECTION_INVALID','选取范围没有唯一对应当前几何，或匹配数量不符合预期。','查询当前面、边及参考候选，明确目标与数量后再执行；不能猜选编号或自动扩大范围。',['queryGeometry','queryReferences','getState'],{hardStop:true}),
  rule('history','UNSAFE_LEGACY_REFERENCE HISTORY_INVALID PARALLEL_DEPENDENCY_MISSING','历史或下游特征依赖无法安全对应修改后的拓扑。','读取受影响特征，重新明确真实引用；不得擅删后续步骤。撤销只用于已核对的本次提交。',['getHistory','getState','queryGeometry'],{hardStop:true}),
  rule('unsaved','UNSAVED_REPLACEMENT ONE_PROJECT_ONLY','当前工程尚未保存或不能同时替换多个工程。','先通过文件接口保存当前已提交工程，再由用户明确选择打开或新建。',['files.save'],{hardStop:true}),
  rule('preview','PREVIEW_ACTIVE UI_TASK_ACTIVE LOGO_WIZARD_BUSY LOGO_WIZARD_CLOSED AGENT_PANEL_ACTIVE RESOURCE_BUSY KERNEL_BUSY','已有预览、编辑草稿、资源写入或计算占用当前操作。','先查看当前任务：继续原任务，或明确应用/取消草稿后再执行；不要自动关闭用户未完成编辑。',['getState','getJob'],{hardStop:true}),
  rule('review','LOGO_REVIEW_REQUIRED MACHINING_SOURCE_REQUIRED LOGO_SOURCE_REQUIRED','图案轮廓或加工来源尚未确认。','检查同一稿件的原图、孔洞、毫米尺寸与加工深度，明确确认后才生成加工特征。',['reviewLogo','logoWizard','planPatternMachining'],{hardStop:true}),
  rule('display','DISPLAY_FAILED DISPLAY_INCOMPLETE DISPLAY_REFINEMENT_FAILED DISPLAY_VOLUME_MISMATCH STALE_DISPLAY CAPTURE_TIMEOUT UNSUPPORTED_RENDER_FEATURE','画面或截图未能确认与已提交模型一致。','读取提交回执和当前状态，再尝试一次 redraw 或 capture；只报告画面未确认，不要重新执行建模。',['getState','redraw','capture'],{readRetry:true}),
  rule('integrity','ARTIFACT_CORRUPT HASH_MISMATCH MESH_ASSET_CORRUPT MESH_RESULT_MISMATCH RESULT_MISMATCH RESULT_INVALID LAYER_CACHE_CORRUPT ASSET_ROLE_MISMATCH GEOMETRY_CODEC_MISMATCH ROUND_RADIUS_MISMATCH REFINE_GEOMETRY_CHANGED','来源、结果或缓存的身份、哈希、语义或几何校验未通过。','停止安装该结果，保留原件和诊断；核对原任务、来源、参数及发布版本，不能降级校验。',['getState','getServicesJob','getServicesRequest'],{hardStop:true}),
  rule('version','CATALOG_CHANGED SCHEMA_MISMATCH KERNEL_BUILD_CHANGED DOCUMENT_VERSION_UNSUPPORTED OPERATION_VERSION_UNSUPPORTED SERVICES_PROTOCOL_MISMATCH SERVICES_MIGRATION_REQUIRED RELIEF_EDIT_VERSION','页面、文档、文件或后端协议版本不兼容。','重新握手并读取匹配版本的完整契约；工程先保存，不能用旧包或旧编号继续写入。',['connect','getTool','getServicesCapabilities'],{hardStop:true}),
  rule('capacity','SIZE_LIMIT RESOURCE_LIMIT FILE_TOO_LARGE IMPORT_TOO_LARGE RESULT_TOO_LARGE RESULT_TOO_LARGE_FOR_CLIENT CHECKPOINT_CLIENT_CAPACITY SOURCE_BUDGET_EXCEEDED GEOMETRY_SOURCE_LIMIT CONTOUR_TOO_COMPLEX LOFT_COMPLEXITY MESH_DISPLAY_CAPACITY MESH_SIZE_LIMIT RELIEF_EDIT_CAPACITY RELIEF_LIMIT RELIEF_PLAN_LIMIT REFINE_LIMIT PROFILE_CONSTRAINT_LIMIT','输入、结果、工程或客户端承载超过这条实际链路的容量。','读取对应容量限制，按来源允许的部件/工程拆分或释放无用资源；不能自动减细节、降精度或改用另一内核。',['files.capabilities','getTool','getState'],{hardStop:true}),
  rule('resource','RESOURCE_EXPIRED ASSET_NOT_FOUND ARTIFACT_NOT_FOUND ARTIFACT_UNAVAILABLE SERVICES_SOURCE_UNAVAILABLE LIBRARY_ENTRY_NOT_FOUND HANDLE_REQUIRED','所需输入资源、结果文件或授权文件句柄已经失效或不可用。','保留原资源/任务标识；由宿主重新提供同一来源或重新取得已有工件与句柄，核对哈希后继续。',['files.capabilities','getServicesJob','getState'],{hardStop:true}),
  rule('file','MALFORMED_FILE JSON_INVALID PROJECT_FORMAT_INVALID DOCUMENT_INVALID ASSET_INVALID LIBRARY_INVALID VECTOR_INVALID RELIEF_IMAGE_INVALID LOGO_READ_FAILED FILE_COMMAND_FAILED CONVERSION_FAILED','文件内容、格式转换、编码或工程结构未通过校验。','核对原文件真实格式与来源，使用受支持的导出格式重新提供；不要覆盖原文件或将解析失败当成空模型。',['getTool','files.capabilities'],{hardStop:true}),
  rule('transfer','ARTIFACT_TRANSFER_FAILED SAVE_CONFIRMATION_FAILED RESULT_REPORT_FAILED UPLOAD_FAILED PROJECT_ENCODING_FAILED PROJECT_ENCODING_MESSAGE_ERROR PROJECT_ENCODING_SEND_FAILED PROJECT_ENCODING_TIMEOUT','文件传输、工程编码或写入确认未完成。','区分已生成、已传输和已写盘；先取原工件或原回执，再仅恢复未完成的传输，不重算模型。',['files.save','files.capabilities','getBatchReceipt','getJob'],{hardStop:true}),
  rule('storage','STORAGE_UNAVAILABLE LIBRARY_STORAGE_UNAVAILABLE DATA_ROOT_IN_USE DATA_ROOT_INVALID GATEWAY_CONFIG_INVALID SERVICES_CONFIG_INVALID SERVICES_CONFIG_REQUIRED AGENT_URL_INVALID IIS_RUNTIME_UNAVAILABLE','存储、服务映射或连接配置当前不可用。','通过现有设置核对连接与存储；保留工程，向负责该环境的宿主请求处理，不建立替代服务或改写运行目录。',['getServices','files.capabilities'],{hardStop:true}),
  rule('cancelled','CANCELLED PREVIEW_CANCELLED BATCH_CANCELLED JOB_CANCELLED JOB_CANCELED WORKER_CANCELLED SERVICES_JOB_CANCELLED LOGO_READ_CANCELLED','这项操作已取消或在当前步骤后停止。','检查最终回执和仍保留的已提交步骤；取消请求不等于内核已停止，只有最终停止状态才能开始后续计算。',['getState','getJob','getServicesJob'],{hardStop:true}),
  rule('wait','SERVICES_WAIT_DECISION_REQUIRED SERVICES_WAIT_NOT_PENDING','后台计算需要明确等待决定，或原等待决定已经过期。','查询原任务并选择继续等待同一作业或受控停止；不自动重新提交。',['getServicesJob','decideServicesWait'],{hardStop:true,reconcile:true}),
  rule('kernel','KERNEL_CRASHED KERNEL_START_TIMEOUT KERNEL_TIMEOUT KERNEL_BUILD_FAILED KERNEL_RECOVERY_REQUESTED WORKER_MESSAGE_ERROR WORKER_SEND_FAILED WORKER_TERMINATED WORKER_TIMEOUT WORKER_FAILED WORKER_UNAVAILABLE NATIVE_WORKER_FAILED MESH_WORKER_FAILED','几何内核或受控工作进程未能完成当前计算。','先保存最后已提交工程并核对原任务；本地内核确实不可用时才 recoverKernel，不刷新页面、不重放未知命令。',['files.save','getState','getJob','getServicesJob','recoverKernel'],{hardStop:true}),
  rule('precision','TOLERANCE_UNACHIEVABLE MESH_BOOLEAN_PRECISION_LIMIT MESH_EXPORT_PRECISION RELIEF_RESOLUTION_INSUFFICIENT GUIDED_LOFT_GUIDE_DEVIATION GUIDED_LOFT_CIRCULAR_RADIUS_CHANGE','所需误差、精度或来源形状保持条件未达到。','保留来源与原精度；检查来源测量和工具支持范围，只有用户明确同意的新要求才可另定精度或尺寸。',['getTool','inspectProfile'],{hardStop:true}),
  rule('material','NO_MATERIAL_ADDED NO_MATERIAL_REMOVED MATERIAL_CHECK_FAILED LOFT_VOLUME_MISMATCH MESH_BOOLEAN_EMPTY TAP_MATERIAL_INSUFFICIENT RELIEF_THICKNESS RELIEF_THICKNESS_UNKNOWN','操作没有产生要求的材料变化，或厚度/材料余量未被证明。','检查目标、刀具、方向、截面、深度及实际厚度；只以原参数做受控预览，不能通过改变尺寸凑成功。',['measure','queryGeometry','inspectThickness','getTool'],{candidate:true}),
  rule('contour','OPEN_CONTOUR INVALID_CONTOUR INVALID_HOLE LOGO_CONTOUR_INVALID LOGO_EMPTY LOGO_MIN_VERTICES NO_VECTOR_CONTENT REGIONS_TOUCH_OR_OVERLAP SELF_INTERSECTION RASTER_SMOOTHING_TOPOLOGY RASTER_TOPOLOGY_AMBIGUOUS','来源轮廓存在未闭合、孔归属、交叠、自交或描摹拓扑问题。','核对原图与可读中间轮廓；明确修正真实轮廓，保留孔与尺寸，不自动填洞、删细节或扩大容差。',['readVector','inspectProfile','reviewLogo'],{hardStop:true}),
  rule('constraints','PROFILE_CONSTRAINT_CONFLICT PROFILE_CONSTRAINT_UNSATISFIED PROFILE_CONSTRAINT_NUMERICAL PROFILE_CONSTRAINT_GEOMETRY_INVALID PROFILE_CONSTRAINT_INVALID RELIEF_CONSTRAINT_CONFLICT RELIEF_CONSTRAINT_INVALID RELIEF_BOUNDARY_CONFLICT RELIEF_PATCH_PROTECTION RELIEF_DESIGN_PROTECTED REFERENCE_LOCKED','约束、保护区域或锁定规则与这次修改冲突。','读取实际约束与保护区，明确修改哪一项条件；不能自动解除锁定、删除孔或覆盖保护区域。',['inspectConstraints','getState','getTool'],{hardStop:true}),
  rule('outside','RELIEF_OUTSIDE_FACE RELIEF_SAMPLE_OUTSIDE RELIEF_TARGET_OUTSIDE RELIEF_DESIGN_OUTSIDE TAP_POINT_INVALID TAP_DEPTH_INVALID SUBD_BRUSH_NO_HIT','操作点、深度或加工范围未落在允许的实际目标区域。','重新测量当前目标与局部坐标，明确位于材料/支撑范围内的位置；保留原深度与图案比例。',['queryGeometry','measure','getTool'],{hardStop:true}),
  rule('no_change','NO_CHANGE RELIEF_NO_CHANGE LOGO_UNDO_EMPTY CLEANUP_NOT_APPLICABLE BLEND_SKIPPED AUTO_PLACED COLOR_IGNORED_BY_METAL_FINISH','当前条件没有可应用的额外变化，或回执包含需要说明的状态。','读取原状态与报告确认实际结果；无需重复加工，不将“未变化”冒称新几何已生成。',['getState','getTool']),
  rule('sequence','COMPLEX_BATCH_REQUIRES_SEQUENTIAL SERIAL_REBUILD_REQUIRED','这组依赖需要按已提交的当前结果顺序执行。','核对前序已提交步骤，仅把未完成部分按依赖顺序规划为有界步骤。',['getState','getHistory'],{hardStop:true}),
  rule('design_check','DESIGN_CHECK_INCONCLUSIVE DESIGN_REQUIREMENTS_NOT_MET','指定设计检查未通过，或现有证据不足以证明满足要求。','读取逐项检查和未验证项，修正已证实的问题；不能把有效实体或工具执行成功当成设计验收。',['inspectDesign','getState'],{hardStop:true}),
  rule('host_connection','AGENT_PANEL_FAILED AGENT_PANEL_TIMEOUT host_unavailable PAGE_REQUIRED ROUTE_NOT_FOUND','宿主、页面绑定或现有接口连接未建立。','核对所选页面和宿主实际脚本能力、已有连接配置；最多一次针对性重连，不能刷新未保存工程或建立替代服务。',['connect','getAgentPanel'],{hardStop:true}),
  rule('manual_lock','HOST_INTERACTION_LOCKED','当前页面的人工编辑由正在执行的Agent控制暂时锁定。','等待原控制任务完成或通过既有控制入口释放编辑权；不要绕过锁定。',['getState'],{hardStop:true}),
  rule('placement','PLACEMENT_NOT_APPLICABLE','这项操作不接受当前定位方式。','读取工具定位契约，沿来源冻结坐标执行加工；不能叠加当前锚点造成错位。',['getTool','getState'],{hardStop:true}),
  rule('execution','BATCH_FAILED JOB_EXECUTION_FAILED SERVICES_JOB_FAILED SERVICES_REQUEST_FAILED HOST_FAILED TEXT_COMMAND_FAILED UPGRADE_FAILED','执行链路返回失败，具体原因须结合本次阶段和诊断确认。','读取原错误的code、path、stage、report与逐步回执；先核对提交状态，仅修复已证实的原因。不要自动重算或把未知失败归咎于模型。',['getState','getJob','getServicesJob'],{hardStop:true}),
];
const exact=new Map(rules.flatMap(item=>[...item.codes].map(code=>[code,item])));
const unavailable=rule('unsupported','', '当前工具、宿主或执行端不支持这份来源与请求语义。','读取工具卡与实际能力；仅选择输入、输出、孔洞、尺寸和深度语义一致的已支持工具。没有等价工具时说明缺口并停止，不换核兜底。',['getTool','getServicesCapabilities'],{hardStop:true});
const geometry=rule('geometry','', '候选几何未通过构造、有效性或来源保持检查。','读取本次阶段与诊断并检查来源；只在确认未提交、有新机制证据和剩余预算时，通过现有 preview.start/update/cancel 评估一个候选。保留尺寸、图案、深度与R。',['getTool','queryGeometry','measure'],{candidate:true});
const input=rule('source_parameters','', '此来源或工具参数组合不满足几何输入条件。','读取对应工具卡和报错阶段，复核来源截面、路径、支撑及参数关系；先修正已证实的输入问题，不能用试错改变设计。',['getTool','inspectProfile'],{hardStop:true});
const guided=rule('guided_loft','', '导引放样的来源绑定、截面、引导或接合条件未成立。','核对当前来源截面、引导路径和匹配条件；仅支持卡片公布的范围，不用近似面替代实体或绕过来源绑定。',['getTool','inspectProfile','getState'],{hardStop:true});
const unknown=rule('unclassified','', '操作未能完成，目前没有足够证据确定安全恢复方式。','保留当前工程与原始错误回执，先检查提交和任务状态；将明确的失败原因及需要的下一项信息告知用户。',['getState','getJob'],{hardStop:true});

export const ERROR_RECOVERY_VERSION='1.0.0';
function businessReason(message){
  const value=String(message||'').trim();
  // Preserve concise Chinese business guidance, but never echo opaque native diagnostics,
  // credentials, paths, stacks, request identifiers or unproven rollback/save claims.
  if(!/[\u3400-\u9fff]/u.test(value)||value.length>300||/(?:^|\s)\/(?:[^\s/]+\/)+[^\s]*/.test(value)||/[\r\n]|https?:|[A-Za-z]:[\\/]|\\\\|(?:\bat\s+.+\(|stack|bearer|token|cookie|authorization|password|secret|api.?key|jobId|requestId|diagnosticsRef|密钥|令牌|密码)|[A-Za-z0-9_-]{24,}|刷新页面|降低精度|已回滚|原工程保留|工程未(?:改变|变化)|已保存到/i.test(value))return null;
  return value;
}
export function recoveryRule(code,message=''){
  if(exact.has(code))return exact.get(code);
  if(/UNSUPPORTED|UNAVAILABLE|_MISSING$|_TBD$|_UNMATCHED$|^UNKNOWN_OPERATION$|^FORMAT_|^CONTINUITY_|^SCOPE_EXPANSION_REQUIRED$|^OPERATION_|^NATIVE_ACCEPTANCE_/.test(code))return unavailable;
  if(/^GUIDED_LOFT_/.test(code))return guided;
  if(/^(?:GEOMETRY_|BLEND_RADIUS_|REFINE_FAILED|OCCT_FAILURE|CLOSED_GRINDING_|GRINDING_STRIP_|RELIEF_(?:GEOMETRY|INTERSECTION|NOT_CLOSED|MULTIVALUED)|MESH_BOOLEAN_INVALID)/.test(code))return geometry;
  if(/^(?:PROFILE_|FIT_|RELIEF_|HEIGHTFIELD_|MESH_|PROJECTION_|DEGENERATE_|UNSUPPORTED_CURVE_)/.test(code))return input;
  if(code==='UNCLASSIFIED_ERROR'){
    if(/permission|unauthor|forbidden|权限|授权|未登录/i.test(message))return exact.get('UNAUTHORIZED');
    if(/ambiguous|select (?:a|one)|请选择|选中|选择.*[面边体]|含混|歧义/i.test(message))return exact.get('AMBIGUOUS_SELECTION');
    if(/unsupported|not supported|不支持|尚未支持/i.test(message))return unavailable;
    if(/must |expected |invalid (?:parameter|input)|请输入|参数|必须.*(?:大于|小于|有限|数值)/i.test(message))return exact.get('PARAM_SCHEMA_INVALID');
    if(/contour|wire|闭合|轮廓|自交/i.test(message))return exact.get('OPEN_CONTOUR');
    if(/kernel|worker|内核/i.test(message))return exact.get('KERNEL_CRASHED');
    if(/geometry|boolean|fillet|chamfer|BRep|几何|布尔|圆角|倒角/i.test(message))return geometry;
  }
  return unknown;
}

export function errorRecovery(error={},receipt={}){
  const code=String(error.code||'UNCLASSIFIED_ERROR'),base=recoveryRule(code,String(error.message||''));
  const transport=code==='SERVICES_CONNECTION_UNKNOWN'?formatServicesTransportFailure(error):null;
  const logoFailure=error.details?.logoFailure,logoReason=businessReason(logoFailure?.reason),logoNext=businessReason(logoFailure?.next);
  const parameterReason=parameterErrorMessage(error),detail=transport?null:businessReason(error.message),reason=transport??logoReason??parameterReason??(detail?(base===unknown?detail:`${base.reason}${detail}`):base.reason);
  const commit=receipt.commitState??error.commitState??error.serviceCommitState;
  const uncertain=receipt.status==='unknown'||commit==='unknown'||base.reconcile===true;
  const partial=receipt.status==='partial'||receipt.atomic===false&&receipt.results?.some(step=>['committed','completed'].includes(step.result?.status));
  const notCommitted=['not_committed','notCommitted'].includes(commit);
  const committed=['committed','applied'].includes(commit);
  const preservation=uncertain?'执行结果尚未确认；请保留当前工程和原任务回执。':partial?'前面已提交的步骤仍保留，后续步骤已经停止；不要重建已成功部分。':notCommitted?'本次失败步骤未提交，先前已提交内容保留。':committed?'已有操作提交，请先核对当前工程与显示状态。':'请保留当前工程；是否已有提交须以原回执和状态为准。';
  const classification=uncertain?'reconcile':base.id;
  const next=transport?'用 getServicesRequest 查询原请求键；勿盲目重算，勿更换幂等键。':uncertain?'先按原任务或请求标识查询回执并与当前工程对账，确认前不要重放、换键或另起计算。':logoNext??base.next;
  const candidate=base.candidate===true&&!uncertain&&notCommitted&&error.budgetExhausted!==true;
  return {version:ERROR_RECOVERY_VERSION,code,classification,reason,preservation,next,scope:'failed-operation',agentMayContinue:true,
    userMessage:transport||(logoReason?`${reason}${next}`:`${reason}${preservation}${next}`),automaticRetry:false,
    retry:{allowed:false,condition:base.readRetry&&!uncertain?'仅重试只读画面/截图一次；不重做建模。':'原错误条件已明确修正、状态已对账且共享预算允许；不得自动重放。'},
    candidate:{eligible:candidate,allowed:false,mode:candidate?'evaluate-existing-preview-conditions':'blocked',requires:['known-not-committed','new-mechanism-evidence','shared-budget-available','supported-tool-contract','unchanged-design-intent'],commit:'only-after-valid-preview-and-explicit-task-authorization'},
    alternatives:{mode:'contract-compatible-only',readTools:uncertain?['getJob','getBatchReceipt','getServicesJob','getServicesRequest','getState']:base.tools,automaticFallback:false},
    stop:uncertain||base.hardStop===true||!candidate,guide:'api.error-recovery'};
}

const uiAudit=[];
const auditText=value=>String(value??'').slice(0,4096).replace(/((?:authorization|bearer|api[_ -]?key|token|cookie|password|secret|密钥|令牌|密码)\s*[:=]?\s*)[^\s,;]+/gi,'$1[redacted]');
// UI-only validation failures have no command receipt. Retain a bounded diagnostic
// record separately from rendered text. No CAD bytes, credentials, or persistent writes.
export function errorAuditSnapshot(){return structuredClone(uiAudit);}
export function humanError(error,receipt={}){
  const source=typeof error==='string'?{message:error}:error||{};
  debugJournal.record('ui','error',{error:source},'error');
  uiAudit.push({at:Date.now(),code:source.code??'UNCLASSIFIED_ERROR',message:auditText(source.message),...(source.path?{path:auditText(source.path)}:{}),...(source.requestId?{requestId:source.requestId}:{}),...(source.jobId?{jobId:source.jobId}:{})});
  if(uiAudit.length>100)uiAudit.shift();
  if(source.code==='SERVICES_CONNECTION_UNKNOWN')return formatServicesTransportFailure(source);
  const recovery=errorRecovery(source,receipt);
  // A UI validation message is not evidence of an unknown geometry commit.
  // Keep full recovery/receipt guidance on the API, without repeating it in
  // every field correction notice.
  if(!Object.keys(receipt).length&&!source.commitState&&!source.serviceCommitState){
    const specific=parameterErrorMessage(source)||businessReason(source.message);
    return specific||recovery.reason;
  }
  return recovery.userMessage;
}

// Preserve legacy code/message/path and receipt status for audit/backwards compatibility.
// Human-facing hosts must use userMessage; raw messages/stacks/paths are never interpolated here.
export function withErrorRecovery(receipt){
  if(!receipt||typeof receipt!=='object')return receipt;
  if(Array.isArray(receipt))return receipt.map(item=>withErrorRecovery(item));
  const prototype=Object.getPrototypeOf(receipt);if(prototype!==Object.prototype&&prototype!==null)return receipt;
  const result={...receipt};
  if(receipt.error&&typeof receipt.error==='object'){
    const recovery=errorRecovery(receipt.error,receipt);
    result.error={...receipt.error,userMessage:recovery.userMessage,recovery};
  }
  for(const key of ['results','result','attachment','saveConfirmation']){
    if(Array.isArray(receipt[key]))result[key]=receipt[key].map(item=>withErrorRecovery(item));
    else if(receipt[key]&&typeof receipt[key]==='object')result[key]=withErrorRecovery(receipt[key]);
  }
  return result;
}

export const ERROR_RECOVERY_GUIDE=`# 错误解释与恢复\n\nAgent 是独立助手。error.recovery 的 scope=failed-operation、stop 只约束当前失败操作，agentMayContinue=true；不表示停止对话、诊断、其他只读查询或整个任务。已有用户授权继续有效，修正合法参数、读取日志和恢复工具连接不需要再次请用户确认。\n\n失败先读 code、message、path 和提交状态，向用户简短说明具体问题与下一步。保留原始诊断供查询，不倾倒堆栈或凭证；不吞错或伪报成功。\n\n1. 参数或选取无效：按当前工具卡修正相关字段；不因一次格式错误结束任务。权限、来源、工程身份及完整性检查仅阻止不符合条件的操作。\n2. unknown/断线/超时：用原 getJob、getBatchReceipt、getServicesJob/getServicesRequest 查询回执。不新建 key 重放结果未知的写入；其他独立工作可继续。cancel 只是停止请求，本地超时提醒仍继续原任务。\n3. partial：前面成功的提交保留，只处理失败或未执行部分，不重建已成功部分。\n4. 几何候选沿已有 preview.start/update/cancel，在确认 not_committed、有明确修正依据、支持的工具与剩余共享预算时继续；preview.commit 沿用当前任务已获授权，不另加确认。不得擅改尺寸、孔、深度、R或精度。候选不重置共享预算。\n5. 工具不支持时可继续查询等价能力和诊断；来源、单位、孔和输出语义仍须保持。不得把网格当作精确 BRep，也不以另一个内核掩盖尚未实现的操作。\n6. 显示或文件传输失败不等于建模失败。核对 committed、display.rendered、generated/download_initiated/write_verified，只恢复相应显示或传输，不重新计算模型。\n\n恢复字段是建议，不自动重试、撤销或取消，不改变原 status/commitState。candidate.eligible 只说明可评估，candidate.allowed 不新增执行授权。未知错误先查真实原因，不声称静态清单穷举了动态第三方错误。`;

export function errorRecoveryCatalogDoc(){
  const groups=new Map();
  for(const code of sourceCodes.codes){const item=recoveryRule(code);if(!groups.has(item.id))groups.set(item.id,{item,codes:[]});groups.get(item.id).codes.push(code);}
  return ERROR_RECOVERY_GUIDE+'\n\n## 当前源码字面错误码映射\n\n此表由源码生产点/代码赋值扫描生成，包含少量同字段警告码；不把警告改为错误。每码对应下列原因和处理。原始message/path/report提供本次具体字段、失败阶段、边数、来源或能力缺口；先解释这些证据再回复用户。无code异常与动态第三方码另走保守分类，不能宣称完全枚举。\n\n'+[...groups.values()].map(({item,codes})=>`### ${item.id}\n\n${item.reason}\n\n${item.next}\n\n代码：${codes.map(code=>'`'+code+'`').join('、')}\n`).join('\n');
}
