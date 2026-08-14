#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const topicSnapshot = JSON.parse(await readFile(resolve(ROOT, 'topic-repositories.json'), 'utf8'))
const repositories = topicSnapshot.repositories
const generatedAt = topicSnapshot.generatedAt
const USER_AGENT = 'omdsh-workshop-topic-audit/1.0'

const MANUAL_DECISIONS = new Map([
  ['deepseek-ai/deepseek-harness', { decision: 'exclude', reasonCode: 'core-product', reason: 'DeepSeek Harness 主仓，不是插件。' }],
  ['omdsh-dev/dsh-hub-workshop', { decision: 'exclude', reasonCode: 'ecosystem-infrastructure', reason: 'Workshop/Catalog 权威仓，不是插件。' }],
  ['omdsh-dev/dsh-hub', { decision: 'exclude', reasonCode: 'ecosystem-infrastructure', reason: 'Hub 消费端，不是插件。' }],
  ['omdsh-dev/omdsh-runtime', { decision: 'exclude', reasonCode: 'ecosystem-infrastructure', reason: 'OMDSH Runtime，不是插件。' }],
  ['omdsh-dev/dsh-mygo', {
    decision: 'exclude',
    reasonCode: 'ecosystem-infrastructure',
    reason: '插件管理与治理框架，不是可作为单一最终用户插件安装的叶子项目；子包也未通过当前公开基线验证。',
    evidence: {
      inspectedCommit: '4566748646823f8e2123f6addcf22b55e305e740',
      verificationLevel: 'static-public-source',
      findings: [
        'root-package-manifest-absent',
        'multi-package-plugin-management-framework',
        'subpackages-target-older-rc-line',
        'workspace-dependencies-unresolved',
        'public-packages-unavailable',
        'current-public-baseline-not-verified',
      ],
    },
  }],
  ['omdsh-dev/omdsh', { decision: 'exclude', reasonCode: 'distribution', reason: 'Oh My DSH 发行版，不是插件。' }],
  ['omdsh-dev/plugin-template', { decision: 'exclude', reasonCode: 'template-or-guide', reason: '插件模板本身不作为插件收录。' }],
  ['omdsh-dev/dsh-plugin-dev', { decision: 'exclude', reasonCode: 'template-or-guide', reason: '插件开发说明与工具，不作为插件收录。' }],
  ['omdsh-dev/dsh-plugin-skills', { decision: 'exclude', reasonCode: 'template-or-guide', reason: '面向插件开发与测试的 Agent Skills，不是运行时插件。' }],
  ['omdsh-dev/dsh-tool-browser', { decision: 'exclude', reasonCode: 'template-or-guide', reason: '浏览器接入配置与指南，不含独立 DSH 插件实现。' }],
  ['omdsh-dev/dsh-github-integration', { decision: 'include', reasonCode: 'verified-repository-plugin', reason: '固定提交中的 plugins/github-integration/.dsh-plugin 已通过静态打包核验。' }],
  ['omdsh-dev/toybox', { decision: 'include', reasonCode: 'verified-plugin-collection', reason: '固定提交中的 8 个 Repository Plugin 子项目已逐项通过静态或协议核验。' }],
])

const decoder = new TextDecoder()
const encodePath = (value) => value.split('/').map(encodeURIComponent).join('/')
const fullName = (repository) => `${repository.owner}/${repository.name}`

async function fetchText(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.8' },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) return null
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > 1_500_000) return decoder.decode(buffer.slice(0, 1_500_000))
    return decoder.decode(buffer)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function rawUrl(repository, path) {
  return `https://raw.githubusercontent.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/${encodePath(repository.defaultBranch || 'main')}/${encodePath(path)}`
}

function treeUrl(repository, path = '') {
  const base = `https://github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`
  return path ? `${base}/tree/${encodePath(repository.defaultBranch || 'main')}/${encodePath(path)}` : base
}

function pathsFromHtml(source) {
  if (!source) return []
  return [...new Set([...source.matchAll(/"path":"([^"\\]*(?:\\.[^"\\]*)*)"/g)]
    .map((match) => JSON.parse(`"${match[1]}"`))
    .filter((path) => path && path !== '/'))]
}

function parsePackage(source) {
  if (!source) return null
  try { return JSON.parse(source) } catch { return null }
}

function dependencyNames(pkg) {
  return Object.keys({
    ...(pkg?.dependencies || {}),
    ...(pkg?.peerDependencies || {}),
    ...(pkg?.optionalDependencies || {}),
    ...(pkg?.devDependencies || {}),
  })
}

function looksLikeAwesome(repository, text) {
  return /(^|[-_.])awesome([-. _]|$)/i.test(repository.name)
    || /\b(awesome list|curated list|curated directory|资源列表|项目列表|插件列表|生态列表|导航站)\b/i.test(`${repository.name}\n${repository.description || ''}`)
}

function pluginClaims(text) {
  const matches = []
  for (const [label, pattern] of [
    ['explicit-harness-plugin', /\b(?:(?:deepseek harness|dsh)\s+(?:native\s+)?(?:plugins?|extensions?|providers?)|(?:plugins?|extensions?|providers?)\s+(?:for|to)\s+(?:deepseek harness|dsh))\b/i],
    ['profile-install', /\bdsh\s+plugin\s+(?:add|install|remove)|--profile\b/i],
    ['repository-plugin', /repository[- ]plugin|\.dsh-plugin\b/i],
    ['profile-bundle', /profile[- ]bundle|cordis\.patch\.ya?ml|"bundle"\s*:/i],
  ]) if (pattern.test(text)) matches.push(label)
  return matches
}

async function mapLimit(items, limit, callback) {
  const output = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await callback(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return output
}

async function inspect(repository) {
  const name = fullName(repository)
  const rootHtml = await fetchText(treeUrl(repository))
  const rootPaths = pathsFromHtml(rootHtml)
  const rootNames = new Set(rootPaths.filter((path) => !path.includes('/')))
  const readmePaths = ['README.md', 'README.zh-CN.md', 'README.zh.md', 'README_CN.md', 'README.en.md', 'readme.md']
  const requested = [...readmePaths, 'package.json', 'dsh.plugin.json', 'cordis.patch.yml', 'cordis.patch.yaml', 'SKILL.md']
  const [files, pluginDirHtml, pluginsDirHtml, packagesDirHtml] = await Promise.all([
    Promise.all(requested.map(async (path) => [path, await fetchText(rawUrl(repository, path))])),
    rootNames.has('.dsh-plugin') ? fetchText(treeUrl(repository, '.dsh-plugin')) : null,
    rootNames.has('plugins') ? fetchText(treeUrl(repository, 'plugins')) : null,
    rootNames.has('packages') ? fetchText(treeUrl(repository, 'packages')) : null,
  ])
  const contents = Object.fromEntries(files.filter(([, source]) => source !== null))
  const pkg = parsePackage(contents['package.json'])
  const readme = readmePaths.map((path) => contents[path] || '').join('\n')
  const combinedText = `${repository.name}\n${repository.description || ''}\n${readme}`
  const dependencies = dependencyNames(pkg)
  const deepseekDependencies = dependencies.filter((dependency) => dependency.startsWith('@deepseek-ai/'))
  const packageDsh = pkg?.dsh && typeof pkg.dsh === 'object' ? pkg.dsh : null
  const bundlePatch = packageDsh?.bundle?.patch || null
  const pluginDirPaths = pathsFromHtml(pluginDirHtml)
  const pluginChildren = pathsFromHtml(pluginsDirHtml).filter((path) => path.startsWith('plugins/'))
  const packageChildren = pathsFromHtml(packagesDirHtml).filter((path) => path.startsWith('packages/'))
  const claims = pluginClaims(combinedText)
  const strongSignals = []
  if (bundlePatch) strongSignals.push(`package.json:dsh.bundle.patch=${bundlePatch}`)
  if (contents['dsh.plugin.json']) strongSignals.push('dsh.plugin.json')
  if (contents['cordis.patch.yml'] || contents['cordis.patch.yaml']) strongSignals.push('cordis.patch')
  if (rootNames.has('.dsh-plugin')) strongSignals.push('.dsh-plugin/')
  if (pluginDirPaths.some((path) => /(?:manifest|plugin|prepare|install|config).*(?:json|ya?ml|js|mjs|ts)$/i.test(path))) {
    strongSignals.push('.dsh-plugin manifest/installer')
  }
  if (packageDsh && Object.keys(packageDsh).length) strongSignals.push('package.json:dsh metadata')
  if (deepseekDependencies.length) strongSignals.push(`DeepSeek Harness dependencies (${deepseekDependencies.length})`)
  const collectionSignals = []
  if (rootNames.has('plugins') && pluginChildren.length) collectionSignals.push(`plugins/ tree (${new Set(pluginChildren.map((path) => path.split('/')[1])).size} children)`)
  if (rootNames.has('packages') && packageChildren.length) collectionSignals.push(`packages/ tree (${new Set(packageChildren.map((path) => path.split('/')[1])).size} children)`)

  let decision = 'exclude'
  let reasonCode = 'insufficient-plugin-evidence'
  let reason = '只有 Topic 或文字描述，未发现可核验的 DSH 插件清单、Profile Bundle、Repository Plugin 或 Harness 依赖证据。'
  const override = MANUAL_DECISIONS.get(name)
  if (override) {
    ;({ decision, reasonCode, reason } = override)
  } else if (repository.archived) {
    reasonCode = 'archived'
    reason = '仓库已归档，不进入当前插件目录。'
  } else if (/\bprivate\b/i.test(repository.description || '')) {
    reasonCode = 'private-or-unavailable'
    reason = '公开描述标明 Private，不能作为可核验的公开插件来源。'
  } else if (looksLikeAwesome(repository, combinedText)) {
    reasonCode = 'awesome-or-directory'
    reason = 'Awesome/导航/文档清单不是插件实现。'
  } else if (/\b(template|starter|boilerplate|from scratch|guide|placeholder|leaderboard|group photo)\b|教程|指南|脚手架|占位|排行榜|合影/i.test(`${repository.name}\n${repository.description || ''}`)) {
    reasonCode = 'template-or-guide'
    reason = '模板、教程、排行榜或占位项目不是插件实现。'
  } else if (bundlePatch || contents['dsh.plugin.json'] || rootNames.has('.dsh-plugin') || (packageDsh && Object.keys(packageDsh).length)) {
    decision = 'include'
    reasonCode = 'verified-plugin-contract'
    reason = '仓库包含可核验的 DSH 插件契约或 Profile Bundle 元数据。'
  } else if ((contents['cordis.patch.yml'] || contents['cordis.patch.yaml']) && (deepseekDependencies.length || claims.length)) {
    decision = 'include'
    reasonCode = 'verified-cordis-plugin'
    reason = '仓库包含 Cordis patch，并有 DeepSeek Harness 依赖或明确插件接入证据。'
  } else if (deepseekDependencies.length && claims.length) {
    decision = 'include'
    reasonCode = 'verified-harness-integration'
    reason = '代码包同时声明 DeepSeek Harness 依赖和明确插件接入方式。'
  } else if (collectionSignals.length && claims.length) {
    decision = 'review'
    reasonCode = 'plugin-collection-needs-expansion'
    reason = '看起来是插件集合；需要按子插件清单展开，不能把集合仓整体冒充一个插件。'
  } else if (!rootPaths.length && !Object.keys(contents).length) {
    decision = 'review'
    reasonCode = 'source-scan-unavailable'
    reason = '本次未能读取公开仓库文件，不能仅凭 Topic 判为插件或非插件。'
  } else if (claims.length) {
    decision = 'review'
    reasonCode = 'claimed-plugin-unverified'
    reason = '文档声称是 DSH 插件，但当前根目录证据不足，需要继续核对插件子路径或不可变提交。'
  }

  return {
    owner: repository.owner,
    name: repository.name,
    url: repository.url,
    defaultBranch: repository.defaultBranch,
    archived: repository.archived,
    decision,
    reasonCode,
    reason,
    evidence: {
      manualReview: override?.evidence || null,
      rootPaths: rootPaths.slice(0, 80),
      packageName: pkg?.name || null,
      packagePrivate: typeof pkg?.private === 'boolean' ? pkg.private : null,
      packageDsh: packageDsh || null,
      deepseekDependencies,
      pluginClaims: claims,
      strongSignals,
      collectionSignals,
      pluginDirectoryPaths: pluginDirPaths.slice(0, 40),
      pluginChildren: pluginChildren.slice(0, 80),
      packageChildren: packageChildren.slice(0, 80),
    },
  }
}

let completed = 0
const audits = await mapLimit(repositories, 12, async (repository) => {
  const audit = await inspect(repository)
  completed += 1
  if (completed % 25 === 0 || completed === repositories.length) process.stderr.write(`audited ${completed}/${repositories.length}\n`)
  return audit
})

const countBy = (field) => Object.fromEntries([...new Set(audits.map((entry) => entry[field]))]
  .sort()
  .map((value) => [value, audits.filter((entry) => entry[field] === value).length]))
const report = {
  schema: 'omdsh-topic-plugin-audit/v1',
  generatedAt,
  topic: topicSnapshot.topic,
  sourceSnapshotGeneratedAt: topicSnapshot.generatedAt,
  policy: {
    included: 'Only repositories with a verifiable DSH plugin contract, Profile Bundle, Repository Plugin, or corroborated Harness integration are eligible.',
    reviewed: 'Claims and collections without enough file-level evidence remain outside the Catalog pending manual expansion or verification.',
    excluded: 'Core products, infrastructure, distributions, awesome lists, documentation, templates, placeholders, archived sources, and Topic-only repositories are excluded.',
  },
  stats: {
    repositories: audits.length,
    decisions: countBy('decision'),
    reasons: countBy('reasonCode'),
  },
  repositories: audits.map((entry) => ({
    owner: entry.owner,
    name: entry.name,
    url: entry.url,
    defaultBranch: entry.defaultBranch,
    archived: entry.archived,
    decision: entry.decision,
    reasonCode: entry.reasonCode,
    reason: entry.reason,
    evidence: {
      ...(entry.evidence.manualReview ? { manualReview: entry.evidence.manualReview } : {}),
      strongSignals: entry.evidence.strongSignals,
      pluginClaims: entry.evidence.pluginClaims,
      collectionSignals: entry.evidence.collectionSignals,
    },
  })),
}

await writeFile(resolve(ROOT, 'topic-plugin-audit.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.stats, null, 2))
