#!/usr/bin/env node

import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

import { prepareIssueIntake } from './issue-intake-lib.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const eventPath = process.argv[2] || process.env.GITHUB_EVENT_PATH
if (!eventPath) throw new Error('usage: node scripts/prepare-issue-intake.mjs GITHUB_EVENT_JSON')

const event = JSON.parse(await readFile(resolve(eventPath), 'utf8'))
const result = await prepareIssueIntake(event, {
  root: ROOT,
  token: process.env.GITHUB_TOKEN || '',
})
await writeFile(result.recordPath, `${JSON.stringify(result.record, null, 2)}\n`, { flag: 'wx' })

const runId = String(process.env.GITHUB_RUN_ID || 'local').replace(/[^0-9A-Za-z-]/g, '')
const outputs = {
  branch: `automation/intake-${event.issue.number}-${runId}`,
  issue_number: String(event.issue.number),
  record_id: result.record.id,
  record_path: `intake/records/${basename(result.recordPath)}`,
}
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''))
}

console.log(`prepared ${result.record.id} from Issue #${event.issue.number}; Registry remains ${result.record.registry.state}`)
