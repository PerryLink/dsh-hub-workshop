const state = {
  packages: [],
  query: '',
  category: 'all',
  kind: 'all',
  install: 'all',
  sort: 'featured',
  snapshot: '',
}

const elements = {
  list: document.querySelector('#catalog-list'),
  featured: document.querySelector('#featured-list'),
  count: document.querySelector('#result-count'),
  empty: document.querySelector('#empty-state'),
  search: document.querySelector('#search'),
  kind: document.querySelector('#kind-filter'),
  install: document.querySelector('#install-filter'),
  sort: document.querySelector('#sort-order'),
  categories: document.querySelector('#category-filters'),
  results: document.querySelector('.results-panel'),
  dialog: document.querySelector('#package-dialog'),
  dialogContent: document.querySelector('#dialog-content'),
  toast: document.querySelector('#toast'),
}

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const t = (key) => window.DSHHub.t(key)
const locale = () => window.DSHHub.locale
const formatText = (key, values = {}) => Object.entries(values)
  .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), t(key))

const detailUrl = (pkg) => `${pkg.repository}/tree/${pkg.ref}${pkg.repositoryPath || ''}`

function avatarUrl(pkg) {
  try {
    const url = new URL(pkg.author.url)
    const segments = url.pathname.split('/').filter(Boolean)
    if (url.hostname !== 'github.com' || segments.length !== 1 || segments[0] === 'orgs') return ''
    return `https://github.com/${encodeURIComponent(segments[0])}.png?size=80`
  } catch {
    return ''
  }
}

function commandPreview(command) {
  const firstLine = command.split('\n').find((line) => line.trim()) || command
  return firstLine.trim().replaceAll(/\s+/g, ' ')
}

function packageMonogram(name) {
  const language = locale() === 'zh' ? 'zh-CN' : 'en-US'
  const words = String(name).trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (words.length > 1) {
    return words.slice(0, 2).map((word) => [...word][0]).join('').toLocaleUpperCase(language)
  }
  return [...(words[0] || 'D')].slice(0, 2).join('').toLocaleUpperCase(language)
}

function authorMark(pkg, className = '') {
  const avatar = avatarUrl(pkg)
  if (avatar) {
    return `<img class="author-avatar ${escapeHtml(className)}" src="${escapeHtml(avatar)}" alt="" width="24" height="24" loading="lazy" data-avatar>`
  }
  return `<span class="author-fallback ${escapeHtml(className)}" aria-hidden="true">${escapeHtml([...pkg.author.name][0]?.toLocaleUpperCase(locale() === 'zh' ? 'zh-CN' : 'en-US') || 'D')}</span>`
}

function packageText(pkg) {
  const translation = locale() === 'en' ? window.DSHHub.i18n?.packages?.[pkg.id] : null
  return {
    name: translation?.name || pkg.name,
    description: translation?.description || pkg.description,
    installLabel: translation?.installLabel || pkg.install.label,
    installNote: translation?.installNote ?? pkg.install.note,
    compatibility: translation?.compatibility || pkg.compatibility || t('dialog.seeProject'),
  }
}

function categoryLabel(category) {
  return t(`categories.${category}`) === `categories.${category}` ? category : t(`categories.${category}`)
}

function kindLabel(kind) {
  return t(`kinds.${kind}`) === `kinds.${kind}` ? kind : t(`kinds.${kind}`)
}

function statusLabel(status) {
  return t(`statuses.${status}`) === `statuses.${status}` ? status : t(`statuses.${status}`)
}

function formatDate(value, style = 'short') {
  const language = locale() === 'zh' ? 'zh-CN' : 'en-US'
  const options = style === 'long'
    ? { year: 'numeric', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric' }
  return new Intl.DateTimeFormat(language, { ...options, timeZone: 'Asia/Shanghai' }).format(new Date(value))
}

function installGroup(type) {
  if (['repository-plugin', 'marisa', 'npm'].includes(type)) return 'quick'
  if (type === 'plugin-registry') return 'managed'
  if (type === 'source') return 'source'
  return 'manual'
}

function searchableText(pkg) {
  const translated = window.DSHHub.i18n?.packages?.[pkg.id] || {}
  return [
    pkg.id,
    pkg.name,
    pkg.description,
    translated.name,
    translated.description,
    pkg.kind,
    pkg.category,
    pkg.author.name,
    pkg.repository,
    ...pkg.tags,
  ].filter(Boolean).join(' ').toLocaleLowerCase(locale() === 'zh' ? 'zh-CN' : 'en-US')
}

function filteredPackages() {
  const query = state.query.trim().toLocaleLowerCase(locale() === 'zh' ? 'zh-CN' : 'en-US')
  const packages = state.packages.filter((pkg) => {
    if (query && !searchableText(pkg).includes(query)) return false
    if (state.category !== 'all' && pkg.category !== state.category) return false
    if (state.kind !== 'all' && pkg.kind !== state.kind) return false
    if (state.install !== 'all' && installGroup(pkg.install.type) !== state.install) return false
    return true
  })

  return packages.sort((a, b) => {
    if (state.sort === 'name') return packageText(a).name.localeCompare(packageText(b).name, locale() === 'zh' ? 'zh-CN' : 'en')
    if (state.sort === 'updated') return new Date(b.updatedAt) - new Date(a.updatedAt)
    return Number(Boolean(b.featured)) - Number(Boolean(a.featured))
      || new Date(b.updatedAt) - new Date(a.updatedAt)
      || packageText(a).name.localeCompare(packageText(b).name, locale() === 'zh' ? 'zh-CN' : 'en')
  })
}

function packageCard(pkg) {
  const copy = packageText(pkg)
  const version = pkg.version ? `v${pkg.version}` : pkg.ref.slice(0, 7)
  return `
    <article class="package-card">
      <button class="package-thumb mark-${escapeHtml(pkg.category)}" type="button" data-open-package="${escapeHtml(pkg.id)}" aria-label="${escapeHtml(formatText('row.open', { name: copy.name }))}">
        <span>${escapeHtml(packageMonogram(copy.name))}</span>
      </button>
      <div class="package-card-content">
        <div class="package-card-top">
          <div class="package-labels">
            <span>${escapeHtml(kindLabel(pkg.kind))}</span>
            <span>${escapeHtml(categoryLabel(pkg.category))}</span>
          </div>
          <span class="package-status">${escapeHtml(statusLabel(pkg.status))}</span>
        </div>
        <div class="package-card-copy">
          <button class="package-name" type="button" data-open-package="${escapeHtml(pkg.id)}">${escapeHtml(copy.name)}</button>
          <code>${escapeHtml(pkg.id)}</code>
          <p>${escapeHtml(copy.description)}</p>
        </div>
        <div class="package-byline">
          ${authorMark(pkg, 'classic-avatar')}
          <a href="${escapeHtml(pkg.author.url)}">${escapeHtml(pkg.author.name)}</a>
          <span>${escapeHtml(version)}</span>
          <span>${escapeHtml(pkg.license)}</span>
          <time datetime="${escapeHtml(pkg.updatedAt)}">${escapeHtml(formatDate(pkg.updatedAt))} ${escapeHtml(t('row.updated'))}</time>
        </div>
      </div>
      <div class="package-card-footer">
        <button class="install-preview" type="button" data-copy-install="${escapeHtml(pkg.id)}" aria-label="${escapeHtml(formatText('row.copyInstall', { name: copy.name }))}">
          <span>
            <strong>${escapeHtml(copy.installLabel)}</strong>
            <code>${escapeHtml(commandPreview(pkg.install.command))}</code>
          </span>
          <span class="copy-label">${escapeHtml(t('dialog.copy'))}</span>
        </button>
        <div class="package-card-links">
          <a href="${escapeHtml(detailUrl(pkg))}">${escapeHtml(t('row.source'))} ↗</a>
          <button type="button" data-open-package="${escapeHtml(pkg.id)}" aria-label="${escapeHtml(formatText('row.open', { name: copy.name }))}">${escapeHtml(t('row.details'))}</button>
        </div>
      </div>
    </article>`
}

function render() {
  const packages = filteredPackages()
  elements.list.innerHTML = packages.map(packageCard).join('')
  elements.list.setAttribute('aria-busy', 'false')
  elements.count.textContent = String(packages.length)
  elements.empty.hidden = packages.length !== 0
  elements.list.hidden = packages.length === 0

  document.querySelectorAll('.category-filter').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.category === state.category))
  })
}

function alignResultsToTop() {
  window.cancelAnimationFrame(alignResultsToTop.frame)
  alignResultsToTop.frame = window.requestAnimationFrame(() => {
    elements.results.scrollIntoView({ block: 'start', behavior: 'instant' })
  })
}

function renderFeatured() {
  const packages = state.packages
    .filter((pkg) => pkg.featured)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 4)

  elements.featured.innerHTML = packages.map((pkg) => {
    const copy = packageText(pkg)
    return `
      <button class="featured-item" type="button" data-open-package="${escapeHtml(pkg.id)}">
        <span class="featured-icon mark-${escapeHtml(pkg.category)}">
          <span>${escapeHtml(packageMonogram(copy.name))}</span>
        </span>
        <span class="featured-content">
          <span class="featured-meta">
            <span>${escapeHtml(kindLabel(pkg.kind))}</span>
            <time datetime="${escapeHtml(pkg.updatedAt)}">${escapeHtml(formatDate(pkg.updatedAt))}</time>
          </span>
          <strong>${escapeHtml(copy.name)}</strong>
          <span class="featured-description">${escapeHtml(copy.description)}</span>
          <span class="featured-author">${authorMark(pkg)}<span>${escapeHtml(pkg.author.name)}</span></span>
        </span>
      </button>`
  }).join('')
  elements.featured.setAttribute('aria-busy', 'false')
}

function option(value, label) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
}

function renderFilters() {
  const categories = [...new Set(state.packages.map((pkg) => pkg.category))]
  elements.categories.innerHTML = ['all', ...categories].map((category) => {
    const count = category === 'all'
      ? state.packages.length
      : state.packages.filter((pkg) => pkg.category === category).length
    return `<button class="category-filter" type="button" data-category="${escapeHtml(category)}" aria-pressed="${category === state.category}">${escapeHtml(categoryLabel(category))}<span>${count}</span></button>`
  }).join('')

  const kinds = [...new Set(state.packages.map((pkg) => pkg.kind))]
  elements.kind.innerHTML = option('all', t('filters.allTypes'))
    + kinds.map((kind) => option(kind, kindLabel(kind))).join('')
  elements.install.innerHTML = [
    option('all', t('filters.allInstall')),
    option('quick', t('filters.quick')),
    option('managed', t('filters.managed')),
    option('source', t('filters.source')),
    option('manual', t('filters.manual')),
  ].join('')
  elements.sort.innerHTML = [
    option('featured', t('sort.featured')),
    option('updated', t('sort.updated')),
    option('name', t('sort.name')),
  ].join('')

  elements.kind.value = state.kind
  elements.install.value = state.install
  elements.sort.value = state.sort
}

function showToast(message) {
  elements.toast.textContent = message
  elements.toast.classList.add('is-visible')
  window.clearTimeout(showToast.timeout)
  showToast.timeout = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 1900)
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
  showToast(t('dialog.copied'))
}

function openPackage(id, updateHash = true) {
  const pkg = state.packages.find((candidate) => candidate.id === id)
  if (!pkg) return
  const copy = packageText(pkg)
  const version = pkg.version ? `v${pkg.version}` : pkg.ref.slice(0, 7)
  elements.dialog.dataset.packageId = id
  elements.dialogContent.innerHTML = `
    <div class="dialog-body">
      <div class="dialog-meta">
        <span>${escapeHtml(kindLabel(pkg.kind))}</span>
        <span>${escapeHtml(categoryLabel(pkg.category))}</span>
        <span>${escapeHtml(statusLabel(pkg.status))}</span>
      </div>
      <h2 id="dialog-title">${escapeHtml(copy.name)}</h2>
      <code class="dialog-id">${escapeHtml(pkg.id)}</code>
      <p class="dialog-description">${escapeHtml(copy.description)}</p>
      <dl class="dialog-facts">
        <div><dt>${escapeHtml(t('dialog.author'))}</dt><dd>${escapeHtml(pkg.author.name)}</dd></div>
        <div><dt>${escapeHtml(t('dialog.version'))}</dt><dd>${escapeHtml(version)}</dd></div>
        <div><dt>${escapeHtml(t('dialog.license'))}</dt><dd>${escapeHtml(pkg.license)}</dd></div>
        <div><dt>${escapeHtml(t('dialog.compatibility'))}</dt><dd>${escapeHtml(copy.compatibility)}</dd></div>
      </dl>
      <section class="install-panel">
        <div class="install-heading">
          <h3>${escapeHtml(copy.installLabel)}</h3>
          <span>${escapeHtml(pkg.install.type)}</span>
        </div>
        <div class="code-block">
          <pre><code>${escapeHtml(pkg.install.command)}</code></pre>
          <button class="copy-command" type="button">${escapeHtml(t('dialog.copy'))}</button>
        </div>
        ${copy.installNote ? `<p class="install-note">${escapeHtml(copy.installNote)}</p>` : ''}
      </section>
      <p class="dialog-safety">${escapeHtml(t('safety.short'))}</p>
      <div class="dialog-source">
        <div>
          <strong>${escapeHtml(t('dialog.fixedSource'))}</strong>
          <code>${escapeHtml(pkg.ref)}</code>
        </div>
        <a href="${escapeHtml(detailUrl(pkg))}">${escapeHtml(t('dialog.viewSource'))} ↗</a>
      </div>
    </div>`
  elements.dialogContent.querySelector('.copy-command').addEventListener('click', () => copyText(pkg.install.command))
  if (!elements.dialog.open) elements.dialog.showModal()
  if (updateHash) history.replaceState(null, '', `#package=${encodeURIComponent(pkg.id)}`)
}

function resetFilters() {
  state.query = ''
  state.category = 'all'
  state.kind = 'all'
  state.install = 'all'
  state.sort = 'featured'
  elements.search.value = ''
  renderFilters()
  render()
  alignResultsToTop()
}

function bindEvents() {
  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement && event.target.matches('[data-avatar]')) {
      event.target.remove()
    }
  }, true)
  elements.search.addEventListener('input', (event) => { state.query = event.target.value; render() })
  elements.kind.addEventListener('change', (event) => {
    state.kind = event.target.value
    render()
    alignResultsToTop()
  })
  elements.install.addEventListener('change', (event) => {
    state.install = event.target.value
    render()
    alignResultsToTop()
  })
  elements.sort.addEventListener('change', (event) => { state.sort = event.target.value; render() })
  elements.categories.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]')
    if (!button) return
    state.category = button.dataset.category
    render()
    alignResultsToTop()
  })
  document.addEventListener('click', (event) => {
    const copyButton = event.target.closest('[data-copy-install]')
    if (copyButton) {
      const pkg = state.packages.find((candidate) => candidate.id === copyButton.dataset.copyInstall)
      if (pkg) copyText(pkg.install.command)
      return
    }
    const button = event.target.closest('[data-open-package]')
    if (button) openPackage(button.dataset.openPackage)
  })
  document.querySelector('#reset-filters').addEventListener('click', resetFilters)
  document.querySelector('#reset-filters-top').addEventListener('click', resetFilters)
  document.querySelector('.dialog-close').addEventListener('click', () => elements.dialog.close())
  elements.dialog.addEventListener('click', (event) => {
    if (event.target === elements.dialog) elements.dialog.close()
  })
  elements.dialog.addEventListener('close', () => {
    elements.dialog.dataset.packageId = ''
    if (location.hash.startsWith('#package=')) history.replaceState(null, '', `${location.pathname}${location.search}`)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      event.preventDefault()
      elements.search.focus()
    }
  })
  document.addEventListener('dsh:locale', () => {
    renderFilters()
    renderFeatured()
    render()
    document.querySelector('#snapshot-time').textContent = formatDate(state.snapshot, 'long')
    if (elements.dialog.open && elements.dialog.dataset.packageId) {
      openPackage(elements.dialog.dataset.packageId, false)
    }
  })
}

async function init() {
  bindEvents()
  try {
    const [response] = await Promise.all([
      fetch('catalog.json'),
      window.dshI18nReady,
    ])
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const index = await response.json()
    state.packages = index.packages || []
    state.snapshot = index.updated
    document.querySelector('#stat-packages').textContent = index.stats.packages
    document.querySelector('#stat-repositories').textContent = index.stats.repositories
    document.querySelector('#stat-categories').textContent = Object.keys(index.stats.categories).length
    document.querySelector('#snapshot-time').textContent = formatDate(index.updated, 'long')
    renderFilters()
    renderFeatured()
    render()
    const requested = new URLSearchParams(location.hash.slice(1)).get('package')
    if (requested) openPackage(requested, false)
  } catch (error) {
    elements.list.setAttribute('aria-busy', 'false')
    elements.list.innerHTML = `<p class="load-error">${escapeHtml(t('error.load'))} ${escapeHtml(String(error))}</p>`
  }
}

init()
