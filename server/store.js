/**
 * store.js —— 零依赖 JSON 存储
 *
 * 设计要点（现场可靠性优先）：
 * 1. 全量数据常驻内存，读操作零 IO；
 * 2. 每次写操作串行进队列，落盘用「临时文件 + rename」保证原子性，
 *    即使进程被杀也不会写出半截 JSON；
 * 3. 覆盖前把上一版留成 db.prev.json，误删可回滚；
 * 4. 每 10 分钟一份快照到 snapshots/，最多保留 60 份；
 * 5. 100 人规模下，单次落盘 < 2ms，完全够用。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 注意：不能用 `import.meta.dirname` —— 那是 Node 20.11 才有的，
// 在 Node 16/18 上是 undefined，path.resolve 会直接抛 ERR_INVALID_ARG_TYPE。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
const SNAP_DIR = path.join(DATA_DIR, 'snapshots')
const DB_FILE = path.join(DATA_DIR, 'db.json')
const PREV_FILE = path.join(DATA_DIR, 'db.prev.json')

const DEFAULT_SENSITIVE = [
  '傻逼', '沙比', '煞笔', '妈的', '你妈', '卧槽', '我操', '草泥马', '去死',
  '内定', '黑幕', '暗箱', '垃圾公司', '离职', '裁员'
]

export function defaultDb() {
  return {
    meta: {
      ver: 1,
      seq: 0,
      createdAt: new Date().toISOString()
    },
    settings: {
      title: '互动墙',
      subtitle: '扫码上墙 · 内容投票 · 现场抽奖',
      theme: 'red',
      bgImage: '',
      bgDim: 0.55,
      showLogo: true,

      q1: '今年最想不通的一个问题是什么？',
      q2: '今年我单位靠什么撑住的？',
      maxLen: 60,
      requireTail: true,

      autoApprove: true,
      sensitiveWords: DEFAULT_SENSITIVE,
      reportThreshold: 3,
      allowMultiSubmit: false,
      editWindowMinutes: 10,

      votesPerUser: 3,
      showVotesOnWall: true,
      showTailOnWall: false,

      layout: 'mosaic',
      pageSeconds: 22,
      showQrOnScreen: true,
      qrUrl: '',
      screenFooter: '',

      phase: 'idle',
      popularAwardName: '人气奖',
      popularTopN: 5,
      drawRounds: [
        { name: '幸运奖', count: 5 },
        { name: '三等奖', count: 3 },
        { name: '二等奖', count: 2 },
        { name: '一等奖', count: 1 }
      ],
      excludeWinners: true
    },
    submissions: [],
    votes: [],
    draws: [],
    logs: []
  }
}

function ensureDirs() {
  for (const d of [DATA_DIR, UPLOAD_DIR, SNAP_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  }
}

function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, file)
}

let db = null
let writeChain = Promise.resolve()
let lastSnap = 0

export function init() {
  ensureDirs()
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
      // 兼容旧数据：补齐缺失字段
      const d = defaultDb()
      db.meta = { ...d.meta, ...db.meta }
      db.settings = { ...d.settings, ...(db.settings || {}) }
      db.submissions ||= []
      db.votes ||= []
      db.draws ||= []
      db.logs ||= []
    } catch (e) {
      console.error('[store] db.json 解析失败，尝试回滚到 db.prev.json', e.message)
      if (fs.existsSync(PREV_FILE)) {
        db = JSON.parse(fs.readFileSync(PREV_FILE, 'utf8'))
      } else {
        throw new Error('数据库损坏且无备份，请检查 data/ 目录')
      }
    }
  } else {
    db = defaultDb()
    persist()
  }
  lastSnap = Date.now()
  return db
}

export function get() {
  if (!db) init()
  return db
}

/** 任何写操作后调用：自增版本号（前端轮询靠它判断是否需要重绘） */
export function touch() {
  db.meta.ver = (db.meta.ver || 0) + 1
  db.meta.updatedAt = new Date().toISOString()
}

function persist() {
  writeChain = writeChain.then(() => {
    try {
      const text = JSON.stringify(db)
      if (fs.existsSync(DB_FILE)) {
        try {
          fs.copyFileSync(DB_FILE, PREV_FILE)
        } catch {}
      }
      atomicWrite(DB_FILE, text)
      maybeSnapshot()
    } catch (e) {
      console.error('[store] 落盘失败', e)
    }
  })
  return writeChain
}

function maybeSnapshot() {
  const now = Date.now()
  if (now - lastSnap < 10 * 60 * 1000) return
  lastSnap = now
  try {
    const name = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json'
    atomicWrite(path.join(SNAP_DIR, name), JSON.stringify(db))
    const files = fs
      .readdirSync(SNAP_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
    while (files.length > 60) {
      const f = files.shift()
      try {
        fs.unlinkSync(path.join(SNAP_DIR, f))
      } catch {}
    }
  } catch (e) {
    console.error('[store] 快照失败', e)
  }
}

/** 提交变更：touch + 落盘（不等待，避免阻塞请求） */
export function commit() {
  touch()
  persist()
}

/** 需要确认落盘时 await 它 */
export function flush() {
  if (!db) return Promise.resolve()
  touch()
  persist()
  return writeChain
}

export function log(action, detail) {
  const d = get()
  d.logs.unshift({
    at: new Date().toISOString(),
    action,
    detail: detail || ''
  })
  if (d.logs.length > 800) d.logs.length = 800
}

/** 生成下一个牌号 LY-001 */
export function nextCode() {
  const d = get()
  d.meta.seq = (d.meta.seq || 0) + 1
  return 'LY-' + String(d.meta.seq).padStart(3, '0')
}

/** 活动重置：清空提交/投票/抽奖，保留设置 */
export function resetEvent(keepSettings = true) {
  const d = get()
  const settings = keepSettings ? d.settings : defaultDb().settings
  db = {
    meta: { ver: d.meta.ver + 1, seq: 0, createdAt: new Date().toISOString() },
    settings: { ...settings, phase: 'idle' },
    submissions: [],
    votes: [],
    draws: [],
    logs: [{ at: new Date().toISOString(), action: 'reset', detail: '活动数据已重置' }]
  }
  persist()
}

/** 手动导出全量（后台"备份"按钮用） */
export function dumpJson() {
  return JSON.stringify(get(), null, 2)
}

export const paths = { DB_FILE, PREV_FILE, SNAP_DIR, ROOT }
