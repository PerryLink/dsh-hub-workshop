((root) => {
  const releaseKey = (projectId, releaseId) => `${projectId}\0${releaseId}`

  function releaseIndex(workshop) {
    return new Map((workshop?.projects || []).flatMap((project) => (project.releases || []).map((release) => [
      releaseKey(project.id, release.id),
      { project, release },
    ])))
  }

  function isAvailable(release) {
    return release?.state === 'active'
      && release.install?.mode !== 'unavailable'
      && !['blocked', 'review-required'].includes(release.listing?.state)
  }

  function dependencyCycles(items, resolved) {
    const selected = new Set(items.map((item) => releaseKey(item.projectId, item.releaseId)))
    const edges = new Map(items.map((item) => [releaseKey(item.projectId, item.releaseId), []]))
    for (const item of items) {
      const source = releaseKey(item.projectId, item.releaseId)
      const release = resolved.get(source)?.release
      if (release?.relations?.state !== 'declared') continue
      for (const relation of release.relations.required || []) {
        const target = releaseKey(relation.projectId, relation.releaseId)
        if (selected.has(target)) edges.get(source).push(target)
      }
    }

    const visiting = new Set()
    const visited = new Set()
    const cycles = new Set()
    const visit = (node, path) => {
      if (visiting.has(node)) {
        const start = path.indexOf(node)
        cycles.add(path.slice(start).concat(node).join(' -> '))
        return
      }
      if (visited.has(node)) return
      visiting.add(node)
      for (const target of edges.get(node) || []) visit(target, [...path, node])
      visiting.delete(node)
      visited.add(node)
    }
    for (const node of edges.keys()) visit(node, [])
    return [...cycles]
  }

  function evaluate({ workshop, composition }) {
    const items = composition?.items || []
    const resolved = releaseIndex(workshop)
    const selected = new Set(items.map((item) => releaseKey(item.projectId, item.releaseId)))
    const issues = []
    const repairAdditions = new Map()
    let available = 0
    let relationsDeclared = 0
    let successfulRuns = 0

    for (const item of items) {
      const key = releaseKey(item.projectId, item.releaseId)
      const match = resolved.get(key)
      if (!match) {
        issues.push({ severity: 'blocked', kind: 'release-missing', projectId: item.projectId, releaseId: item.releaseId })
        continue
      }
      const { release } = match
      if (isAvailable(release)) available += 1
      else issues.push({ severity: 'blocked', kind: 'release-unavailable', projectId: item.projectId, releaseId: item.releaseId })

      if (release.relations?.state === 'declared') {
        relationsDeclared += 1
        for (const relation of release.relations.required || []) {
          const dependencyKey = releaseKey(relation.projectId, relation.releaseId)
          if (selected.has(dependencyKey)) continue
          issues.push({
            severity: 'blocked',
            kind: 'required-release-missing',
            projectId: item.projectId,
            releaseId: item.releaseId,
            dependency: relation,
          })
          const dependency = resolved.get(dependencyKey)?.release
          if (isAvailable(dependency)) repairAdditions.set(dependencyKey, { ...relation })
        }
      } else {
        issues.push({ severity: 'incomplete', kind: 'relations-not-declared', projectId: item.projectId, releaseId: item.releaseId })
      }

      const ranSuccessfully = (workshop?.runRecords || []).some((record) => record.projectId === item.projectId
        && record.releaseId === item.releaseId
        && record.checks?.install === 'passed'
        && record.checks?.ready === 'passed'
        && record.checks?.task?.result === 'passed')
      if (ranSuccessfully) successfulRuns += 1
      else issues.push({ severity: 'incomplete', kind: 'run-record-missing', projectId: item.projectId, releaseId: item.releaseId })
    }

    const cycles = dependencyCycles(items, resolved)
    if (cycles.length > 0) issues.push({ severity: 'blocked', kind: 'dependency-cycle', cycles })

    const recoveryScope = composition?.recoveryScope || composition?.apply?.recoveryScope || 'none'
    const externalEffects = items.some((item) => resolved.get(releaseKey(item.projectId, item.releaseId))?.release.management?.externalEffects === 'not-covered')
      ? 'not-covered'
      : 'unknown'
    const status = issues.some((issue) => issue.severity === 'blocked')
      ? 'blocked'
      : issues.some((issue) => issue.severity === 'incomplete')
        ? 'incomplete'
        : 'ready'

    const suggestionKinds = []
    const addSuggestion = (kind) => {
      if (!suggestionKinds.includes(kind)) suggestionKinds.push(kind)
    }
    for (const issue of issues) {
      if (issue.kind === 'required-release-missing' && repairAdditions.size > 0) addSuggestion('preview-required-additions')
      else if (issue.kind === 'release-unavailable' || issue.kind === 'release-missing') addSuggestion('choose-available-release')
      else if (issue.kind === 'dependency-cycle') addSuggestion('resolve-dependency-cycle')
      else if (issue.kind === 'relations-not-declared') addSuggestion('declare-relations')
      else if (issue.kind === 'run-record-missing') addSuggestion('add-run-record')
    }
    if (externalEffects === 'not-covered') addSuggestion('review-external-effects')

    return {
      status,
      facts: {
        items: items.length,
        available,
        relationsDeclared,
        successfulRuns,
        recoveryScope,
        externalEffects,
      },
      issues,
      suggestions: suggestionKinds,
      repairPreview: {
        executable: false,
        additions: [...repairAdditions.values()],
      },
    }
  }

  root.DSHCompositionPreflight = Object.freeze({ evaluate })
})(typeof window === 'undefined' ? globalThis : window)
