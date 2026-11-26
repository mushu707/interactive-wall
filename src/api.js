/** 极简接口封装 */

export async function api(path, options = {}) {
  const { method = 'GET', body, raw } = options
  const init = { method, cache: 'no-store', credentials: 'same-origin', headers: {} }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch('/api' + path, init)
  let data = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  if (!res.ok) {
    // 代理层报错（后端没起 / 进程挂了）时拿不到 JSON，给一句能定位的话
    let msg = data.error
    if (!msg) {
      if (res.status >= 500) msg = `接口异常（HTTP ${res.status}）：后端服务可能没启动`
      else if (res.status === 404) msg = '接口不存在（HTTP 404）'
      else msg = `请求失败（HTTP ${res.status}）`
    }
    const err = new Error(msg)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

/* ---------------- 本地存储 ---------------- */
const K_DEVICE = 'ly_device'
const K_MINE = 'ly_mine'

function safeGet(k) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function safeSet(k, v) {
  try {
    localStorage.setItem(k, v)
  } catch {}
}

export function deviceId() {
  let id = safeGet(K_DEVICE)
  if (!id) {
    id = 'd_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    safeSet(K_DEVICE, id)
  }
  return id
}

export function mySubmission() {
  const raw = safeGet(K_MINE)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveMySubmission(obj) {
  safeSet(K_MINE, JSON.stringify(obj))
}

export function clearMySubmission() {
  try {
    localStorage.removeItem(K_MINE)
  } catch {}
}
