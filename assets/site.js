(() => {
  const script = document.currentScript
  const i18nSource = script?.dataset.i18nSrc || 'assets/i18n.json'
  const storedLocale = localStorage.getItem('dsh-hub-locale')
  const preferredLocale = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'

  const hub = {
    locale: storedLocale === 'en' || storedLocale === 'zh' ? storedLocale : preferredLocale,
    i18n: null,
    t(key) {
      const localeStrings = this.i18n?.ui?.[this.locale] || {}
      const fallbackStrings = this.i18n?.ui?.zh || {}
      return localeStrings[key] ?? fallbackStrings[key] ?? key
    },
    setLocale(locale) {
      if (locale !== 'zh' && locale !== 'en') return
      this.locale = locale
      localStorage.setItem('dsh-hub-locale', locale)
      applyLocale()
      document.dispatchEvent(new CustomEvent('dsh:locale', { detail: { locale } }))
    },
  }

  window.DSHHub = hub

  function applyText(selector, attribute, valueAttribute) {
    document.querySelectorAll(selector).forEach((element) => {
      const key = element.getAttribute(attribute)
      const value = hub.t(key)
      if (valueAttribute) element.setAttribute(valueAttribute, value)
      else element.textContent = value
    })
  }

  function applyLocale() {
    document.documentElement.lang = hub.locale === 'zh' ? 'zh-CN' : 'en'
    document.documentElement.dataset.locale = hub.locale
    if (hub.i18n) {
      applyText('[data-i18n]', 'data-i18n')
      applyText('[data-i18n-placeholder]', 'data-i18n-placeholder', 'placeholder')
      applyText('[data-i18n-aria-label]', 'data-i18n-aria-label', 'aria-label')
      applyText('[data-i18n-content]', 'data-i18n-content', 'content')
    }

    document.querySelectorAll('[data-set-locale]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.setLocale === hub.locale))
    })

    document.querySelectorAll('[data-locale-content]').forEach((content) => {
      const active = content.dataset.localeContent === hub.locale
      content.hidden = !active
      content.setAttribute('aria-hidden', String(!active))
    })

    const titleKey = document.body.dataset.titleKey
    if (titleKey && hub.i18n) {
      document.title = hub.t(titleKey)
    } else {
      const localizedTitle = hub.locale === 'en' ? document.body.dataset.titleEn : document.body.dataset.titleZh
      if (localizedTitle) document.title = `${localizedTitle} - DSH Hub`
    }

    if (hub.i18n) updateThemeLabel()
  }

  function activeTheme() {
    return document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  }

  function updateThemeLabel() {
    const nextTheme = activeTheme() === 'dark' ? 'light' : 'dark'
    document.querySelectorAll('[data-theme-label]').forEach((label) => {
      label.textContent = hub.t(nextTheme === 'dark' ? 'site.darkMode' : 'site.lightMode')
    })
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-label', hub.t(nextTheme === 'dark' ? 'site.useDarkMode' : 'site.useLightMode'))
    })
  }

  function setupInteractions() {
    document.addEventListener('click', (event) => {
      const localeButton = event.target.closest('[data-set-locale]')
      if (localeButton) hub.setLocale(localeButton.dataset.setLocale)

      const themeButton = event.target.closest('[data-theme-toggle]')
      if (themeButton) {
        const nextTheme = activeTheme() === 'dark' ? 'light' : 'dark'
        document.documentElement.dataset.theme = nextTheme
        localStorage.setItem('dsh-hub-theme', nextTheme)
        updateThemeLabel()
      }
    })

    const storedTheme = localStorage.getItem('dsh-hub-theme')
    if (storedTheme === 'dark' || storedTheme === 'light') {
      document.documentElement.dataset.theme = storedTheme
    }

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!document.documentElement.dataset.theme) updateThemeLabel()
    })
  }


  setupInteractions()
  applyLocale()

  window.dshI18nReady = fetch(i18nSource)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    })
    .then((data) => {
      hub.i18n = data
      applyLocale()
      return data
    })
    .catch((error) => {
      console.warn('DSH Hub translations could not be loaded.', error)
      return null
    })
})()
