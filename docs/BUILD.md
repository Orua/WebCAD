# Build from source / 安装与构建

Use the repository lockfile and Node.js 22.12+ or a compatible newer supported release. Vite's installed engine declaration is authoritative; do not silently update dependencies to solve an engine mismatch.

```sh
npm ci
npm run build
node --test scripts/open-source.test.mjs scripts/license-policy.test.mjs
```

`npm ci` installs the pinned dependency graph. `npm run build` runs existing contract/document generators, Vite and release-integrity checks. Preserve the complete output tree, including Worker/WASM binaries, `automation/`, `open-source/` and `open-source-notices.html`. The generated source ZIP is a restricted snapshot with documented exclusions, not a complete native-kernel source package.

The Vite base is relative (`./`). Serve over HTTPS or localhost; `file://` is unsupported. `WEBCAD_DIST_DIR` optionally selects an output directory. The normal default is `dist/`. `WEBCAD_TEST_TEMP_DIR` selects the open-source test's temporary directory. Use task-specific output directories in parallel development. Local maintainer storage and deployment restrictions still apply; these instructions do not authorize creating a new local server or overwriting an existing site.

## Publication gate

After the integrity build, run the separate scope check against that same output:

```sh
node scripts/verify-public-release.mjs dist public-web
```

The wrapper runs the existing release-integrity gate first, then the publication policy. Static inventory supports `public-web` and `integrated-web`. The policy map also distinguishes `agent-host`, `services` and `dev-only`; those deployments need their own inventories and are not approved by this static checker. A scope's unresolved dependencies block that scope; an unrelated dev-only item does not automatically block the static frontend. For policy-only diagnosis use `node scripts/license-policy.mjs public-web dist`; that command alone is not a publication gate.

**Current public distribution is blocked.** The [source/license map](compliance/source-license-map.json) intentionally retains pending application authorization, matching native-source evidence and media provenance. Do not remove records or change their status merely to make the gate pass. Update the map only with supporting source, permission and build evidence. [Open decisions](compliance/LICENSE_DECISION.md) list closure requirements.

Optional Services and Agent host code require separate configuration and review; static hosting cannot provide their capabilities. Server credentials and deployment-specific configuration must never enter a public source snapshot. See [CORRESPONDING_SOURCE.md](../CORRESPONDING_SOURCE.md) for exact source/build gaps and [VALIDATION.md](VALIDATION.md) for test levels.
