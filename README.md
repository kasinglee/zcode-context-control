# ZCode Context Control — adaptation preview

Version 0.27.12, based on the supplied Codex Context Control 0.27.11 project. Native macOS SwiftUI/AppKit and Windows Electron UI implementations, shared business logic, tests and build structure are retained.

This is an initial adapter, not verified feature parity. It implements ZCode session protocol observation, native model bounds, compaction budgets via a private runtime copy, manual compaction, and sequential text queues without quota protection. Account quotas, account switching, 920K extension, full analytics, cloud identity integration, automatic updates and production installers remain unverified or unavailable. No real conversation was used for validation.

See the [Chinese setup and capability matrix](README.zh-CN.md), [adaptation notes](docs/ZCODE_ADAPTATION.md), and [validation report](VALIDATION.md). Other inherited documentation describes the upstream design and history, not verified ZCode support.

```sh
node src/zcode/doctor.mjs
node scripts/build-mac.mjs
node scripts/install-current.mjs
# Quit ZCode completely before launching with the integration environment.
node src/zcode/launch.mjs
```

Development data stays in this project's `.local/control` directory. The original ZCode application bundle is never patched. Restart ZCode normally to run without the integration environment.
