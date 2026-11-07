# Validation / 验证口径

Record the reviewed commit and actual environment for every result. Keep four independent states: code implemented, automated checks passed, real model accepted, deployment accepted. A missing capability or skipped run is `NOT_RUN` or `BLOCKED`, never a pass.

| Layer | Entry | What it establishes |
| --- | --- | --- |
| License policy | `node --test scripts/license-policy.test.mjs` | Scope isolation, unknown dependencies/media and version/license changes fail closed; documentation links resolve |
| Open-source integrity | `node --test scripts/open-source.test.mjs` | Installed package notices, module collection, runtime hashes and source-snapshot tampering checks |
| Candidate build | `npm ci` then `npm run build` | Locked installation and the existing build/release-integrity gate |
| Publication | `node scripts/verify-public-release.mjs dist public-web` | Existing release-integrity checks plus applicable reviewed evidence; current policy intentionally blocks publication |
| Contracts / kernel | `npm run test:contracts`, `npm run test:kernel` | Relevant deterministic contracts/geometry, subject to each suite's prerequisites |
| Browser workflow | [Quick start](QUICKSTART.md) | Actual page creation, modification, save/reopen and precise STEP round trip |
| Real Agent | Frozen benchmark and independent oracle | Actual model + authorized page execution + independently checked geometry; not simulated receipts |
| Deployment | [Public deployment checklist](PUBLIC-DEPLOYMENT.md) | Same candidate installed, anonymous boundary and protected functions checked |

Use targeted checks for the changed behavior. Browser suites may have hosting prerequisites; do not start a new server where local policy prohibits it. Use a dedicated blank project on the authorized existing site, preserve user projects, and coordinate publishing the candidate before testing it. Testing an old site's build does not validate a new source candidate.

The new checker uses in-memory policy fixtures for its negative tests; those are policy tests, not real CAD/model results. Existing integrity tests mutate isolated test copies of notices, WASM and source ZIPs. Neither test family proves native source reproducibility or legal compliance. Clean native reconstruction, runtime replacement and external publication require their own records.
