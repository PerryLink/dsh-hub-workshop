#!/usr/bin/env node

import { createHash } from 'node:crypto'

const origin = String(process.argv[2] || 'https://hub.omdsh.dev').replace(/\/$/, '')
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}
async function json(path) {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return response.json()
}

const [registry, distributions, plugins] = await Promise.all([
  json('/registry-v1.json'),
  json('/distributions-v1.json'),
  json('/api/v1/plugins.json')
])
if (registry.schema !== 'omdsh-registry/v1' || registry.signature?.algorithm !== 'Ed25519' || !registry.signature?.keyId || !registry.signature?.value) {
  throw new Error('live Registry is not signed with an identified Ed25519 key')
}
const payload = {
  schema: registry.schema,
  revision: registry.revision,
  generatedAt: registry.generatedAt,
  origins: registry.origins,
  entries: registry.entries,
  collections: registry.collections
}
const snapshotId = `sha256:${createHash('sha256').update(canonical(payload)).digest('hex')}`
if (snapshotId !== registry.snapshotId) throw new Error('live Registry snapshotId does not match its payload')
if (distributions.registry?.snapshotId !== registry.snapshotId) throw new Error('live Distribution feed is bound to a different Registry')
if (plugins.schema !== 'omdsh-ai-plugins/v1') throw new Error('live plugin API schema mismatch')
console.log(`live Hub accepted: ${registry.entries.length} Registry entries, ${distributions.distributions.length} Distributions, ${plugins.count} plugin listings`)
