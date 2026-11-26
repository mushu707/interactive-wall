/**
 * auth.js —— 单密码 + HMAC 签名 Cookie 会话
 * 不引入任何依赖，也不建表：cookie 自校验，服务端无状态。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './store.js'

const SECRET_FILE = path.join(DATA_DIR, '.session_secret')
const COOKIE = 'ly_sess'
const TTL_MS = 12 * 60 * 60 * 1000 // 12 小时，够覆盖一整场晚会

let secret = null

function loadSecret() {
  if (secret) return secret
  if (process.env.SESSION_SECRET) {
    secret = Buffer.from(process.env.SESSION_SECRET)
    return secret
  }
  try {
    if (fs.existsSync(SECRET_FILE)) {
      secret = Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8').trim(), 'hex')
      if (secret.length >= 32) return secret
    }
  } catch {}
  secret = crypto.randomBytes(32)
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(SECRET_FILE, secret.toString('hex'), { mode: 0o600 })
  } catch (e) {
    console.warn('[auth] 无法持久化会话密钥，重启后需重新登录', e.message)
  }
  return secret
}

function sign(payload) {
  return crypto
    .createHmac('sha256', loadSecret())
    .update(payload)
    .digest('base64url')
}

export function getPassword() {
  return process.env.ADMIN_PASSWORD || 'admin888'
}

export function checkPassword(input) {
  const a = Buffer.from(String(input || ''))
  const b = Buffer.from(getPassword())
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function issueCookie() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TTL_MS })).toString('base64url')
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}`
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

export function isAuthed(req) {
  const raw = parseCookies(req.headers.cookie)[COOKIE]
  if (!raw) return false
  const dot = raw.lastIndexOf('.')
  if (dot < 0) return false
  const payload = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  const expect = sign(payload)
  if (sig.length !== expect.length) return false
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return data.exp > Date.now()
  } catch {
    return false
  }
}

/* ---------- 登录失败节流（按 IP，仅用于后台，不影响观众端） ---------- */
const fails = new Map()
const WINDOW = 10 * 60 * 1000
const MAX_FAIL = 8

export function loginBlocked(ip) {
  const rec = fails.get(ip)
  if (!rec) return 0
  if (Date.now() - rec.first > WINDOW) {
    fails.delete(ip)
    return 0
  }
  return rec.count >= MAX_FAIL ? Math.ceil((WINDOW - (Date.now() - rec.first)) / 1000) : 0
}

export function recordFail(ip) {
  const rec = fails.get(ip)
  if (!rec || Date.now() - rec.first > WINDOW) {
    fails.set(ip, { first: Date.now(), count: 1 })
  } else {
    rec.count++
  }
}

export function clearFail(ip) {
  fails.delete(ip)
}
