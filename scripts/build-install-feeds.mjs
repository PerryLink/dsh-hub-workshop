#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const ORIGINS = [
  'https://hub.omdsh.dev/registry-v1.json',
  'https://hub.0.org.cn/registry-v1.json',
]
const COMMIT_RE = /^[0-9a-f]{40}$/
const PACKAGE_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const PINNED_GITHUB_RE = /^github:[A-Za-z0-9_.-]+\/[A-Za-z0-9._-]+#[0-9a-f]{40}$/
const BLOCKED_SOURCE_RE = /^github:[A-Za-z0-9_.-]+\/[A-Za-z0-9._-]+#[0-9a-f]{40}(?:&path:\/[^\s&]+\/\.dsh-plugin)?$/

export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON cannot contain non-finite numbers')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  throw new TypeError(`canonical JSON cannot encode ${typeof value}`)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizedTimestamp(value, name) {
  if (typeof value !== 'string' || new Date(value).toISOString() !== value) {
    throw new Error(`${name} must be a normalized ISO timestamp`)
  }
  return value
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function json(root, path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'))
}

function content(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function registryBinding(registry) {
  return {
    schema: registry.schema,
    snapshotId: registry.snapshotId,
    revision: registry.revision,
    origins: registry.origins,
  }
}

function releaseId(pkg) {
  return `${pkg.id}@${pkg.version}`
}

export function validateAdmission(admission, pkg, audit, evidenceDigest, baseline) {
  assert(admission?.decision === 'admitted', `${admission?.id ?? 'admission'}: unsupported decision`)
  assert(admission.mode === 'profile-bundle', `${admission.id}: only Profile Bundle admission is currently supported`)
  assert(pkg !== undefined, `${admission.id}: missing Catalog project`)
  assert(COMMIT_RE.test(admission.source?.ref), `${admission.id}: source ref must be a full commit`)
  assert(admission.source.repository === pkg.repository, `${admission.id}: repository differs from Catalog`)
  assert(admission.source.ref === pkg.ref, `${admission.id}: ref differs from Catalog`)
  assert((admission.source.path ?? null) === (pkg.repositoryPath || null), `${admission.id}: path differs from Catalog`)
  assert(admission.version === pkg.version, `${admission.id}: version differs from Catalog`)
  assert(pkg.workshop?.manifest?.status === 'valid', `${admission.id}: Registry admission requires package.json#dshWorkshop`)
  assert(pkg.workshop?.install?.adapter === 'profile-bundle', `${admission.id}: Workshop manifest adapter differs from Profile Bundle admission`)
  assert(pkg.workshop?.install?.mode === 'transactional', `${admission.id}: Workshop manifest must declare transactional installation`)
  assert(PACKAGE_RE.test(admission.packageName), `${admission.id}: invalid package name`)
  assert(PINNED_GITHUB_RE.test(admission.spec), `${admission.id}: spec must be a commit-pinned GitHub package`)
  assert(admission.spec.endsWith(`#${admission.source.ref}`), `${admission.id}: spec does not match source ref`)
  assert(['unknown', 'low', 'medium', 'high', 'critical'].includes(admission.risk.level), `${admission.id}: unsupported risk level`)
  assert(['unknown', 'passed', 'findings'].includes(admission.risk.vulnerabilityScan), `${admission.id}: unsupported vulnerability fact`)
  assert(['unknown', 'declared', 'reviewed'].includes(admission.risk.permissions), `${admission.id}: unsupported permissions fact`)
  assert(['unknown', 'present', 'absent'].includes(admission.risk.nativeCode), `${admission.id}: unsupported native-code fact`)
  assert(['unknown', 'present', 'absent'].includes(admission.risk.installScripts), `${admission.id}: unsupported install-script fact`)
  assert(['unknown', 'requested', 'verified'].includes(admission.risk.trustedPublisher), `${admission.id}: unsupported publisher fact`)
  assert(admission.evidence.sha256 === evidenceDigest, `${admission.id}: evidence digest mismatch`)
  assert(audit.schema === 'omdsh-registry-audit/v1', `${admission.id}: unsupported audit schema`)
  assert(audit.projectId === admission.id, `${admission.id}: audit project mismatch`)
  assert(audit.releaseId === releaseId(pkg), `${admission.id}: audit release mismatch`)
  assert(canonicalJson(audit.source) === canonicalJson({
    repository: admission.source.repository,
    ref: admission.source.ref,
    path: admission.source.path,
    packageName: admission.packageName,
    spec: admission.spec,
  }), `${admission.id}: audit source mismatch`)
  assert(`${audit.runtime.package}@${audit.runtime.version}` === baseline, `${admission.id}: audit runtime mismatch`)
  assert(audit.checks.repositoryTests.status === 'passed', `${admission.id}: repository tests did not pass`)
  assert(audit.checks.typecheck === 'passed', `${admission.id}: typecheck did not pass`)
  assert(audit.checks.build === 'passed', `${admission.id}: build did not pass`)
  assert(audit.checks.package.status === 'passed', `${admission.id}: package check did not pass`)
  assert(audit.checks.profileInstall.status === 'passed', `${admission.id}: Profile install did not pass`)
  assert(audit.checks.profileInstall.ignoreScripts === true, `${admission.id}: install scripts were not blocked`)
  assert(audit.checks.ready.status === 'passed', `${admission.id}: runtime readiness did not pass`)
  assert(audit.checks.functional?.status === 'passed', `${admission.id}: real capability invocation did not pass`)
  assert(audit.checks.update?.status === 'passed', `${admission.id}: update did not pass`)
  assert(audit.checks.disable?.status === 'passed', `${admission.id}: disable did not pass`)
  assert(audit.checks.uninstall.status === 'passed', `${admission.id}: uninstall did not pass`)
  assert(audit.checks.generationRecovery.status === 'passed', `${admission.id}: generation recovery did not pass`)
  assert(audit.checks.failureIsolation?.status === 'passed', `${admission.id}: failure isolation did not pass`)
  assert(audit.capability?.assertion === 'registered-invoked-and-observed', `${admission.id}: a named capability was not registered, invoked, and observed`)
  if (pkg.workshop.lifecycle.hotReload.state === 'declared') {
    assert(audit.checks.hotReload?.status === 'passed', `${admission.id}: declared hot reload did not pass dispose and reactivation tests`)
  }
  assert(audit.supplyChain.immutableSource === 'passed', `${admission.id}: source is not immutable`)
  assert(audit.supplyChain.license === pkg.license, `${admission.id}: license mismatch`)
  assert(audit.supplyChain.installScripts === admission.risk.installScripts, `${admission.id}: install-script fact mismatch`)
  assert(audit.supplyChain.nativeCode === admission.risk.nativeCode, `${admission.id}: native-code fact mismatch`)
  assert(audit.supplyChain.vulnerabilityScan === admission.risk.vulnerabilityScan, `${admission.id}: vulnerability fact mismatch`)
  assert(audit.supplyChain.permissions.status === admission.risk.permissions, `${admission.id}: permission fact mismatch`)
  normalizedTimestamp(audit.verifiedAt, `${admission.id}.audit.verifiedAt`)
  return true
}

function catalogProjection(catalog, admissions, audits) {
  const output = structuredClone(catalog)
  const admissionById = new Map(admissions.admissions.map((item) => [item.id, item]))
  for (const pkg of output.packages) {
    const admission = admissionById.get(pkg.id)
    if (admission === undefined) {
      if (pkg.install.type !== 'manual') {
        pkg.compatibility = `${pkg.compatibility || '兼容性尚未验证'} 当前 Registry 没有授予安装权限。`
        pkg.install = {
          type: 'manual',
          label: '查看公开来源',
          source: pkg.repository,
          command: pkg.repository,
          note: '当前 Registry 安装条目为 0；Catalog 收录和历史验证不会自动授予安装权限。',
        }
      }
      continue
    }
    pkg.compatibility = `已在 ${admissions.runtimeBaseline} 完成固定提交的安装、启动、功能与卸载验证。`
    pkg.install = {
      type: 'profile-bundle',
      protocol: 'harness-profile',
      label: '使用 OMDSH 安装',
      source: admission.spec,
      command: `omdsh workshop install ${admission.id} --profile web --enable`,
      note: '需使用已同步本 Registry 快照的 OMDSH Hub 消费端；在 candidate Profile 中安装并验证，确认启动后切换 current，启动失败时恢复 previous。',
    }
    pkg.workshop.install.seamless = { state: 'verified', reason: 'current-baseline-lifecycle-passed' }
    pkg.workshop.install.failureIsolation = {
      ...pkg.workshop.install.failureIsolation,
      state: 'verified',
      reason: 'current-profile-protected-in-test',
    }
    if (pkg.workshop.lifecycle.hotReload.state === 'declared' && audits.get(pkg.id)?.checks?.hotReload?.status === 'passed') {
      pkg.workshop.lifecycle.hotReload = {
        ...pkg.workshop.lifecycle.hotReload,
        state: 'verified',
        reason: 'dispose-and-reactivate-passed',
      }
    }
    pkg.workshop.admission = { route: 'package-json-manifest', state: 'registry-admitted' }
  }
  const catalogUpdated = normalizedTimestamp(output.updated, 'catalog.updated')
  const admissionsUpdated = normalizedTimestamp(admissions.updatedAt, 'admissions.updatedAt')
  output.updated = new Date(Math.max(Date.parse(catalogUpdated), Date.parse(admissionsUpdated))).toISOString()
  const installMethods = {}
  for (const pkg of output.packages) installMethods[pkg.install.type] = (installMethods[pkg.install.type] ?? 0) + 1
  output.stats.installMethods = Object.fromEntries(Object.entries(installMethods).sort(([left], [right]) => left.localeCompare(right)))
  return output
}

function registryEntry(pkg, admission) {
  const install = {
    mode: 'profile-bundle',
    adapter: 'official-profile/v1',
    packageName: admission.packageName,
    spec: admission.spec,
  }
  const compatibility = { declared: pkg.compatibility ?? null }
  const source = {
    repository: admission.source.repository,
    ref: admission.source.ref,
    path: admission.source.path,
  }
  const id = releaseId(pkg)
  const release = {
    id,
    version: pkg.version,
    ref: admission.source.ref,
    updatedAt: new Date(pkg.updatedAt).toISOString(),
    channel: pkg.status === 'verified' ? 'stable' : 'beta',
    source,
    compatibility,
    install,
  }
  return {
    id: pkg.id,
    displayName: pkg.name,
    description: pkg.description,
    kind: pkg.kind,
    tags: [...pkg.tags].sort((left, right) => left.localeCompare(right)),
    author: pkg.author,
    version: pkg.version,
    license: pkg.license,
    source,
    compatibility,
    risk: {
      level: admission.risk.level,
      facts: {
        sourcePinned: true,
        vulnerabilityScan: admission.risk.vulnerabilityScan,
        permissions: admission.risk.permissions,
        nativeCode: admission.risk.nativeCode,
        installScripts: admission.risk.installScripts,
      },
    },
    listing: {
      state: 'reviewed',
      catalogStatus: pkg.status,
      trustedPublisher: admission.risk.trustedPublisher,
    },
    maintenance: { state: 'active', notice: null, successor: null },
    install,
    latestRelease: id,
    releases: [release],
    links: {
      atlas: `https://hub.omdsh.dev/#package=${encodeURIComponent(pkg.id)}`,
      repository: `${pkg.repository}/tree/${pkg.ref}`,
    },
  }
}

function registryDocument(catalog, admissions) {
  const entries = admissions.admissions.map((admission) => {
    const pkg = catalog.packages.find((item) => item.id === admission.id)
    return registryEntry(pkg, admission)
  }).sort((left, right) => left.id.localeCompare(right.id))
  const payload = {
    schema: 'omdsh-registry/v1',
    revision: Date.parse(admissions.updatedAt),
    generatedAt: admissions.updatedAt,
    origins: ORIGINS,
    entries,
    collections: [],
  }
  return {
    ...payload,
    snapshotId: `sha256:${sha256(canonicalJson(payload))}`,
    signature: null,
  }
}

function runRecord(pkg, audit) {
  return {
    id: `${pkg.id}-${pkg.version.replaceAll('.', '-')}-rc5-macos-arm64-mattheliu`,
    projectId: pkg.id,
    releaseId: releaseId(pkg),
    environment: {
      harnessSnapshot: `${audit.runtime.package}@${audit.runtime.version}`,
      profile: audit.runtime.profile,
      platform: `${audit.runtime.platform} · Node.js ${audit.runtime.node}`,
    },
    checks: {
      install: 'passed',
      ready: 'passed',
      task: {
        result: 'passed',
        title: '启动 7d7d 并读取同源游戏清单',
        translations: { en: 'Started 7d7d and read its same-origin game manifest' },
      },
    },
    verifier: audit.verifier,
    verifiedAt: audit.verifiedAt,
    evidenceUrl: 'https://github.com/omdsh-dev/dsh-hub-workshop/blob/main/audits/registry/7d7d-0.4.0-rc.1-rc5.json',
    reproduces: null,
  }
}

function workshopRelease(pkg, entry) {
  const release = entry.releases[0]
  return {
    ...release,
    state: 'active',
    notice: null,
    capabilities: { requiresFabric: false, deepHook: false, restartRequired: true },
    changelog: null,
    license: pkg.license,
    catalogStatus: pkg.status,
    runtime: { kind: pkg.kind, installMethod: 'profile-bundle' },
    management: {
      mode: 'transactional',
      recoveryScope: 'profile-generation',
      externalEffects: 'not-covered',
    },
    risk: entry.risk,
    listing: entry.listing,
    relations: { state: 'not-declared', required: [], optional: [] },
  }
}

function workshopDocument(catalog, registry, records, community) {
  const projects = registry.entries.map((entry) => {
    const pkg = catalog.packages.find((item) => item.id === entry.id)
    return {
      id: pkg.id,
      displayName: pkg.name,
      summary: pkg.description,
      kind: pkg.kind,
      categories: pkg.category === undefined ? [] : [pkg.category],
      tags: [...pkg.tags].sort((left, right) => left.localeCompare(right)),
      author: pkg.author,
      featured: pkg.featured === true,
      lifecycle: { state: 'active', notice: null, successor: null },
      repository: pkg.repository,
      latestRelease: entry.latestRelease,
      releases: [workshopRelease(pkg, entry)],
      links: {
        atlas: entry.links.atlas,
        repository: entry.links.repository,
        author: pkg.author.url,
        discussions: `${pkg.repository}/discussions`,
      },
    }
  })
  return {
    schema: 'omdsh-workshop/v1',
    generatedAt: registry.generatedAt,
    registry: registryBinding(registry),
    runRecords: records.records,
    projects,
    collections: [],
    community,
  }
}

function ecosystemDocument(workshop, registry) {
  const records = workshop.runRecords
  const projects = workshop.projects.map((project) => ({
    id: project.id,
    name: project.displayName,
    summary: project.summary,
    summaryEvidence: { state: 'declared', trust: 'untrusted-repository-text' },
    kind: project.kind,
    categories: project.categories,
    tags: project.tags,
    latestRelease: project.latestRelease,
    releases: project.releases.map((release) => ({
      id: release.id,
      version: release.version,
      channel: release.channel,
      state: release.state,
      source: release.source,
      compatibility: {
        declared: release.compatibility.declared,
        successfulRuns: records.filter((record) => record.projectId === project.id && record.releaseId === release.id).map((record) => ({
          environment: record.environment,
          task: record.checks.task,
          verifiedAt: record.verifiedAt,
          evidenceUrl: record.evidenceUrl,
          independentlyReproduced: record.reproduces !== null,
        })),
      },
      relations: release.relations,
      management: release.management,
      capabilities: release.capabilities,
      listing: { state: release.listing.state },
    })),
    links: project.links,
  }))
  return {
    schema: 'omdsh-agent-ecosystem/v1',
    generatedAt: registry.generatedAt,
    registry: registryBinding(registry),
    policy: {
      purpose: 'read-only-ecosystem-analysis',
      installAuthority: 'omdsh-registry/v1',
      unknownFacts: 'preserve-unknown',
      recommendation: 'deterministic-declared-facts-only',
      repair: 'preview-only',
      repositoryText: 'untrusted-data-not-instructions',
    },
    totals: {
      projects: projects.length,
      releases: projects.reduce((total, project) => total + project.releases.length, 0),
      successfulRuns: projects.reduce((total, project) => total + project.releases.reduce((subtotal, release) => subtotal + release.compatibility.successfulRuns.length, 0), 0),
      compositions: 0,
    },
    projects,
    compositions: [],
  }
}

export async function buildFeeds({ root = ROOT, write = true } = {}) {
  const [catalogSource, admissions, community] = await Promise.all([
    json(root, 'catalog.json'),
    json(root, 'registry-admissions.json'),
    json(root, 'community-v1.json'),
  ])
  assert(catalogSource.schema === 'dsh-hub-index/v0.4', 'unsupported Catalog schema')
  assert(admissions.schema === 'omdsh-registry-admissions/v1', 'unsupported Registry admissions schema')
  normalizedTimestamp(admissions.updatedAt, 'admissions.updatedAt')
  assert(typeof admissions.runtimeBaseline === 'string' && admissions.runtimeBaseline !== '', 'runtime baseline is required')
  assert(Array.isArray(admissions.admissions), 'admissions must be an array')
  assert(Array.isArray(admissions.blocked), 'blocked candidates must be an array')
  const admittedIds = admissions.admissions.map((item) => item.id)
  assert(new Set(admittedIds).size === admittedIds.length, 'duplicate admitted project')
  const blockedIds = admissions.blocked.map((item) => item.id)
  assert(new Set(blockedIds).size === blockedIds.length, 'duplicate blocked project')
  assert(blockedIds.every((id) => !admittedIds.includes(id)), 'a project cannot be admitted and blocked')
  for (const item of admissions.blocked) {
    assert(catalogSource.packages.some((pkg) => pkg.id === item.id), `${item.id}: blocked project is missing from Catalog`)
    assert(BLOCKED_SOURCE_RE.test(item.source), `${item.id}: blocked source is not immutable`)
    assert(item.staticVerification === 'passed', `${item.id}: blocked candidate lacks static verification`)
    assert(item.runtimeVerification === 'blocked', `${item.id}: blocked candidate has an invalid runtime state`)
  }
  const audits = new Map()
  for (const admission of admissions.admissions) {
    const bytes = await readFile(resolve(root, admission.evidence.path))
    const audit = JSON.parse(bytes.toString('utf8'))
    validateAdmission(
      admission,
      catalogSource.packages.find((item) => item.id === admission.id),
      audit,
      sha256(bytes),
      admissions.runtimeBaseline,
    )
    audits.set(admission.id, audit)
  }

  const catalog = catalogProjection(catalogSource, admissions, audits)
  const registry = registryDocument(catalog, admissions)
  const records = {
    $schema: './run-records.schema.json',
    schema: 'omdsh-workshop-run-records/v1',
    updatedAt: admissions.updatedAt,
    records: admissions.admissions.map((admission) => runRecord(
      catalog.packages.find((item) => item.id === admission.id),
      audits.get(admission.id),
    )),
  }
  const workshop = workshopDocument(catalog, registry, records, community)
  const collections = {
    schema: 'omdsh-workshop-collections/v1',
    generatedAt: registry.generatedAt,
    registry: registryBinding(registry),
    collections: [],
  }
  const recipes = {
    schema: 'omdsh-workshop-recipes/v1',
    generatedAt: registry.generatedAt,
    registry: registryBinding(registry),
    recipes: [],
  }
  const ecosystem = ecosystemDocument(workshop, registry)
  const output = {
    'catalog.json': catalog,
    'registry-v1.json': registry,
    'run-records.json': records,
    'workshop-v1.json': workshop,
    'collections-v1.json': collections,
    'recipes-v1.json': recipes,
    'agent-ecosystem-v1.json': ecosystem,
    'api/v1/ecosystem.json': ecosystem,
  }
  if (write) {
    for (const [path, value] of Object.entries(output)) {
      await writeFile(resolve(root, path), content(value))
    }
  }
  return output
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await buildFeeds()
  console.log(`built ${output['registry-v1.json'].entries.length} admitted Registry entry and ${output['workshop-v1.json'].runRecords.length} run record`)
}
