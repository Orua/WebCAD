# api.error-recovery

# 错误解释与恢复

Agent 是独立助手。error.recovery 的 scope=failed-operation、stop 只约束当前失败操作，agentMayContinue=true；不表示停止对话、诊断、其他只读查询或整个任务。已有用户授权继续有效，修正合法参数、读取日志和恢复工具连接不需要再次请用户确认。

失败先读 code、message、path 和提交状态，向用户简短说明具体问题与下一步。保留原始诊断供查询，不倾倒堆栈或凭证；不吞错或伪报成功。

1. 参数或选取无效：按当前工具卡修正相关字段；不因一次格式错误结束任务。权限、来源、工程身份及完整性检查仅阻止不符合条件的操作。
2. unknown/断线/超时：用原 getJob、getBatchReceipt、getServicesJob/getServicesRequest 查询回执。不新建 key 重放结果未知的写入；其他独立工作可继续。cancel 只是停止请求，本地超时提醒仍继续原任务。
3. partial：前面成功的提交保留，只处理失败或未执行部分，不重建已成功部分。
4. 几何候选沿已有 preview.start/update/cancel，在确认 not_committed、有明确修正依据、支持的工具与剩余共享预算时继续；preview.commit 沿用当前任务已获授权，不另加确认。不得擅改尺寸、孔、深度、R或精度。候选不重置共享预算。
5. 工具不支持时可继续查询等价能力和诊断；来源、单位、孔和输出语义仍须保持。不得把网格当作精确 BRep，也不以另一个内核掩盖尚未实现的操作。
6. 显示或文件传输失败不等于建模失败。核对 committed、display.rendered、generated/download_initiated/write_verified，只恢复相应显示或传输，不重新计算模型。

恢复字段是建议，不自动重试、撤销或取消，不改变原 status/commitState。candidate.eligible 只说明可评估，candidate.allowed 不新增执行授权。未知错误先查真实原因，不声称静态清单穷举了动态第三方错误。

## 当前源码字面错误码映射

此表由源码生产点/代码赋值扫描生成，包含少量同字段警告码；不把警告改为错误。每码对应下列原因和处理。原始message/path/report提供本次具体字段、失败阶段、边数、来源或能力缺口；先解释这些证据再回复用户。无code异常与动态第三方码另走保守分类，不能宣称完全枚举。

### authorization

当前授权或访问范围不允许这项操作。

先通过现有设置完成登录或取得所需授权，再核对原请求；不要绕过权限或擅自上传来源。

代码：`action_not_allowed`、`AGENT_METHOD_DENIED`、`AUTH_CONFIG_REQUIRED`、`HOST_ACCESS_DENIED`、`HTTPS_REQUIRED`、`IIS_STORAGE_FORBIDDEN`、`LAN_ONLY`、`method_not_allowed`、`ORIGIN_FORBIDDEN`、`PERMISSION_REQUIRED`、`RECOVERY_AUTH_REQUIRED`、`scope_denied`、`SERVICES_AUTH_REQUIRED`、`UNAUTHORIZED`、`UPLOAD_AUTH_REQUIRED`

### unsupported

当前工具、宿主或执行端不支持这份来源与请求语义。

读取工具卡与实际能力；仅选择输入、输出、孔洞、尺寸和深度语义一致的已支持工具。没有等价工具时说明缺口并停止，不换核兜底。

代码：`ADAPTIVE_FAMILY_UNMATCHED`、`AGENT_COMPOSER_UNAVAILABLE`、`ANALYTIC_FAMILY_UNMATCHED`、`CAPABILITY_UNAVAILABLE`、`CONTINUITY_UNSUPPORTED`、`CONTINUOUS_SCULPT_UNAVAILABLE`、`DESIGN_CHECK_UNSUPPORTED`、`DOMAIN_SHAPE_UNSUPPORTED`、`END_ROUNDING_UNSUPPORTED`、`ENGINE_UNAVAILABLE`、`EVIDENCE_UNAVAILABLE`、`FORMAT_UNSUPPORTED`、`FORMAT_VARIANT_UNSUPPORTED`、`GUIDED_LOFT_BINDING_SHAPE_MISSING`、`GUIDED_LOFT_BINDING_SOURCE_UNSUPPORTED`、`HOST_UNAVAILABLE`、`LOCAL_VECTOR_UNSUPPORTED`、`LOFT_GUIDE_UNSUPPORTED`、`LOFT_POINT_CAP_UNSUPPORTED`、`MESH_BOOLEAN_UNAVAILABLE`、`MESH_BREP_UNAVAILABLE`、`MESH_COMBINATION_UNAVAILABLE`、`MESH_OPERATION_UNAVAILABLE`、`MESH_RECOVERY_UNAVAILABLE`、`MESH_TOOL_UNAVAILABLE`、`MESH_TOPOLOGY_UNAVAILABLE`、`NATIVE_ACCEPTANCE_INVALID`、`NATIVE_POLISHING_NETWORK_UNAVAILABLE`、`OPERATION_TBD`、`OPERATION_UNAVAILABLE`、`PDF_RENDERER_UNAVAILABLE`、`PIPELINE_OPTION_UNSUPPORTED`、`PROFILE_CONSTRAINT_UNSUPPORTED`、`PROJECT_SNAPSHOT_UNAVAILABLE`、`REFINE_UNSUPPORTED`、`RELIEF_PATCH_UNSUPPORTED`、`RELIEF_PLAN_UNSUPPORTED`、`RELIEF_SHOULDER_UNSUPPORTED`、`RELIEF_SOURCE_UNSUPPORTED`、`RELIEF_UNSUPPORTED`、`SCOPE_EXPANSION_REQUIRED`、`SELECTION_UNSUPPORTED`、`SERVICES_OPERATION_UNAVAILABLE`、`TARGET_PEAK_UNAVAILABLE`、`UNKNOWN_OPERATION`、`UNSUPPORTED_CURVE_PROJECTION`、`UNSUPPORTED_FORMAT`、`VARIABLE_FAMILY_UNMATCHED`、`VOLUME_UNAVAILABLE`、`WIDTH_FAMILY_UNMATCHED`

### preview

已有预览、编辑草稿、资源写入或计算占用当前操作。

先查看当前任务：继续原任务，或明确应用/取消草稿后再执行；不要自动关闭用户未完成编辑。

代码：`AGENT_PANEL_ACTIVE`、`KERNEL_BUSY`、`LOGO_WIZARD_BUSY`、`LOGO_WIZARD_CLOSED`、`PREVIEW_ACTIVE`、`RESOURCE_BUSY`、`UI_TASK_ACTIVE`

### host_connection

宿主、页面绑定或现有接口连接未建立。

核对所选页面和宿主实际脚本能力、已有连接配置；最多一次针对性重连，不能刷新未保存工程或建立替代服务。

代码：`AGENT_PANEL_FAILED`、`AGENT_PANEL_TIMEOUT`、`host_unavailable`、`PAGE_REQUIRED`、`ROUTE_NOT_FOUND`

### storage

存储、服务映射或连接配置当前不可用。

通过现有设置核对连接与存储；保留工程，向负责该环境的宿主请求处理，不建立替代服务或改写运行目录。

代码：`AGENT_URL_INVALID`、`DATA_ROOT_IN_USE`、`DATA_ROOT_INVALID`、`GATEWAY_CONFIG_INVALID`、`IIS_RUNTIME_UNAVAILABLE`、`LIBRARY_STORAGE_UNAVAILABLE`、`SERVICES_CONFIG_INVALID`、`SERVICES_CONFIG_REQUIRED`、`STORAGE_UNAVAILABLE`

### selection

选取范围没有唯一对应当前几何，或匹配数量不符合预期。

查询当前面、边及参考候选，明确目标与数量后再执行；不能猜选编号或自动扩大范围。

代码：`ALIGN_UNDERCONSTRAINED`、`AMBIGUOUS_CONTOUR`、`AMBIGUOUS_REFERENCE`、`AMBIGUOUS_SELECTION`、`LOCATION_NO_HIT`、`LOGO_SELECTION_INVALID`、`NO_MATCH`、`PROFILE_SELECTION_INVALID`、`RELIEF_SELECTION_AMBIGUOUS`、`ROUND_SELECTION_AMBIGUOUS`、`SELECTION_CONFLICT`、`SELECTION_COUNT_CHANGED`、`SELECTOR_EMPTY`、`SELECTOR_INVALID`、`SELECTOR_UNCERTAIN`、`TAP_BORE_AMBIGUOUS`

### integrity

来源、结果或缓存的身份、哈希、语义或几何校验未通过。

停止安装该结果，保留原件和诊断；核对原任务、来源、参数及发布版本，不能降级校验。

代码：`ARTIFACT_CORRUPT`、`ASSET_ROLE_MISMATCH`、`GEOMETRY_CODEC_MISMATCH`、`HASH_MISMATCH`、`LAYER_CACHE_CORRUPT`、`MESH_ASSET_CORRUPT`、`MESH_RESULT_MISMATCH`、`REFINE_GEOMETRY_CHANGED`、`RESULT_INVALID`、`RESULT_MISMATCH`、`ROUND_RADIUS_MISMATCH`

### resource

所需输入资源、结果文件或授权文件句柄已经失效或不可用。

保留原资源/任务标识；由宿主重新提供同一来源或重新取得已有工件与句柄，核对哈希后继续。

代码：`ARTIFACT_NOT_FOUND`、`ARTIFACT_UNAVAILABLE`、`ASSET_NOT_FOUND`、`HANDLE_REQUIRED`、`LIBRARY_ENTRY_NOT_FOUND`、`RESOURCE_EXPIRED`、`SERVICES_SOURCE_UNAVAILABLE`

### transfer

文件传输、工程编码或写入确认未完成。

区分已生成、已传输和已写盘；先取原工件或原回执，再仅恢复未完成的传输，不重算模型。

代码：`ARTIFACT_TRANSFER_FAILED`、`PROJECT_ENCODING_FAILED`、`PROJECT_ENCODING_MESSAGE_ERROR`、`PROJECT_ENCODING_SEND_FAILED`、`PROJECT_ENCODING_TIMEOUT`、`RESULT_REPORT_FAILED`、`SAVE_CONFIRMATION_FAILED`、`UPLOAD_FAILED`

### file

文件内容、格式转换、编码或工程结构未通过校验。

核对原文件真实格式与来源，使用受支持的导出格式重新提供；不要覆盖原文件或将解析失败当成空模型。

代码：`ASSET_INVALID`、`CONVERSION_FAILED`、`DOCUMENT_INVALID`、`FILE_COMMAND_FAILED`、`JSON_INVALID`、`LIBRARY_INVALID`、`LOGO_READ_FAILED`、`MALFORMED_FILE`、`PROJECT_FORMAT_INVALID`、`RELIEF_IMAGE_INVALID`、`VECTOR_INVALID`

### no_change

当前条件没有可应用的额外变化，或回执包含需要说明的状态。

读取原状态与报告确认实际结果；无需重复加工，不将“未变化”冒称新几何已生成。

代码：`AUTO_PLACED`、`BLEND_SKIPPED`、`CLEANUP_NOT_APPLICABLE`、`COLOR_IGNORED_BY_METAL_FINISH`、`LOGO_UNDO_EMPTY`、`NO_CHANGE`、`RELIEF_NO_CHANGE`

### schema

输入字段、类型、范围或坐标格式不符合当前工具契约。

读取对应完整工具卡，核对报错字段及实际单位后修正请求；保留原设计尺寸和加工意图。

代码：`BADGE_INVALID`、`FIT_INPUT_INVALID`、`FRAME_INVALID`、`GATEWAY_REQUEST_INVALID`、`HOST_CONTROL_INVALID`、`HOST_FRAME_INVALID`、`INVALID_INPUT`、`INVALID_OPTIONS`、`NAME_INVALID`、`PARAM_RANGE_INVALID`、`PARAM_SCHEMA_INVALID`、`REQUEST_INVALID`、`TYPE_MISMATCH`

### cancelled

这项操作已取消或在当前步骤后停止。

检查最终回执和仍保留的已提交步骤；取消请求不等于内核已停止，只有最终停止状态才能开始后续计算。

代码：`BATCH_CANCELLED`、`CANCELLED`、`JOB_CANCELED`、`JOB_CANCELLED`、`LOGO_READ_CANCELLED`、`PREVIEW_CANCELLED`、`SERVICES_JOB_CANCELLED`、`WORKER_CANCELLED`

### execution

执行链路返回失败，具体原因须结合本次阶段和诊断确认。

读取原错误的code、path、stage、report与逐步回执；先核对提交状态，仅修复已证实的原因。不要自动重算或把未知失败归咎于模型。

代码：`BATCH_FAILED`、`HOST_FAILED`、`JOB_EXECUTION_FAILED`、`SERVICES_JOB_FAILED`、`SERVICES_REQUEST_FAILED`、`TEXT_COMMAND_FAILED`、`UPGRADE_FAILED`

### geometry

候选几何未通过构造、有效性或来源保持检查。

读取本次阶段与诊断并检查来源；只在确认未提交、有新机制证据和剩余预算时，通过现有 preview.start/update/cancel 评估一个候选。保留尺寸、图案、深度与R。

代码：`BLEND_RADIUS_INFEASIBLE`、`CLOSED_GRINDING_CHAIN_REJECTED`、`GEOMETRY_CONFLICT`、`GEOMETRY_FAILED`、`GEOMETRY_INVALID`、`GRINDING_STRIP_REJECTED`、`MESH_BOOLEAN_INVALID`、`REFINE_FAILED`、`RELIEF_GEOMETRY_INVALID`、`RELIEF_INTERSECTION`、`RELIEF_MULTIVALUED`、`RELIEF_NOT_CLOSED`

### unclassified

操作未能完成，目前没有足够证据确定安全恢复方式。

保留当前工程与原始错误回执，先检查提交和任务状态；将明确的失败原因及需要的下一项信息告知用户。

代码：`BUSY`、`EVIDENCE_INVALID`、`EVIDENCE_QUEUE_FULL`、`EVIDENCE_RENDER_FAILED`、`EVIDENCE_SIZE_LIMIT`、`EVIDENCE_SUPERSEDED`、`EXECUTION_UNKNOWN`、`IDEMPOTENCY_CONFLICT`、`MATERIAL_IN_USE`、`MEASUREMENT_FAILED`、`PREPARATION_APPLIED`、`PREPARATION_STALE`、`PROJECT_ENCODING`

### display

画面或截图未能确认与已提交模型一致。

读取提交回执和当前状态，再尝试一次 redraw 或 capture；只报告画面未确认，不要重新执行建模。

代码：`CAPTURE_TIMEOUT`、`DISPLAY_FAILED`、`DISPLAY_INCOMPLETE`、`DISPLAY_REFINEMENT_FAILED`、`DISPLAY_VOLUME_MISMATCH`、`STALE_DISPLAY`、`UNSUPPORTED_RENDER_FEATURE`

### version

页面、文档、文件或后端协议版本不兼容。

重新握手并读取匹配版本的完整契约；工程先保存，不能用旧包或旧编号继续写入。

代码：`CATALOG_CHANGED`、`DOCUMENT_VERSION_UNSUPPORTED`、`KERNEL_BUILD_CHANGED`、`OPERATION_VERSION_UNSUPPORTED`、`RELIEF_EDIT_VERSION`、`SCHEMA_MISMATCH`、`SERVICES_MIGRATION_REQUIRED`、`SERVICES_PROTOCOL_MISMATCH`

### capacity

输入、结果、工程或客户端承载超过这条实际链路的容量。

读取对应容量限制，按来源允许的部件/工程拆分或释放无用资源；不能自动减细节、降精度或改用另一内核。

代码：`CHECKPOINT_CLIENT_CAPACITY`、`CONTOUR_TOO_COMPLEX`、`FILE_TOO_LARGE`、`GEOMETRY_SOURCE_LIMIT`、`IMPORT_TOO_LARGE`、`LOFT_COMPLEXITY`、`MESH_DISPLAY_CAPACITY`、`MESH_SIZE_LIMIT`、`PROFILE_CONSTRAINT_LIMIT`、`REFINE_LIMIT`、`RELIEF_EDIT_CAPACITY`、`RELIEF_LIMIT`、`RELIEF_PLAN_LIMIT`、`RESOURCE_LIMIT`、`RESULT_TOO_LARGE`、`RESULT_TOO_LARGE_FOR_CLIENT`、`SIZE_LIMIT`、`SOURCE_BUDGET_EXCEEDED`

### dispatch

命令在进入CAD执行前已超过派发期限，尚未提交页面作业。

保留原命令回执，核对连接和当前工程状态；确认未提交并恢复连接后，才处理尚未执行的步骤。

代码：`COMMAND_EXPIRED`

### sequence

这组依赖需要按已提交的当前结果顺序执行。

核对前序已提交步骤，仅把未完成部分按依赖顺序规划为有界步骤。

代码：`COMPLEX_BATCH_REQUIRES_SEQUENTIAL`、`SERIAL_REBUILD_REQUIRED`

### binding

请求引用的工程、版本、来源或定位已变化。

读取当前状态与来源，重新查询引用并重规划尚未完成的步骤；不要沿用旧面边编号。

代码：`COORDINATE_MODE_CONFLICT`、`DOCUMENT_MISMATCH`、`FRAME_SURFACE_MISMATCH`、`INSTANCE_MISMATCH`、`LIBRARY_REVISION_CONFLICT`、`LOGO_REVIEW_STALE`、`MACHINING_SOURCE_CONFLICT`、`RECOVERY_INPUT_CHANGED`、`REVISION_CONFLICT`、`SELECTOR_CONTEXT_REQUIRED`、`SELECTOR_CONTEXT_STALE`、`SOURCE_ANCHOR_INVALID`、`SOURCE_HASH_MISMATCH`、`STALE_REFERENCE`、`TOPOLOGY_REFERENCE_STALE`

### source_parameters

此来源或工具参数组合不满足几何输入条件。

读取对应工具卡和报错阶段，复核来源截面、路径、支撑及参数关系；先修正已证实的输入问题，不能用试错改变设计。

代码：`DEGENERATE_PROJECTION`、`FIT_DEGENERATE`、`HEIGHTFIELD_INVALID`、`HEIGHTFIELD_SCULPT_INVALID`、`MESH_CODEC_INVALID`、`MESH_INDEX_INVALID`、`MESH_NONFINITE`、`MESH_NOT_MANIFOLD`、`MESH_REPORT_INVALID`、`MESH_SOURCE_CLASSIFICATION_REQUIRED`、`MESH_SOURCE_INVALID`、`MESH_TRANSFORM_INVALID`、`PROFILE_CAPACITY`、`PROFILE_EDIT_INVALID`、`PROFILE_EXTRUDE_INVALID`、`PROFILE_INVALID`、`PROFILE_LOFT_INVALID`、`PROFILE_OFFSET_INVALID`、`PROFILE_OUTSIDE`、`PROFILE_REPAIR_INVALID`、`PROFILE_REVOLVE_INVALID`、`PROFILE_SWEEP_INVALID`、`PROJECTION_INVALID`、`RELIEF_CURVE_DEVIATION`、`RELIEF_CURVE_TOPOLOGY_INVALID`、`RELIEF_DEFORMATION_INVALID`、`RELIEF_DESIGN_INTENT_REQUIRED`、`RELIEF_DESIGN_PLACEMENT_REQUIRED`、`RELIEF_DESIGN_STALE`、`RELIEF_DESIGN_TARGET_REQUIRED`、`RELIEF_DESIGN_UNSOLVED`、`RELIEF_FIELD_INVALID`、`RELIEF_INVALID`、`RELIEF_LAYERS_INVALID`、`RELIEF_PATCH_INVALID`、`RELIEF_PLATE_INVALID`、`RELIEF_PROFILE_INVALID`、`RELIEF_REGION_INVALID`、`RELIEF_SHOULDER_INVALID`、`RELIEF_SUPPORT_INVALID`

### design_check

指定设计检查未通过，或现有证据不足以证明满足要求。

读取逐项检查和未验证项，修正已证实的问题；不能把有效实体或工具执行成功当成设计验收。

代码：`DESIGN_CHECK_INCONCLUSIVE`、`DESIGN_REQUIREMENTS_NOT_MET`

### design-capacity

设计场的采样数量或求解工作量超过当前范围。

读取数值场工具的采样与迭代上限，保留草稿；不要自动降低用户要求的造型精度。

代码：`DOMAIN_CAPACITY`、`FIELD_CAPACITY`、`PIPELINE_CAPACITY`

### design-constraints

毫米高度点、支撑、孔或保护区域的约束无法同时应用。

检查点位是否在有效支撑内并避开孔和保护区，核对最低/最高高度；只修订明确冲突的约束，不自动移动点或删除保护。

代码：`DOMAIN_CONSTRAINT_CONFLICT`、`DOMAIN_EMPTY`、`DOMAIN_HARD_POINT_NOT_ON_GRID`、`DOMAIN_HARD_POINT_OUTSIDE`、`DOMAIN_INVALID`、`FIELD_CONSTRAINT_CONFLICT`、`FIELD_EMPTY_DOMAIN`、`FIELD_INPUT_INVALID`、`FIELD_SAMPLE_OUTSIDE`、`FIELD_UNANCHORED`、`LOCAL_EDIT_BOUNDS`、`LOCAL_EDIT_CONSTRAINT_CONFLICT`、`LOCAL_EDIT_EMPTY_DOMAIN`、`LOCAL_EDIT_INVALID`、`LOCAL_EDIT_OUTSIDE`、`PIPELINE_INVALID`

### design-cancel

本次数值求解或局部编辑已停止。

保留已保存设计；需要继续时先读取当前草稿和任务状态，不自动重新求解。

代码：`FIELD_CANCELLED`、`LOCAL_EDIT_CANCELLED`、`PIPELINE_CANCELLED`

### design-solve

本次数值求解未取得满足停止条件的有效结果。

保留草稿，读取本次残差和工作量报告；先查具体约束或Worker故障，不将未收敛的场提交为模型。

代码：`FIELD_FAILED`、`FIELD_NOT_CONVERGED`、`FIELD_NUMERICAL`、`FIELD_TIMEOUT`、`FIELD_WORKER_FAILED`

### design-fit-cancel

数值拟合已停止。

原已解设计场保留；读取当前拟合状态，不自动重启。

代码：`FIT_CANCELLED`

### design-fit-capacity

拟合的采样、控制网格或数值工作量超出当前范围。

核对显式控制数与原场采样及容量；保留设计，不自动降低精度、改变误差或重试耗尽任务。

代码：`FIT_CAPACITY`、`FIT_UNDERSAMPLED`、`FIT_WORK_BUDGET`

### design-fit-constraints

当前高度方向、支撑或保护约束与拟合条件不一致。

读取原设计、baseline及受保护极点报告；不能删孔、放松保护或翻转高度来通过。

代码：`FIT_CONSTRAINT_CONFLICT`、`FIT_DIRECTION_CONFLICT`、`FIT_DOMAIN_CONFLICT`、`FIT_DOMAIN_EMPTY`、`FIT_DOMAIN_UNSUPPORTED`、`FIT_NO_FREEDOM`、`FIT_PARAMETER_OUTSIDE`、`FIT_SOURCE_INVALID`

### design-fit-quality

本次拟合未达到明确误差、保护或求解条件。

保留原设计场和实际诊断，不提交为实体；先核对误差与约束，不能自动修改容差或换算法重算。

代码：`FIT_DEVIATION`、`FIT_FAILED`、`FIT_NOT_CONVERGED`、`FIT_PROTECTION_FAILED`、`FIT_TIMEOUT`、`FIT_WORKER_FAILED`、`NUMERICAL_RESULT_MISMATCH`

### guided_loft

导引放样的来源绑定、截面、引导或接合条件未成立。

核对当前来源截面、引导路径和匹配条件；仅支持卡片公布的范围，不用近似面替代实体或绕过来源绑定。

代码：`GUIDED_LOFT_BINDING_ANCHOR_UNFROZEN`、`GUIDED_LOFT_BINDING_FEATURE_INVALID`、`GUIDED_LOFT_BINDING_FRAME_INVALID`、`GUIDED_LOFT_BINDING_REFS_INVALID`、`GUIDED_LOFT_BINDING_SOURCE_INVALID`、`GUIDED_LOFT_BUILD_FAILED`、`GUIDED_LOFT_CAP_FAILED`、`GUIDED_LOFT_CURVE_FAILED`、`GUIDED_LOFT_FIT_TOLERANCE`、`GUIDED_LOFT_GUIDE_DUPLICATE`、`GUIDED_LOFT_GUIDE_OFF_PROFILE`、`GUIDED_LOFT_GUIDE_REORDERED`、`GUIDED_LOFT_INVALID_BREP`、`GUIDED_LOFT_INVALID_CONDITION`、`GUIDED_LOFT_INVALID_FRAME`、`GUIDED_LOFT_INVALID_GUIDES`、`GUIDED_LOFT_INVALID_INPUT`、`GUIDED_LOFT_INVALID_MATCH`、`GUIDED_LOFT_INVALID_PROFILE`、`GUIDED_LOFT_INVALID_SECTIONS`、`GUIDED_LOFT_INVALID_SOLID`、`GUIDED_LOFT_INVALID_TOLERANCE`、`GUIDED_LOFT_MATCH_BREP_MISMATCH`、`GUIDED_LOFT_MATCH_CONTEXT_REQUIRED`、`GUIDED_LOFT_MATCH_JET_INVALID`、`GUIDED_LOFT_MATCH_RECIPE_INVALID`、`GUIDED_LOFT_MATCH_REQUIRED`、`GUIDED_LOFT_MATCH_SECTION_MISMATCH`、`GUIDED_LOFT_MATCH_SOURCE_UNCONFIRMED`、`GUIDED_LOFT_NO_OCCT`、`GUIDED_LOFT_PATCH_FAILED`、`GUIDED_LOFT_PIPE_FAILED`、`GUIDED_LOFT_PROFILE_OPEN`、`GUIDED_LOFT_SEW_FAILED`、`GUIDED_LOFT_SINGLE_MATCH_LIMIT`、`GUIDED_LOFT_SOLID_FAILED`

### precision

所需误差、精度或来源形状保持条件未达到。

保留来源与原精度；检查来源测量和工具支持范围，只有用户明确同意的新要求才可另定精度或尺寸。

代码：`GUIDED_LOFT_CIRCULAR_RADIUS_CHANGE`、`GUIDED_LOFT_GUIDE_DEVIATION`、`MESH_BOOLEAN_PRECISION_LIMIT`、`MESH_EXPORT_PRECISION`、`RELIEF_RESOLUTION_INSUFFICIENT`、`TOLERANCE_UNACHIEVABLE`

### history

历史或下游特征依赖无法安全对应修改后的拓扑。

读取受影响特征，重新明确真实引用；不得擅删后续步骤。撤销只用于已核对的本次提交。

代码：`HISTORY_INVALID`、`PARALLEL_DEPENDENCY_MISSING`、`UNSAFE_LEGACY_REFERENCE`

### manual_lock

当前页面的人工编辑由正在执行的Agent控制暂时锁定。

等待原控制任务完成或通过既有控制入口释放编辑权；不要绕过锁定。

代码：`HOST_INTERACTION_LOCKED`

### reconcile

原任务的执行或提交结果尚未确认。

按原 jobId、请求键或批次标识查询状态并与当前工程对账；确认前不要重放、换键或另起计算。

代码：`HOST_INTERRUPTED`、`HOST_TIMEOUT`、`JOB_NOT_FOUND`、`JOB_RESULT_UNAVAILABLE`、`JOB_TIMEOUT`、`OBSERVATION_CANCELLED`、`PREVIOUS_ATTEMPT_UNKNOWN`、`receipt_unavailable`、`RECOVERY_RESULT_UNRESOLVED`、`REQUEST_NOT_FOUND`、`RESULT_NOT_READY`、`RESULT_UNKNOWN`、`SERVICE_STOPPING`、`SERVICES_CONNECTION_UNKNOWN`、`TIMEOUT`

### idempotency

请求标识已绑定另一份参数。

先取原回执并核对是否已提交；只有明确修订后的剩余请求才使用新标识。

代码：`idempotency_conflict`、`IDEMPOTENCY_KEY_REUSED`

### units

尺寸单位、加工意图、来源准备或恢复依据尚未明确。

补齐来源支持的毫米尺寸、凸凹方向、深度与明确策略；混合图案先拆分明确加工计划，照片先准备受支持高度/矢量来源，不能从亮度、文件名或默认值猜测。

代码：`INTENT_CONFLICT`、`MACHINING_INTENT_CONFLICT`、`MACHINING_INTENT_REQUIRED`、`MESH_UNITS_REQUIRED`、`MIXED_PLAN_REQUIRED`、`PARAM_UNIT_MISMATCH`、`RECOVERY_REASON_REQUIRED`、`RELIEF_UPGRADE_STRATEGY_REQUIRED`、`SIZE_REQUIRED`、`SOURCE_PREPARATION_REQUIRED`

### contour

来源轮廓存在未闭合、孔归属、交叠、自交或描摹拓扑问题。

核对原图与可读中间轮廓；明确修正真实轮廓，保留孔与尺寸，不自动填洞、删细节或扩大容差。

代码：`INVALID_CONTOUR`、`INVALID_HOLE`、`LOGO_CONTOUR_INVALID`、`LOGO_EMPTY`、`LOGO_MIN_VERTICES`、`NO_VECTOR_CONTENT`、`OPEN_CONTOUR`、`RASTER_SMOOTHING_TOPOLOGY`、`RASTER_TOPOLOGY_AMBIGUOUS`、`REGIONS_TOUCH_OR_OVERLAP`、`SELF_INTERSECTION`

### kernel

几何内核或受控工作进程未能完成当前计算。

先保存最后已提交工程并核对原任务；本地内核确实不可用时才 recoverKernel，不刷新页面、不重放未知命令。

代码：`KERNEL_BUILD_FAILED`、`KERNEL_CRASHED`、`KERNEL_RECOVERY_REQUESTED`、`KERNEL_START_TIMEOUT`、`KERNEL_TIMEOUT`、`MESH_WORKER_FAILED`、`NATIVE_WORKER_FAILED`、`WORKER_FAILED`、`WORKER_MESSAGE_ERROR`、`WORKER_SEND_FAILED`、`WORKER_TERMINATED`、`WORKER_TIMEOUT`、`WORKER_UNAVAILABLE`

### budget

此前相同输入的任务未成功，本次未重新计算。

查看原任务的具体错误；LOGO 识别任务确认已停止后，可重新点击识别。其他建模任务须先核对失败原因和当前工程。

代码：`KNOWN_INPUT_FAILED`、`PREVIOUS_ATTEMPT_FAILED`

### host-control

页面控制权或当前任务绑定已结束或改变，并不等于登录到期。

核对原任务、原命令和当前页面绑定；通过宿主重新连接原工程，结果未知时不得换键重画。

代码：`lease_revoked`、`task_binding_mismatch`、`task_ended`

### material

操作没有产生要求的材料变化，或厚度/材料余量未被证明。

检查目标、刀具、方向、截面、深度及实际厚度；只以原参数做受控预览，不能通过改变尺寸凑成功。

代码：`LOFT_VOLUME_MISMATCH`、`MATERIAL_CHECK_FAILED`、`MESH_BOOLEAN_EMPTY`、`NO_MATERIAL_ADDED`、`NO_MATERIAL_REMOVED`、`RELIEF_THICKNESS`、`RELIEF_THICKNESS_UNKNOWN`、`TAP_MATERIAL_INSUFFICIENT`

### logo-render

PDF页面渲染或渲染底图校验未通过。

保留原文件，核对页码、服务端渲染能力与原作业报告；可以提供同一图案的受支持矢量文件，不自动替换内容。

代码：`LOGO_RENDERED_IMAGE_INVALID`、`PDF_RENDER_FAILED`

### review

图案轮廓或加工来源尚未确认。

检查同一稿件的原图、孔洞、毫米尺寸与加工深度，明确确认后才生成加工特征。

代码：`LOGO_REVIEW_REQUIRED`、`LOGO_SOURCE_REQUIRED`、`MACHINING_SOURCE_REQUIRED`

### parameters

命名参数存在循环、无效表达式或绑定冲突。

检查参数依赖与引用路径，修改原参数定义；不要绕过绑定另写一个尺寸。

代码：`PARAM_CYCLE`、`PARAM_EXPRESSION_INVALID`、`PARAM_PATH_INVALID`、`PARAM_UNDEFINED`、`PARAMETER_BOUND`

### placement

这项操作不接受当前定位方式。

读取工具定位契约，沿来源冻结坐标执行加工；不能叠加当前锚点造成错位。

代码：`PLACEMENT_NOT_APPLICABLE`

### constraints

约束、保护区域或锁定规则与这次修改冲突。

读取实际约束与保护区，明确修改哪一项条件；不能自动解除锁定、删除孔或覆盖保护区域。

代码：`PROFILE_CONSTRAINT_CONFLICT`、`PROFILE_CONSTRAINT_GEOMETRY_INVALID`、`PROFILE_CONSTRAINT_INVALID`、`PROFILE_CONSTRAINT_NUMERICAL`、`PROFILE_CONSTRAINT_UNSATISFIED`、`REFERENCE_LOCKED`、`RELIEF_BOUNDARY_CONFLICT`、`RELIEF_CONSTRAINT_CONFLICT`、`RELIEF_CONSTRAINT_INVALID`、`RELIEF_DESIGN_PROTECTED`、`RELIEF_PATCH_PROTECTION`

### project-store

当前工程的本地存储写入失败。

保留当前页面工程，先检查浏览器存储和原保存回执；不能宣称已保存或自动重算几何。

代码：`PROJECT_STORE_FAILED`

### recovery-denied

此任务不能从中断位置恢复。

查看原任务状态和失败原因；已完成或已停止的任务不能当作可恢复任务继续。

代码：`RECOVERY_NOT_ALLOWED`

### recovery-active

上一任务的计算进程仍在运行。

等待原任务完成，或停止原任务并确认结束后再操作。

代码：`RECOVERY_WORKER_ACTIVE`

### design-base

设计高度会穿过底板背面。

核对最低设计高度与底厚，明确修订后重新生成候选；不自动抬高或削平原设计。

代码：`RELIEF_DESIGN_BASE_INTERSECTION`

### design-fit-brep-binding

拟合与支撑面、放置或掩码的绑定不再一致。

重新读取当前工程，重新选择真实平面并重新准备；不沿用旧面编号，不放宽绑定或改用其他轮廓策略。

代码：`RELIEF_DESIGN_BINDING_INVALID`、`RELIEF_DESIGN_MASK_BLOCKED`、`RELIEF_DESIGN_SOURCE_CHANGED`、`RELIEF_DESIGN_SUPPORT_INVALID`

### design-boundary

当前采样尚不能完整保留支撑边界或贯穿孔。

查看采样间距与边界报告，在允许范围内提高采样分辨率；孔仍无法分离时保留草稿，不自动填孔或更换底板。

代码：`RELIEF_DESIGN_DOMAIN_EMPTY`、`RELIEF_DESIGN_DOMAIN_NONMANIFOLD`、`RELIEF_DESIGN_DOMAIN_TOPOLOGY_CHANGED`

### design-mask

浮雕范围数据与当前采样网格不一致。

重新读取同一设计草稿并求解，保留孔与支撑边界；不要手工填补或丢弃掩码。

代码：`RELIEF_DESIGN_MASK_INVALID`

### outside

操作点、深度或加工范围未落在允许的实际目标区域。

重新测量当前目标与局部坐标，明确位于材料/支撑范围内的位置；保留原深度与图案比例。

代码：`RELIEF_DESIGN_OUTSIDE`、`RELIEF_OUTSIDE_FACE`、`RELIEF_SAMPLE_OUTSIDE`、`RELIEF_TARGET_OUTSIDE`、`SUBD_BRUSH_NO_HIT`、`TAP_DEPTH_INVALID`、`TAP_POINT_INVALID`

### relief-services-required

临时控制网需要 Services 完成首次拟合。

保留当前设计并检查 Services 能力；如需本地执行，由用户明确选择浏览器拟合后重新准备。

代码：`RELIEF_DESIGN_SERVICES_REQUIRED`

### relief-reference

浮雕原参考图不存在、已改变或未通过原件校验。

读取当前设计草稿与已登记原图资源；核对真实图片格式、SHA256、大小和解码结果。原图仅供参考，不能按照片明暗自动生成高度。

代码：`RELIEF_REFERENCE_INVALID`、`RELIEF_REFERENCE_MISSING`

### relief-services-response

Services 浮雕响应与请求、哈希或误差不一致。

保留当前工程，核对原任务与返回产物；不提交、不自动重算或回退。

代码：`SERVICES_RESPONSE_INVALID`

### wait

后台计算需要明确等待决定，或原等待决定已经过期。

查询原任务并选择继续等待同一作业或受控停止；不自动重新提交。

代码：`SERVICES_WAIT_DECISION_REQUIRED`、`SERVICES_WAIT_NOT_PENDING`

### unsaved

当前工程尚未保存或不能同时替换多个工程。

先通过文件接口保存当前已提交工程，再由用户明确选择打开或新建。

代码：`UNSAVED_REPLACEMENT`


Context policy: none = no document context; identity = sessionId/documentId/documentInstanceId (revision ignored); revision = sessionId/documentId/documentInstanceId plus current expectedRevision. For writes use api.createRequestContext(), connect().requestContext or the last successful receipt nextContext/requestContext. getState().context contains revision; do not pass it unchanged as a revision-protected write context.
reliefWizard: contextPolicy=identity
prepareToolCall: contextPolicy=identity
prepareOperation: contextPolicy=identity
applyPreparedOperation: contextPolicy=identity
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
