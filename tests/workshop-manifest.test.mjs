import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MCP_PROTOCOL_CURRENT,
  MCP_REGISTRY_SCHEMA,
  capabilityProfile,
  validateOfficialMcpManifest,
  validateWorkshopManifest,
} from '../scripts/workshop-manifest-lib.mjs'

function profileManifest() {
  return {
    schema: 'omdsh-workshop-package/v1',
    type: 'plugin',
    integration: { protocol: 'harness-profile', artifact: 'package.json' },
    install: {
      mode: 'transactional',
      adapter: 'profile-bundle',
      failurePolicy: 'generation-rollback',
      touchesCurrentBeforeActivation: false,
    },
    lifecycle: { activation: 'restart-profile', dispose: 'supported' },
    permissions: ['filesystem:read'],
    evidence: {
      install: 'docs/verification/install.md',
      failureIsolation: 'docs/verification/failure.md',
      hotReload: null,
      remove: 'docs/verification/remove.md',
    },
  }
}

test('accepts a transactional package.json Workshop declaration', () => {
  assert.deepEqual(validateWorkshopManifest(profileManifest()), [])
})

test('rejects transactional declarations that can touch current before activation', () => {
  const manifest = profileManifest()
  manifest.install.touchesCurrentBeforeActivation = true
  assert.match(validateWorkshopManifest(manifest).join('\n'), /must not touch current/)
})

test('requires hot reload to expose a dispose hook', () => {
  const manifest = profileManifest()
  manifest.lifecycle = { activation: 'hot-reload', dispose: 'unknown' }
  assert.match(validateWorkshopManifest(manifest).join('\n'), /dispose hook/)
})

test('aligns MCP declarations with the current official protocol and server manifest', () => {
  const declaration = {
    schema: 'omdsh-workshop-package/v1',
    type: 'plugin',
    integration: {
      protocol: 'mcp',
      artifact: 'server.json',
      mcp: {
        protocolVersions: [MCP_PROTOCOL_CURRENT],
        serverManifest: 'server.json',
        registrySchema: MCP_REGISTRY_SCHEMA,
      },
    },
    install: { mode: 'isolated-trial', adapter: 'mcp-server', failurePolicy: 'discard-process', touchesCurrentBeforeActivation: false },
    lifecycle: { activation: 'restart-plugin', dispose: 'supported' },
    permissions: ['network:outbound'],
    evidence: { install: null, failureIsolation: null, hotReload: null, remove: null },
  }
  assert.deepEqual(validateWorkshopManifest(declaration), [])
  assert.deepEqual(validateOfficialMcpManifest({
    packageJson: { name: '@owner/weather', mcpName: 'io.github.owner/weather' },
    serverManifest: {
      $schema: MCP_REGISTRY_SCHEMA,
      name: 'io.github.owner/weather',
      packages: [{ registryType: 'npm', identifier: '@owner/weather', version: '1.0.0', transport: { type: 'stdio' } }],
    },
    declaration,
  }), [])
})

test('rejects an npm MCP ownership mismatch', () => {
  const errors = validateOfficialMcpManifest({
    packageJson: { mcpName: 'io.github.owner/other' },
    serverManifest: {
      $schema: MCP_REGISTRY_SCHEMA,
      name: 'io.github.owner/weather',
      packages: [{ registryType: 'npm', identifier: '@owner/weather' }],
    },
  })
  assert.match(errors.join('\n'), /mcpName/)
})

test('keeps author capability declarations separate from current-baseline verification', () => {
  const profile = capabilityProfile({ declaration: profileManifest() })
  assert.equal(profile.install.seamless.state, 'declared')
  assert.equal(profile.install.failureIsolation.state, 'declared')
  assert.equal(profile.lifecycle.hotReload.state, 'unsupported')
  assert.equal(profile.admission.state, 'manifest-ready-for-tests')
})
