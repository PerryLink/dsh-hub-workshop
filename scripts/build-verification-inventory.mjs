#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const json = async (path) => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'))
const [catalog, admissions, baseline] = await Promise.all([
  json('catalog.json'),
  json('registry-admissions.json'),
  json('official-baseline.json'),
])
const baselineId = `${baseline.runtime.package}@${baseline.runtime.version}`
const blocked = new Map(admissions.blocked.map((record) => [record.id, record]))
const admitted = new Map(admissions.admissions.map((record) => [record.id, record]))

const projects = catalog.packages.map((project) => {
  const blockedRecord = blocked.get(project.id)
  const admission = admitted.get(project.id)
  const requestedMode = admission?.mode || blockedRecord?.mode || 'guided'
  const management = requestedMode === 'profile-bundle'
    ? 'transactional'
    : requestedMode === 'repository-plugin'
      ? 'managed'
      : 'guided'
  return {
    id: project.id,
    repository: project.repository,
    ref: project.ref,
    path: project.repositoryPath || null,
    management,
    review: {
      state: admission ? 'approved' : blockedRecord ? 'blocked' : 'pending-review',
      reason: admission ? 'registry-admitted' : blockedRecord?.reason || 'dedicated-intake-not-completed',
    },
    verification: {
      baseline: baselineId,
      state: admission
        ? 'current-baseline-passed'
        : blockedRecord
          ? 'blocked'
          : 'untested',
      reason: admission
        ? 'admission-evidence-accepted'
        : blockedRecord?.reason || 'no-current-baseline-evidence',
    },
    registry: {
      state: admission ? 'admitted' : 'ineligible',
    },
  }
}).sort((left, right) => left.id.localeCompare(right.id))

function counts(field, nested) {
  const values = {}
  for (const project of projects) {
    const value = nested ? project[field][nested] : project[field]
    values[value] = (values[value] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)))
}

const output = {
  schema: 'omdsh-workshop-verification-inventory/v1',
  generatedAt: admissions.updatedAt,
  officialBaseline: {
    package: baseline.runtime.package,
    version: baseline.runtime.version,
    integrity: baseline.runtime.integrity,
    releaseChannel: baseline.runtime.releaseChannel,
    ga: baseline.runtime.ga,
  },
  policy: {
    catalogDoesNotGrantInstallAuthority: true,
    historicalEvidenceDoesNotSatisfyCurrentBaseline: true,
    unknownProjectsUseGuidedPublicHandling: true,
    failClosed: true,
  },
  summary: {
    catalogProjects: projects.length,
    management: counts('management'),
    review: counts('review', 'state'),
    verification: counts('verification', 'state'),
    registry: counts('registry', 'state'),
  },
  projects,
}

await writeFile(resolve(ROOT, 'verification-inventory.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(`built verification inventory: ${projects.length} projects, ${output.summary.verification['current-baseline-passed'] ?? 0} current-baseline verified`)
