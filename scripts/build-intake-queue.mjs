#!/usr/bin/env node

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { evaluateRecord } from './intake-lib.mjs'

const DEFAULT_ROOT = resolve(import.meta.dirname, '..')

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function recordFiles(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => resolve(directory, entry.name))
    .sort()
}

export async function buildIntakeQueue({ root = DEFAULT_ROOT, write = true } = {}) {
  const baseline = await json(resolve(root, 'official-baseline.json'))
  const files = await recordFiles(resolve(root, 'intake/records'))
  const records = (await Promise.all(files.map(json))).sort((left, right) => left.id.localeCompare(right.id))
  const errors = records.flatMap((record) => evaluateRecord(record, baseline))
  const ids = new Set()
  for (const record of records) {
    if (ids.has(record.id)) errors.push(`${record.id}: duplicate intake record`)
    ids.add(record.id)
  }
  if (errors.length > 0) throw new Error(errors.join('\n'))
  const timestamps = records.flatMap((record) => [record.review?.reviewedAt, record.verification?.verifiedAt]).filter(Boolean)
  const queue = {
    schema: 'omdsh-workshop-intake-queue/v1',
    generatedAt: timestamps.sort().at(-1) || baseline.checkedAt,
    officialBaseline: `${baseline.runtime.package}@${baseline.runtime.version}`,
    policy: {
      managementModes: ['transactional', 'managed', 'guided'],
      reviewStateIsIndependent: true,
      registryEligibleModes: ['transactional', 'managed'],
      failClosed: true,
    },
    records,
  }
  if (write) await writeFile(resolve(root, 'intake-queue.json'), `${JSON.stringify(queue, null, 2)}\n`)
  return queue
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const queue = await buildIntakeQueue()
  console.log(`built intake queue: ${queue.records.length} record(s), baseline ${queue.officialBaseline}`)
}
