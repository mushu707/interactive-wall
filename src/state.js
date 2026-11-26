import { reactive } from 'vue'

export const state = reactive({
  config: null,
  ready: false
})

let pending = null

export function loadConfig(force = false) {
  if (pending && !force) return pending
  pending = fetch('/api/public/config', { cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => {
      state.config = d.settings
      state.ready = true
      applyTheme(d.settings.theme)
      if (d.settings.title) document.title = d.settings.title
      return d
    })
    .catch(() => {
      state.ready = true
      return null
    })
  return pending
}

export function applyTheme(theme) {
  const t = theme || 'red'
  document.documentElement.dataset.theme = t
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'red' ? '#4A0A0F' : t === 'deep' ? '#0E1226' : '#161514')
}
