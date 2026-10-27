# Validation · 0.27.16

Date: 2026-10-28 (Asia/Shanghai). The 0.27.16 implementation was validated on Windows on 2026-10-27; tests were rerun before publishing the source.

- `npm test`: 102 passed, 0 failed, 3 platform-specific tests skipped (105 total).
- Windows 0.27.16 built successfully. Payload manifest integrity and the running executable path were checked. Executable SHA-256: `3c6a266ddea75e0c0bdcd856e9b75d4da669ed25e116def7ddf0d68d0d8cf78a`.
- The live Windows task view and Settings → General displayed cumulative token usage and reference-price costs. Light mode and task sidebar totals were inspected.
- A readonly query against the local ZCode usage ledger matched the global token total. Pure and SQLite fixture tests cover child-task aggregation, forks, cache/reasoning subsets, unknown prices, duplicate requests, refresh replacement and cached fallback.
- Private storage preparation delegates to the original ZCode runtime; application binaries are not patched. Storage entry and isolated bridge/service regression tests pass.
- macOS native UI source was updated for parity. This version was not compiled or run on macOS; earlier build results below apply only to 0.27.12.
- Local account credentials, usage databases, logs, generated builds and machine-specific installer/shortcut helpers are excluded from the source commit. Reference prices are estimates, not provider invoices; unsupported model prices remain unpriced.

## Historical validation · 0.27.12

Date: 2026-10-27 (Asia/Shanghai).

- **89 tests passed, 0 failed** across the new ZCode tests and selected inherited budget, policy, shared-contract, queue, retry/history and quota-outlook regression suites.
- **208 JavaScript files** in src/, desktop/ and scripts/ passed Node syntax checking.
- Shared core boundaries and generated native control routes passed `scripts/check-architecture.mjs`.
- macOS SwiftUI/AppKit application compiled and was ad-hoc signed; `codesign --verify --deep --strict` passed.
- Built bundle version: `0.27.12`; identifier: `io.github.zcode-context-control`.
- Built native executable SHA-256: `ddaef2707f7baa1f0871c1bd0d579ea258d9f29f6ac411f0b191b18da9d10e8c`.
- A private copy of the installed ZCode 3.16.3 agent passed patch anchor matching and Node syntax checking. It was **not executed**.
- Control service integration tests used project-local fixture directories. They verified HTTP authentication, native model discovery, budgets persisted to the hook document, compaction routing, sequential queue dispatch, and exact wrapper forwarding to a fake agent.

## Scope and remaining checks

The original reference project was not changed. No system service or production installer was installed; installed-app hash verification therefore does not apply. Development configuration and copied test runtime remain under this project's .local/ directory. The signed ZCode application bundle was not patched.

One mistaken invocation of the ZCode desktop executable with --version triggered startup and exited; this was disclosed to the user. All subsequent runtime verification used the reference project's copied Node and synthetic agents. No real ZCode conversation, quota endpoint, credentials, or chat database was used to validate this port.

The inherited code emits Swift concurrency and deprecation warnings under the current compiler. They did not prevent this build, but Swift 6 language-mode migration remains future work.

Windows Electron dependencies were not present in the provided reference node_modules. No Windows binary or installer, live tray/shortcut/notification behavior, real ZCode conversation, cloud sync, or quota/account integration was validated. The full inherited Codex-specific integration suite is retained as `test:upstream`; it is not a claim of ZCode compatibility. `npm test` and `test:ci` select the verified adaptation/core suite.

Raw local verification logs: `.local/test-results.tap` and `.local/mac-build.log` (ignored development files).
