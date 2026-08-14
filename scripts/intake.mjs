#!/usr/bin/env node

import { resolve } from 'node:path'
import { applyEvidence, createIntakeRecord, readJson, validateQueue, validateSubmission } from './intake-lib.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const [command, firstPath, secondPath] = process.argv.slice(2)
const baseline = await readJson(resolve(ROOT, 'official-baseline.json'))

function usage() {
  console.error('Usage: node scripts/intake.mjs validate <submission.json> | prepare <submission.json> | evidence <record.json> <evidence.json> | queue')
  process.exitCode = 2
}

if (command === 'validate' && firstPath) {
  const errors = validateSubmission(await readJson(resolve(firstPath)))
  if (errors.length > 0) throw new Error(errors.join('\n'))
  console.log('submission accepted for pending review; no repository code was executed')
} else if (command === 'prepare' && firstPath) {
  console.log(JSON.stringify(createIntakeRecord(await readJson(resolve(firstPath)), baseline), null, 2))
} else if (command === 'evidence' && firstPath && secondPath) {
  console.log(JSON.stringify(applyEvidence(await readJson(resolve(firstPath)), await readJson(resolve(secondPath)), baseline), null, 2))
} else if (command === 'queue') {
  const queue = await readJson(resolve(ROOT, 'intake-queue.json'))
  const errors = validateQueue(queue, baseline)
  if (errors.length > 0) throw new Error(errors.join('\n'))
  console.log(`intake queue accepted: ${queue.records.length} record(s), baseline ${queue.officialBaseline}`)
} else {
  usage()
}
