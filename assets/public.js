(() => {
  const input = document.querySelector('#public-search')
  const cards = [...document.querySelectorAll('[data-public-project]')]
  const empty = document.querySelector('#public-empty')
  input?.addEventListener('input', () => {
    const query = input.value.trim().toLocaleLowerCase()
    let visible = 0
    for (const card of cards) {
      const match = query === '' || card.dataset.search.includes(query)
      card.hidden = !match
      if (match) visible += 1
    }
    if (empty) empty.hidden = visible !== 0
  })
})()
