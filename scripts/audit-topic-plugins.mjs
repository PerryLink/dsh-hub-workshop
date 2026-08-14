#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  capabilityProfile,
  validateOfficialMcpManifest,
  validateWorkshopManifest,
} from './workshop-manifest-lib.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const snapshot = JSON.parse(await readFile(resolve(ROOT, 'topic-repositories.json'), 'utf8'))
const USER_AGENT = 'omdsh-workshop-topic-audit/3.0'
const decoder = new TextDecoder()

function result(decision, reasonCode, reason, { qualification = null, marketLayer = null, evidence = {} } = {}) {
  return { decision, reasonCode, reason, qualification, marketLayer, evidence }
}

const include = (reasonCode, reason, evidence) => result('include', reasonCode, reason, { qualification: 'verified', evidence })
const review = (reasonCode, reason, evidence = {}) => result('review', reasonCode, reason, { qualification: 'pending-review', evidence })
const market = (marketLayer, reasonCode, reason, evidence = {}) => result('market', reasonCode, reason, { qualification: 'pending-review', marketLayer, evidence })
const exclude = (reasonCode, reason, evidence = {}) => result('exclude', reasonCode, reason, { evidence })

const MANUAL_DECISIONS = new Map([
  ['deepseek-ai/deepseek-harness', exclude('core-product', 'DeepSeek Harness 主仓不是生态插件。')],
  ['omdsh-dev/dsh-hub-workshop', market('infrastructure', 'ecosystem-infrastructure', 'Workshop/Catalog 权威仓属于生态基础设施。')],
  ['omdsh-dev/dsh-hub', market('infrastructure', 'ecosystem-infrastructure', 'Hub 消费端属于生态基础设施。')],
  ['omdsh-dev/omdsh-runtime', market('infrastructure', 'ecosystem-infrastructure', 'OMDSH Runtime 属于生态基础设施。')],
  ['omdsh-dev/dsh-mygo', market('infrastructure', 'ecosystem-infrastructure', '插件管理与治理框架属于生态基础设施。', {
    manualReview: {
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
  })],
  ['omdsh-dev/omdsh', market('distribution', 'community-distribution', 'Oh My DSH 是社区发行版。')],
  ['omdsh-dev/plugin-template', exclude('template-or-guide', '插件模板不作为作品条目收录。')],
  ['omdsh-dev/dsh-plugin-dev', exclude('template-or-guide', '插件开发文档与说明不是最终用户插件。')],
  ['omdsh-dev/dsh-plugin-skills', market('infrastructure', 'ecosystem-infrastructure', '插件开发与测试 Agent Skills 属于生态工具。')],
  ['omdsh-dev/dsh-tool-browser', market('infrastructure', 'ecosystem-infrastructure', '浏览器接入配置与指南属于生态接入工具。')],
  ['omdsh-dev/dsh-github-integration', include('verified-repository-plugin', '固定提交中的 Repository Plugin 已通过静态核验。', {
    verificationLevel: 'curated-fixed-source',
    strongSignals: ['.dsh-plugin/package.json', '.dsh-plugin static workflow skill'],
    pluginClaims: ['repository-plugin'],
  })],
  ['omdsh-dev/toybox', include('verified-plugin-collection', '仓库中的八个叶子插件已分别建立公开条目。', {
    verificationLevel: 'curated-fixed-source',
    strongSignals: ['eight reviewed .dsh-plugin leaf projects'],
    pluginClaims: ['repository-plugin'],
    collectionSignals: ['plugins/ tree (8 children)'],
  })],
])

const AWESOME_RE = /(?:^|[-_.])(awesome|handbook|wiki)(?:[-_.]|$)|\b(?:awesome list|curated list|resource list|handbook|wiki|guide to|from scratch)\b|(?:教程|指南|手册|百科|资源列表|项目列表|插件列表|生态列表|导航站)/i
const TEMPLATE_RE = /(?:^|[-_.])(?:template|starter|boilerplate|scaffold|example)(?:[-_.]|$)|\b(?:template|starter|boilerplate|scaffold|placeholder|group photo|leaderboard)\b|(?:模板|脚手架|占位|排行榜|合影)/i
const DIRECTORY_RE = /(?:plugin|extension)[-_ ]?(?:store|market(?:place)?|index|directory|registry|hub|radar|landscape|recommend)|(?:find|search)[-_ ]?(?:plugin|extension)|(?:插件|扩展)(?:商店|市场|目录|索引|导航|排行|推荐)/i
const INFRASTRUCTURE_RE = /(?:^|[-_.])(?:desktop|launcher|client|tui|vscode|devkit|doctor|installer|publisher|manager|updater)(?:[-_.\s]|$)|\b(?:desktop app|desktop wrapper|desktop shell|terminal (?:ui|client)|launcher|plugin manager|plugin marketplace|plugin store|developer toolkit|companion cli|vs ?code (?:client|extension)|packager)\b|(?:桌面端|桌面版|桌面客户端|桌面壳|启动器|终端 ?UI|插件管理器|插件市场|插件商店|开发工具|诊断工具)/i
const DISTRIBUTION_RE = /(?:^|[-_.])(?:oh[-_.]?my[-_.]?dsh|modpack|plugin[-_.]?pack)(?:[-_.\s]|$)|\b(?:plugin collection|plugins collection|plugin suite|community distribution|plugin kit|plugin pack|modpack|packager|curated bundle)\b|(?:插件合集|插件集合|插件精选集|插件聚合|社区发行版|整合包)/i
const PLUGIN_WORD_RE = /\b(?:plugins?|extensions?|providers?|bundles?|skins?|skills?|adapters?|bridges?|channels?|tools?)\b|(?:插件|扩展|提供方|皮肤|技能|适配器|桥接|工具)/i
const DSH_RE = /\b(?:deepseek[ -]?harness|dsh)\b/i

const repositoryKey = (repository) => `${repository.owner}/${repository.name}`.toLocaleLowerCase('en-US')
const productText = (repository) => `${repository.name}\n${repository.description || ''}`
const encodePath = (value) => value.split('/').map(encodeURIComponent).join('/')

async function fetchText(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.8' },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) return null
    const buffer = await response.arrayBuffer()
    return decoder.decode(buffer.byteLength > 1_500_000 ? buffer.slice(0, 1_500_000) : buffer)
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

function parseJson(source) {
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

function nestedStrings(value) {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []
  return Object.values(value).flatMap(nestedStrings)
}

function safeRepositoryPath(value) {
  const path = String(value || '').replace(/^\.\//, '')
  return path && !path.startsWith('/') && !path.split('/').includes('..') ? path : null
}

function runtimePaths(pkg, manifest) {
  const values = [
    pkg?.main,
    pkg?.module,
    pkg?.browser,
    ...nestedStrings(pkg?.exports),
    ...nestedStrings(pkg?.bin),
    manifest?.main,
    manifest?.entry,
    manifest?.runtime,
    manifest?.server,
    ...nestedStrings(manifest?.bin),
  ]
  return [...new Set(values
    .map(safeRepositoryPath)
    .filter((path) => path && /\.(?:[cm]?js|tsx?|jsx)$/i.test(path) && !/\.d\.ts$/i.test(path)))]
    .slice(0, 12)
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

function obviousClassification(repository) {
  const key = repositoryKey(repository)
  const manual = MANUAL_DECISIONS.get(key)
  if (manual) return manual
  const text = productText(repository)
  const lowerName = repository.name.toLocaleLowerCase('en-US')
  const hasDshClaim = DSH_RE.test(text) || /(?:^|[-_.])dsh(?:[-_.]|$)|deepseek[-_.]?harness/i.test(lowerName)

  if (repository.archived) return exclude('archived', '仓库已归档，不进入当前插件目录。')
  if (/(?:^|[-_.])(?:awesome|handbook|wiki)(?:[-_.]|$)/i.test(lowerName)) {
    return exclude('awesome-or-documentation', 'Awesome、手册、Wiki 或纯导航文档不是插件作品。')
  }
  if (/(?:^|[-_.])(?:template|starter|boilerplate|scaffold|example)(?:[-_.]|$)/i.test(lowerName)) {
    return exclude('template-or-placeholder', '模板、脚手架、示例、排行榜或占位项目不是插件作品。')
  }
  if (hasDshClaim && DISTRIBUTION_RE.test(text)) {
    return market('distribution', 'community-distribution', '真实的插件集合或社区发行项目，作为整合层展示而不冒充单一插件。')
  }
  if (hasDshClaim && (DIRECTORY_RE.test(text) || INFRASTRUCTURE_RE.test(text))) {
    return market('infrastructure', 'ecosystem-infrastructure', '真实的客户端、管理器、市场、开发工具或其他生态基础设施。')
  }
  if (AWESOME_RE.test(text)) return exclude('awesome-or-documentation', 'Awesome、手册、Wiki 或纯导航文档不是插件作品。')
  if (TEMPLATE_RE.test(text)) return exclude('template-or-placeholder', '模板、脚手架、示例、排行榜或占位项目不是插件作品。')
  return null
}

async function inspect(repository) {
  const obvious = obviousClassification(repository)
  if (obvious) return obvious

  const rootHtml = await fetchText(treeUrl(repository))
  const rootPaths = pathsFromHtml(rootHtml)
  const rootNames = new Set(rootPaths.filter((path) => !path.includes('/')))
  const readmePaths = ['README.md', 'README.zh-CN.md', 'README.zh.md', 'README_CN.md', 'README.en.md', 'readme.md']
  const requested = [
    ...readmePaths,
    'package.json',
    'dsh.plugin.json',
    'cordis.patch.yml',
    'cordis.patch.yaml',
    '.dsh-plugin/package.json',
    '.dsh-plugin/manifest.json',
    '.dsh-plugin/prepare.js',
    'SKILL.md',
    'mcp.json',
    '.mcp.json',
    'server.json',
  ]
  const [files, pluginDirHtml, pluginsDirHtml, packagesDirHtml] = await Promise.all([
    Promise.all(requested.map(async (path) => [path, await fetchText(rawUrl(repository, path))])),
    rootNames.has('.dsh-plugin') ? fetchText(treeUrl(repository, '.dsh-plugin')) : null,
    rootNames.has('plugins') ? fetchText(treeUrl(repository, 'plugins')) : null,
    rootNames.has('packages') ? fetchText(treeUrl(repository, 'packages')) : null,
  ])
  const contents = Object.fromEntries(files.filter(([, source]) => source !== null))
  const pkg = parseJson(contents['package.json'])
  const dshManifest = parseJson(contents['dsh.plugin.json'])
  const repositoryPluginManifest = parseJson(contents['.dsh-plugin/package.json'])
  const mcpManifest = parseJson(contents['mcp.json'] || contents['.mcp.json'])
  const officialMcpManifest = parseJson(contents['server.json'])
  const workshopManifest = pkg?.dshWorkshop
  const readme = readmePaths.map((path) => contents[path] || '').join('\n')
  const combinedText = `${productText(repository)}\n${readme}`
  const lowerName = repository.name.toLocaleLowerCase('en-US')
  const hasDshClaim = DSH_RE.test(combinedText) || /(?:^|[-_.])dsh(?:[-_.]|$)|deepseek[-_.]?harness/i.test(lowerName)
  const hasPluginClaim = PLUGIN_WORD_RE.test(combinedText)
  const claims = pluginClaims(combinedText)
  const dependencies = dependencyNames(pkg)
  const deepseekDependencies = dependencies.filter((dependency) => dependency.startsWith('@deepseek-ai/'))
  const packageDsh = pkg?.dsh && typeof pkg.dsh === 'object' ? pkg.dsh : null
  const bundlePatch = packageDsh?.bundle?.patch || null
  const bundlePatchPath = safeRepositoryPath(bundlePatch)
  const bundlePatchSource = bundlePatchPath
    ? (contents[bundlePatchPath] ?? await fetchText(rawUrl(repository, bundlePatchPath)))
    : null
  const entryPaths = runtimePaths(pkg, dshManifest || repositoryPluginManifest || mcpManifest)
  const entryFiles = Object.fromEntries((await Promise.all(entryPaths
    .map(async (path) => [path, await fetchText(rawUrl(repository, path))])))
    .filter(([, source]) => source !== null && source.trim().length >= 40))
  const resolvedRuntimePaths = Object.keys(entryFiles)
  const pluginDirPaths = pathsFromHtml(pluginDirHtml)
  const pluginChildren = pathsFromHtml(pluginsDirHtml).filter((path) => path.startsWith('plugins/'))
  const packageChildren = pathsFromHtml(packagesDirHtml).filter((path) => path.startsWith('packages/'))
  const declaredSignals = []
  const strongSignals = []
  const validPatch = typeof bundlePatchSource === 'string'
    && bundlePatchSource.length >= 20
    && /(?:^|\n)\s*-?\s*(?:insert|remove|replace|patch|merge):/m.test(bundlePatchSource)
  const validRepositoryPlugin = repositoryPluginManifest !== null
    && (Boolean(contents['.dsh-plugin/prepare.js'])
      || Boolean(contents['.dsh-plugin/manifest.json'])
      || pluginDirPaths.some((path) => /(?:manifest|plugin|prepare|install|config).*(?:json|ya?ml|js|mjs|ts)$/i.test(path)))
  const validDshManifest = dshManifest !== null && resolvedRuntimePaths.length > 0
  const validSkill = typeof contents['SKILL.md'] === 'string' && contents['SKILL.md'].trim().length >= 120
  const validMcp = mcpManifest !== null && (resolvedRuntimePaths.length > 0 || JSON.stringify(mcpManifest).length >= 80)
  const workshopPaths = workshopManifest && typeof workshopManifest === 'object'
    ? [workshopManifest.integration?.artifact, ...Object.values(workshopManifest.evidence || {})]
      .map(safeRepositoryPath).filter(Boolean)
    : []
  const workshopFiles = Object.fromEntries((await Promise.all([...new Set(workshopPaths)]
    .map(async (path) => [path, contents[path] ?? await fetchText(rawUrl(repository, path))])))
    .filter(([, source]) => typeof source === 'string' && source.trim().length > 0))
  const workshopErrors = workshopManifest === undefined ? [] : validateWorkshopManifest(workshopManifest)
  if (workshopManifest?.integration?.protocol === 'mcp') {
    const serverPath = workshopManifest.integration.mcp?.serverManifest
    const serverManifest = parseJson(workshopFiles[serverPath]) || (serverPath === 'server.json' ? officialMcpManifest : null)
    workshopErrors.push(...validateOfficialMcpManifest({ packageJson: pkg, serverManifest, declaration: workshopManifest }))
  }
  const workshopEvidencePaths = workshopManifest && typeof workshopManifest === 'object'
    ? Object.values(workshopManifest.evidence || {}).filter((path) => typeof path === 'string')
    : []
  const missingWorkshopEvidence = workshopEvidencePaths.filter((path) => !workshopFiles[path])
  if (missingWorkshopEvidence.length) workshopErrors.push(`declared evidence files are missing: ${missingWorkshopEvidence.join(', ')}`)
  const workshopProtocol = workshopManifest?.integration?.protocol
  const validWorkshopArtifact = workshopErrors.length === 0 && ({
    'harness-profile': validPatch,
    'harness-repository': validRepositoryPlugin,
    'harness-cordis': resolvedRuntimePaths.length > 0 && (deepseekDependencies.length > 0 || Boolean(contents['cordis.patch.yml'] || contents['cordis.patch.yaml'])),
    mcp: Boolean(parseJson(workshopFiles[workshopManifest?.integration?.artifact]) || officialMcpManifest),
    skill: validSkill,
    'third-party': resolvedRuntimePaths.length > 0 && hasDshClaim,
  }[workshopProtocol] === true)
  if (bundlePatch) declaredSignals.push(`package.json:dsh.bundle.patch=${bundlePatch}`)
  if (contents['dsh.plugin.json']) declaredSignals.push('dsh.plugin.json')
  if (packageDsh && Object.keys(packageDsh).length) declaredSignals.push('package.json:dsh metadata')
  if (deepseekDependencies.length) declaredSignals.push(`DeepSeek Harness dependencies (${deepseekDependencies.length})`)
  if (validPatch) strongSignals.push(`resolved bundle patch:${bundlePatchPath}`)
  if (validRepositoryPlugin) strongSignals.push('resolved .dsh-plugin package and runtime asset')
  if (validDshManifest) strongSignals.push('resolved dsh.plugin.json runtime entry')
  if (resolvedRuntimePaths.length) strongSignals.push(`resolved runtime artifact (${resolvedRuntimePaths.length})`)
  if (validSkill) strongSignals.push('non-empty SKILL.md')
  if (validMcp) strongSignals.push('resolved MCP manifest')
  if (workshopManifest !== undefined) declaredSignals.push('package.json#dshWorkshop')
  if (validWorkshopArtifact) strongSignals.push(`validated Workshop package manifest:${workshopManifest.integration.artifact}`)
  const collectionSignals = []
  if (pluginChildren.length) collectionSignals.push(`plugins/ tree (${new Set(pluginChildren.map((path) => path.split('/')[1])).size} children)`)
  if (packageChildren.length) collectionSignals.push(`packages/ tree (${new Set(packageChildren.map((path) => path.split('/')[1])).size} children)`)
  const evidence = {
    verificationLevel: 'static-default-branch',
    inspectedRef: repository.defaultBranch || 'main',
    declaredSignals,
    strongSignals,
    resolvedRuntimePaths,
    pluginClaims: claims,
    collectionSignals,
    packageManifest: workshopManifest === undefined ? {
      status: 'absent',
      source: null,
      errors: [],
      declaration: null,
      profile: null,
    } : {
      status: validWorkshopArtifact ? 'valid' : 'invalid',
      source: 'package.json#dshWorkshop',
      errors: [...new Set(workshopErrors.length ? workshopErrors : ['declared integration artifact could not be verified'])],
      declaration: workshopManifest,
      profile: validWorkshopArtifact ? capabilityProfile({ declaration: workshopManifest }) : null,
    },
  }

  if (workshopManifest !== undefined && workshopErrors.length > 0) {
    return review('invalid-workshop-package-manifest', '仓库声明了 Workshop package manifest，但结构、MCP 对齐或证据路径未通过校验。', evidence)
  }
  if (workshopManifest !== undefined && validWorkshopArtifact) {
    return include('verified-workshop-package-manifest', 'package.json#dshWorkshop 已通过结构、协议与制品交叉校验；运行能力仍需当前基线测试。', evidence)
  }
  if (workshopManifest !== undefined) {
    return review('unresolved-workshop-package-artifact', 'Workshop package manifest 合法，但没有解析到相符的插件制品。', evidence)
  }
  if (validPatch || validRepositoryPlugin || validDshManifest) {
    return include('verified-plugin-contract', '仓库默认分支中的插件声明已解析到实际 patch、Repository Plugin 资产或运行入口。', evidence)
  }
  if ((contents['cordis.patch.yml'] || contents['cordis.patch.yaml']) && validPatch && (deepseekDependencies.length || claims.length)) {
    return include('verified-cordis-plugin', '仓库包含可解析 Cordis patch，并有 DeepSeek Harness 依赖或明确插件接入证据。', evidence)
  }
  if (deepseekDependencies.length && claims.length && resolvedRuntimePaths.length) {
    return include('verified-harness-integration', '代码包同时具有 DeepSeek Harness 依赖、明确插件接入声明和可读取运行入口。', evidence)
  }
  if ((validSkill || validMcp) && hasDshClaim && hasPluginClaim) {
    return include('verified-static-extension', '仓库包含非空 Skill 或可解析 MCP 制品，并有明确 DSH 插件声明。', evidence)
  }
  if (collectionSignals.length && (claims.length || hasPluginClaim)) {
    return review('plugin-collection-needs-expansion', '仓库看起来是插件集合；必须按真实叶子插件和固定来源展开后才能进入 Catalog。', evidence)
  }
  if (!rootPaths.length && !Object.keys(contents).length) {
    return review('source-scan-unavailable', '本次无法读取公开仓库文件；不能仅凭 Topic、名称或简介判为插件。', evidence)
  }
  if (claims.length || (hasDshClaim && hasPluginClaim)) {
    return review('claimed-plugin-unverified', '仓库声称是 DSH 插件，但没有发现足够的文件级制品证据。', evidence)
  }
  if (hasDshClaim) {
    return review('dsh-project-unverified', '项目名称或简介指向 DSH，但没有发现可核验插件制品。', evidence)
  }
  return exclude('topic-only-traffic', '只有 dsh-plugin Topic 命中，没有 DSH 作品声明或文件级插件证据。', evidence)
}

let completed = 0
const audits = await mapLimit(snapshot.repositories, 16, async (repository) => {
  const classification = await inspect(repository)
  completed += 1
  if (completed % 25 === 0 || completed === snapshot.repositories.length) {
    process.stderr.write(`audited ${completed}/${snapshot.repositories.length}\n`)
  }
  return {
    owner: repository.owner,
    name: repository.name,
    url: repository.url,
    defaultBranch: repository.defaultBranch,
    archived: repository.archived,
    ...classification,
    evidence: {
      ...classification.evidence,
      topicClaim: {
        descriptionPresent: Boolean(repository.description),
        explicitDshClaim: DSH_RE.test(productText(repository)) || /(?:^|[-_.])dsh(?:[-_.]|$)|deepseek[-_.]?harness/i.test(repository.name),
        explicitPluginClaim: PLUGIN_WORD_RE.test(productText(repository)),
      },
    },
  }
})

function countBy(field) {
  return Object.fromEntries([...new Set(audits.map((entry) => entry[field]).filter((value) => value !== null))]
    .sort()
    .map((value) => [value, audits.filter((entry) => entry[field] === value).length]))
}

const report = {
  schema: 'omdsh-topic-plugin-audit/v3',
  generatedAt: snapshot.generatedAt,
  topic: snapshot.topic,
  sourceSnapshotGeneratedAt: snapshot.generatedAt,
  policy: {
    plugin: 'package.json#dshWorkshop is the preferred admission contract. Legacy file-level plugin artifacts remain visible only as compatibility-mapped entries that need a manifest and current-baseline tests.',
    review: 'Topic, name, description, README claims, unavailable scans, and unexpanded collections remain discovery-only review leads outside the Catalog.',
    market: 'Genuine DSH clients, managers, marketplaces, developer tools, integrations, plugin collections, and distributions remain in non-plugin market layers.',
    excluded: 'Core products, Awesome/documentation, templates/placeholders, archived sources, and Topic-only popularity matches remain outside the market.',
    registry: 'A valid manifest is author declaration, not execution evidence. Static file evidence grants neither RC.6 compatibility nor Registry installation authority.',
  },
  stats: {
    repositories: audits.length,
    decisions: countBy('decision'),
    reasons: countBy('reasonCode'),
    qualifications: countBy('qualification'),
    marketLayers: countBy('marketLayer'),
  },
  repositories: audits,
}

await writeFile(resolve(ROOT, 'topic-plugin-audit.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.stats, null, 2))
