import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { applyEvidence, createIntakeRecord, evaluateRecord, managementMode, validateSubmission } from '../scripts/intake-lib.mjs'

const baseline = JSON.parse(await readFile(new URL('../official-baseline.json', import.meta.url), 'utf8'))
const SHA = '1'.repeat(40)

function submission(method) {
  const mode = managementMode(method)
  return {
    schema: 'omdsh-workshop-submission/v1',
    operation: 'create-project',
    project: {
      id: `example-${mode}`,
      displayName: `Example ${mode}`,
      summary: 'A deterministic intake test plugin.',
      kind: 'extension',
      category: 'developer-tools',
      tags: ['dsh-plugin'],
      repository: `https://github.com/example/example-${mode}`,
      path: null,
      author: { name: 'example', url: 'https://github.com/example' },
      license: 'MIT',
      media: null,
    },
    release: {
      version: '1.0.0',
      ref: SHA,
      updatedAt: '2026-08-14T00:00:00.000Z',
      channel: 'stable',
      compatibility: 'Verified only by this synthetic fixture.',
      changelog: 'Initial test release.',
      capabilities: { requiresFabric: false, deepHook: false, restartRequired: false },
      profileBundle: mode === 'transactional'
        ? { packageName: '@example/plugin', spec: `github:example/example-${mode}#${SHA}` }
        : null,
    },
    management: {
      method,
      protocol: mode === 'transactional' ? 'harness-profile' : mode === 'managed' ? 'harness-repository' : 'third-party',
      label: mode === 'guided' ? 'View integration guide' : 'Install after admission',
      instructions: mode === 'managed'
        ? `Use github:example/example-${mode}#${SHA}&path:/.dsh-plugin in the official configuration.`
        : mode === 'guided'
          ? `Read https://github.com/example/example-${mode}/tree/${SHA}`
          : 'Use the admitted Workshop release in an isolated candidate Profile.',
      source: mode === 'managed' ? `github:example/example-${mode}#${SHA}&path:/.dsh-plugin` : null,
    },
    declarations: {
      permissions: 'No additional permissions.',
      testing: 'Synthetic test fixture only.',
      trustedPublisherRequested: false,
      installScriptsMustRemainDisabled: true,
    },
  }
}

function check(status, evidence = status) {
  return { status, evidence }
}

function evidence(record) {
  const guided = record.classification.management === 'guided'
  const lifecycle = guided ? 'not-applicable' : 'passed'
  return {
    schema: 'omdsh-workshop-intake-evidence/v1',
    projectId: record.submission.manifest.project.id,
    releaseId: record.id,
    management: record.classification.management,
    source: {
      repository: record.submission.repository,
      ref: record.submission.ref,
      path: record.submission.path,
    },
    runtime: guided ? null : {
      package: baseline.runtime.package,
      version: baseline.runtime.version,
      integrity: baseline.runtime.integrity,
      profile: 'intake-test',
      platform: 'isolated-test-environment',
      node: '22',
    },
    capability: guided ? null : {
      id: 'tool.example',
      kind: 'tool',
      invocation: 'invoke tool.example with the deterministic fixture input',
      assertion: 'registered-invoked-and-observed',
      expected: 'fixture-result',
      observed: 'fixture-result',
    },
    checks: {
      static: check('passed'),
      manifest: check('passed', 'manifest parsed and coordinates matched'),
      entry: check('passed', 'declared entry exists in the fixed commit'),
      dshContract: check('passed', 'DSH-specific registration path identified'),
      compatibility: check('passed', 'current baseline compatibility reviewed'),
      permissions: check('passed', 'permission declaration matched observed behavior'),
      supplyChain: check('passed'),
      install: check(lifecycle),
      ready: check(lifecycle),
      functional: check(lifecycle),
      update: check(lifecycle),
      disable: check(lifecycle),
      remove: check(lifecycle),
      recovery: check(lifecycle),
    },
    verifiedAt: '2026-08-14T01:00:00.000Z',
    verifier: 'synthetic-test',
  }
}

test('there are exactly three integration modes and pending review is independent', () => {
  assert.equal(managementMode('profile-bundle'), 'transactional')
  assert.equal(managementMode('repository-plugin'), 'managed')
  assert.equal(managementMode('guided'), 'guided')
  assert.equal(managementMode('pending-review'), null)
  for (const method of ['profile-bundle', 'repository-plugin', 'guided']) {
    const record = createIntakeRecord(submission(method), baseline)
    assert.equal(record.review.state, 'pending-review')
  }
})

test('submission intake rejects mutable refs and executable guided commands', () => {
  const mutable = submission('guided')
  mutable.release.ref = 'main'
  assert.match(validateSubmission(mutable).join('; '), /full 40-character commit/)
  const executable = submission('guided')
  executable.management.instructions = 'npm install @example/plugin'
  assert.match(validateSubmission(executable).join('; '), /must not expose an executable install command/)
})

test('managed configuration fails closed while the public official package is unavailable', () => {
  const record = createIntakeRecord(submission('repository-plugin'), baseline)
  assert.equal(record.verification.state, 'blocked')
  assert.equal(record.tests.officialBaseline.status, 'blocked')
  assert.equal(record.registry.state, 'ineligible')
  assert.deepEqual(evaluateRecord(record, baseline), [])
  assert.throws(() => applyEvidence(record, evidence(record), baseline), /official Repository Plugin contract is unavailable/)
})

test('guided source evidence can pass but never grants Registry authority', () => {
  const record = createIntakeRecord(submission('guided'), baseline)
  record.review = { state: 'approved', reviewer: 'reviewer', reviewedAt: '2026-08-14T01:00:00.000Z' }
  const verified = applyEvidence(record, evidence(record), baseline)
  assert.equal(verified.verification.state, 'source-evidence-passed')
  assert.equal(verified.registry.state, 'ineligible')
  assert.deepEqual(evaluateRecord(verified, baseline), [])
})

test('transactional admission requires both current-baseline evidence and explicit review approval', () => {
  const pending = createIntakeRecord(submission('profile-bundle'), baseline)
  const verifiedPending = applyEvidence(pending, evidence(pending), baseline)
  assert.equal(verifiedPending.verification.state, 'current-baseline-passed')
  assert.equal(verifiedPending.registry.state, 'ineligible')
  pending.review = { state: 'approved', reviewer: 'reviewer', reviewedAt: '2026-08-14T01:00:00.000Z' }
  const verifiedApproved = applyEvidence(pending, evidence(pending), baseline)
  assert.equal(verifiedApproved.registry.state, 'eligible')
  assert.deepEqual(evaluateRecord(verifiedApproved, baseline), [])
})

test('evidence from another commit or runtime is rejected', () => {
  const record = createIntakeRecord(submission('profile-bundle'), baseline)
  const wrongSource = evidence(record)
  wrongSource.source.ref = '2'.repeat(40)
  assert.throws(() => applyEvidence(record, wrongSource, baseline), /source coordinates do not match/)
  const wrongRuntime = evidence(record)
  wrongRuntime.runtime.version = '0.0.1-rc.5'
  assert.throws(() => applyEvidence(record, wrongRuntime, baseline), /current official runtime/)
})

test('a successful process exit without an observed capability is not verification', () => {
  const record = createIntakeRecord(submission('profile-bundle'), baseline)
  const smokeOnly = evidence(record)
  smokeOnly.capability = null
  assert.throws(() => applyEvidence(record, smokeOnly, baseline), /must identify a target capability/)
  const notInvoked = evidence(record)
  notInvoked.capability.assertion = 'loaded-only'
  assert.throws(() => applyEvidence(record, notInvoked, baseline), /must be registered, invoked, and observed/)
})
