# Contributing / 参与贡献

WebCAD focuses on quickly modeling, checking and delivering final geometry and STEP files. Keep changes scoped to a concrete operation or workflow. Read [PROJECT.md](PROJECT.md) for architecture and [build instructions](docs/BUILD.md) for local setup.

1. Create a topic branch from the agreed base. Keep unrelated working changes intact.
2. Explain the trigger, expected behavior, actual result and affected tools. Use a small synthetic example you are allowed to publish.
3. Update affected public contracts, UI descriptions and documentation together. Generated discovery files must come from their existing generators.
4. Run checks directly relevant to the change. Separate deterministic tests, browser acceptance, real model testing and deployment; report anything not run.
5. Submit a PR with its base/head, changes, validation, limitations and rollback. Do not include local paths, internal handoffs, screenshots of private projects, generated archives, build outputs or backups.

Do not submit credentials, cookies, personal data, customer drawings, brand artwork or real product identifiers. See [SECURITY.md](SECURITY.md) before sharing a diagnostic report.

## Sources and licenses

Identify the source and exact version of copied or adapted code, text, fonts, textures and samples. Retain upstream copyright, license and notice text; describe modifications and applicable distribution scopes in the [source/license map](docs/compliance/source-license-map.json). AI assistance is separate from provenance and does not establish ownership or permission. New dependencies require actual module-graph and binary-source review when applicable.

Submit only material you are authorized to contribute. The project currently has unresolved authorization for some new application code; this document does not select a new license, introduce a contributor agreement or grant rights on behalf of contributors. See [the pending decision](docs/compliance/LICENSE_DECISION.md).

## PR contents

Include the problem and resulting behavior, source/license changes, relevant commands and actual results, untested cases and rollback. Permission-sensitive changes require evidence for the intended boundary. Publication remains blocked until the applicable distribution gate passes. Please do not report a skipped browser or real-model test as successful.
