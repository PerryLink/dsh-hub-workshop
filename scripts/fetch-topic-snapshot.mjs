#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const TOPIC = 'dsh-plugin'
const USER_AGENT = 'omdsh-workshop-topic-refresh/2.0'
const TOKEN = process.env.GITHUB_TOKEN || ''
const REQUEST_INTERVAL_MS = TOKEN ? 2_100 : 6_500
const decoder = new TextDecoder()
let lastRequestAt = 0

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))

async function search(query, page) {
  const elapsed = Date.now() - lastRequestAt
  if (elapsed < REQUEST_INTERVAL_MS) await wait(REQUEST_INTERVAL_MS - elapsed)
  const url = new URL('https://api.github.com/search/repositories')
  url.searchParams.set('q', query)
  url.searchParams.set('per_page', '100')
  url.searchParams.set('page', String(page))
  url.searchParams.set('sort', 'updated')
  url.searchParams.set('order', 'desc')
  lastRequestAt = Date.now()
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': USER_AGENT,
      'x-github-api-version': '2022-11-28',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
  })
  if (!response.ok) {
    const body = decoder.decode((await response.arrayBuffer()).slice(0, 800))
    throw new Error(`GitHub Search HTTP ${response.status}: ${body}`)
  }
  const value = await response.json()
  if (value.incomplete_results) throw new Error(`GitHub Search returned incomplete results for ${query}`)
  return value
}

const MIN_INTERVAL_MS = 1_000
const startBoundary = Date.parse('2008-01-01T00:00:00.000Z')
const endDate = new Date()
endDate.setUTCDate(endDate.getUTCDate() + 1)
endDate.setUTCHours(0, 0, 0, 0)
const endBoundary = endDate.getTime()
const partitions = []

async function partition(start, end) {
  const query = `topic:${TOPIC} created:>=${new Date(start).toISOString()} created:<${new Date(end).toISOString()}`
  const first = await search(query, 1)
  if (first.total_count > 1_000) {
    if (end - start <= MIN_INTERVAL_MS) {
      throw new Error(`one-second Topic partition exceeds the GitHub Search cap: ${query} (${first.total_count})`)
    }
    const midpoint = start + Math.floor((end - start) / 2)
    await partition(start, midpoint)
    await partition(midpoint, end)
    return
  }
  partitions.push({ query, first, pages: Math.ceil(first.total_count / 100) })
}

await partition(startBoundary, endBoundary)
const repositoriesByName = new Map()
let observed = 0
let observedPages = 0
for (const { query, first, pages } of partitions) {
  observed += first.total_count
  observedPages += pages
  for (let page = 1; page <= pages; page += 1) {
    const value = page === 1 ? first : await search(query, page)
    for (const repository of value.items) {
      const key = repository.full_name.toLocaleLowerCase('en-US')
      const previous = repositoriesByName.get(key)
      if (!previous || String(repository.updated_at) > String(previous.updated_at)) repositoriesByName.set(key, repository)
    }
    process.stderr.write(`captured ${query} page ${page}/${pages}\n`)
  }
}
if (repositoriesByName.size !== observed) {
  throw new Error(`partitioned Topic snapshot mismatch: received ${repositoriesByName.size} unique repositories, expected ${observed}`)
}

const RETIRED_TOPIC = ['dsh', 'external'].join('-')
const publicTopics = (repository) => (repository.topics || []).filter((topic) => topic !== RETIRED_TOPIC)
const sanitizePublicText = (value = '') => String(value)
  .replaceAll(new RegExp(RETIRED_TOPIC, 'gi'), 'retired DSH ecosystem')
  .replaceAll(/\bNDA\b/gi, 'previous restricted program')
  .replaceAll('内测', '社区阶段')
const generatedAt = new Date().toISOString()
const repositories = [...repositoriesByName.values()]
  .sort((left, right) => String(right.pushed_at || right.updated_at).localeCompare(String(left.pushed_at || left.updated_at)))
const snapshot = {
  schema: 'dsh-topic-discovery/v1',
  generatedAt,
  topic: TOPIC,
  source: 'https://github.com/search?q=topic%3Adsh-plugin&type=repositories',
  observedRepositoryCount: repositories.length,
  status: 'discovery-only',
  collection: {
    method: TOKEN ? 'authenticated-partitioned-github-search' : 'anonymous-partitioned-github-search',
    partitions: partitions.map(({ query }) => query),
    authenticated: Boolean(TOKEN),
    searchCapHandled: true,
  },
  repositories: repositories.map((repository) => ({
    owner: repository.owner.login,
    name: repository.name,
    url: repository.html_url,
    description: sanitizePublicText(repository.description || ''),
    language: repository.language,
    topics: publicTopics(repository),
    createdAt: repository.created_at,
    commitUpdatedAt: repository.pushed_at || repository.updated_at,
    metadataUpdatedAt: repository.updated_at,
    stars: repository.stargazers_count,
    archived: repository.archived,
    defaultBranch: repository.default_branch || 'main',
  })),
}

const discoveryPath = resolve(ROOT, 'public-discovery.json')
const discovery = JSON.parse(await readFile(discoveryPath, 'utf8'))
discovery.generatedAt = generatedAt
discovery.topic.observedPages = observedPages
discovery.topic.observedRepositoryCount = repositories.length
discovery.topic.collection = snapshot.collection

await Promise.all([
  writeFile(resolve(ROOT, 'topic-repositories.json'), `${JSON.stringify(snapshot, null, 2)}\n`),
  writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`),
])
console.log(`refreshed public Topic snapshot: ${repositories.length} repositories across ${partitions.length} non-overlapping adaptive partitions`)
