(() => {
  const tabs = ['distributions', 'collections', 'community']
  const state = { workshop: null, recipes: null, active: 'distributions', taskQuery: '' }
  const elements = {
    collections: document.querySelector('#configuration-collections'),
    community: document.querySelector('#configuration-community'),
    distributions: document.querySelector('#configuration-distributions'),
    taskQuery: document.querySelector('#configuration-task-query'),
    taskClear: document.querySelector('#configuration-task-clear'),
    taskSuggestions: document.querySelector('#configuration-task-suggestions'),
    taskResults: document.querySelector('#configuration-task-results'),
    taskStatus: document.querySelector('#configuration-task-status'),
    taskGrid: document.querySelector('#configuration-task-grid'),
    toast: document.querySelector('#configuration-toast'),
  }

  const t = (key) => window.DSHHub?.t(key) || key
  const locale = () => window.DSHHub?.locale || 'zh'
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  const format = (key, values) => Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), t(key),
  )
  const localized = (item) => locale() === 'en' && item.translations?.en ? item.translations.en : item
  const authorName = (author) => ['anonymous', 'omdsh maintainers', 'dsh hub maintainers'].includes(author?.name?.toLowerCase())
    ? t('authors.anonymous')
    : author?.name || t('authors.anonymous')

  function projectName(id) {
    return state.workshop?.projects.find((project) => project.id === id)?.displayName || id
  }

  function projectStack(items) {
    return `<div class="recipe-project-stack">${items.slice(0, 5).map((item) => {
      const name = projectName(item.projectId)
      return `<span title="${escapeHtml(name)}">${escapeHtml([...name][0]?.toUpperCase() || 'D')}</span>`
    }).join('')}${items.length > 5 ? `<span>+${items.length - 5}</span>` : ''}</div>`
  }

  function taskTags(item) {
    const useCases = item.useCases || []
    if (useCases.length === 0) return ''
    return `<div class="configuration-task-tags" aria-label="${escapeHtml(t('configurations.taskUsesLabel'))}">${useCases.map((useCase) => {
      const title = locale() === 'en' ? useCase.translations?.en : useCase.title
      return `<span>${escapeHtml(title || useCase.id)}</span>`
    }).join('')}</div>`
  }

  function preflightSuggestion(kind, preflight) {
    const count = kind === 'preview-required-additions'
      ? preflight.repairPreview.additions.length
      : kind === 'declare-relations'
        ? preflight.facts.items - preflight.facts.relationsDeclared
        : kind === 'add-run-record'
          ? preflight.facts.items - preflight.facts.successfulRuns
          : 0
    return format(`configurations.preflight.suggestion.${kind}`, { count })
  }

  function preflightPanel(composition) {
    const preflight = window.DSHCompositionPreflight?.evaluate({ workshop: state.workshop, composition })
    if (!preflight) return ''
    const { facts } = preflight
    const repairPreview = preflight.repairPreview.additions.length === 0 ? '' : `
      <div class="configuration-repair-preview">
        <strong>${escapeHtml(t('configurations.preflight.repairTitle'))}</strong>
        <ul>${preflight.repairPreview.additions.map((item) => `<li><span>+</span><code>${escapeHtml(projectName(item.projectId))}</code><small>${escapeHtml(item.releaseId)}</small></li>`).join('')}</ul>
        <p>${escapeHtml(t('configurations.preflight.repairBoundary'))}</p>
      </div>`
    return `<details class="configuration-preflight" data-preflight-state="${escapeHtml(preflight.status)}">
      <summary><span>${escapeHtml(t('configurations.preflight.title'))}</span><strong>${escapeHtml(t(`configurations.preflight.status.${preflight.status}`))}</strong></summary>
      <div class="configuration-preflight-body">
        <dl class="configuration-preflight-facts">
          <div><dt>${escapeHtml(t('configurations.preflight.releases'))}</dt><dd>${facts.available}/${facts.items}</dd></div>
          <div><dt>${escapeHtml(t('configurations.preflight.relations'))}</dt><dd>${facts.relationsDeclared}/${facts.items}</dd></div>
          <div><dt>${escapeHtml(t('configurations.preflight.runs'))}</dt><dd>${facts.successfulRuns}/${facts.items}</dd></div>
          <div><dt>${escapeHtml(t('configurations.preflight.recovery'))}</dt><dd>${escapeHtml(t(`configurations.preflight.recovery.${facts.recoveryScope}`))}</dd></div>
        </dl>
        <p class="configuration-preflight-boundary">${escapeHtml(t(`configurations.preflight.external.${facts.externalEffects}`))}</p>
        <div class="configuration-preflight-suggestions">
          <strong>${escapeHtml(t('configurations.preflight.suggestions'))}</strong>
          <ol>${preflight.suggestions.slice(0, 3).map((kind) => `<li>${escapeHtml(preflightSuggestion(kind, preflight))}</li>`).join('')}</ol>
          <a href="developer-guide.html">${escapeHtml(t('configurations.preflight.guide'))}</a>
        </div>
        ${repairPreview}
        <p class="configuration-preflight-note">${escapeHtml(t('configurations.preflight.noMutation'))}</p>
      </div>
    </details>`
  }

  function collectionCard(collection) {
    const copy = localized(collection)
    const command = `omdsh workshop collection ${collection.id} --profile web`
    return `<article class="configuration-card configuration-card-collection">
      <div class="configuration-card-meta"><span>${escapeHtml(t('configurations.kind.collection'))}</span><code>${escapeHtml(collection.id)}</code></div>
      <h3>${escapeHtml(copy.title)}</h3>
      <p>${escapeHtml(copy.summary)}</p>
      ${taskTags(collection)}
      ${projectStack(collection.items)}
      <dl><div><dt>${escapeHtml(t('configurations.projects'))}</dt><dd>${collection.items.length}</dd></div><div><dt>${escapeHtml(t('configurations.applyMode'))}</dt><dd>${escapeHtml(t('configurations.apply.atomic'))}</dd></div></dl>
      ${preflightPanel(collection)}
      <footer><span>${escapeHtml(authorName(collection.author))}</span><button type="button" data-copy-command="${escapeHtml(command)}">${escapeHtml(t('configurations.copyCollection'))}</button></footer>
    </article>`
  }

  function recipeCard(recipe) {
    const copy = localized(recipe)
    const mode = recipe.apply?.mode || 'blocked'
    return `<article class="configuration-card configuration-card-recipe">
      <div class="configuration-card-meta"><span>${escapeHtml(t(`configurations.kind.${recipe.kind}`))}</span><code>${escapeHtml(recipe.compatibility?.harness || t('configurations.compatibilityUnknown'))}</code></div>
      <h3>${escapeHtml(copy.title)}</h3>
      <p>${escapeHtml(copy.summary)}</p>
      ${taskTags(recipe)}
      ${projectStack(recipe.items)}
      <dl><div><dt>${escapeHtml(t('configurations.projects'))}</dt><dd>${recipe.items.length}</dd></div><div><dt>${escapeHtml(t('configurations.applyMode'))}</dt><dd>${escapeHtml(t(`configurations.apply.${mode}`))}</dd></div></dl>
      ${preflightPanel(recipe)}
      <footer><span>${escapeHtml(authorName(recipe.author))}</span><a href="${escapeHtml(recipe.source.repository)}/tree/${escapeHtml(recipe.source.ref)}">${escapeHtml(t('configurations.viewSource'))}</a></footer>
    </article>`
  }

  function normalizeTaskQuery(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/g, ' ')
  }

  function taskSearchText(item) {
    return normalizeTaskQuery((item.useCases || []).flatMap((useCase) => [
      useCase.id,
      useCase.title,
      useCase.translations?.en,
    ]).filter(Boolean).join(' '))
  }

  function taskMatches(item, query) {
    const normalized = normalizeTaskQuery(query)
    if (normalized === '') return false
    const text = taskSearchText(item)
    return text.includes(normalized) || normalized.split(' ').every((token) => text.includes(token))
  }

  function taskCompositions() {
    const collections = (state.workshop?.collections || []).map((item) => ({ ...item, compositionType: 'collection' }))
    const recipes = (state.recipes?.recipes || []).map((item) => ({ ...item, compositionType: 'recipe' }))
    const rank = (item) => item.kind === 'distribution' && item.apply?.mode === 'single-candidate'
      ? 0
      : item.compositionType === 'collection' ? 1 : item.apply?.mode === 'single-candidate' ? 2 : item.apply?.mode === 'guided' ? 3 : 4
    return [...collections, ...recipes].sort((left, right) => rank(left) - rank(right) || left.id.localeCompare(right.id))
  }

  function renderTaskFinder() {
    if (!state.workshop || !state.recipes) return
    const compositions = taskCompositions()
    const suggestions = new Map()
    for (const item of compositions) {
      for (const useCase of item.useCases || []) if (!suggestions.has(useCase.id)) suggestions.set(useCase.id, useCase)
    }
    elements.taskSuggestions.innerHTML = [...suggestions.values()].map((useCase) => {
      const title = locale() === 'en' ? useCase.translations?.en : useCase.title
      return `<button type="button" data-task-intent="${escapeHtml(useCase.id)}">${escapeHtml(title || useCase.id)}</button>`
    }).join('')

    const query = normalizeTaskQuery(state.taskQuery)
    elements.taskClear.hidden = query === ''
    elements.taskResults.hidden = query === ''
    if (query === '') return
    const matches = compositions.filter((item) => taskMatches(item, query))
    elements.taskStatus.textContent = matches.length === 0
      ? t('configurations.taskNoMatch')
      : format('configurations.taskMatchCount', { count: matches.length })
    elements.taskGrid.innerHTML = matches.length === 0
      ? `<div class="configuration-task-no-match"><a href="plugins.html">${escapeHtml(t('configurations.taskBrowseProjects'))}</a><span>${escapeHtml(t('configurations.taskNoGuess'))}</span></div>`
      : matches.map((item) => item.compositionType === 'collection' ? collectionCard(item) : recipeCard(item)).join('')
  }

  function emptyState(kind) {
    return `<div class="configuration-empty">
      <span aria-hidden="true">{ }</span>
      <div><h3>${escapeHtml(t(`configurations.empty.${kind}.title`))}</h3><p>${escapeHtml(t(`configurations.empty.${kind}.description`))}</p></div>
      <a href="recipes.schema.json">${escapeHtml(t('configurations.schema'))}</a>
    </div>`
  }

  function distributionCreateCard() {
    return `<aside class="configuration-create-card">
      <span aria-hidden="true">+</span>
      <div><p>${escapeHtml(t('configurations.createCardKicker'))}</p><h3>${escapeHtml(t('configurations.createCardTitle'))}</h3><p>${escapeHtml(t('configurations.createCardDescription'))}</p></div>
      <a href="publish.html?type=distribution">${escapeHtml(t('configurations.createDistribution'))}</a>
    </aside>`
  }

  function render() {
    if (!state.workshop || !state.recipes) return
    const collections = state.workshop.collections || []
    const community = state.recipes.recipes.filter((recipe) => recipe.kind === 'configuration')
    const distributions = state.recipes.recipes.filter((recipe) => recipe.kind === 'distribution')
    elements.collections.innerHTML = collections.length ? collections.map(collectionCard).join('') : emptyState('collections')
    elements.community.innerHTML = community.length ? community.map(recipeCard).join('') : emptyState('community')
    elements.distributions.innerHTML = `${distributions.length ? distributions.map(recipeCard).join('') : emptyState('distributions')}${distributionCreateCard()}`
    for (const element of Object.values(elements).filter((item) => item?.classList?.contains('configuration-grid'))) {
      element.setAttribute('aria-busy', 'false')
    }
    document.querySelector('#collection-count').textContent = String(collections.length)
    document.querySelector('#community-recipe-count').textContent = String(community.length)
    document.querySelector('#distribution-count').textContent = String(distributions.length)
    renderTaskFinder()
  }

  function activate(name, updateHash = true) {
    if (!tabs.includes(name)) name = 'distributions'
    state.active = name
    document.querySelectorAll('[data-configuration-tab]').forEach((button) => {
      const active = button.dataset.configurationTab === name
      button.setAttribute('aria-selected', String(active))
      button.tabIndex = active ? 0 : -1
    })
    document.querySelectorAll('[data-configuration-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.configurationPanel !== name
    })
    if (updateHash) history.replaceState(null, '', `#${name}`)
  }

  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = value
      document.body.append(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    elements.toast.textContent = t('configurations.commandCopied')
    elements.toast.hidden = false
    clearTimeout(copy.timer)
    copy.timer = setTimeout(() => { elements.toast.hidden = true }, 2200)
  }

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-configuration-tab]')
    if (tab) activate(tab.dataset.configurationTab)
    const jump = event.target.closest('[data-configuration-jump]')
    if (jump) {
      activate(jump.dataset.configurationJump)
      document.querySelector('#configuration-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    const command = event.target.closest('[data-copy-command]')
    if (command) void copy(command.dataset.copyCommand)
    const taskIntent = event.target.closest('[data-task-intent]')
    if (taskIntent) {
      const useCase = taskCompositions().flatMap((item) => item.useCases || []).find((item) => item.id === taskIntent.dataset.taskIntent)
      state.taskQuery = locale() === 'en' ? useCase?.translations?.en || useCase?.title || '' : useCase?.title || ''
      elements.taskQuery.value = state.taskQuery
      renderTaskFinder()
      elements.taskQuery.focus()
    }
  })
  elements.taskQuery.addEventListener('input', () => {
    state.taskQuery = elements.taskQuery.value
    renderTaskFinder()
  })
  elements.taskClear.addEventListener('click', () => {
    state.taskQuery = ''
    elements.taskQuery.value = ''
    renderTaskFinder()
    elements.taskQuery.focus()
  })
  document.addEventListener('keydown', (event) => {
    const tab = event.target.closest('[data-configuration-tab]')
    if (!tab || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const index = tabs.indexOf(tab.dataset.configurationTab)
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const next = tabs[(index + direction + tabs.length) % tabs.length]
    activate(next)
    document.querySelector(`[data-configuration-tab="${next}"]`)?.focus()
  })
  document.addEventListener('dsh:locale', render)
  addEventListener('hashchange', () => activate(location.hash.slice(1), false))

  Promise.all([
    window.dshI18nReady,
    fetch('workshop-v1.json').then((response) => {
      if (!response.ok) throw new Error(`Workshop HTTP ${response.status}`)
      return response.json()
    }),
    fetch('recipes-v1.json').then((response) => {
      if (!response.ok) throw new Error(`Recipes HTTP ${response.status}`)
      return response.json()
    }),
  ]).then(([, workshop, recipes]) => {
    state.workshop = workshop
    state.recipes = recipes
    render()
    activate(location.hash.slice(1), false)
  }).catch((error) => {
    console.warn('Configuration feeds could not be loaded.', error)
    for (const target of [elements.collections, elements.community, elements.distributions]) {
      target.innerHTML = emptyState('unavailable')
      target.setAttribute('aria-busy', 'false')
    }
  })
})()
