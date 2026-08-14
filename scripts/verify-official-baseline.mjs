#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const ROOT = resolve(import.meta.dirname, '..')
const baseline = JSON.parse(await readFile(resolve(ROOT, 'official-baseline.json'), 'utf8'))

async function view(spec, fields) {
  const { stdout } = await exec('npm', ['view', spec, ...fields, '--json', '--userconfig=/dev/null'], {
    cwd: ROOT,
    env: { ...process.env, npm_config_userconfig: '/dev/null' },
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  })
  return JSON.parse(stdout)
}

async function unavailable(spec) {
  try {
    await view(spec, ['version'])
    return false
  } catch (error) {
    return /E404|404 Not Found/.test(`${error.stderr || ''}\n${error.message || ''}`)
  }
}

const runtime = await view(`${baseline.runtime.package}@${baseline.runtime.distTag}`, ['version', 'dist.integrity'])
if (runtime.version !== baseline.runtime.version || runtime['dist.integrity'] !== baseline.runtime.integrity) {
  throw new Error(`official runtime changed: expected ${baseline.runtime.version} ${baseline.runtime.integrity}, received ${runtime.version} ${runtime['dist.integrity']}`)
}
for (const contract of [baseline.contracts.repositoryPlugin, { package: baseline.contracts.guided.sdkPackage, registryResult: baseline.contracts.guided.sdkRegistryResult }]) {
  if (contract.registryResult === 'E404' && !await unavailable(contract.package)) {
    throw new Error(`${contract.package} is now publicly available; update official-baseline.json and re-run managed/guided contract review`)
  }
}
const cordis = await view('@deepseek-ai/cordis@latest', ['version'])
if (`@deepseek-ai/cordis@${cordis}` !== baseline.contracts.guided.cordisRuntime) {
  throw new Error(`official Cordis baseline changed: received @deepseek-ai/cordis@${cordis}`)
}
console.log(`official baseline verified online: ${baseline.runtime.package}@${runtime.version}; Repository Plugin and dsh-sdk remain unavailable`)
