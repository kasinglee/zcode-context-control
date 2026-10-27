# ZCode adaptation notes

## Evidence and access boundary

Development references were limited to the supplied Codex Context Control directory and this project. The user separately authorized read-only inspection of the installed ZCode application. Inspected application: `/Applications/ZCode.app`, version 3.16.3, bundle ID `dev.zcode.app`; bundled agent: `Contents/Resources/glm/zcode.cjs`. Source SHA-256: `97490d0f06a7a225d54d47817acf4b4859cdb268b59f2490caaeda982bef063a`.

Selected application code was temporarily extracted into ignored `research/` for local inspection. It is not a distributable dependency and must not be committed or included in releases. No ZCode credential files or chat databases were opened during implementation. One mistaken `ZCode --version` invocation triggered an app startup and exited; it was reported to the user. Subsequent validation used the copied Node runtime and isolated fixtures.

## Protocol and launching

ZCode Protocol version 1 uses strict newline-delimited JSON objects `{id, method, params}`; **no `jsonrpc` field**. Methods include `runtime/capabilities`, `session/create`, `session/resume`, `session/read`, `session/compact`, `session/send`, `session/stop`, `session/usage` and `usage/stats`. Having an `app-server --stdio` command does not imply Codex protocol compatibility.

The inspected desktop host supports `ZCODE_AGENT_SERVER_COMMAND` and `ZCODE_AGENT_SERVER_ARGS_JSON`, and appends `--surface desktop`. The launcher injects our Node wrapper using this existing override. Parent desktop environment removes `ELECTRON_RUN_AS_NODE`; the agent runs with the supplied standalone Node. An already running singleton desktop instance must be quit by the user before launching. We do not stop an existing app or set persistent global environment variables.

The wrapper forwards desktop bytes, reserves unique internal request IDs, consumes its own responses (including late timeout replies), and refreshes only sessions already loaded by the desktop. Peer disconnection clears in-flight requests. It starts the existing authenticated loopback/IPC manager service in an isolated product directory. This preserves both UI clients' existing control API.

## Budget hook

`runtime-copy.mjs` reads the agent bundle and creates a content-addressed private copy. It requires exactly one known compaction call-site anchor. The injected policy resolver changes only the compaction decision config, preserves native model capacity and output reserve, and never changes provider request model limits. It reads only per-session policies from the manager's own JSON file. Defaults are attached to observed new `session/create` replies, not indiscriminately applied to resumed history. Fork policy inheritance uses the existing manager core.

If a future ZCode release changes this call site, preparation fails closed with an actionable error. Syntactic compatibility is not semantic validation: a real conversation remains necessary before release. The UI's observed native model window remains the native window; a smaller compaction budget does not claim the model metadata has changed.

## Capability limitations

Quotas do not use the Codex auth flow or OpenAI quota endpoints. Quota state is explicitly stale/unavailable with no successful observation timestamp. Quota gates are not fabricated: the ZCode daemon explicitly selects sequential scheduling without quota protection, while upstream quota gate functions remain for later provider integration and regression tests. Both UI switches identify the absence of quota protection.

Unverified account switching, quota activation, extension and update installation return explicit errors. The ZCode daemon uses unavailable-provider factories instead of legacy account/runtime/update implementations. Legacy implementation modules are retained for reference and future adapters; installers route to project-local development setup.

Native snapshots provide aggregate context usage. Reports leave price fields null, and leave unsupported breakdowns/history empty with an explanatory note. They never apply OpenAI model prices to GLM.

## Platform validation

Shared JavaScript and fake macOS/Windows discovery tests run locally. SwiftUI build and ad-hoc signing run on macOS. The Windows Electron/C# implementation remains in the source tree; a real Windows host is still required for installer, tray, notifications, global shortcut and app lifecycle validation. This repository is not ready for an unattended production installation.
