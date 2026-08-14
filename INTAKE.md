# Workshop plugin intake and verification

The intake system records five independent dimensions: **integration mode, install/isolation capability, lifecycle capability, review and verification state, and Registry admission**. Catalog inclusion, a Topic match, or historical preview evidence never grants installation authority.

New submissions bind to `package.json#dshWorkshop` (`omdsh-workshop-package/v1`) at the pinned commit. Legacy `dsh.bundle`, `.dsh-plugin`, Skill, and MCP artifacts remain compatibility-mapped, with seamless install, failure isolation, and hot reload kept unknown until authors adopt the manifest and tests pass.

This intake applies only to the leaf-plugin layer. Ecosystem infrastructure and community distributions use the curated `market-layers.json` projection, remain outside plugin verification inventory, and are always ineligible for Registry admission through market listing alone.

The current official public baseline is `@deepseek-ai/dsh@0.1.0-rc.6`. It is an official public release candidate, not stable GA. Every installable entry must be reverified whenever that baseline changes.

## Integration modes

| Mode | Submission contract | Current status | Required tests | Registry |
|---|---|---|---|---|
| Transactional | `profile-bundle` / `harness-profile` | Public RC.6 exposes the Profile/Bundle lifecycle | pinned source, supply chain, install, ready, functional, update, disable, remove, recovery | eligible only after review and current-baseline evidence |
| Configuration candidate | `repository-plugin` / `harness-repository` | its package, schema, and loader are not present in the current public RC.6 contract | preserve static evidence; rerun the full lifecycle when a public contract can be verified | blocked today |
| Guided | `guided` / `harness-cordis`, `mcp`, `skill`, or `third-party` | pinned public source and guidance; MCP may receive an independent isolated protocol test | source, license, permissions, supply-chain, and optional isolated protocol evidence | never directly eligible |

`pending-review` is a review state, not a fourth installation mode.

## State machine

```text
pinned public commit submission
  → product-boundary filter (exclude core, infrastructure, distributions, directories, templates)
  → locate the actual root package or plugin subpackage
  → automated manifest, public repository, fixed commit, and declared-path preflight
  → automated pending-review record and review PR
  → compatibility, permissions, and supply-chain review
  → mode-specific verification
  → assert one named capability was registered, invoked, and observed
  → approved / needs-fix / blocked review decision
  → approved + current-baseline-passed = eligible
  → explicit maintainer admission = Registry publication
```

Topic and keyword matches only create discovery candidates. A repository with no installable root package must be inspected at its real subpackage path; a manager, SDK, host, directory, template, or plugin collection is not admitted as one plugin. Static resemblance is not enough: a runtime pass must identify the exact tool, command, service, UI contribution, event, or provider, invoke it, and record expected versus observed behavior. A process that merely starts and exits successfully counts only as a smoke test.

## Five capability gates

| Platform fact | Minimum evidence for Verified |
|---|---|
| Seamless install | candidate install, ready, real capability, update, disable, remove, and generation recovery all pass with pinned source and install scripts disabled |
| Disposable failure | injected install and startup failures discard only the candidate or isolated MCP process and leave current unchanged before activation |
| Hot reload / restart | execute the declared activation; hot reload observes dispose, resource cleanup, reactivation, and one real capability invocation |
| Integration protocol | the Profile, Repository, Cordis, MCP, Skill, or third-party artifact matches its declaration; MCP uses official `server.json` and protocol `2026-07-28` |
| Community admission | the v2 submission exactly matches fixed `package.json#dshWorkshop`, then passes static, permissions, supply-chain, and human review |

Author declarations display only as Declared. Missing evidence paths, absent evidence files, environment mismatches, or non-reproducible results cannot become Verified. A disposable MCP process proves isolation only; it never grants DSH Profile or Registry installation authority.

Records use `intake.schema.json`, runtime evidence uses `intake-evidence.schema.json`, the public queue is `intake-queue.json`, and `official-baseline.json` records current upstream facts. CI validates all four fail-closed.

`verification-inventory.json` accounts for every Catalog project across public handling, review, current-baseline verification, and Registry state. Unknown projects receive guided public handling and are never presented as tested merely because they appear in Catalog.

## Commands

```bash
npm run intake:validate -- /path/to/submission.json
npm run intake:prepare -- /path/to/submission.json
npm run intake:issue -- /path/to/github-event.json
npm run intake:build
npm run intake:evidence -- intake/records/project@version.json intake/evidence/project@version.json
npm run intake:check
npm run baseline:verify
npm run validate
```

Author Studio carries the complete manifest into a GitHub Issue. After the Issue is created, the `intake` workflow checks the public repository, full commit, and declared path read-only. A successful preflight lets `github-actions[bot]` write a `pending-review` record on an isolated branch, rebuild the queue, and open a review PR. Automation does not clone the submitted repository, execute its scripts, approve the submission, or write Registry state. Human boundary review, evidence under `intake/evidence/`, and a separately reviewed admission change remain mandatory. Runtime evidence also records a structured `capability` assertion; executable modes cannot pass with load-only evidence.
