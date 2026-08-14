# Workshop plugin intake and verification

The intake system records four independent dimensions: **integration mode, review state, verification state, and Registry admission**. Catalog inclusion, a Topic match, or historical preview evidence never grants installation authority.

This intake applies only to the leaf-plugin layer. Ecosystem infrastructure and community distributions use the curated `market-layers.json` projection, remain outside plugin verification inventory, and are always ineligible for Registry admission through market listing alone.

The current official public baseline is `@deepseek-ai/dsh@0.1.0-rc.6`. It is an official public release candidate, not stable GA. Every installable entry must be reverified whenever that baseline changes.

## Integration modes

| Mode | Submission contract | Current status | Required tests | Registry |
|---|---|---|---|---|
| Transactional | `profile-bundle` / `harness-profile` | Public RC.6 exposes the Profile/Bundle lifecycle | pinned source, supply chain, install, ready, functional, update, disable, remove, recovery | eligible only after review and current-baseline evidence |
| Configuration candidate | `repository-plugin` / `harness-repository` | its package, schema, and loader are not present in the current public RC.6 contract | preserve static evidence; rerun the full lifecycle when a public contract can be verified | blocked today |
| Guided | `guided` / `harness-cordis` or `third-party` | pinned public source and guidance only | source, license, permissions, and supply-chain declarations; no submitted code execution | never eligible |

`pending-review` is a review state, not a fourth installation mode.

## State machine

```text
pinned public commit submission
  → product-boundary filter (exclude core, infrastructure, distributions, directories, templates)
  → locate the actual root package or plugin subpackage
  → manifest, declared entry, and DSH-specific registration validation
  → pending-review intake record
  → compatibility, permissions, and supply-chain review
  → mode-specific verification
  → assert one named capability was registered, invoked, and observed
  → approved / needs-fix / blocked review decision
  → approved + current-baseline-passed = eligible
  → explicit maintainer admission = Registry publication
```

Topic and keyword matches only create discovery candidates. A repository with no installable root package must be inspected at its real subpackage path; a manager, SDK, host, directory, template, or plugin collection is not admitted as one plugin. Static resemblance is not enough: a runtime pass must identify the exact tool, command, service, UI contribution, event, or provider, invoke it, and record expected versus observed behavior. A process that merely starts and exits successfully counts only as a smoke test.

Records use `intake.schema.json`, runtime evidence uses `intake-evidence.schema.json`, the public queue is `intake-queue.json`, and `official-baseline.json` records current upstream facts. CI validates all four fail-closed.

`verification-inventory.json` accounts for every Catalog project across public handling, review, current-baseline verification, and Registry state. Unknown projects receive guided public handling and are never presented as tested merely because they appear in Catalog.

## Commands

```bash
npm run intake:validate -- /path/to/submission.json
npm run intake:prepare -- /path/to/submission.json
npm run intake:build
npm run intake:evidence -- intake/records/project@version.json intake/evidence/project@version.json
npm run intake:check
npm run baseline:verify
npm run validate
```

An issue never writes repository state automatically. A maintainer saves reviewed records under `intake/records/`, evidence under `intake/evidence/`, generates the queue, and submits the result through PR/CI. The commands do not clone a submitted repository, execute its scripts, or write Registry state automatically. Admission remains a separately reviewed maintainer change. Runtime evidence also records a structured `capability` assertion; executable modes cannot pass with load-only evidence.
