#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const BUILD = resolve(ROOT, '.public-site')
const RETIRED_PRIVATE_OWNER = ['dsh', 'external'].join('-')
const json = async (path) => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'))

async function files(directory) {
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) output.push(...await files(path))
    else if (entry.isFile()) output.push(path)
    else throw new Error(`public build contains a non-regular entry: ${path}`)
  }
  return output
}

const [catalog, registry, recipes, ecosystem, workshop, runRecords, admissions, repositories, discovery, topicRepositories, topicAudit] = await Promise.all([
  json('catalog.json'),
  json('registry-v1.json'),
  json('recipes-v1.json'),
  json('api/v1/ecosystem.json'),
  json('workshop-v1.json'),
  json('run-records.json'),
  json('registry-admissions.json'),
  json('ecosystem-repositories.json'),
  json('public-discovery.json'),
  json('topic-repositories.json'),
  json('topic-plugin-audit.json'),
])

if (catalog.schema !== 'dsh-hub-index/v0.3') throw new Error('catalog schema mismatch')
if (registry.schema !== 'omdsh-registry/v1') throw new Error('Registry schema mismatch')
if (recipes.schema !== 'omdsh-workshop-recipes/v1') throw new Error('Recipes schema mismatch')
if (ecosystem.schema !== 'omdsh-agent-ecosystem/v1') throw new Error('Ecosystem schema mismatch')
if (recipes.registry?.snapshotId !== registry.snapshotId
  || ecosystem.registry?.snapshotId !== registry.snapshotId
  || workshop.registry?.snapshotId !== registry.snapshotId) {
  throw new Error('public feeds do not share one Registry snapshot')
}
if (admissions.schema !== 'omdsh-registry-admissions/v1'
  || registry.entries.length !== admissions.admissions.length
  || registry.entries.length !== 0
  || workshop.projects.length !== 0
  || workshop.runRecords.length !== 0
  || runRecords.records.length !== 0
  || ecosystem.projects.length !== 0
  || recipes.recipes.length !== 0) {
  throw new Error('public install feeds must remain empty until a current-baseline admission passes every gate')
}
if (topicAudit.schema !== 'omdsh-topic-plugin-audit/v1'
  || topicAudit.stats?.repositories !== topicRepositories.observedRepositoryCount
  || topicAudit.repositories.length !== topicRepositories.observedRepositoryCount
  || Object.values(topicAudit.stats?.decisions || {}).reduce((total, count) => total + count, 0) !== topicAudit.stats.repositories) {
  throw new Error('Topic plugin audit must classify every observed repository exactly once')
}
const qualifiedRepositories = new Set(topicAudit.repositories
  .filter((entry) => entry.decision === 'include')
  .map((entry) => `${entry.owner}/${entry.name}`.toLocaleLowerCase('en-US')))
const catalogRepositories = new Set(catalog.packages.map((entry) => new URL(entry.repository).pathname.split('/').filter(Boolean).slice(0, 2).join('/').toLocaleLowerCase('en-US')))
if (catalog.packages.length !== catalog.stats?.packages
  || catalog.stats?.repositories !== catalogRepositories.size
  || catalog.stats?.observedTopicRepositories !== 255
  || catalog.stats?.qualifiedRepositories !== topicAudit.stats.decisions.include
  || catalog.stats?.pendingRepositories !== topicAudit.stats.decisions.review
  || catalog.stats?.excludedRepositories !== topicAudit.stats.decisions.exclude
  || catalog.stats?.reviewed !== 11
  || new Set(catalog.packages.map((entry) => entry.id)).size !== catalog.packages.length
  || catalogRepositories.size !== qualifiedRepositories.size
  || [...catalogRepositories].some((repository) => !qualifiedRepositories.has(repository))) {
  throw new Error('public catalog must contain only qualified plugin entries and eleven reviewed candidates')
}
if (repositories.schema !== 'omdsh-public-repositories/v1' || repositories.repositories.length !== 9) {
  throw new Error('public repository map must contain the nine approved repositories')
}
if (discovery.schema !== 'omdsh-public-discovery/v1') throw new Error('public discovery schema mismatch')
if (discovery.organization?.owner !== 'omdsh-dev'
  || discovery.organization?.observedRepositoryCount !== 63
  || discovery.organization?.projectCount !== 62
  || discovery.organization?.repositories?.length !== 63) {
  throw new Error('public organization discovery snapshot must contain 63 repositories and 62 projects')
}
if (discovery.topic?.name !== 'dsh-plugin'
  || discovery.topic?.observedRepositoryCount !== 255
  || discovery.topic?.status !== 'discovery-only') {
  throw new Error('dsh-plugin Topic must remain a 255-repository discovery-only snapshot')
}
if (topicRepositories.schema !== 'dsh-topic-discovery/v1'
  || topicRepositories.topic !== 'dsh-plugin'
  || topicRepositories.observedRepositoryCount !== 255
  || topicRepositories.repositories.length !== 255
  || topicRepositories.status !== 'discovery-only') {
  throw new Error('Topic repository snapshot must contain all 255 public discovery repositories')
}

const builtFiles = await files(BUILD)
if (builtFiles.length !== 42) throw new Error(`public build must contain exactly 42 files, received ${builtFiles.length}`)
for (const repository of repositories.repositories) {
  if (!/^https:\/\/github[.]com\/omdsh-dev\/[A-Za-z0-9._-]+$/.test(repository.url)) {
    throw new Error(`unapproved public repository URL: ${repository.url}`)
  }
}
for (const repository of discovery.organization.repositories) {
  if (!/^https:\/\/github[.]com\/omdsh-dev\/[A-Za-z0-9._-]+$/.test(repository.url)) {
    throw new Error(`unapproved discovery repository URL: ${repository.url}`)
  }
}
for (const repository of topicRepositories.repositories) {
  if (!/^https:\/\/github[.]com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9._-]+$/.test(repository.url)) {
    throw new Error(`invalid Topic discovery repository URL: ${repository.url}`)
  }
}
for (const repository of topicAudit.repositories) {
  if (!/^https:\/\/github[.]com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9._-]+$/.test(repository.url)) {
    throw new Error(`invalid Topic plugin audit repository URL: ${repository.url}`)
  }
}
for (const entry of catalog.packages) {
  if (!/^https:\/\/github[.]com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9._-]+$/.test(entry.repository)) {
    throw new Error(`invalid catalog repository URL: ${entry.repository}`)
  }
}

const publicTextExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.yaml', '.yml'])
const contents = (await Promise.all(builtFiles
  .filter((path) => publicTextExtensions.has(path.slice(path.lastIndexOf('.'))))
  .map((path) => readFile(path, 'utf8')))).join('\n')
const forbiddenPublicContent = new RegExp(`${RETIRED_PRIVATE_OWNER}|Private Preview|/auth/github|github_pat_|\\bgh[opusr]_|\\bnpm_[A-Za-z0-9]{20,}|-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----`, 'i')
if (forbiddenPublicContent.test(contents)) {
  throw new Error('public site contains private-source, login, credential, or key material')
}

const [home, app, styles, configurations, developers, publish, contributing] = await Promise.all([
  readFile(resolve(ROOT, 'index.html'), 'utf8'),
  readFile(resolve(ROOT, 'assets/app.js'), 'utf8'),
  readFile(resolve(ROOT, 'assets/styles.css'), 'utf8'),
  readFile(resolve(ROOT, 'configurations.html'), 'utf8'),
  readFile(resolve(ROOT, 'developer-guide.html'), 'utf8'),
  readFile(resolve(ROOT, 'publish.html'), 'utf8'),
  readFile(resolve(ROOT, 'contributing.html'), 'utf8'),
])
for (const required of ['discover-stage', 'featured-tabs', 'data-catalog-view="grid"', 'data-catalog-view="list"', 'catalog-pagination']) {
  if (!home.includes(required)) throw new Error(`restored Workshop layout is missing ${required}`)
}
if (!app.includes('featured.empty.recoverable') || !app.includes('visiblePackages')) {
  throw new Error('restored Workshop interactions must preserve empty recoverable state and catalog pagination')
}
if (!home.includes('data-featured-mode="stars"')
  || !app.includes('projectStars')
  || !app.includes('commitUpdatedAt')) {
  throw new Error('featured lanes must use GitHub stars and repository commit activity')
}
for (const [name, source, minimumLines, required] of [
  ['configurations', configurations, 150, 'configuration-task-finder'],
  ['developer guide', developers, 700, 'ai-integration-prompt'],
  ['publish', publish, 250, 'manifest-form'],
  ['contributing', contributing, 330, 'omdsh-workshop-submission/v1'],
]) {
  if (source.split('\n').length < minimumLines || !source.includes(required)) {
    throw new Error(`${name} page regressed to an incomplete public placeholder`)
  }
}
if (!/\.author-project-mark\s*\{[^}]*position:\s*relative;[^}]*overflow:\s*hidden;/s.test(styles)) {
  throw new Error('author project artwork must remain clipped to its icon container')
}

console.log(`public site accepted: ${catalog.packages.length} catalog entries (${catalog.stats.reviewed} reviewed), ${discovery.organization.projectCount} organization projects, ${discovery.topic.observedRepositoryCount} Topic repositories, ${registry.entries.length} install entry, snapshot ${registry.snapshotId}`)
