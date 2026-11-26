/**
 * api.js —— 全部接口实现（零依赖）
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import * as store from './store.js'
import { UPLOAD_DIR } from './store.js'
import * as auth from './auth.js'

/* ============================ 工具 ============================ */

export function json(res, code, data, headers = {}) {
  const body = JSON.stringify(data)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  })
  res.end(body)
}

export function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJson(req, limit) {
  const buf = await readBody(req, limit)
  if (!buf.length) return {}
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch {
    throw new Error('bad json')
  }
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  const ip = xf || req.socket.remoteAddress || ''
  return ip.replace(/^::ffff:/, '')
}

function ipHash(req) {
  return crypto
    .createHash('sha256')
    .update('ly-wall|' + clientIp(req))
    .digest('hex')
    .slice(0, 12)
}

const bump = (k) => {
  const d = store.get()
  d.meta[k + 'Ver'] = (d.meta[k + 'Ver'] || 0) + 1
}

function publicSettings(s) {
  return {
    title: s.title,
    subtitle: s.subtitle,
    theme: s.theme,
    bgImage: s.bgImage,
    bgDim: s.bgDim,
    showLogo: s.showLogo,
    q1: s.q1,
    q2: s.q2,
    maxLen: s.maxLen,
    requireTail: s.requireTail,
    votesPerUser: s.votesPerUser,
    showVotesOnWall: s.showVotesOnWall,
    showTailOnWall: s.showTailOnWall,
    layout: s.layout,
    pageSeconds: s.pageSeconds,
    showQrOnScreen: s.showQrOnScreen,
    qrUrl: s.qrUrl,
    screenFooter: s.screenFooter,
    popularAwardName: s.popularAwardName,
    popularTopN: popularTopN(s),
    editWindowMinutes: s.editWindowMinutes,
    allowMultiSubmit: s.allowMultiSubmit
  }
}

function hasSensitive(text, words) {
  if (!text) return false
  const low = String(text).toLowerCase()
  return (words || []).some((w) => w && low.includes(String(w).toLowerCase()))
}

function validTail(t) {
  return /^\d{4}$/.test(String(t || ''))
}

function cardOf(s, showTail) {
  return {
    id: s.id,
    code: s.code,
    a1: s.a1,
    a2: s.a2,
    likes: s.likes || 0,
    tail: showTail ? s.tail : undefined,
    at: s.createdAt
  }
}

function approvedVisible(d) {
  return d.submissions.filter((s) => s.status === 'approved' && !s.hidden)
}

function topLiked(d, n = 8) {
  return approvedVisible(d)
    .slice()
    .sort((a, b) => (b.likes || 0) - (a.likes || 0) || new Date(a.createdAt) - new Date(b.createdAt))
    .slice(0, n)
    .map((s) => ({ id: s.id, code: s.code, likes: s.likes || 0, a1: s.a1 }))
}

// 人气奖：与随机抽奖相互独立，按票数取前 N 名（同票取更早提交的）
// N 由后台设置 popularTopN 决定（默认 5，上限 6：大屏右侧小条再多就挤不下了）
function popularTopN(settings) {
  return Math.max(1, Math.min(6, Number(settings.popularTopN) || 5))
}

function buildPopular(d) {
  const s = d.settings
  const n = popularTopN(s)
  const list = approvedVisible(d)
    .slice()
    .sort((a, b) => (b.likes || 0) - (a.likes || 0) || new Date(a.createdAt) - new Date(b.createdAt))
    .slice(0, n)
  if (!list.length) return null
  return {
    awardName: s.popularAwardName || '人气奖',
    totalVotes: d.votes.length,
    topN: n,
    winners: list.map((x, i) => ({
      rank: i + 1,
      id: x.id,
      code: x.code,
      tail: x.tail,
      likes: x.likes || 0,
      a1: x.a1,
      a2: x.a2,
      at: x.createdAt
    }))
  }
}

/* ============================ 限流 ============================
 * 注意：绝对不能按 IP 限流 —— 100 人连同一个 WiFi，出口 IP 相同，
 * 一个人超限就会导致全场被拒。这里只做「按设备」+「全局熔断」。
 */
const deviceBuckets = new Map()
const globalBucket = { count: 0, resetAt: 0 }

function throttleDevice(key, max = 20, windowMs = 60_000) {
  const now = Date.now()
  const rec = deviceBuckets.get(key)
  if (!rec || now > rec.resetAt) {
    deviceBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (rec.count >= max) return false
  rec.count++
  return true
}

/**
 * 全局熔断：整个服务每分钟最多处理 N 次写请求，防止脚本打爆。
 *
 * 阈值必须大于「全场真实写入量」，否则正常的最后几个人会被误杀：
 * 100 人 ×（1 次提交 + 3 票）= 400 次，正好等于旧阈值 400 —— 一次重试就爆。
 * 实测这个量级的服务单机可以轻松跑到 1000+ 次/秒，所以默认给到 1500/分钟，
 * 仍然能拦住失控脚本（相当于 25 次/秒），但不会误伤现场。
 * 可用环境变量 WRITE_PER_MIN 覆盖。
 */
const WRITE_PER_MIN = Math.max(400, Number(process.env.WRITE_PER_MIN) || 1500)

function globalGuard(max = WRITE_PER_MIN) {
  const now = Date.now()
  if (now > globalBucket.resetAt) {
    globalBucket.count = 0
    globalBucket.resetAt = now + 60_000
  }
  globalBucket.count++
  return globalBucket.count <= max
}

/* ============================ 公共接口 ============================ */

function handleConfig(res) {
  const d = store.get()
  json(res, 200, {
    ok: true,
    settings: publicSettings(d.settings),
    phase: d.settings.phase,
    ver: d.meta.ver
  })
}

/** 大屏轮询：分包版本号，前端据此判断重绘哪一块 */
function handleScreen(res) {
  const d = store.get()
  const s = d.settings
  const cards = approvedVisible(d).map((x) => cardOf(x, !!s.showTailOnWall))

  let draw = null
  const last = d.draws[0]
  if (last && (s.phase === 'drawing' || s.phase === 'result')) {
    draw = {
      id: last.id,
      awardName: last.awardName,
      count: last.count,
      revealed: !!last.revealed,
      // a2 兜底：早期抽奖记录里只存了 a1，按 id 回查提交补上，避免旧数据大屏空一行
      winners: last.revealed
        ? last.winners.map((w) => {
            const src = w.a2 ? w : d.submissions.find((x) => x.id === w.id) || w
            return { code: w.code, tail: w.tail, a1: w.a1 || src.a1, a2: w.a2 || src.a2 || '' }
          })
        : [],
      rolling: last.rolling || []
    }
  }

  const popular = s.phase === 'popular' ? buildPopular(d) : null

  json(res, 200, {
    ok: true,
    phase: s.phase,
    settings: publicSettings(s),
    cards,
    top: topLiked(d),
    draw,
    popular,
    stats: {
      total: d.submissions.length,
      approved: cards.length,
      votes: d.votes.length,
      winners: d.draws.reduce((n, x) => n + (x.revealed ? x.winners.length : 0), 0)
    },
    ver: {
      cards: d.meta.cardsVer || 0,
      votes: d.meta.votesVer || 0,
      draw: d.meta.drawVer || 0,
      settings: d.meta.settingsVer || 0
    }
  })
}

async function handleSubmit(req, res) {
  const d = store.get()
  const s = d.settings
  const body = await readJson(req, 8 * 1024)
  const a1 = String(body.a1 || '').trim()
  const a2 = String(body.a2 || '').trim()
  const tail = String(body.tail || '').trim()
  const deviceId = String(body.deviceId || '').slice(0, 64)

  if (!a1 || !a2) return json(res, 400, { ok: false, error: '两个问题都要回答哦' })
  if (a1.length > s.maxLen || a2.length > s.maxLen) {
    return json(res, 400, { ok: false, error: `每条回答最多 ${s.maxLen} 字` })
  }
  if (s.requireTail && !validTail(tail)) {
    return json(res, 400, { ok: false, error: '请填写手机号后 4 位' })
  }

  if (!globalGuard()) return json(res, 429, { ok: false, error: '现场太火爆了，请稍后再试' })
  if (deviceId && !throttleDevice('sub:' + deviceId, 10)) {
    return json(res, 429, { ok: false, error: '提交太频繁，请稍后再试' })
  }

  if (!s.allowMultiSubmit && deviceId) {
    const exist = d.submissions.find((x) => x.deviceId === deviceId)
    if (exist) {
      return json(res, 409, {
        ok: false,
        error: '这台手机已经提交过了',
        code: exist.code,
        id: exist.id,
        editToken: exist.editToken
      })
    }
  }

  const status = hasSensitive(a1 + ' ' + a2, s.sensitiveWords)
    ? 'pending'
    : s.autoApprove
      ? 'approved'
      : 'pending'

  const item = {
    id: crypto.randomUUID(),
    code: store.nextCode(),
    tail,
    a1,
    a2,
    status,
    hidden: false,
    likes: 0,
    reportCount: 0,
    deviceId,
    ipHash: ipHash(req),
    editToken: crypto.randomBytes(12).toString('hex'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  d.submissions.push(item)
  bump('cards')
  store.log('submit', `${item.code} ${status}`)
  store.commit()

  // 同尾号提示（不拦截）：150 人里有 67% 概率至少两人尾号相同，
  // 拦人会让第二个真实撞号的同事当场提交不了，所以只提示、不拒绝，
  // 并明确告诉他们领奖以「牌号」为准。
  const tailDup = tail ? d.submissions.filter((x) => x.tail === tail && x.id !== item.id).length : 0

  json(res, 200, {
    ok: true,
    id: item.id,
    code: item.code,
    status,
    editToken: item.editToken,
    tailDup
  })
}

async function handleEdit(req, res, id) {
  const d = store.get()
  const s = d.settings
  const body = await readJson(req, 8 * 1024)
  const item = d.submissions.find((x) => x.id === id)
  if (!item) return json(res, 404, { ok: false, error: '找不到这条提交' })
  if (body.editToken !== item.editToken) return json(res, 403, { ok: false, error: '没有修改权限' })

  const age = Date.now() - new Date(item.createdAt).getTime()
  if (age > s.editWindowMinutes * 60_000) {
    return json(res, 403, { ok: false, error: `提交后 ${s.editWindowMinutes} 分钟内才能修改` })
  }

  const a1 = String(body.a1 ?? item.a1).trim()
  const a2 = String(body.a2 ?? item.a2).trim()
  const tail = String(body.tail ?? item.tail).trim()
  if (!a1 || !a2) return json(res, 400, { ok: false, error: '两个问题都要回答' })
  if (a1.length > s.maxLen || a2.length > s.maxLen) {
    return json(res, 400, { ok: false, error: `每条回答最多 ${s.maxLen} 字` })
  }
  if (s.requireTail && !validTail(tail)) return json(res, 400, { ok: false, error: '请填写手机号后 4 位' })

  item.a1 = a1
  item.a2 = a2
  item.tail = tail
  item.updatedAt = new Date().toISOString()
  if (item.status === 'approved' && hasSensitive(a1 + ' ' + a2, s.sensitiveWords)) {
    item.status = 'pending'
  }
  bump('cards')
  store.log('edit', item.code)
  store.commit()
  json(res, 200, { ok: true, status: item.status, code: item.code })
}

function handleFind(req, res) {
  const body = readJson(req, 4 * 1024).then((b) => {
    const d = store.get()
    const tail = String(b.tail || '').trim()
    if (!validTail(tail)) return json(res, 400, { ok: false, error: '请输入 4 位数字' })
    const now = Date.now()
    const hits = d.submissions
      .filter((s) => s.tail === tail)
      .map((s) => {
        const editable = now - new Date(s.createdAt).getTime() < d.settings.editWindowMinutes * 60_000
        return {
          id: s.id,
          code: s.code,
          preview: s.a1.slice(0, 14),
          likes: s.likes || 0,
          status: s.status,
          // 同尾号可能有多条，给个时间让本人认出哪条是自己的
          at: s.createdAt,
          // 只在可编辑窗口内下发 token，让找回后还能改答案
          editToken: editable ? s.editToken : undefined
        }
      })
    json(res, 200, { ok: true, items: hits })
  })
  return body
}

function handleWall(req, res, url) {
  const d = store.get()
  const s = d.settings
  const voterKey = String(url.searchParams.get('voterKey') || '')

  const mine = new Set(
    voterKey ? d.votes.filter((v) => v.voterKey === voterKey).map((v) => v.submissionId) : []
  )
  const used = voterKey ? d.votes.filter((v) => v.voterKey === voterKey).length : 0

  const cards = approvedVisible(d)
    .slice()
    .sort((a, b) => (b.likes || 0) - (a.likes || 0) || new Date(a.createdAt) - new Date(b.createdAt))
    .map((x) => ({ ...cardOf(x, !!s.showTailOnWall), mine: mine.has(x.id) }))

  json(res, 200, {
    ok: true,
    cards,
    used,
    remaining: Math.max(0, s.votesPerUser - used),
    votesPerUser: s.votesPerUser,
    ver: d.meta.votesVer || 0
  })
}

async function handleVote(req, res) {
  const d = store.get()
  const s = d.settings
  const body = await readJson(req, 4 * 1024)
  const submissionId = String(body.submissionId || '')
  const voterKey = String(body.voterKey || '').slice(0, 64)

  if (!voterKey) return json(res, 400, { ok: false, error: '缺少设备标识' })
  if (!globalGuard()) return json(res, 429, { ok: false, error: '操作太频繁，请稍后再试' })
  if (!throttleDevice('vote:' + voterKey, 30)) {
    return json(res, 429, { ok: false, error: '操作太频繁' })
  }

  const item = d.submissions.find((x) => x.id === submissionId)
  if (!item || item.status !== 'approved' || item.hidden) {
    return json(res, 404, { ok: false, error: '这条内容已不在墙上' })
  }

  const used = d.votes.filter((v) => v.voterKey === voterKey)
  if (used.length >= s.votesPerUser) {
    return json(res, 403, { ok: false, error: `你只有 ${s.votesPerUser} 票，已经用完啦` })
  }
  if (used.some((v) => v.submissionId === submissionId)) {
    return json(res, 409, { ok: false, error: '这一条你已经投过了' })
  }

  d.votes.push({
    id: (d.meta.voteSeq = (d.meta.voteSeq || 0) + 1),
    submissionId,
    voterKey,
    createdAt: new Date().toISOString()
  })
  item.likes = (item.likes || 0) + 1
  bump('votes')
  store.commit()

  json(res, 200, {
    ok: true,
    likes: item.likes,
    remaining: Math.max(0, s.votesPerUser - used.length - 1)
  })
}

async function handleReport(req, res) {
  const d = store.get()
  const body = await readJson(req, 4 * 1024)
  const item = d.submissions.find((x) => x.id === String(body.id || ''))
  if (!item) return json(res, 404, { ok: false, error: '找不到这条内容' })
  item.reportCount = (item.reportCount || 0) + 1
  if (item.reportCount >= d.settings.reportThreshold && item.status === 'approved') {
    item.status = 'pending'
    store.log('auto-review', `${item.code} 被举报 ${item.reportCount} 次，已下墙待审`)
    bump('cards')
  }
  store.commit()
  json(res, 200, { ok: true })
}

function handleMine(req, res, url, id) {
  const d = store.get()
  const item = d.submissions.find((x) => x.id === id)
  if (!item) return json(res, 404, { ok: false, error: '找不到这条提交' })
  const ranked = approvedVisible(d)
    .slice()
    .sort((a, b) => (b.likes || 0) - (a.likes || 0) || new Date(a.createdAt) - new Date(b.createdAt))
  const rank = ranked.findIndex((x) => x.id === id) + 1
  const won = d.draws
    .filter((dr) => dr.revealed && dr.winners.some((w) => w.id === id))
    .map((dr) => ({ id: dr.id, awardName: dr.awardName, at: dr.revealedAt }))
  json(res, 200, {
    ok: true,
    won,
    item: {
      id: item.id,
      code: item.code,
      a1: item.a1,
      a2: item.a2,
      tail: item.tail,
      status: item.status,
      hidden: !!item.hidden,
      likes: item.likes || 0,
      rank: rank || null,
      createdAt: item.createdAt,
      editableUntil: new Date(
        new Date(item.createdAt).getTime() + d.settings.editWindowMinutes * 60_000
      ).toISOString()
    },
    canEdit: Date.now() - new Date(item.createdAt).getTime() < d.settings.editWindowMinutes * 60_000,
    votesPerUser: d.settings.votesPerUser
  })
}

/* ============================ 管理接口 ============================ */

function handleAdminState(res) {
  const d = store.get()
  json(res, 200, {
    ok: true,
    settings: { ...d.settings, popularTopN: popularTopN(d.settings) },
    submissions: d.submissions
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((s) => ({
        id: s.id,
        code: s.code,
        tail: s.tail,
        a1: s.a1,
        a2: s.a2,
        status: s.status,
        hidden: !!s.hidden,
        likes: s.likes || 0,
        reportCount: s.reportCount || 0,
        deviceId: s.deviceId ? s.deviceId.slice(0, 8) : '',
        ipHash: s.ipHash,
        createdAt: s.createdAt
      })),
    draws: d.draws,
    logs: d.logs.slice(0, 200),
    stats: {
      total: d.submissions.length,
      approved: approvedVisible(d).length,
      pending: d.submissions.filter((x) => x.status === 'pending').length,
      votes: d.votes.length,
      voters: new Set(d.votes.map((v) => v.voterKey)).size
    },
    ver: d.meta.ver
  })
}

async function handleAdminPatchSubmission(req, res, id) {
  const d = store.get()
  const body = await readJson(req, 4 * 1024)
  const item = d.submissions.find((x) => x.id === id)
  if (!item) return json(res, 404, { ok: false, error: '不存在' })

  if (body.status && ['pending', 'approved', 'rejected'].includes(body.status)) {
    item.status = body.status
    store.log('review', `${item.code} → ${body.status}`)
  }
  if (typeof body.hidden === 'boolean') {
    item.hidden = body.hidden
    store.log('mask', `${item.code} ${body.hidden ? '已遮蔽' : '已恢复'}`)
  }
  item.updatedAt = new Date().toISOString()
  bump('cards')
  store.commit()
  json(res, 200, { ok: true })
}

function handleAdminDeleteSubmission(res, id) {
  const d = store.get()
  const idx = d.submissions.findIndex((x) => x.id === id)
  if (idx < 0) return json(res, 404, { ok: false, error: '不存在' })
  const [item] = d.submissions.splice(idx, 1)
  d.votes = d.votes.filter((v) => v.submissionId !== id)
  store.log('delete', item.code)
  bump('cards')
  bump('votes')
  store.commit()
  json(res, 200, { ok: true })
}

function handleAdminResetLikes(res, id) {
  const d = store.get()
  const item = d.submissions.find((x) => x.id === id)
  if (!item) return json(res, 404, { ok: false, error: '不存在' })
  d.votes = d.votes.filter((v) => v.submissionId !== id)
  item.likes = 0
  store.log('reset-likes', item.code)
  bump('votes')
  store.commit()
  json(res, 200, { ok: true })
}

function drawPool(d, awardName) {
  const won = new Set()
  if (d.settings.excludeWinners) {
    for (const dr of d.draws) {
      if (dr.revealed) for (const w of dr.winners) won.add(w.id)
    }
  }
  return approvedVisible(d).filter((x) => !won.has(x.id))
}

function pickWinners(d, count, pool) {
  const arr = pool.slice()
  const n = Math.min(count, arr.length)
  const out = []
  for (let i = 0; i < n; i++) {
    const idx = crypto.randomInt(0, arr.length)
    out.push(arr.splice(idx, 1)[0])
  }
  return out
}

async function handleDrawPrepare(req, res) {
  const d = store.get()
  const body = await readJson(req, 4 * 1024)
  const awardName = String(body.awardName || '幸运奖').slice(0, 20)
  const count = Math.max(1, Math.min(50, Number(body.count) || 1))
  const pool = drawPool(d, awardName)
  if (!pool.length) return json(res, 400, { ok: false, error: '没有可抽取的有效提交' })

  const winners = pickWinners(d, count, pool)
  const rolling = pool
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, 40)
    .map((x) => x.code)

  const draw = {
    id: crypto.randomUUID(),
    awardName,
    count,
    poolSize: pool.length,
    winners: winners.map((w) => ({ id: w.id, code: w.code, tail: w.tail, a1: w.a1, a2: w.a2 })),
    rolling,
    revealed: false,
    createdAt: new Date().toISOString(),
    revealedAt: null
  }
  d.draws.unshift(draw)
  d.settings.phase = 'drawing'
  store.log('draw-prepare', `${awardName} 抽 ${count} 人 / 池 ${pool.length}`)
  bump('draw')
  bump('settings')
  store.commit()
  json(res, 200, { ok: true, draw: { ...draw, winners: [] } })
}

function handleDrawReveal(res) {
  const d = store.get()
  const draw = d.draws[0]
  if (!draw) return json(res, 400, { ok: false, error: '还没有进行中的抽奖' })
  draw.revealed = true
  draw.revealedAt = new Date().toISOString()
  d.settings.phase = 'result'
  store.log('draw-reveal', `${draw.awardName} → ${draw.winners.map((w) => w.code).join(',')}`)
  bump('draw')
  bump('settings')
  store.commit()
  json(res, 200, { ok: true, draw })
}

function handleDrawRedraw(res) {
  const d = store.get()
  const draw = d.draws[0]
  if (!draw) return json(res, 400, { ok: false, error: '没有可重抽的记录' })
  const prev = new Set(draw.winners.map((w) => w.id))
  const pool = drawPool(d, draw.awardName).filter((x) => !prev.has(x.id))
  if (pool.length < draw.count) {
    return json(res, 400, { ok: false, error: '剩余可选内容不足，无法重抽' })
  }
  const winners = pickWinners(d, draw.count, pool)
  draw.winners = winners.map((w) => ({ id: w.id, code: w.code, tail: w.tail, a1: w.a1, a2: w.a2 }))
  draw.rolling = pool.slice(0, 40).map((x) => x.code)
  draw.revealed = false
  draw.revealedAt = null
  d.settings.phase = 'drawing'
  store.log('draw-redraw', `${draw.awardName} 重抽 → 待揭晓`)
  bump('draw')
  bump('settings')
  store.commit()
  json(res, 200, { ok: true })
}

async function handlePhase(req, res) {
  const d = store.get()
  const body = await readJson(req, 2 * 1024)
  const phase = String(body.phase || '')
  if (!['idle', 'live', 'drawing', 'result', 'popular'].includes(phase)) {
    return json(res, 400, { ok: false, error: '未知阶段' })
  }
  d.settings.phase = phase
  store.log('phase', phase)
  bump('settings')
  store.commit()
  json(res, 200, { ok: true })
}

const SETTING_KEYS = [
  'title', 'subtitle', 'theme', 'bgImage', 'bgDim', 'showLogo',
  'q1', 'q2', 'maxLen', 'requireTail',
  'autoApprove', 'sensitiveWords', 'reportThreshold', 'allowMultiSubmit', 'editWindowMinutes',
  'votesPerUser', 'showVotesOnWall', 'showTailOnWall',
  'layout', 'pageSeconds', 'showQrOnScreen', 'qrUrl', 'screenFooter',
  'drawRounds', 'excludeWinners', 'popularAwardName', 'popularTopN'
]

async function handleSettings(req, res) {
  const d = store.get()
  const body = await readJson(req, 64 * 1024)
  for (const k of SETTING_KEYS) {
    if (k in body) d.settings[k] = body[k]
  }
  d.settings.maxLen = Math.max(10, Math.min(200, Number(d.settings.maxLen) || 60))
  d.settings.votesPerUser = Math.max(1, Math.min(10, Number(d.settings.votesPerUser) || 3))
  d.settings.pageSeconds = Math.max(8, Math.min(120, Number(d.settings.pageSeconds) || 22))
  d.settings.bgDim = Math.max(0, Math.min(0.9, Number(d.settings.bgDim) ?? 0.55))
  d.settings.popularTopN = popularTopN(d.settings)
  store.log('settings', Object.keys(body).join(','))
  bump('settings')
  bump('cards')
  store.commit()
  json(res, 200, { ok: true, settings: d.settings })
}

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

async function handleUpload(req, res) {
  const type = String(req.headers['content-type'] || '')
  const ext = MIME['.' + type.split('/')[1]] ? '.' + type.split('/')[1] : '.jpg'
  if (!MIME[ext]) return json(res, 400, { ok: false, error: '只支持 jpg / png / webp / gif' })
  const buf = await readBody(req, 8 * 1024 * 1024)
  if (!buf.length) return json(res, 400, { ok: false, error: '空文件' })
  const name = `bg-${Date.now().toString(36)}${ext}`
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf)
  store.log('upload', name)
  store.commit()
  json(res, 200, { ok: true, url: '/uploads/' + name })
}

/* ---------- CSV 导出 ---------- */
function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function csv(rows) {
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

function handleExport(res, type) {
  const d = store.get()
  let rows = []
  if (type === 'submissions') {
    rows.push(['牌号', '手机尾号', '答案1', '答案2', '状态', '点赞数', '举报数', '设备', 'IP哈希', '提交时间'])
    const ST = { approved: '已上墙', pending: '待审', rejected: '已驳回' }
    for (const s of d.submissions) {
      rows.push([
        s.code, s.tail, s.a1, s.a2,
        s.hidden ? '已遮蔽' : ST[s.status] || s.status,
        s.likes || 0, s.reportCount || 0,
        (s.deviceId || '').slice(0, 8), s.ipHash,
        new Date(s.createdAt).toLocaleString('zh-CN')
      ])
    }
  } else if (type === 'likes') {
    rows.push(['票ID', '牌号', '投票设备', '时间'])
    const byId = new Map(d.submissions.map((s) => [s.id, s]))
    for (const v of d.votes) {
      const s = byId.get(v.submissionId)
      rows.push([v.id, s ? s.code : '', (v.voterKey || '').slice(0, 8), new Date(v.createdAt).toLocaleString('zh-CN')])
    }
  } else if (type === 'draws') {
    rows.push(['奖项', '人数', '牌号', '手机尾号', '答案①摘要', '答案②摘要', '抽取时间', '揭晓时间'])
    const byId = new Map(d.submissions.map((s) => [s.id, s]))
    for (const dr of d.draws) {
      for (const w of dr.winners) {
        // 早期抽奖记录只存了 a1，答案② 回查提交补上
        const full = byId.get(w.id) || {}
        rows.push([
          dr.awardName, dr.count, w.code, w.tail,
          (w.a1 || full.a1 || '').slice(0, 30),
          (w.a2 || full.a2 || '').slice(0, 30),
          new Date(dr.createdAt).toLocaleString('zh-CN'),
          dr.revealedAt ? new Date(dr.revealedAt).toLocaleString('zh-CN') : '未揭晓'
        ])
      }
    }
  } else {
    return json(res, 404, { ok: false, error: 'unknown export' })
  }
  const body = csv(rows)
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="ly-${type}-${Date.now()}.csv"`,
    'Cache-Control': 'no-store'
  })
  res.end(body)
}

/* ============================ 路由分发 ============================ */

export async function handle(req, res, url) {
  const p = url.pathname
  const m = req.method

  try {
    /* --- 开发/健康检查 --- */
    if (p === '/api/health') return json(res, 200, { ok: true, up: process.uptime() | 0 })

    /* --- 公共 --- */
    if (p === '/api/public/config' && m === 'GET') return handleConfig(res)
    if (p === '/api/public/screen' && m === 'GET') return handleScreen(res)
    if (p === '/api/public/wall' && m === 'GET') return handleWall(req, res, url)
    if (p === '/api/public/submissions' && m === 'POST') return await handleSubmit(req, res)
    if (p === '/api/public/find' && m === 'POST') return await handleFind(req, res)
    if (p === '/api/public/votes' && m === 'POST') return await handleVote(req, res)
    if (p === '/api/public/report' && m === 'POST') return await handleReport(req, res)

    let mm
    if ((mm = p.match(/^\/api\/public\/submissions\/([\w-]+)$/))) {
      if (m === 'GET') return handleMine(req, res, url, mm[1])
      if (m === 'PATCH') return await handleEdit(req, res, mm[1])
    }

    /* --- 登录 --- */
    if (p === '/api/admin/login' && m === 'POST') {
      const ip = clientIp(req)
      const blocked = auth.loginBlocked(ip)
      if (blocked) return json(res, 429, { ok: false, error: `尝试过多，请 ${blocked} 秒后再试` })
      const body = await readJson(req, 2 * 1024)
      if (!auth.checkPassword(body.password)) {
        auth.recordFail(ip)
        return json(res, 401, { ok: false, error: '密码不对' })
      }
      auth.clearFail(ip)
      store.log('login', ip)
      store.commit()
      return json(res, 200, { ok: true }, { 'Set-Cookie': auth.issueCookie() })
    }
    if (p === '/api/admin/logout' && m === 'POST') {
      return json(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() })
    }

    /* --- 管理接口鉴权 --- */
    if (p.startsWith('/api/admin/')) {
      if (!auth.isAuthed(req)) return json(res, 401, { ok: false, error: '请先登录' })

      if (p === '/api/admin/state' && m === 'GET') return handleAdminState(res)
      if (p === '/api/admin/settings' && m === 'PUT') return await handleSettings(req, res)
      if (p === '/api/admin/upload' && m === 'POST') return await handleUpload(req, res)
      if (p === '/api/admin/draw/prepare' && m === 'POST') return await handleDrawPrepare(req, res)
      if (p === '/api/admin/draw/reveal' && m === 'POST') return handleDrawReveal(res)
      if (p === '/api/admin/draw/redraw' && m === 'POST') return handleDrawRedraw(res)
      if (p === '/api/admin/phase' && m === 'POST') return await handlePhase(req, res)

      if (p === '/api/admin/reset' && m === 'POST') {
        store.resetEvent(true)
        return json(res, 200, { ok: true })
      }
      if (p === '/api/admin/backup' && m === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="ly-backup-${Date.now()}.json"`
        })
        return res.end(store.dumpJson())
      }

      if ((mm = p.match(/^\/api\/admin\/export\/(\w+)\.csv$/))) return handleExport(res, mm[1])
      if ((mm = p.match(/^\/api\/admin\/submissions\/([\w-]+)$/))) {
        if (m === 'PATCH') return await handleAdminPatchSubmission(req, res, mm[1])
        if (m === 'DELETE') return handleAdminDeleteSubmission(res, mm[1])
      }
      if ((mm = p.match(/^\/api\/admin\/submissions\/([\w-]+)\/reset-likes$/)) && m === 'POST') {
        return handleAdminResetLikes(res, mm[1])
      }

      return json(res, 404, { ok: false, error: '接口不存在' })
    }

    return json(res, 404, { ok: false, error: 'not found' })
  } catch (e) {
    if (String(e.message).includes('too large')) {
      return json(res, 413, { ok: false, error: '内容太大了' })
    }
    console.error('[api]', e)
    return json(res, 500, { ok: false, error: '服务器开小差了' })
  }
}
