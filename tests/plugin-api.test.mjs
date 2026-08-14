import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const root = new URL('../', import.meta.url)
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'))

test('plugin and market APIs are generated from separate authorities', async () => {
  await exec(process.execPath, ['scripts/build-plugin-api.mjs'], { cwd: root })
  const [catalog, inventory, layers, plugins, types, market] = await Promise.all([
    json('catalog.json'),
    json('verification-inventory.json'),
    json('market-layers.json'),
    json('api/v1/plugins.json'),
    json('api/v1/plugin-types.json'),
    json('api/v1/market.json'),
  ])
  assert.equal(plugins.count, catalog.packages.length)
  assert.equal(plugins.projects.length, catalog.packages.length)
  assert.equal(types.totals.catalogProjects, catalog.packages.length)
  assert.deepEqual(
    Object.fromEntries(types.management.map((entry) => [entry.id, entry.count])),
    inventory.summary.management,
  )
  assert.deepEqual(
    Object.fromEntries(types.reviewStates.filter((entry) => entry.count > 0).map((entry) => [entry.id, entry.count])),
    inventory.summary.review,
  )
  assert.equal(market.totals.projects, catalog.packages.length + layers.projects.length)
  assert.equal(market.totals.plugin, catalog.packages.length)
  assert.equal(market.totals.infrastructure, layers.totals.infrastructure)
  assert.equal(market.totals.distribution, layers.totals.distribution)
  assert.equal(market.totals.installable, 0)
})

test('read-only plugin API exposes no install command or executable package intent', async () => {
  const plugins = await json('api/v1/plugins.json')
  const serialized = JSON.stringify(plugins)
  for (const forbidden of ['installCommand', 'profileBundle', '@deepseek-ai/dsh-repository-plugin', '&path:/.dsh-plugin']) {
    assert.equal(serialized.includes(forbidden), false, forbidden)
  }
  assert.ok(plugins.projects.every((project) => project.registry.state === 'ineligible'))
})

test('non-plugin market projects never leak into plugin or Registry authorities', async () => {
  const [catalog, inventory, layers, plugins, registry] = await Promise.all([
    json('catalog.json'),
    json('verification-inventory.json'),
    json('market-layers.json'),
    json('api/v1/plugins.json'),
    json('registry-v1.json'),
  ])
  const protectedIds = new Set(layers.projects.map((project) => project.id))
  for (const collection of [catalog.packages, inventory.projects, plugins.projects, registry.entries]) {
    assert.ok(collection.every((project) => !protectedIds.has(project.id)))
  }
  assert.ok(layers.projects.every((project) => project.registry.state === 'ineligible'))
})
