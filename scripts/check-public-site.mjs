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

const [catalog, registry, recipes, ecosystem, repositories, discovery] = await Promise.all([
  json('catalog.json'),
  json('registry-v1.json'),
  json('recipes-v1.json'),
  json('api/v1/ecosystem.json'),
  json('ecosystem-repositories.json'),
  json('public-discovery.json'),
])

if (catalog.schema !== 'dsh-hub-index/v0.2') throw new Error('catalog schema mismatch')
if (registry.schema !== 'omdsh-registry/v1') throw new Error('Registry schema mismatch')
if (recipes.schema !== 'omdsh-workshop-recipes/v1') throw new Error('Recipes schema mismatch')
if (ecosystem.schema !== 'omdsh-agent-ecosystem/v1') throw new Error('Ecosystem schema mismatch')
if (recipes.registry?.snapshotId !== registry.snapshotId || ecosystem.registry?.snapshotId !== registry.snapshotId) {
  throw new Error('public feeds do not share one Registry snapshot')
}
if (registry.entries.length !== 0 || recipes.recipes.length !== 0 || ecosystem.projects.length !== 0) {
  throw new Error('initial public deployment must keep install feeds empty until project review')
}
if (catalog.packages.length !== 12 || catalog.stats?.packages !== 12) {
  throw new Error('public discovery catalog must contain the twelve reviewed public-source candidates')
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
  || discovery.topic?.observedRepositoryCount !== 208
  || discovery.topic?.status !== 'discovery-only') {
  throw new Error('dsh-plugin Topic must remain a 208-repository discovery-only snapshot')
}

const builtFiles = await files(BUILD)
if (builtFiles.length !== 28) throw new Error(`public build must contain exactly 28 files, received ${builtFiles.length}`)
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

const publicFiles = [
  'index.html',
  'catalog.json',
  'registry-v1.json',
  'recipes-v1.json',
  'api/v1/ecosystem.json',
  'ecosystem-repositories.json',
  'public-discovery.json',
  'projects.html',
  'assets/app.js',
  'assets/discovery.js',
  'assets/i18n.json',
  'assets/site.js',
]
const contents = (await Promise.all(publicFiles.map((path) => readFile(resolve(ROOT, path), 'utf8')))).join('\n')
const forbiddenPublicContent = new RegExp(`${RETIRED_PRIVATE_OWNER}|Private Preview|/auth/github|github_pat_|\\bgh[opusr]_|\\bnpm_[A-Za-z0-9]{20,}|-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----`, 'i')
if (forbiddenPublicContent.test(contents)) {
  throw new Error('public site contains private-source, login, credential, or key material')
}

console.log(`public site accepted: ${catalog.packages.length} reviewed discovery entries, ${discovery.organization.projectCount} organization projects, ${discovery.topic.observedRepositoryCount} Topic candidates, 0 install entries, snapshot ${registry.snapshotId}`)
