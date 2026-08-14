import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { createIntakeRecord, validateSubmission } from './intake-lib.mjs'

const MAX_ISSUE_BODY_BYTES = 128 * 1024
const SUBMISSION_FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/gi
const REPOSITORY_RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/
const MANAGED_SOURCE_RE = /^github:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#[0-9a-f]{40}&path:\/(.+)$/

function requestHeaders(token) {
  return {
    accept: 'application/vnd.github+json',
    'user-agent': 'omdsh-workshop-intake',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
}

async function githubJson(url, { fetchImpl, token, description }) {
  const response = await fetchImpl(url, { headers: requestHeaders(token) })
  if (!response.ok) throw new Error(`${description} failed with GitHub HTTP ${response.status}`)
  return response.json()
}

function encodedPath(value) {
  return String(value).split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

export function extractSubmissionManifest(body) {
  if (typeof body !== 'string' || body.length === 0) throw new Error('submission Issue body is empty')
  if (Buffer.byteLength(body, 'utf8') > MAX_ISSUE_BODY_BYTES) throw new Error('submission Issue body exceeds 128 KiB')
  for (const match of body.matchAll(SUBMISSION_FENCE_RE)) {
    let candidate
    try {
      candidate = JSON.parse(match[1])
    } catch {
      continue
    }
    if (candidate?.schema === 'omdsh-workshop-submission/v1') return candidate
  }
  throw new Error('Issue does not contain an omdsh-workshop-submission/v1 JSON code block')
}

export async function verifyPublicSubmissionSource(manifest, { fetchImpl = fetch, token = '' } = {}) {
  const repository = REPOSITORY_RE.exec(manifest.project.repository)
  if (!repository) throw new Error('submission repository is not a supported GitHub URL')
  const [, owner, name] = repository
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
  const repositoryFacts = await githubJson(apiBase, {
    fetchImpl,
    token,
    description: 'public repository lookup',
  })
  if (repositoryFacts.private !== false) throw new Error('submission repository must be public')
  if (repositoryFacts.disabled === true) throw new Error('submission repository is disabled')

  const commit = await githubJson(`${apiBase}/git/commits/${manifest.release.ref}`, {
    fetchImpl,
    token,
    description: 'fixed commit lookup',
  })
  if (commit.sha !== manifest.release.ref) throw new Error('fixed commit did not resolve exactly')

  const paths = new Set()
  if (manifest.project.path) paths.add(manifest.project.path)
  if (manifest.management.method === 'repository-plugin') {
    const source = MANAGED_SOURCE_RE.exec(manifest.management.source || '')
    if (!source) throw new Error('Repository Plugin source path is invalid')
    paths.add(`/${source[1]}`)
  }
  for (const path of paths) {
    await githubJson(`${apiBase}/contents/${encodedPath(path)}?ref=${manifest.release.ref}`, {
      fetchImpl,
      token,
      description: `fixed source path ${path}`,
    })
  }

  return {
    repository: repositoryFacts.html_url || manifest.project.repository.replace(/\/$/, ''),
    ref: commit.sha,
    paths: [...paths].sort(),
    archived: repositoryFacts.archived === true,
  }
}

export async function prepareIssueIntake(event, { root, fetchImpl = fetch, token = '' } = {}) {
  if (!event?.issue || event.issue.pull_request) throw new Error('event is not a GitHub Issue')
  if (!/^\[Submission\](?:\s|$)/.test(event.issue.title || '')) throw new Error('Issue title is not an extension submission')
  const manifest = extractSubmissionManifest(event.issue.body)
  const errors = validateSubmission(manifest)
  if (errors.length > 0) throw new Error(errors.join('\n'))

  const baseline = JSON.parse(await readFile(resolve(root, 'official-baseline.json'), 'utf8'))
  const record = createIntakeRecord(manifest, baseline)
  const recordPath = resolve(root, 'intake/records', `${record.id}.json`)
  try {
    await readFile(recordPath)
    throw new Error(`${record.id}: an intake record already exists`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  const source = await verifyPublicSubmissionSource(manifest, { fetchImpl, token })
  record.review.notes = `Automatically prepared from #${event.issue.number}; public fixed-source preflight passed. Human review is still required.`
  record.tests.static.evidence = `submission manifest validation; public repository and fixed commit resolved${source.paths.length ? `; pinned path(s): ${source.paths.join(', ')}` : ''}`
  return { manifest, record, recordPath, source }
}
