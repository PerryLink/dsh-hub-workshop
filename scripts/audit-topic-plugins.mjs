#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const auditPath = resolve(ROOT, 'topic-plugin-audit.json')
const topicSnapshot = JSON.parse(await readFile(resolve(ROOT, 'topic-repositories.json'), 'utf8'))
const previousAudit = await readFile(auditPath, 'utf8').then(JSON.parse).catch(() => ({ repositories: [] }))
const previousByRepository = new Map((previousAudit.repositories || []).map((entry) => [`${entry.owner}/${entry.name}`.toLocaleLowerCase('en-US'), entry]))

function included(reasonCode, reason, qualification = 'pending-review', manualReview = null) {
  return { decision: 'include', reasonCode, reason, qualification, marketLayer: null, manualReview }
}

function market(marketLayer, reasonCode, reason, manualReview = null) {
  return { decision: 'market', reasonCode, reason, qualification: 'pending-review', marketLayer, manualReview }
}

function excluded(reasonCode, reason, manualReview = null) {
  return { decision: 'exclude', reasonCode, reason, qualification: null, marketLayer: null, manualReview }
}

const MANUAL_DECISIONS = new Map([
  ['deepseek-ai/deepseek-harness', excluded('core-product', 'DeepSeek Harness 主仓不是生态插件。')],
  ['omdsh-dev/dsh-hub-workshop', market('infrastructure', 'ecosystem-infrastructure', 'Workshop/Catalog 权威仓属于生态基础设施。')],
  ['omdsh-dev/dsh-hub', market('infrastructure', 'ecosystem-infrastructure', 'Hub 消费端属于生态基础设施。')],
  ['omdsh-dev/omdsh-runtime', market('infrastructure', 'ecosystem-infrastructure', 'OMDSH Runtime 属于生态基础设施。')],
  ['omdsh-dev/dsh-mygo', market('infrastructure', 'ecosystem-infrastructure', '插件管理与治理框架属于生态基础设施。', {
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
  })],
  ['omdsh-dev/omdsh', market('distribution', 'community-distribution', 'Oh My DSH 是社区发行版。')],
  ['omdsh-dev/plugin-template', excluded('template-or-guide', '插件模板不作为作品条目收录。')],
  ['omdsh-dev/dsh-plugin-dev', excluded('template-or-guide', '插件开发文档与说明不是最终用户插件。')],
  ['omdsh-dev/dsh-plugin-skills', market('infrastructure', 'ecosystem-infrastructure', '插件开发与测试 Agent Skills 属于生态工具。')],
  ['omdsh-dev/dsh-tool-browser', market('infrastructure', 'ecosystem-infrastructure', '浏览器接入配置与指南属于生态接入工具。')],
  ['omdsh-dev/dsh-github-integration', included('verified-repository-plugin', '固定提交中的 Repository Plugin 已通过静态核验。', 'verified')],
  ['omdsh-dev/toybox', included('verified-plugin-collection', '仓库中的八个叶子插件已分别建立公开条目。', 'verified')],
])

const AWESOME_RE = /(?:^|[-_.])(awesome|handbook|wiki)(?:[-_.]|$)|\b(?:awesome list|curated list|resource list|handbook|wiki|guide to|from scratch)\b|(?:教程|指南|手册|百科|资源列表|项目列表|插件列表|生态列表|导航站)/i
const TEMPLATE_RE = /(?:^|[-_.])(?:template|starter|boilerplate|scaffold|example)(?:[-_.]|$)|\b(?:template|starter|boilerplate|scaffold|placeholder|group photo|leaderboard)\b|(?:模板|脚手架|占位|排行榜|合影)/i
const DIRECTORY_RE = /(?:plugin|extension)[-_ ]?(?:store|market(?:place)?|index|directory|registry|hub|radar|landscape|recommend)|(?:find|search)[-_ ]?(?:plugin|extension)|(?:插件|扩展)(?:商店|市场|目录|索引|导航|排行|推荐)/i
const INFRASTRUCTURE_RE = /(?:^|[-_.])(?:desktop|launcher|client|tui|vscode|devkit|doctor|installer|publisher|manager|updater)(?:[-_.\s]|$)|\b(?:desktop app|desktop wrapper|desktop shell|terminal (?:ui|client)|launcher|plugin manager|plugin marketplace|plugin store|developer toolkit|companion cli|vs ?code (?:client|extension)|packager)\b|(?:桌面端|桌面版|桌面客户端|桌面壳|启动器|终端 ?UI|插件管理器|插件市场|插件商店|开发工具|诊断工具)/i
const DISTRIBUTION_RE = /(?:^|[-_.])(?:oh[-_.]?my[-_.]?dsh|modpack|plugin[-_.]?pack)(?:[-_.\s]|$)|\b(?:plugin collection|plugins collection|plugin suite|community distribution|plugin kit|plugin pack|modpack|packager|curated bundle)\b|(?:插件合集|插件集合|插件精选集|插件聚合|社区发行版|整合包)/i
const PLUGIN_WORD_RE = /\b(?:plugins?|extensions?|providers?|bundles?|skins?|skills?|adapters?|bridges?|channels?|tools?)\b|(?:插件|扩展|提供方|皮肤|技能|适配器|桥接|工具)/i
const DSH_RE = /\b(?:deepseek[ -]?harness|dsh)\b/i

function repositoryKey(repository) {
  return `${repository.owner}/${repository.name}`.toLocaleLowerCase('en-US')
}

function productText(repository) {
  return `${repository.name}\n${repository.description || ''}`
}

function classify(repository) {
  const key = repositoryKey(repository)
  const text = productText(repository)
  const lowerName = repository.name.toLocaleLowerCase('en-US')
  const previous = previousByRepository.get(key)
  const manual = MANUAL_DECISIONS.get(key)
  if (manual) return manual

  const hasDshClaim = DSH_RE.test(text)
    || /(?:^|[-_.])dsh(?:[-_.]|$)/i.test(lowerName)
    || /deepseek[-_.]?harness/i.test(lowerName)
  const hasPluginClaim = PLUGIN_WORD_RE.test(text)
    || /(?:^|[-_.])(?:plugin|plugins|skin|skills?)(?:[-_.]|$)/i.test(lowerName)

  if (/(?:^|[-_.])(?:awesome|handbook|wiki)(?:[-_.]|$)/i.test(lowerName)) {
    return excluded('awesome-or-documentation', 'Awesome、手册、Wiki 或纯导航文档不是插件作品。')
  }
  if (/(?:^|[-_.])(?:template|starter|boilerplate|scaffold|example)(?:[-_.]|$)/i.test(lowerName)) {
    return excluded('template-or-placeholder', '模板、脚手架、示例或占位项目不进入市场。')
  }

  const previouslyVerified = previous?.decision === 'include'
    && (previous.qualification === 'verified' || /^verified-/.test(previous.reasonCode || ''))
  if (previouslyVerified && !DIRECTORY_RE.test(text) && !INFRASTRUCTURE_RE.test(text) && !DISTRIBUTION_RE.test(text)) {
    return included(previous.reasonCode, previous.reason, 'verified', previous.evidence?.manualReview || null)
  }
  if (hasDshClaim && DISTRIBUTION_RE.test(text)) {
    return market('distribution', 'community-distribution', '真实的插件集合或社区发行项目，作为整合层展示而不冒充单一插件。')
  }
  if (hasDshClaim && (DIRECTORY_RE.test(text) || INFRASTRUCTURE_RE.test(text))) {
    return market('infrastructure', 'ecosystem-infrastructure', '真实的客户端、管理器、市场、开发工具或其他生态基础设施。')
  }
  if (AWESOME_RE.test(text)) return excluded('awesome-or-documentation', 'Awesome、手册、Wiki 或纯导航文档不是插件作品。')
  if (TEMPLATE_RE.test(text)) return excluded('template-or-placeholder', '模板、脚手架、示例、排行榜或占位项目不进入市场。')
  if (hasDshClaim && hasPluginClaim) {
    return included('claimed-plugin-pending-review', '仓库明确声明 DSH 插件或扩展能力；先进入展示层，等待固定来源和协议核验。')
  }
  if (hasDshClaim && /(?:^|[-_.])dsh(?:[-_.]|$)|deepseek[-_.]?harness/i.test(lowerName)) {
    return included('dsh-project-pending-review', '项目名称明确指向 DSH 生态；先作为待审核作品展示，不授予安装权限。')
  }
  if (hasDshClaim) {
    return market('infrastructure', 'dsh-integration', '项目明确提供 DSH 集成，但不是可核验的单一叶子插件。')
  }
  return excluded('topic-only-traffic', '只有 dsh-plugin Topic 命中，没有 DSH 作品声明或既有插件证据。')
}

const audits = topicSnapshot.repositories.map((repository) => {
  const classification = classify(repository)
  const text = productText(repository)
  return {
    owner: repository.owner,
    name: repository.name,
    url: repository.url,
    defaultBranch: repository.defaultBranch,
    archived: repository.archived,
    decision: classification.decision,
    reasonCode: classification.reasonCode,
    reason: classification.reason,
    qualification: classification.qualification,
    marketLayer: classification.marketLayer,
    evidence: {
      ...(classification.manualReview ? { manualReview: classification.manualReview } : {}),
      topicClaim: {
        descriptionPresent: Boolean(repository.description),
        explicitDshClaim: DSH_RE.test(text) || /(?:^|[-_.])dsh(?:[-_.]|$)|deepseek[-_.]?harness/i.test(repository.name),
        explicitPluginClaim: PLUGIN_WORD_RE.test(text),
      },
    },
  }
})

function countBy(field) {
  return Object.fromEntries([...new Set(audits.map((entry) => entry[field]).filter((value) => value !== null))]
    .sort()
    .map((value) => [value, audits.filter((entry) => entry[field] === value).length]))
}

function countSubset(entries, field) {
  return Object.fromEntries([...new Set(entries.map((entry) => entry[field]).filter((value) => value !== null))]
    .sort()
    .map((value) => [value, entries.filter((entry) => entry[field] === value).length]))
}

const report = {
  schema: 'omdsh-topic-plugin-audit/v2',
  generatedAt: topicSnapshot.generatedAt,
  topic: topicSnapshot.topic,
  sourceSnapshotGeneratedAt: topicSnapshot.generatedAt,
  policy: {
    plugin: 'A repository with an explicit DSH plugin or extension claim is displayed as a plugin; file-level evidence determines verified versus pending-review, never installation authority.',
    market: 'Genuine DSH clients, managers, marketplaces, developer tools, integrations, plugin collections, and distributions are displayed in non-plugin market layers.',
    excluded: 'Core products, Awesome/documentation, templates/placeholders, and Topic-only popularity matches without a DSH work claim remain outside the market.',
    registry: 'All Topic-derived entries remain ineligible for Registry installation until independent Intake, testing, review, and admission pass.',
  },
  stats: {
    repositories: audits.length,
    decisions: countBy('decision'),
    reasons: countBy('reasonCode'),
    qualifications: countBy('qualification'),
    pluginQualifications: countSubset(audits.filter((entry) => entry.decision === 'include'), 'qualification'),
    marketLayers: countBy('marketLayer'),
  },
  repositories: audits,
}

await writeFile(auditPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.stats, null, 2))
