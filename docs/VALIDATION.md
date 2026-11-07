# Validation / 验证口径

Record the reviewed commit and actual environment for every result. Keep four independent states: code implemented, automated checks passed, real model accepted, deployment accepted. A missing capability or skipped run is `NOT_RUN` or `BLOCKED`, never a pass.

| Layer | Entry | What it establishes |
| --- | --- | --- |
| License policy | `node --test scripts/license-policy.test.mjs` | Scope isolation, unknown dependencies/media and version/license changes fail closed; documentation links resolve |
| Open-source integrity | `node --test scripts/open-source.test.mjs` | Installed package notices, module collection, runtime hashes and source-snapshot tampering checks |
| Candidate build | `npm ci` then `npm run build` | Locked installation and the existing build/release-integrity gate |
| Publication | `node scripts/verify-public-release.mjs dist public-web` | Existing release-integrity checks plus applicable reviewed evidence; unknown or changed files remain blocked outside the reviewed scope |
| Contracts / kernel | `npm run test:contracts`, `npm run test:kernel` | Relevant deterministic contracts/geometry, subject to each suite's prerequisites |
| Browser workflow | [Quick start](QUICKSTART.md) | Actual page creation, modification, save/reopen and precise STEP round trip |
| Real Agent | Frozen benchmark and independent oracle | Actual model + authorized page execution + independently checked geometry; not simulated receipts |
| Deployment | [Public deployment checklist](PUBLIC-DEPLOYMENT.md) | Same candidate installed, anonymous boundary and protected functions checked |

Use targeted checks for the changed behavior. Browser suites may have hosting prerequisites; do not start a new server where local policy prohibits it. Use a dedicated blank project on the authorized existing site, preserve user projects, and coordinate publishing the candidate before testing it. Testing an old site's build does not validate a new source candidate.

The new checker uses in-memory policy fixtures for its negative tests; those are policy tests, not real CAD/model results. Existing integrity tests mutate isolated test copies of notices, WASM and source ZIPs. Neither test family proves native source reproducibility or legal compliance. Clean native reconstruction, runtime replacement and external publication require their own records.

## Recovery validation updates

- Original 20 synthetic cases retain separate tool-level and autonomous-model results. The last five surface/solid cases were independently planned by native Codex sessions, with original STEP, actual STEP reimport/re-export and final project cold-reopen checks. Earlier model evidence is retained rather than relabeled as the same model or same build. This is bounded synthetic coverage, not general manufacturing approval.
- A retained profile face in a final-state project exposed an incorrect forced 3D import cast. Real cold restore of that original project and direct solid/mesh/import-history regressions now pass.
- Performance recovery no longer requires high CPU submission after load has improved. Busy deferral no longer consumes the first display action. Original failure stimuli, the low-CPU control and manual-lock/document-change cases pass against the actual runtime modules; these deterministic inputs are not measured browser frame data. Historical frame improvements retain their individual fixture and setup-cost limits.
- Actual anonymous production creation/edit/undo/save/cold reopen and STEP round trip pass in fresh contexts, with no private/model startup requests or page errors. The public policy collected a valid 683-sample normal-load window without Agent access. This does not establish a newly calibrated full G5 overhead/recovery benchmark.
- Anonymous computation checks cover signed expiry/tamper, persistent resource/job/idempotency isolation, quotas, cancellation-before-cleanup and preservation of internal data. A real controlled Logo worker produces a verified one-hole result for its owner; a second visitor cannot cancel or download it. Actual local and production IIS cookies, real worker output/hash/hole structure and cross-visitor negatives now pass. Internal business authentication remains enforced.

Relevant commands: `node --test tests/performance-runtime.test.mjs tests/performance-preparation.test.mjs tests/performance-api.test.mjs tests/performance-quality-install.test.mjs`, `node --test tests/services-settings.test.mjs tests/services-handshake.test.mjs tests/public-edition.test.mjs`, and `tests/services-anonymous.ps1 -RuntimeDirectory <built-gateway-directory> -DataRoot <fresh-fixed-disk-test-directory> -LogoWorker <built-worker-executable>`. Do not create a second HTTP test server or use synthetic timing as browser performance evidence.

Final native Codex verification also restored 300 bodies/300 solids with total volume 57600 mm³ and original positions/appearance/materials. S11 restored both its retained construction face and final solid. A separate OCP process read the actual basic STEP, cold STEP and S11 solid, checking validity, counts, bounds, volumes and cylindrical supports. Manual mode disables automatic display changes; switching back to auto preserves geometry/revision/dirty. It does not disable collection of frame samples.
