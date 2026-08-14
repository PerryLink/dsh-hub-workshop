import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function json(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
}

test('topic audit stats match decisions and dsh-mygo cannot leak into plugin surfaces', async () => {
  const [audit, catalog, inventory, api] = await Promise.all([
    json('../topic-plugin-audit.json'),
    json('../catalog.json'),
    json('../verification-inventory.json'),
    json('../api/v1/plugins.json'),
  ])

  const decisions = Object.fromEntries(['exclude', 'include', 'review'].map((decision) => [
    decision,
    audit.repositories.filter((entry) => entry.decision === decision).length,
  ]))
  assert.deepEqual(audit.stats.decisions, decisions)
  const reasons = Object.fromEntries([...new Set(audit.repositories.map((entry) => entry.reasonCode))]
    .sort()
    .map((reason) => [reason, audit.repositories.filter((entry) => entry.reasonCode === reason).length]))
  assert.deepEqual(audit.stats.reasons, reasons)

  const candidate = audit.repositories.find((entry) => entry.owner === 'omdsh-dev' && entry.name === 'dsh-mygo')
  assert.equal(candidate.decision, 'exclude')
  assert.equal(candidate.reasonCode, 'ecosystem-infrastructure')
  assert.equal(candidate.evidence.manualReview.inspectedCommit, '4566748646823f8e2123f6addcf22b55e305e740')
  assert.equal(candidate.evidence.manualReview.verificationLevel, 'static-public-source')
  assert.ok(candidate.evidence.manualReview.findings.includes('root-package-manifest-absent'))
  assert.ok(candidate.evidence.manualReview.findings.includes('current-public-baseline-not-verified'))

  const catalogText = JSON.stringify({ packages: catalog.packages, plugins: catalog.plugins })
  assert.doesNotMatch(catalogText, /omdsh-dev\/dsh-mygo/)
  assert.equal(inventory.projects.some((entry) => entry.repository === 'https://github.com/omdsh-dev/dsh-mygo'), false)
  assert.equal(api.projects.some((entry) => entry.source?.repository === 'https://github.com/omdsh-dev/dsh-mygo'), false)
})
