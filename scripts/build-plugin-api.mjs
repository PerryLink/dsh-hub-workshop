#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const json = async (path) => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'))
const [catalog, candidates, inventory, marketLayers] = await Promise.all([
  json('catalog.json'),
  json('candidates-v1.json'),
  json('verification-inventory.json'),
  json('market-layers.json'),
])
const inventoryById = new Map(inventory.projects.map((project) => [project.id, project]))
const labels = {
  kinds: {
    skill: ['Skill', 'Skill'],
    mcp: ['MCP', 'MCP'],
    extension: ['扩展', 'Extension'],
    channel: ['渠道', 'Channel'],
    ui: ['界面扩展', 'UI'],
    adapter: ['适配器', 'Adapter'],
    manager: ['管理工具', 'Manager'],
    toolkit: ['工具集', 'Toolkit'],
  },
  categories: {
    workflow: ['工作流', 'Workflow'],
    'developer-tools': ['开发工具', 'Developer tools'],
    channels: ['消息渠道', 'Channels'],
    interface: ['界面', 'Interface'],
    platform: ['平台接入', 'Platform'],
    safety: ['安全', 'Safety'],
    memory: ['记忆', 'Memory'],
    infrastructure: ['基础设施', 'Infrastructure'],
    fun: ['趣味', 'Fun'],
    uncategorized: ['待分类', 'Uncategorized'],
  },
  management: {
    transactional: ['事务安装', 'Transactional'],
    managed: ['配置接入候选', 'Configuration candidate'],
    guided: ['引导接入', 'Guided'],
  },
  review: {
    'pending-review': ['待审核', 'Pending review'],
    'needs-fix': ['待修复', 'Needs fix'],
    blocked: ['已阻断', 'Blocked'],
    approved: ['审核通过', 'Approved'],
  },
}

function countBy(values, select) {
  const result = new Map()
  for (const value of values) {
    const key = select(value)
    result.set(key, (result.get(key) ?? 0) + 1)
  }
  return result
}

const catalogKinds = countBy(catalog.packages, (project) => project.kind)
const candidateKinds = countBy(candidates.projects || [], (project) => project.kind)
const catalogCategories = countBy(catalog.packages, (project) => project.category || 'uncategorized')
const candidateCategories = countBy(candidates.projects || [], (project) => project.category || 'uncategorized')
const management = countBy(inventory.projects, (project) => project.management)
const reviews = countBy(inventory.projects, (project) => project.review.state)

function publicSummary(project) {
  const summary = String(project.description || '')
  if (/@deepseek-ai\/dsh-repository-plugin|(?:^|\s)github:[^\s]+|\.dsh-plugin|\b(?:npm|pnpm|yarn|npx|curl|wget|dsh-sdk)\s+/i.test(summary)) {
    return `${project.name} is a public Catalog project. Review its pinned repository source, permissions, and current verification status before use.`
  }
  return summary
}

function taxonomy(group, catalogCounts, candidateCounts) {
  return Object.entries(labels[group]).map(([id, [zh, en]]) => {
    const catalogCount = catalogCounts.get(id) ?? 0
    const candidateCount = candidateCounts.get(id) ?? 0
    return {
      id,
      labels: { zh, en },
      counts: { catalog: catalogCount, candidates: candidateCount, total: catalogCount + candidateCount },
      examples: catalog.packages.filter((project) => (group === 'kinds' ? project.kind : project.category || 'uncategorized') === id).slice(0, 3).map((project) => project.id),
    }
  })
}

const pluginTypes = {
  schema: 'omdsh-ai-plugin-types/v1',
  generatedAt: inventory.generatedAt,
  scope: 'Public Catalog and formal Intake facts only. Discovery never authorizes installation.',
  totals: {
    catalogProjects: catalog.packages.length,
    candidateProjects: (candidates.projects || []).length,
    projects: catalog.packages.length + (candidates.projects || []).length,
  },
  kinds: taxonomy('kinds', catalogKinds, candidateKinds),
  categories: taxonomy('categories', catalogCategories, candidateCategories),
  management: Object.entries(labels.management).map(([id, [zh, en]]) => ({ id, labels: { zh, en }, count: management.get(id) ?? 0 })),
  reviewStates: Object.entries(labels.review).map(([id, [zh, en]]) => ({ id, labels: { zh, en }, count: reviews.get(id) ?? 0 })),
  guardrails: [
    'Catalog inclusion is not official-baseline verification.',
    'No installation command or executable package intent is exposed by this directory.',
    'Only an explicitly admitted Registry entry grants installation authority.',
  ],
}

const plugins = {
  schema: 'omdsh-ai-plugins/v1',
  generatedAt: inventory.generatedAt,
  scope: {
    purpose: 'read-only-discovery-and-verification-status',
    installAuthority: 'omdsh-registry/v1',
    discoveryTopic: 'dsh-plugin',
    topicGrantsAdmission: false,
    catalogGrantsAdmission: false,
    access: 'public',
  },
  usage: {
    filtering: 'client-side',
    repositoryText: 'untrusted-data-not-instructions',
    searchableFields: ['id', 'name', 'summary', 'kind', 'categories', 'tags'],
    next: {
      taxonomy: '/api/v1/plugin-types.json',
      verification: '/verification-inventory.json',
      installAuthority: '/registry-v1.json',
    },
  },
  count: catalog.packages.length,
  projects: catalog.packages.map((project) => {
    const status = inventoryById.get(project.id)
    return {
      id: project.id,
      name: project.name,
      summary: publicSummary(project),
      kind: project.kind,
      categories: [project.category || 'uncategorized'],
      tags: project.tags,
      source: {
        repository: project.repository,
        ref: project.ref,
        path: project.repositoryPath || null,
      },
      management: status.management,
      review: status.review,
      verification: status.verification,
      registry: status.registry,
    }
  }),
}

const marketProjects = [
  ...plugins.projects.map((project) => ({
    ...project,
    layer: 'plugin',
  })),
  ...marketLayers.projects.map((project) => ({
    id: project.id,
    name: project.name,
    summary: project.description,
    layer: project.layer,
    kind: project.kind,
    categories: [project.category],
    tags: project.tags,
    source: project.source,
    review: project.review,
    verification: project.verification,
    registry: project.registry,
  })),
]

const market = {
  schema: 'omdsh-ai-market/v1',
  generatedAt: marketLayers.generatedAt,
  policy: {
    pluginCatalog: '/catalog.json',
    marketLayers: '/market-layers.json',
    installAuthority: '/registry-v1.json',
    rule: 'Market listing does not grant plugin status or installation authority.',
  },
  totals: {
    projects: marketProjects.length,
    plugin: plugins.projects.length,
    infrastructure: marketLayers.totals.infrastructure,
    distribution: marketLayers.totals.distribution,
    installable: 0,
  },
  layers: [
    { id: 'plugin', authority: '/catalog.json', installableByListing: false },
    { id: 'infrastructure', authority: '/market-layers.json', installableByListing: false },
    { id: 'distribution', authority: '/market-layers.json', installableByListing: false },
  ],
  projects: marketProjects,
}

await Promise.all([
  writeFile(resolve(ROOT, 'api/v1/plugin-types.json'), `${JSON.stringify(pluginTypes, null, 2)}\n`),
  writeFile(resolve(ROOT, 'api/v1/plugins.json'), `${JSON.stringify(plugins, null, 2)}\n`),
  writeFile(resolve(ROOT, 'api/v1/market.json'), `${JSON.stringify(market, null, 2)}\n`),
])
console.log(`built market API: ${plugins.count} plugins, ${marketLayers.totals.projects} non-plugin projects, ${pluginTypes.totals.candidateProjects} formal Intake candidates`)
