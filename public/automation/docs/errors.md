# errors

Errors contain code,path,message,retryable,recoveryAction. A failure before commit has commitState=not_committed; unknown outcomes must preserve unknown status and cannot claim rollback.
PARAM_SCHEMA_INVALID / PARAM_RANGE_INVALID: correct the named field without silently changing requested dimensions.
UNKNOWN_OPERATION / OPERATION_VERSION_UNSUPPORTED / SCHEMA_MISMATCH / CAPABILITY_UNAVAILABLE: READ_TOOL_CONTRACT and check current runtime capabilities.
DOCUMENT_MISMATCH / INSTANCE_MISMATCH / REVISION_CONFLICT / STALE_REFERENCE / UNSAFE_LEGACY_REFERENCE: READ_STATE_AND_REPLAN; do not retry stale IDs or guess another face.
NO_MATCH / AMBIGUOUS_SELECTION / SELECTION_CONFLICT: refine or correct selection; never silently choose the first match.
GEOMETRY_INVALID / NO_MATERIAL_REMOVED: review geometry and explicit dimensions. No automatic radius or size reduction.
PREVIEW_ACTIVE / RESOURCE_LIMIT / IDEMPOTENCY_KEY_REUSED: resolve the reported constraint; do not change idempotency keys merely to bypass an uncertain result.
PERSISTENCE_FAILED / RESULT_UNKNOWN: distinguish committed memory from durable storage or unknown delivery. No durable guarantee in M1. When no automatic action exists, recoveryAction=NONE.
