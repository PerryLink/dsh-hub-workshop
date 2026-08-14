#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const json = (path) => readFile(resolve(ROOT, path), 'utf8').then(JSON.parse)
const [catalog, audit, topic, marketLayers] = await Promise.all([
  json('catalog.json'), json('topic-plugin-audit.json'), json('topic-repositories.json'), json('market-layers.json'),
])
if (catalog.schema !== 'dsh-hub-index/v0.3') throw new Error('unsupported Catalog schema')
if (audit.schema !== 'omdsh-topic-plugin-audit/v2') throw new Error('unsupported Topic audit schema')

const repositoryKey = (url) => new URL(url).pathname.split('/').filter(Boolean).slice(0, 2).join('/').toLocaleLowerCase('en-US')
const safeSlug = (value) => String(value).toLocaleLowerCase('en-US').replace(/[^a-z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '')
const topicByRepository = new Map(topic.repositories.map((entry) => [`${entry.owner}/${entry.name}`.toLocaleLowerCase('en-US'), entry]))
const auditByRepository = new Map(audit.repositories.map((entry) => [`${entry.owner}/${entry.name}`.toLocaleLowerCase('en-US'), entry]))

function entryText(entry) {
  const snapshot = topicByRepository.get(`${entry.owner}/${entry.name}`.toLocaleLowerCase('en-US'))
  return `${entry.name} ${snapshot?.description || ''}`.toLocaleLowerCase('en-US')
}

function inferKind(entry) {
  const text = entryText(entry)
  if (/\bmcp\b/.test(text)) return 'mcp'
  if (/\b(skill|prompt)\b/.test(text)) return 'skill'
  if (/\b(channel|telegram|feishu|lark|wechat|wecom|qq|bot)\b/.test(text)) return 'channel'
  if (/\b(ui|web|sidebar|panel|theme|skin|renderer|terminal|notification)\b/.test(text)) return 'ui'
  if (/\b(adapter|bridge|compat)\b/.test(text)) return 'adapter'
  if (/\b(toolkit|tools|tool)\b/.test(text)) return 'toolkit'
  return 'extension'
}

function inferCategory(entry) {
  const text = entryText(entry)
  if (/\b(memory|session|context|recall|compact)\b/.test(text)) return 'memory'
  if (/\b(channel|telegram|feishu|lark|wechat|wecom|qq|bot)\b/.test(text)) return 'channels'
  if (/\b(security|audit|safety|guard|approval|permission)\b/.test(text)) return 'safety'
  if (/\b(ui|web|sidebar|panel|theme|skin|terminal|desktop|notification|tui)\b/.test(text)) return 'interface'
  return 'developer-tools'
}

function discoveryFacts(snapshot, qualification) {
  return {
    source: 'github-topic', topic: 'dsh-plugin',
    stars: snapshot?.stars || 0,
    commitUpdatedAt: snapshot?.commitUpdatedAt || audit.sourceSnapshotGeneratedAt,
    metadataUpdatedAt: snapshot?.metadataUpdatedAt || audit.sourceSnapshotGeneratedAt,
    archived: snapshot?.archived || false,
    qualification,
  }
}

const reviewedEntries = catalog.packages.filter((entry) => entry.status !== 'discovery' && entry.id !== 'dsh-tool-browser')
const retainedDiscoveryEntries = catalog.packages.filter((entry) => entry.status === 'discovery'
  && auditByRepository.get(repositoryKey(entry.repository))?.decision === 'include')
  .map((entry) => {
    const key = repositoryKey(entry.repository)
    const classification = auditByRepository.get(key)
    const snapshot = topicByRepository.get(key)
    return {
      ...entry,
      description: snapshot?.description || entry.description,
      ref: classification.defaultBranch,
      updatedAt: snapshot?.commitUpdatedAt || entry.updatedAt,
      compatibility: classification.qualification === 'verified'
        ? '已识别可核验的 DSH 插件契约；尚未经过当前官方基线安装验证。'
        : '作者明确声明为 DSH 插件；来源与协议仍处于待审核状态。',
      install: {
        type: 'manual', label: '查看公开来源', source: entry.repository, command: entry.repository,
        note: '展示与待审核状态不授予安装权限。请先核验固定版本、许可、权限、供应链与当前官方基线。',
      },
      discovery: discoveryFacts(snapshot, classification.reasonCode),
    }
  })

const representedRepositories = new Set([...retainedDiscoveryEntries, ...reviewedEntries].map((entry) => repositoryKey(entry.repository)))
const generatedEntries = audit.repositories
  .filter((entry) => entry.decision === 'include' && !representedRepositories.has(`${entry.owner}/${entry.name}`.toLocaleLowerCase('en-US')))
  .map((entry) => {
    const key = `${entry.owner}/${entry.name}`.toLocaleLowerCase('en-US')
    const snapshot = topicByRepository.get(key)
    return {
      id: safeSlug(`${entry.owner}/${entry.name}`),
      name: entry.name,
      description: snapshot?.description || `${entry.owner}/${entry.name} 声明为 DeepSeek Harness 生态插件。`,
      kind: inferKind(entry),
      category: inferCategory(entry),
      tags: ['dsh-plugin'],
      author: { name: entry.owner, url: `https://github.com/${entry.owner}` },
      repository: entry.url,
      repositoryPath: '',
      ref: entry.defaultBranch,
      updatedAt: snapshot?.commitUpdatedAt || audit.sourceSnapshotGeneratedAt,
      license: '未声明',
      status: 'discovery',
      compatibility: entry.qualification === 'verified'
        ? '已识别可核验的 DSH 插件契约；尚未经过当前官方基线安装验证。'
        : '作者明确声明为 DSH 插件；来源与协议仍处于待审核状态。',
      install: {
        type: 'manual', label: '查看公开来源', source: entry.url, command: entry.url,
        note: '展示与待审核状态不授予安装权限。请先核验固定版本、许可、权限、供应链与当前官方基线。',
      },
      featured: false,
      discovery: discoveryFacts(snapshot, entry.reasonCode),
    }
  })

const packages = [...retainedDiscoveryEntries, ...generatedEntries, ...reviewedEntries]
  .sort((left, right) => Number(right.status !== 'discovery') - Number(left.status !== 'discovery')
    || Number(right.discovery?.stars || 0) - Number(left.discovery?.stars || 0)
    || left.id.localeCompare(right.id))
const catalogRepositories = new Set(packages.map((entry) => repositoryKey(entry.repository)))
const countBy = (field) => Object.fromEntries([...new Set(packages.map((entry) => entry[field]))]
  .sort().map((value) => [value, packages.filter((entry) => entry[field] === value).length]))
const installMethods = Object.fromEntries([...new Set(packages.map((entry) => entry.install.type))]
  .sort().map((value) => [value, packages.filter((entry) => entry.install.type === value).length]))

const catalogOutput = {
  ...catalog,
  updated: audit.sourceSnapshotGeneratedAt,
  policy: {
    discovery: 'Explicit DSH plugin works are displayed; verified versus pending-review reflects evidence depth, not installation authority.',
    exclusions: 'Core products, Awesome/documentation, templates/placeholders, and Topic-only traffic matches without a DSH work claim are excluded. Genuine ecosystem infrastructure and distributions are displayed separately.',
    archive: 'Archived genuine works remain visible with their archived source fact.',
    authority: 'Catalog visibility and review state never grant Registry installation authority.',
  },
  stats: {
    packages: packages.length,
    repositories: catalogRepositories.size,
    observedTopicRepositories: audit.stats.repositories,
    qualifiedRepositories: audit.stats.decisions.include || 0,
    pendingRepositories: audit.stats.pluginQualifications['pending-review'] || 0,
    marketRepositories: audit.stats.decisions.market || 0,
    excludedRepositories: audit.stats.decisions.exclude || 0,
    reviewed: reviewedEntries.length,
    featured: packages.filter((entry) => entry.featured).length,
    categories: countBy('category'),
    kinds: countBy('kind'),
    installMethods,
  },
  packages,
}

const curatedMarket = marketLayers.projects.filter((project) => project.review.state === 'curated')
const curatedIds = new Set(curatedMarket.map((project) => project.id))
const discoveredMarket = audit.repositories
  .filter((entry) => entry.decision === 'market' && !curatedIds.has(`${entry.owner}/${entry.name}`.toLocaleLowerCase('en-US')))
  .map((entry) => {
    const key = `${entry.owner}/${entry.name}`.toLocaleLowerCase('en-US')
    const snapshot = topicByRepository.get(key)
    const text = entryText(entry)
    const kind = entry.marketLayer === 'distribution'
      ? 'collection'
      : /desktop|launcher|client|terminal|tui|vscode|app|桌面|终端/i.test(text)
        ? 'application'
        : /adapter|bridge|integration|接入|桥接/i.test(text)
          ? 'integration'
          : /tool|dev|doctor|publisher|工具|诊断/i.test(text)
            ? 'toolkit'
            : 'manager'
    return {
      id: key,
      layer: entry.marketLayer,
      name: entry.name,
      description: snapshot?.description || `${entry.owner}/${entry.name} 是一个 DSH 生态项目。`,
      kind,
      category: entry.marketLayer === 'distribution' ? 'platform' : 'infrastructure',
      tags: ['dsh', entry.marketLayer === 'distribution' ? 'community-distribution' : 'ecosystem-infrastructure'],
      author: { name: entry.owner, url: `https://github.com/${entry.owner}` },
      source: { repository: entry.url, ref: entry.defaultBranch, path: null },
      updatedAt: snapshot?.commitUpdatedAt || audit.sourceSnapshotGeneratedAt,
      version: null,
      license: '未声明',
      featured: false,
      discovery: {
        stars: snapshot?.stars || 0,
        commitUpdatedAt: snapshot?.commitUpdatedAt || audit.sourceSnapshotGeneratedAt,
        metadataUpdatedAt: snapshot?.metadataUpdatedAt || audit.sourceSnapshotGeneratedAt,
        archived: snapshot?.archived || false,
      },
      review: { state: 'pending-review', reason: entry.reasonCode },
      verification: { state: 'unverified', evidence: 'GitHub Topic metadata and explicit DSH project claim; source review pending' },
      registry: { state: 'ineligible', reason: 'market-layer-not-plugin-install' },
    }
  })
const marketProjects = [...curatedMarket, ...discoveredMarket]
  .sort((left, right) => Number(right.review.state === 'curated') - Number(left.review.state === 'curated')
    || Number(right.discovery?.stars || 0) - Number(left.discovery?.stars || 0)
    || left.id.localeCompare(right.id))
const marketOutput = {
  ...marketLayers,
  schema: 'omdsh-market-layers/v2',
  generatedAt: audit.sourceSnapshotGeneratedAt,
  policy: {
    ...marketLayers.policy,
    infrastructure: 'Genuine DSH clients, managers, marketplaces, integrations, and developer tools are displayed separately from leaf plugins.',
    distribution: 'Genuine plugin collections and community distributions are displayed without inheriting installation authority from components.',
    excluded: 'Awesome/documentation, templates/placeholders, and Topic-only traffic matches without a DSH work claim remain outside the market.',
  },
  totals: {
    projects: marketProjects.length,
    infrastructure: marketProjects.filter((project) => project.layer === 'infrastructure').length,
    distribution: marketProjects.filter((project) => project.layer === 'distribution').length,
  },
  projects: marketProjects,
}

await Promise.all([
  writeFile(resolve(ROOT, 'catalog.json'), `${JSON.stringify(catalogOutput, null, 2)}\n`),
  writeFile(resolve(ROOT, 'market-layers.json'), `${JSON.stringify(marketOutput, null, 2)}\n`),
])
console.log(JSON.stringify({ catalog: catalogOutput.stats, market: marketOutput.totals }, null, 2))
