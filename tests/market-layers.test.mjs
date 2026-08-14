import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'))

test('market layers classify infrastructure and distributions separately from plugins', async () => {
  const layers = await json('market-layers.json')
  assert.equal(layers.schema, 'omdsh-market-layers/v1')
  assert.equal(layers.projects.length, 5)
  assert.equal(layers.projects.filter((project) => project.layer === 'infrastructure').length, 4)
  assert.equal(layers.projects.filter((project) => project.layer === 'distribution').length, 1)
  assert.ok(layers.projects.every((project) => /^[0-9a-f]{40}$/.test(project.source.ref)))
  assert.ok(layers.projects.every((project) => project.registry.state === 'ineligible'))
})

test('dsh-mygo is visible as infrastructure but excluded from plugin installation authorities', async () => {
  const [layers, catalog, inventory, registry] = await Promise.all([
    json('market-layers.json'),
    json('catalog.json'),
    json('verification-inventory.json'),
    json('registry-v1.json'),
  ])
  const project = layers.projects.find((entry) => entry.id === 'omdsh-dev/dsh-mygo')
  assert.equal(project?.layer, 'infrastructure')
  assert.equal(project?.review.reason, 'ecosystem-infrastructure')
  for (const authority of [catalog.packages, inventory.projects, registry.entries]) {
    assert.equal(authority.some((entry) => entry.id === project.id), false)
  }
})
