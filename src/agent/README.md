# Optional remote Agent adapter

Current adapter v2 is exposed by the loaded page as window.webcad.agent.createHostAdapter.
Goldenluck hosts do not copy this folder. Connect publishes the canonical contract;
automation/remote-agent.json supplies the finite adapter/contract/host numeric planner,
bound to buildId/catalogHash/docsHash/contractHash and verified byte hashes.
Kernel recovery is a public, guarded job. Saving reads the last committed snapshot
independently of kernel readiness, running geometry and previews.

`createHostAdapter` accepts the current public WebCAD API, a server-issued document binding and an authenticated report capability. The Goldenluck workspace owns network requests and login; this package owns only bounded method dispatch and page-local receipts.

CAD tools, registries and Workers remain owned by the public page API. The modules can be served as plain ES modules by the host. They never evaluate model-provided JavaScript or open model-provided URLs. Every page method is explicitly supported or listed in `HOST_ONLY_METHODS` with its host-side responsibility; a contract test prevents silent omissions.

`receive(command)` queues a command; `report('ack'|'result',command,body)` sends its original hash and ID to the broker. `artifact(command,descriptor,bytes)` is an optional binary upload capability. Without it, an export remains generated in the page and is not reported as saved on the Agent.

`release/endTask` cancel queued jobs and request a running batch to stop after its current step. A synchronous kernel operation itself remains uninterruptible. Running jobs retain their identity for readback. `reconcilePending()` settles a previously unknown receipt from that original job, without replaying geometry. Hosts use `state().editing` and `onStateChange` to lock manual edits only during actual document-changing commands; thinking, discovery, reads and exports do not reserve the canvas. Terminal geometry receipts release the lock before network reporting or artifact transfer. Unknown editing results retain control until the original job is reconciled or the user takes over. Native page busy/revision checks still apply; every new edit must use fresh context because the user may have edited while the Agent was thinking. Server release revokes the old grant and frees ownership while preserving its ledger; reconnect never replays an old task.

There is no cumulative 100-command ceiling. Reported terminal receipts of ended tasks are compacted into replay guards; unresolved/unreported entries retain their original result and job. Re-delivery of an archived command cannot submit geometry again. Hosts must catch synchronous receive errors and retain a failure report before advancing their stream cursor.

For a native `files.save`, the adapter calls `files.confirmWritten` only after the host returns `agent_write_verified` with exactly matching size and SHA256. A later page revision cannot be marked saved by an older artifact. Confirmation failure preserves the verified server attachment and is reported separately.

The host must heartbeat the server binding, retry lost receipt reports, and explicitly release it when leaving. Revision checks remain in the public API. A restored result after a page reload is not inferred from the ledger. A run transfers each generated files.save/files.export step through the same verified artifact channel as standalone exports, including checkpoints committed before a later step fails. Results retain separate generation, attachment and save-confirmation receipts. The broker must accept artifacts from runs declaring these file steps.

Tests: `node --test tests/remote-agent-adapter.test.mjs`.
