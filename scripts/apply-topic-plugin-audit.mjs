#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const [catalog, audit] = await Promise.all([
  readFile(resolve(ROOT, 'catalog.json'), 'utf8').then(JSON.parse),
  readFile(resolve(ROOT, 'topic-plugin-audit.json'), 'utf8').then(JSON.parse),
])

if (catalog.schema !== 'dsh-hub-index/v0.3') throw new Error('unsupported Catalog schema')
if (audit.schema !== 'omdsh-topic-plugin-audit/v1') throw new Error('unsupported Topic plugin audit schema')

const repositoryKey = (url) => new URL(url).pathname.split('/').filter(Boolean).slice(0, 2).join('/').toLocaleLowerCase('en-US')
const safeSlug = (value) => String(value).toLocaleLowerCase('en-US').replace(/[^a-z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '')
const inferKind = (entry) => {
  const text = `${entry.name} ${(entry.evidence?.pluginClaims || []).join(' ')}`.toLocaleLowerCase('en-US')
  if (/\bmcp\b/.test(text)) return 'mcp'
  if (/\b(skill|prompt)\b/.test(text)) return 'skill'
  if (/\b(channel|telegram|feishu|wechat|wecom|qq|bot)\b/.test(text)) return 'channel'
  if (/\b(ui|web|sidebar|panel|theme|skin|renderer|terminal|desktop|notification)\b/.test(text)) return 'ui'
  if (/\b(adapter|bridge|compat)\b/.test(text)) return 'adapter'
  if (/\b(toolkit|tools|tool)\b/.test(text)) return 'toolkit'
  return 'extension'
}
const inferCategory = (entry) => {
  const text = entry.name.toLocaleLowerCase('en-US')
  if (/\b(memory|session|context|recall|compact)\b/.test(text)) return 'memory'
  if (/\b(channel|telegram|feishu|wechat|wecom|qq|bot)\b/.test(text)) return 'channels'
  if (/\b(security|audit|safety|guard|approval|permission)\b/.test(text)) return 'safety'
  if (/\b(ui|web|sidebar|panel|theme|skin|terminal|desktop|notification|tui)\b/.test(text)) return 'interface'
  return 'developer-tools'
}
const auditByRepository = new Map(audit.repositories.map((entry) => [`${entry.owner}/${entry.name}`.toLocaleLowerCase('en-US'), entry]))
const reviewedEntries = catalog.packages.filter((entry) => entry.status !== 'discovery' && entry.id !== 'dsh-tool-browser')
const reviewedRepositories = new Set(reviewedEntries.map((entry) => repositoryKey(entry.repository)))
const discoveryEntries = catalog.packages.filter((entry) => {
  if (entry.status !== 'discovery') return false
  const classification = auditByRepository.get(repositoryKey(entry.repository))
  return classification?.decision === 'include' && !reviewedRepositories.has(repositoryKey(entry.repository))
}).map((entry) => {
  const classification = auditByRepository.get(repositoryKey(entry.repository))
  return {
    ...entry,
    compatibility: entry.compatibility
      .replace('通过 GitHub dsh-plugin Topic 公开发现', '已发现可核验的 DSH 插件契约')
      .replace('从归档版 DSH Hub 恢复条目信息，并映射到当前公开 Topic 仓库', '从归档版 DSH Hub 恢复条目信息，并映射到当前具备插件契约证据的公开仓库'),
    install: {
      ...entry.install,
      note: entry.install.note
        .replace('Topic 标签只用于发现。', '插件契约证据只用于 Catalog 收录。')
        .replace('当前条目只提供公开来源', '当前条目只提供已识别的插件公开来源'),
    },
    discovery: {
      ...entry.discovery,
      qualification: classification.reasonCode,
    },
  }
})
const representedRepositories = new Set([...discoveryEntries, ...reviewedEntries].map((entry) => repositoryKey(entry.repository)))
const generatedEntries = audit.repositories
  .filter((entry) => entry.decision === 'include' && !representedRepositories.has(`${entry.owner}/${entry.name}`.toLocaleLowerCase('en-US')))
  .map((entry) => ({
    id: safeSlug(`${entry.owner}/${entry.name}`),
    name: entry.name,
    description: `经文件级证据识别的 DeepSeek Harness 插件仓库：${entry.owner}/${entry.name}。`,
    kind: inferKind(entry),
    category: inferCategory(entry),
    tags: ['dsh-plugin'],
    author: { name: entry.owner, url: `https://github.com/${entry.owner}` },
    repository: entry.url,
    repositoryPath: '',
    ref: entry.defaultBranch,
    updatedAt: audit.sourceSnapshotGeneratedAt,
    license: '见仓库',
    status: 'discovery',
    compatibility: '已发现可核验的 DSH 插件契约；尚未经过 Workshop 兼容与安装审核。',
    install: {
      type: 'manual',
      label: '查看公开来源',
      source: entry.url,
      command: entry.url,
      note: '插件契约证据只用于 Catalog 收录。请先检查源码、许可证、固定版本、权限和运行环境；该条目尚未获得 Registry 安装权限。',
    },
    featured: false,
    discovery: {
      source: 'github-topic',
      topic: 'dsh-plugin',
      stars: 0,
      commitUpdatedAt: audit.sourceSnapshotGeneratedAt,
      metadataUpdatedAt: audit.sourceSnapshotGeneratedAt,
      archived: entry.archived,
      qualification: entry.reasonCode,
    },
  }))
const packages = [...discoveryEntries, ...generatedEntries, ...reviewedEntries]
const catalogRepositories = new Set(packages.map((entry) => repositoryKey(entry.repository)))
const countBy = (field) => Object.fromEntries([...new Set(packages.map((entry) => entry[field]))]
  .sort()
  .map((value) => [value, packages.filter((entry) => entry[field] === value).length]))
const installMethods = Object.fromEntries([...new Set(packages.map((entry) => entry.install.type))]
  .sort()
  .map((value) => [value, packages.filter((entry) => entry.install.type === value).length]))

const output = {
  ...catalog,
  policy: {
    discovery: 'The dsh-plugin Topic is only a candidate source. Catalog inclusion requires file-level evidence of a DSH plugin contract or a manually verified plugin subproject.',
    exclusions: 'Core products, ecosystem infrastructure, distributions, awesome lists, documentation, templates, standalone applications, placeholders, unavailable private sources, and Topic-only repositories are excluded from the plugin Catalog. Separately curated market layers do not grant plugin or installation status.',
    archive: 'Detailed legacy records are restored only when they map to a currently qualified plugin repository.',
    authority: 'Plugin qualification and archive mapping do not grant Registry installation authority.',
  },
  stats: {
    packages: packages.length,
    repositories: catalogRepositories.size,
    observedTopicRepositories: audit.stats.repositories,
    qualifiedRepositories: audit.stats.decisions.include,
    pendingRepositories: audit.stats.decisions.review,
    excludedRepositories: audit.stats.decisions.exclude,
    reviewed: reviewedEntries.length,
    featured: packages.filter((entry) => entry.featured).length,
    categories: countBy('category'),
    kinds: countBy('kind'),
    installMethods,
  },
  packages,
}

await writeFile(resolve(ROOT, 'catalog.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify(output.stats, null, 2))
