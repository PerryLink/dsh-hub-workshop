(() => {
  const list = document.querySelector('#organization-project-list')
  const search = document.querySelector('#project-search')
  const empty = document.querySelector('#project-empty-state')
  const resultCount = document.querySelector('[data-project-result-count]')
  let projects = []

  function render() {
    const query = search.value.trim().toLocaleLowerCase()
    const filtered = projects.filter((repository) => repository.name.toLocaleLowerCase().includes(query))
    const fragment = document.createDocumentFragment()

    for (const repository of filtered) {
      const link = document.createElement('a')
      link.className = 'project-repository-card'
      link.href = repository.url

      const owner = document.createElement('span')
      owner.textContent = 'omdsh-dev'
      const name = document.createElement('strong')
      name.textContent = repository.name
      const action = document.createElement('small')
      action.textContent = document.documentElement.lang.startsWith('zh') ? '查看公开仓库' : 'View public repository'

      link.append(owner, name, action)
      fragment.append(link)
    }

    list.replaceChildren(fragment)
    list.setAttribute('aria-busy', 'false')
    resultCount.textContent = String(filtered.length)
    empty.hidden = filtered.length !== 0
  }

  search.addEventListener('input', render)
  document.addEventListener('dsh:locale', render)

  fetch('public-discovery.json')
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    })
    .then((data) => {
      projects = data.organization.repositories.filter((repository) => repository.kind === 'public-project')
      document.querySelectorAll('[data-project-count]').forEach((node) => { node.textContent = String(projects.length) })
      document.querySelectorAll('[data-topic-count]').forEach((node) => { node.textContent = String(data.topic.observedRepositoryCount) })
      render()
    })
    .catch(() => {
      list.setAttribute('aria-busy', 'false')
      list.replaceChildren()
      empty.hidden = false
      empty.querySelector('strong').textContent = '项目清单暂时无法加载'
      empty.querySelector('p').textContent = '请稍后重试，或直接访问 omdsh-dev 的 GitHub 组织页面。'
    })
})()
