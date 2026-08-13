(() => {
  const modeButtons = [...document.querySelectorAll('[data-publish-mode]')]
  const modePanels = [...document.querySelectorAll('[data-publish-panel]')]
  const form = document.querySelector('#distribution-form')
  if (!form) return

  const picker = document.querySelector('#distribution-release-picker')
  const addButton = document.querySelector('#distribution-add-release')
  const itemList = document.querySelector('#distribution-items')
  const empty = document.querySelector('#distribution-items-empty')
  const error = document.querySelector('#distribution-error')
  const output = document.querySelector('#distribution-output')
  const preview = document.querySelector('#distribution-preview')
  const copyButton = document.querySelector('#copy-distribution')
  const downloadButton = document.querySelector('#download-distribution')
  const submission = document.querySelector('#open-distribution-submission')
  const selected = new Map()
  let releases = []
  let manifest = null

  const t = (key) => window.DSHHub?.t(key) || key
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

  function setMode(name, updateUrl = true) {
    if (!['project', 'distribution'].includes(name)) name = 'project'
    for (const button of modeButtons) {
      const active = button.dataset.publishMode === name
      button.setAttribute('aria-selected', String(active))
      button.tabIndex = active ? 0 : -1
    }
    for (const panel of modePanels) panel.hidden = panel.dataset.publishPanel !== name
    if (updateUrl) {
      const url = new URL(location.href)
      if (name === 'distribution') url.searchParams.set('type', 'distribution')
      else url.searchParams.delete('type')
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }

  function repositoryParts() {
    return /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(form.elements.repository.value.trim())
  }

  function assignSuggestion(input, value) {
    if (!input.value || input.value === input.dataset.generated) {
      input.value = value
      input.dataset.generated = value
    }
  }

  function suggestIdentity() {
    const parts = repositoryParts()
    if (!parts) return
    const id = parts[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    if (id) assignSuggestion(form.elements.id, id)
    assignSuggestion(form.elements.maintainer, parts[1])
  }

  function releaseLabel(item) {
    const version = item.release.version || item.release.id.split('@').at(-1)
    return `${item.project.displayName} · ${version} · ${item.release.channel}`
  }

  function renderPicker() {
    const current = picker.value
    picker.replaceChildren()
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = releases.length ? t('distributionStudio.chooseRelease') : t('distributionStudio.noEligibleReleases')
    picker.append(placeholder)
    for (const item of releases) {
      const option = document.createElement('option')
      option.value = item.release.id
      option.textContent = releaseLabel(item)
      option.disabled = selected.has(item.release.id)
      picker.append(option)
    }
    picker.value = selected.has(current) ? '' : current
    addButton.disabled = releases.length === 0
  }

  function renderItems() {
    empty.hidden = selected.size > 0
    itemList.innerHTML = [...selected.values()].map((item) => `
      <li>
        <span><strong>${escapeHtml(item.project.displayName)}</strong><small>${escapeHtml(item.release.id)}</small></span>
        <button type="button" data-remove-distribution-release="${escapeHtml(item.release.id)}" aria-label="${escapeHtml(t('distributionStudio.remove'))}">×</button>
      </li>`).join('')
    renderPicker()
  }

  function slug(value, index) {
    const normalized = String(value).normalize('NFKD').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    return normalized || `use-case-${index + 1}`
  }

  function parseUseCases(value) {
    const lines = String(value).split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length < 1 || lines.length > 5) throw new Error(t('distributionStudio.invalidUseCases'))
    const ids = new Set()
    return lines.map((line, index) => {
      const parts = line.split('|').map((item) => item.trim())
      if (parts.length !== 2 || parts.some((item) => item === '')) throw new Error(t('distributionStudio.invalidUseCases'))
      let id = slug(parts[1], index)
      if (ids.has(id)) id = `${id}-${index + 1}`
      ids.add(id)
      return { id, title: parts[0], translations: { en: parts[1] } }
    })
  }

  function values() {
    if (selected.size === 0) throw new Error(t('distributionStudio.invalidItems'))
    const repository = form.elements.repository.value.trim().replace(/\/$/, '')
    return {
      $schema: 'https://hub.0.org.cn/distribution.schema.json',
      schema: 'omdsh-distribution/v1',
      id: form.elements.id.value.trim(),
      version: form.elements.version.value.trim(),
      channel: form.elements.channel.value,
      title: form.elements.titleZh.value.trim(),
      summary: form.elements.summaryZh.value.trim(),
      translations: {
        en: {
          title: form.elements.titleEn.value.trim(),
          summary: form.elements.summaryEn.value.trim(),
        },
      },
      maintainer: {
        name: form.elements.maintainer.value.trim(),
        url: repository,
      },
      compatibility: {
        harness: 'official-profile/v1',
        declared: form.elements.compatibility.value.trim(),
      },
      useCases: parseUseCases(form.elements.useCases.value),
      items: [...selected.values()].map((item) => ({
        projectId: item.project.id,
        releaseId: item.release.id,
        enabled: true,
      })),
      application: {
        candidate: 'required',
        confirmation: 'required',
        recovery: 'managed-profile-generation',
        externalSideEffects: 'not-covered',
      },
    }
  }

  function setReady(ready) {
    copyButton.disabled = !ready
    downloadButton.disabled = !ready
    submission.classList.toggle('is-disabled', !ready)
    submission.setAttribute('aria-disabled', String(!ready))
    if (ready) preview.open = true
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.publishMode)))
  addButton.addEventListener('click', () => {
    const item = releases.find((candidate) => candidate.release.id === picker.value)
    if (!item || selected.has(item.release.id)) return
    selected.set(item.release.id, item)
    renderItems()
  })
  itemList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-distribution-release]')
    if (!button) return
    selected.delete(button.dataset.removeDistributionRelease)
    renderItems()
  })
  form.elements.repository.addEventListener('input', suggestIdentity)

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    error.hidden = true
    if (!form.reportValidity()) return
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

  form.addEventListener('reset', () => queueMicrotask(() => {
    selected.clear()
    manifest = null
    output.textContent = '{}'
    preview.open = false
    error.hidden = true
    setReady(false)
    renderItems()
  }))

  copyButton.addEventListener('click', async () => {
    if (!manifest) return
    await navigator.clipboard.writeText(`${JSON.stringify(manifest, null, 2)}\n`)
    copyButton.textContent = t('publish.copied')
    setTimeout(() => { copyButton.textContent = t('publish.copy') }, 1600)
  })

  downloadButton.addEventListener('click', () => {
    if (!manifest) return
    const blob = new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${manifest.id}-${manifest.version}.distribution.json`
    anchor.click()
    URL.revokeObjectURL(url)
  })
  submission.addEventListener('click', (event) => { if (!manifest) event.preventDefault() })

  document.addEventListener('dsh:locale', () => {
    renderItems()
    if (manifest) output.textContent = JSON.stringify(manifest, null, 2)
  })

  Promise.all([
    window.dshI18nReady,
    fetch('workshop-v1.json').then((response) => {
      if (!response.ok) throw new Error(`Workshop HTTP ${response.status}`)
      return response.json()
    }),
  ]).then(([, workshop]) => {
    releases = (workshop.projects || []).flatMap((project) => (project.releases || [])
      .filter((release) => release.state === 'active'
        && ['auto-listed', 'reviewed'].includes(release.listing?.state)
        && release.install?.mode === 'profile-bundle'
        && release.management?.mode === 'transactional')
      .map((release) => ({ project, release })))
      .sort((left, right) => releaseLabel(left).localeCompare(releaseLabel(right)))
    renderPicker()
  }).catch(() => {
    picker.replaceChildren(new Option(t('distributionStudio.loadFailed'), ''))
    addButton.disabled = true
  })

  const requestedMode = new URLSearchParams(location.search).get('type') === 'distribution' ? 'distribution' : 'project'
  setMode(requestedMode, false)
  renderItems()
})()
