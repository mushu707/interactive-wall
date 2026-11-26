import { reactive } from 'vue'
import { api } from './api.js'

export const admin = reactive({
  authed: false,
  checking: true,
  loading: false,
  error: '',
  tab: 'overview',
  data: null,
  toast: ''
})

let toastTimer = null
export function say(msg) {
  admin.toast = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (admin.toast = ''), 2400)
}

export async function checkAuth() {
  admin.checking = true
  try {
    await load()
    admin.authed = true
  } catch (e) {
    if (e.status === 401) admin.authed = false
  } finally {
    admin.checking = false
  }
}

export async function login(password) {
  admin.error = ''
  try {
    await api('/admin/login', { method: 'POST', body: { password } })
    admin.authed = true
    await load()
    return true
  } catch (e) {
    admin.error = e.message
    return false
  }
}

export async function logout() {
  try {
    await api('/admin/logout', { method: 'POST' })
  } catch {}
  admin.authed = false
  admin.data = null
}

export async function load(silent = false) {
  if (!silent) admin.loading = true
  try {
    const d = await api('/admin/state')
    admin.data = d
    admin.authed = true
    if (d.settings?.theme) document.documentElement.dataset.theme = d.settings.theme
  } finally {
    admin.loading = false
  }
}

async function run(fn, okMsg) {
  try {
    await fn()
    await load(true)
    if (okMsg) say(okMsg)
  } catch (e) {
    say(e.message)
  }
}

export const actions = {
  setPhase: (phase) => run(() => api('/admin/phase', { method: 'POST', body: { phase } }), '已切换'),

  patchSub: (id, body, msg) => run(() => api(`/admin/submissions/${id}`, { method: 'PATCH', body }), msg),
  delSub: (id) => run(() => api(`/admin/submissions/${id}`, { method: 'DELETE' }), '已删除'),
  resetLikes: (id) => run(() => api(`/admin/submissions/${id}/reset-likes`, { method: 'POST' }), '点赞已清零'),

  prepareDraw: (awardName, count) =>
    run(() => api('/admin/draw/prepare', { method: 'POST', body: { awardName, count } }), '已开始抽奖'),
  reveal: () => run(() => api('/admin/draw/reveal', { method: 'POST' }), '已揭晓'),
  redraw: () => run(() => api('/admin/draw/redraw', { method: 'POST' }), '已重抽'),

  saveSettings: (patch) => run(() => api('/admin/settings', { method: 'PUT', body: patch }), '设置已保存'),

  resetEvent: () => run(() => api('/admin/reset', { method: 'POST' }), '活动已重置')
}

export async function uploadImage(file) {
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'image/jpeg' },
    body: file
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || !d.ok) throw new Error(d.error || '上传失败')
  return d.url
}
