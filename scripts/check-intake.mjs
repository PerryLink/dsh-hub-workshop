#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateQueue } from './intake-lib.mjs'
import { buildIntakeQueue } from './build-intake-queue.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const json = async (path) => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'))
const [baseline, queue, admissions, registry] = await Promise.all([
  json('official-baseline.json'),
  json('intake-queue.json'),
  json('registry-admissions.json'),
  json('registry-v1.json'),
])

const baselineId = `${baseline.runtime.package}@${baseline.runtime.version}`
const errors = validateQueue(queue, baseline)
const generatedQueue = await buildIntakeQueue({ root: ROOT, write: false })
if (JSON.stringify(queue) !== JSON.stringify(generatedQueue)) errors.push('intake-queue.json is stale; run npm run intake:build')
if (baseline.schema !== 'omdsh-official-baseline/v1') errors.push('unsupported official baseline schema')
if (baseline.runtime.releaseChannel !== 'release-candidate' || baseline.runtime.ga !== false) errors.push('current official baseline must not be mislabeled as stable GA')
if (admissions.runtimeBaseline !== baselineId) errors.push('Registry admission baseline differs from intake baseline')
const admitted = new Set(queue.records.filter((record) => record.registry.state === 'admitted').map((record) => record.id))
const published = new Set(admissions.admissions.map((entry) => `${entry.id}@${entry.version}`))
if (admitted.size !== published.size || [...admitted].some((id) => !published.has(id))) errors.push('Registry admissions must exactly match admitted intake records')
if (registry.entries.length !== admissions.admissions.length) errors.push('Registry feed and admissions differ')
if (errors.length > 0) throw new Error(errors.join('\n'))

console.log(`intake accepted: ${queue.records.length} queued, ${admitted.size} admitted, official baseline ${baselineId} (${baseline.runtime.releaseChannel})`)
