const form = document.querySelector('#manifest-form')
const bundleFields = document.querySelector('#bundle-fields')
const sourceField = document.querySelector('#source-field')
const projectOptions = document.querySelector('#published-projects')
const output = document.querySelector('#manifest-output')
const error = document.querySelector('#publish-error')
const copyButton = document.querySelector('#copy-manifest')
const downloadButton = document.querySelector('#download-manifest')
const submission = document.querySelector('#open-submission')
const candidatePrefill = document.querySelector('#candidate-prefill')
const candidatePrefillName = document.querySelector('#candidate-prefill-name')
const managementDetails = document.querySelector('#management-details')
const managementSummary = document.querySelector('#management-summary')
const previewDetails = document.querySelector('#manifest-preview')
const stepButtons = [...document.querySelectorAll('[data-publish-step]')]
const formSections = [...document.querySelectorAll('[data-form-step]')]
const previousStepButton = document.querySelector('#previous-publish-step')
const nextStepButton = document.querySelector('#next-publish-step')
const previewButton = document.querySelector('#preview-manifest')
let manifest = null
let publishedProjects = new Map()
let catalogProjects = new Map()
let currentStep = 0
let availableStep = 0

const t = (key) => window.DSHHub.t(key)
const exactSpec = /^(?:v)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$|^(?:git\+https:\/\/|https:\/\/|github:)[^#\s]+#[0-9a-f]{40}$/

function isoFromLocal(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error(t('publish.invalidDate'))
  return date.toISOString()
}

function currentLocalDateTime() {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function ensurePublishedAt() {
  if (!form.elements.updatedAt.value) form.elements.updatedAt.value = currentLocalDateTime()
}

function setStep(index) {
  currentStep = Math.max(0, Math.min(index, formSections.length - 1))
  formSections.forEach((section, sectionIndex) => { section.hidden = sectionIndex !== currentStep })
  stepButtons.forEach((button, buttonIndex) => {
    button.disabled = buttonIndex > availableStep
    if (buttonIndex === currentStep) button.setAttribute('aria-current', 'step')
    else button.removeAttribute('aria-current')
    button.closest('li').classList.toggle('is-complete', buttonIndex < availableStep)
  })
  previousStepButton.hidden = currentStep === 0
  nextStepButton.hidden = currentStep === formSections.length - 1
  previewButton.hidden = currentStep !== formSections.length - 1
  if (!nextStepButton.hidden) {
    const key = currentStep === 0 ? 'publish.nextRelease' : 'publish.nextIntegration'
    nextStepButton.dataset.i18n = key
    nextStepButton.textContent = t(key)
  }
  form.dataset.currentStep = String(currentStep)
  error.hidden = true
}

function firstInvalidField(step) {
  return [...formSections[step].querySelectorAll('input, select, textarea')]
    .find((field) => !field.disabled && !field.checkValidity())
}

function revealInvalidField(field) {
  field.closest('details')?.setAttribute('open', '')
  field.reportValidity()
  field.focus({ preventScroll: false })
}

function continueToNextStep() {
  const invalid = firstInvalidField(currentStep)
  if (invalid) {
    revealInvalidField(invalid)
    return
  }
  availableStep = Math.max(availableStep, currentStep + 1)
  setStep(currentStep + 1)
  document.querySelector('.publish-steps')?.scrollIntoView({ block: 'nearest' })
}

function tags(value) {
  const items = String(value).split(',').map((item) => item.trim()).filter(Boolean)
  if (items.length === 0) throw new Error(t('publish.invalidTags'))
  return [...new Set(items)]
}

function mediaPaths(value) {
  return [...new Set(String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))]
}

function normalizedPath(value) {
  if (!value || value === '/') return ''
  return `/${String(value).replace(/^\/+|\/+$/g, '')}`
}

function candidateProjectId(candidate) {
  const declared = String(candidate.declaration.declaredId || '').replace(/^@[^/]+\//, '')
  const repositoryName = new URL(candidate.source.repository).pathname.split('/').filter(Boolean).at(-1)
  const pathName = normalizedPath(candidate.source.path).split('/').filter(Boolean).at(-1)
  const seed = declared || pathName || repositoryName || 'extension'
  const normalized = seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return /^[a-z0-9]/.test(normalized) ? normalized : `extension-${normalized || 'candidate'}`
}

function repositoryPluginSource(candidate) {
  const manifest = candidate.declaration.manifests.find((item) => /(?:^|\/)\.dsh-plugin\/package\.json$/.test(item))
  if (!manifest) return ''
  const directory = manifest.slice(0, -'/package.json'.length)
  const root = normalizedPath(candidate.source.path).replace(/^\//, '')
  const packageDirectory = directory === root || (root && directory.startsWith(`${root}/`))
    ? directory
    : [root, directory].filter(Boolean).join('/')
  const repository = new URL(candidate.source.repository).pathname.replace(/^\//, '')
  return `github:${repository}#${candidate.source.ref}&path:/${packageDirectory}`
}

function fillCandidate(candidate) {
  form.elements.operation.value = 'create-project'
  form.elements.id.value = candidateProjectId(candidate)
  form.elements.name.value = candidate.displayName
  form.elements.summary.value = candidate.summary
  form.elements.kind.value = candidate.kind
  form.elements.category.value = candidate.category
  form.elements.tags.value = candidate.tags.join(', ')
  form.elements.repository.value = candidate.source.repository.replace(/\/$/, '')
  form.elements.path.value = normalizedPath(candidate.source.path)
  form.elements.ref.value = candidate.source.ref
  form.elements.version.value = candidate.declaration.version || ''
  form.elements.author.value = ''
  form.elements.license.value = ''
  form.elements.mediaIcon.value = ''
  form.elements.mediaCover.value = ''
  form.elements.mediaScreenshots.value = ''
  form.elements.updatedAt.value = currentLocalDateTime()
  form.elements.compatibility.value = ''
  form.elements.changelog.value = ''
  form.elements.permissions.value = ''
  form.elements.testing.value = ''
  form.elements.installLabel.value = ''
  form.elements.instructions.value = ''
  form.elements.source.value = ''
  form.elements.packageName.value = ''
  form.elements.spec.value = ''
  if (candidate.install.possibleAdapter === 'official-profile/v1' && candidate.declaration.packageName) {
    form.elements.method.value = 'profile-bundle'
    form.elements.packageName.value = candidate.declaration.packageName
    form.elements.spec.value = `git+${candidate.source.repository.replace(/\/$/, '')}.git#${candidate.source.ref}`
  } else if (candidate.install.possibleAdapter === 'official-repository/v1' && repositoryPluginSource(candidate)) {
    form.elements.method.value = 'repository-plugin'
    form.elements.source.value = repositoryPluginSource(candidate)
  } else {
    form.elements.method.value = 'manual'
  }
  candidatePrefill.hidden = false
  candidatePrefillName.textContent = candidate.displayName
  suggestProjectIdentity()
  managementMode()
}

function managementMode() {
  const method = form.elements.method.value
  const transactional = method === 'profile-bundle'
  const repositoryPlugin = method === 'repository-plugin'
  bundleFields.hidden = !transactional
  sourceField.hidden = !repositoryPlugin
  for (const input of bundleFields.querySelectorAll('input')) input.required = transactional
  sourceField.querySelector('input').required = repositoryPlugin
  managementDetails.open = method === 'manual'
  managementSummary.textContent = t(`publish.methodSummary.${method || 'unselected'}`)
  suggestInstallFacts()
}

function managementSelection() {
  const selection = form.elements.method.value
  if (selection === 'profile-bundle') return { method: selection, protocol: 'harness-profile' }
  if (selection === 'repository-plugin') return { method: selection, protocol: 'harness-repository' }
  if (selection === 'cordis-sdk') return { method: 'manual', protocol: 'harness-cordis' }
  return { method: selection, protocol: 'third-party' }
}

function assignSuggestion(input, value) {
  if (!input.value || input.value === input.dataset.generated) {
    input.value = value
    input.dataset.generated = value
  }
}

function suggestProjectIdentity() {
  if (form.elements.operation.value !== 'create-project') return
  const repository = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(form.elements.repository.value.trim())
  if (!repository) {
    for (const field of [form.elements.id, form.elements.author]) {
      if (field.value === field.dataset.generated) field.value = ''
      field.dataset.generated = ''
    }
    return
  }
  const projectId = repository[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (projectId) assignSuggestion(form.elements.id, projectId)
  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(repository[1])) {
    assignSuggestion(form.elements.author, repository[1])
  }
}

function suggestInstallFacts() {
  const method = form.elements.method.value
  const repository = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(form.elements.repository.value)
  const ref = form.elements.ref.value
  if (method === 'profile-bundle') {
    const releaseId = `${form.elements.id.value}@${form.elements.version.value}`
    if (form.elements.id.value && form.elements.version.value) {
      assignSuggestion(form.elements.installLabel, t('publish.defaultSubscribeLabel'))
      assignSuggestion(form.elements.instructions, `omdsh workshop install ${form.elements.id.value} --release ${releaseId} --enable`)
    }
    if (repository && /^[0-9a-f]{40}$/.test(ref)) {
      const repositoryUrl = form.elements.repository.value.replace(/\/$/, '').replace(/\.git$/, '')
      assignSuggestion(form.elements.spec, `git+${repositoryUrl}.git#${ref}`)
    }
    return
  }
  if (method === 'cordis-sdk' && repository && /^[0-9a-f]{40}$/.test(ref)) {
    assignSuggestion(form.elements.installLabel, t('publish.defaultCordisLabel'))
    const rootSource = `github:${repository[1]}/${repository[2]}#${ref}`
    const path = normalizedPath(form.elements.path.value)
    const instructions = path
      ? `${t('publish.defaultCordisInstructions')} ${form.elements.repository.value.replace(/\/$/, '')}/tree/${ref}${path}`
      : `dsh-sdk create ${rootSource}`
    assignSuggestion(form.elements.instructions, instructions)
    return
  }
  if (method === 'manual') {
    assignSuggestion(form.elements.installLabel, t('publish.defaultThirdPartyLabel'))
    if (form.elements.instructions.value === form.elements.instructions.dataset.generated) {
      form.elements.instructions.value = ''
      form.elements.instructions.dataset.generated = ''
    }
    return
  }
  if (method !== 'repository-plugin' || !repository || !/^[0-9a-f]{40}$/.test(ref)) return
  const rawPath = form.elements.path.value || ''
  const pluginPath = rawPath.endsWith('/.dsh-plugin') ? rawPath : `${rawPath}/.dsh-plugin`.replace(/^\/$/, '/.dsh-plugin')
  const suggestedSource = `github:${repository[1]}/${repository[2]}#${ref}&path:${pluginPath}`
  assignSuggestion(form.elements.source, suggestedSource)
  const source = form.elements.source.value || suggestedSource
  assignSuggestion(form.elements.installLabel, t('publish.defaultCopyLabel'))
  assignSuggestion(form.elements.instructions, `- id: repository-plugins\n  name: '@deepseek-ai/dsh-repository-plugin'\n  config:\n    repositories:\n      - '${source}'`)
}

function fillExistingProject() {
  if (form.elements.operation.value !== 'add-release') return
  const project = publishedProjects.get(form.elements.id.value)
  if (!project) return
  const release = project.releases.find((item) => item.id === project.latestRelease) || project.releases[0]
  const catalog = catalogProjects.get(project.id)
  form.elements.name.value = project.displayName
  form.elements.summary.value = project.summary
  form.elements.kind.value = project.kind
  form.elements.category.value = project.categories[0] || 'workflow'
  form.elements.tags.value = project.tags.join(', ')
  form.elements.repository.value = project.repository
  form.elements.path.value = release?.source?.path || ''
  form.elements.author.value = project.author.url.split('/').filter(Boolean).at(-1) || project.author.name
  form.elements.license.value = release?.license || ''
  form.elements.mediaIcon.value = catalog?.media?.icon || ''
  form.elements.mediaCover.value = catalog?.media?.cover || ''
  form.elements.mediaScreenshots.value = (catalog?.media?.screenshots || []).join('\n')
  form.elements.compatibility.value = release?.compatibility?.declared || ''
  form.elements.requiresFabric.checked = release?.capabilities?.requiresFabric === true
  form.elements.deepHook.checked = release?.capabilities?.deepHook === true
  form.elements.restartRequired.checked = release?.capabilities?.restartRequired === true
  const installMethod = release?.runtime?.installMethod
  const protocol = catalog?.install?.protocol || release?.runtime?.protocol
  form.elements.method.value = installMethod === 'profile-bundle' || installMethod === 'repository-plugin'
    ? installMethod
    : protocol === 'harness-cordis' ? 'cordis-sdk' : 'manual'
  form.elements.installLabel.value = catalog?.install?.label || ''
  form.elements.instructions.value = catalog?.install?.command || ''
  form.elements.source.value = catalog?.install?.source || ''
  form.elements.packageName.value = release?.install?.packageName || ''
  form.elements.spec.value = ''
  managementMode()
}

async function loadProjects() {
  try {
    const [workshopResponse, catalogResponse, candidateResponse] = await Promise.all([
      fetch('workshop-v1.json'),
      fetch('catalog.json'),
      fetch('candidates-v1.json'),
    ])
    if (!workshopResponse.ok || !catalogResponse.ok) return
    const [workshop, catalog] = await Promise.all([workshopResponse.json(), catalogResponse.json()])
    publishedProjects = new Map((workshop.projects || []).map((project) => [project.id, project]))
    catalogProjects = new Map((catalog.packages || []).map((project) => [project.id, project]))
    projectOptions.replaceChildren(...[...publishedProjects.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((project) => {
        const option = document.createElement('option')
        option.value = project.id
        option.textContent = project.displayName
        return option
      }))
    const requestedCandidate = new URLSearchParams(location.search).get('candidate')
    if (requestedCandidate && candidateResponse.ok) {
      const candidates = await candidateResponse.json()
      const candidate = (candidates.projects || []).find((item) => item.id === requestedCandidate)
      if (candidate) fillCandidate(candidate)
      else fillExistingProject()
    } else {
      fillExistingProject()
    }
  } catch {
    // Author Studio still supports new projects when the optional preload fails.
  }
}

function values() {
  const data = new FormData(form)
  const ref = String(data.get('ref') || '')
  const operation = String(data.get('operation'))
  const { method, protocol } = managementSelection()
  const transactional = method === 'profile-bundle'
  const packageName = String(data.get('packageName') || '')
  const spec = String(data.get('spec') || '')
  const source = String(data.get('source') || '') || null
  const id = String(data.get('id'))
  const icon = String(data.get('mediaIcon') || '').trim()
  const cover = String(data.get('mediaCover') || '').trim()
  const screenshots = mediaPaths(data.get('mediaScreenshots'))
  const media = icon || cover || screenshots.length > 0
    ? { ...(icon ? { icon } : {}), ...(cover ? { cover } : {}), ...(screenshots.length > 0 ? { screenshots } : {}) }
    : null
  if (operation === 'create-project' && publishedProjects.has(id)) throw new Error(t('publish.projectExists'))
  if (operation === 'add-release' && !publishedProjects.has(id)) throw new Error(t('publish.projectMissing'))
  if (transactional && (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(packageName) || !exactSpec.test(spec))) {
    throw new Error(t('publish.invalidBundle'))
  }
  if (transactional && spec.includes('#') && !spec.endsWith(`#${ref}`)) {
    throw new Error(t('publish.specMismatch'))
  }
  if (method === 'repository-plugin' && (!source || !source.includes(`#${ref}`) || !String(data.get('instructions')).includes(source))) {
    throw new Error(t('publish.invalidSource'))
  }
  return {
    schema: 'omdsh-workshop-submission/v1',
    operation,
    project: {
      id,
      displayName: String(data.get('name')),
      summary: String(data.get('summary')),
      kind: String(data.get('kind')),
      category: String(data.get('category')),
      tags: tags(data.get('tags')),
      repository: String(data.get('repository')),
      path: String(data.get('path') || '') || null,
      author: {
        name: String(data.get('author')),
        url: `https://github.com/${encodeURIComponent(String(data.get('author')))}`,
      },
      license: String(data.get('license')),
      media,
    },
    release: {
      version: String(data.get('version')),
      ref,
      updatedAt: isoFromLocal(String(data.get('updatedAt'))),
      channel: String(data.get('channel')),
      compatibility: String(data.get('compatibility')),
      changelog: String(data.get('changelog')),
      capabilities: {
        requiresFabric: data.get('requiresFabric') === 'on' || data.get('deepHook') === 'on',
        deepHook: data.get('deepHook') === 'on',
        restartRequired: data.get('restartRequired') === 'on',
      },
      profileBundle: transactional ? { packageName, spec } : null,
    },
    management: {
      method,
      protocol,
      label: String(data.get('installLabel')),
      instructions: String(data.get('instructions')),
      source: method === 'repository-plugin' ? source : null,
    },
    declarations: {
      permissions: String(data.get('permissions')),
      testing: String(data.get('testing')),
      trustedPublisherRequested: data.get('trustedPublisherRequested') === 'on',
      installScriptsMustRemainDisabled: true,
    },
  }
}

function setReady(ready) {
  copyButton.disabled = !ready
  downloadButton.disabled = !ready
  submission.classList.toggle('is-disabled', !ready)
  submission.setAttribute('aria-disabled', String(!ready))
  if (ready) previewDetails.open = true
}

form.elements.method.addEventListener('change', managementMode)
form.elements.operation.addEventListener('change', () => {
  fillExistingProject()
  suggestProjectIdentity()
})
form.elements.id.addEventListener('change', fillExistingProject)
form.elements.deepHook.addEventListener('change', () => {
  if (form.elements.deepHook.checked) form.elements.requiresFabric.checked = true
})
for (const name of ['id', 'version', 'repository', 'path', 'ref']) {
  form.elements[name].addEventListener('input', suggestInstallFacts)
}
form.elements.repository.addEventListener('input', suggestProjectIdentity)
nextStepButton.addEventListener('click', continueToNextStep)
previousStepButton.addEventListener('click', () => setStep(currentStep - 1))
stepButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const step = Number(button.dataset.publishStep)
    if (step <= availableStep) setStep(step)
  })
})

form.addEventListener('submit', (event) => {
  event.preventDefault()
  error.hidden = true
  const invalidStep = formSections.findIndex((_, index) => firstInvalidField(index))
  if (invalidStep >= 0) {
    availableStep = Math.max(availableStep, invalidStep)
    setStep(invalidStep)
    const invalid = firstInvalidField(invalidStep)
    if (invalid) queueMicrotask(() => revealInvalidField(invalid))
    return
  }
  try {
    manifest = values()
    output.textContent = JSON.stringify(manifest, null, 2)
    setReady(true)
  } catch (reason) {
    manifest = null
    setReady(false)
    error.textContent = reason instanceof Error ? reason.message : String(reason)
    error.hidden = false
  }
})

form.addEventListener('invalid', (event) => {
  event.target.closest('details')?.setAttribute('open', '')
}, true)

form.addEventListener('reset', () => {
  queueMicrotask(() => {
    manifest = null
    output.textContent = '{}'
    previewDetails.open = false
    ensurePublishedAt()
    managementMode()
    availableStep = 0
    setStep(0)
    error.hidden = true
    setReady(false)
  })
})

copyButton.addEventListener('click', async () => {
  if (!manifest) return
  await navigator.clipboard.writeText(`${JSON.stringify(manifest, null, 2)}\n`)
  copyButton.textContent = t('publish.copied')
  window.setTimeout(() => { copyButton.textContent = t('publish.copy') }, 1600)
})

downloadButton.addEventListener('click', () => {
  if (!manifest) return
  const blob = new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${manifest.project.id}-workshop-submission.json`
  anchor.click()
  URL.revokeObjectURL(url)
})

submission.addEventListener('click', (event) => {
  if (!manifest) event.preventDefault()
})

document.addEventListener('dsh:locale', () => {
  managementMode()
  setStep(currentStep)
  if (manifest) output.textContent = JSON.stringify(manifest, null, 2)
})

ensurePublishedAt()
managementMode()
setStep(0)
window.dshI18nReady?.then(() => {
  managementMode()
  setStep(currentStep)
})
loadProjects()
