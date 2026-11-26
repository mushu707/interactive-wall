/**
 * sim.mjs —— 现场彩排模拟器（真打 HTTP 接口，不是直接改库）
 *
 * 为什么要真打接口：这条链路才是现场要跑的链路——牌号自增、设备去重、
 * 敏感词转待审、每人票数上限、全局熔断，全都在这条路上。直接写 db.json
 * 只能得到一堆好看的假数据，什么也验证不了。
 *
 * 用法：
 *   npm run sim -- --reset                 # 先清空，再模拟 100 人
 *   npm run sim -- --reset --users 120     # 改人数
 *   npm run sim -- --users 80 --submit 0.9 --vote 0.6
 *   npm run sim -- --draw                  # 末尾顺带演练奖项（会消耗抽奖池）
 *
 * 可选参数：
 *   --reset         先登录后台调 /api/admin/reset（保留标题/两问/奖项设置）
 *   --reset-only    只清空数据，不模拟（正式活动前用这条）
 *   --users 100     设备数（每人一台手机）
 *   --submit 0.85   参与答题的比例（其余人只看不写）
 *   --vote 0.7      参与投票的比例（其余人只看不投）
 *   --submit-secs 180  答题窗口时长
 *   --vote-secs 120    投票窗口时长（与答题窗口后段重叠）
 *   --edge 0.1      边界样本比例（超长 / 极短 / 敏感词 / 重复提交）
 *   --seed 20261119 随机种子（同种子 = 同一场演出）
 *   --base http://127.0.0.1:3000
 *   --password xxx  后台密码（默认读 ADMIN_PASSWORD，否则 admin888）
 *   --draw          跑完演练奖项
 *   --no-admin      不知道后台密码时用：跳过登录，只灌数据，不动大屏阶段
 *   --quiet         少打点日志
 */
import { QUESTIONS, ANSWERS } from '../server/quotes.js'

// 这个脚本用全局 fetch 打接口，需要 Node 18+。
// 服务器如果是 Node 16，只能运行站点本身，彩排请在本地电脑或用 curl 做。
if (typeof fetch !== 'function') {
  console.error(
    `\n  彩排模拟器需要 Node 18 或更高（当前 v${process.versions.node}，没有全局 fetch）。` +
      `\n  站点本身不受影响 —— 在本地电脑跑 npm run sim 即可。\n`
  )
  process.exit(1)
}

/* ============================ 参数 ============================ */

const argv = process.argv.slice(2)

function has(name) {
  return argv.includes('--' + name)
}
function val(name, dflt) {
  const i = argv.indexOf('--' + name)
  if (i < 0) return dflt
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
function num(name, dflt) {
  const n = Number(val(name, NaN))
  return Number.isFinite(n) ? n : dflt
}

const BASE = String(val('base', process.env.SIM_BASE || 'http://127.0.0.1:3000')).replace(/\/$/, '')
const PASSWORD = String(val('password', process.env.ADMIN_PASSWORD || 'admin888'))
const USERS = Math.max(1, Math.min(500, num('users', 100)))
const SUBMIT_RATE = Math.max(0, Math.min(1, num('submit', 0.85)))
const VOTE_RATE = Math.max(0, Math.min(1, num('vote', 0.7)))
const SUBMIT_SECS = Math.max(1, num('submit-secs', 180))
const VOTE_SECS = Math.max(1, num('vote-secs', 120))
const EDGE = Math.max(0, Math.min(0.5, num('edge', 0.1)))
const SEED = num('seed', 20261119)
const DO_RESET = has('reset')
const RESET_ONLY = has('reset-only')
const DO_DRAW = has('draw')
const QUIET = has('quiet')
// 不打后台密码也能灌数据：跳过登录，也不去切大屏阶段（阶段你在后台自己点）
const NO_ADMIN = has('no-admin')

/* ============================ 随机 ============================ */

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(SEED)
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const shuffle = (arr) => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ============================ HTTP ============================ */

let cookie = ''
const counters = { submit: 0, submitDup: 0, submitBad: 0, vote: 0, throttled: 0, failed: 0 }

async function req(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  if (raw) return { status: res.status, text: await res.text() }
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, data }
}

/** 429 是服务端在保护自己：退一步重试，而不是硬怼 */
async function retry429(fn, times = 3) {
  for (let i = 0; i < times; i++) {
    const r = await fn()
    if (r.status !== 429) return r
    counters.throttled++
    await sleep(1200 + rnd() * 1800)
  }
  return { status: 429, data: null }
}

/* ============================ 语料 ============================ */

const LONG_TAIL = [
  '，问了三个部门，每个部门的说法都不一样',
  '，年初说是这样，年中又变成那样，到现在也没人给个准话',
  '，明明有制度，最后还是靠某个人拍脑袋',
  '，会上没一个人反对，散会就各干各的'
]

function longText(base, maxLen) {
  let s = base
  let guard = 0
  // 一直加从句直到接近上限：这是「满字数」边界样本，要能真的压到排版极限
  while (s.length < maxLen - 2 && guard++ < 10) s += pick(LONG_TAIL)
  return s.slice(0, maxLen)
}

/** 造一条回答；edge 决定是否掺边界样本 */
function buildPair(maxLen) {
  const r = rnd()
  if (r < EDGE) {
    const kind = rnd()
    if (kind < 0.34) {
      // 满字数上限：验证 60 字在卡片里会不会被截掉
      return { kind: 'long', a1: longText(pick(QUESTIONS), maxLen), a2: longText(pick(ANSWERS), maxLen) }
    }
    if (kind < 0.62) {
      // 极短：验证单行排版
      return { kind: 'short', a1: pick(['还没想通。', '为什么？', '想不通', '不知道，真不知道']), a2: pick(['硬撑。', '靠人。', '熬。', '咬着牙']) }
    }
    // 敏感词：应当被转成待审，上不了墙（验证审核链路）
    return { kind: 'sensitive', a1: '这个奖是不是早就内定了？', a2: pick(['靠运气', '靠关系', '不知道']) }
  }
  const i = Math.floor(rnd() * QUESTIONS.length)
  const j = Math.floor(rnd() * ANSWERS.length)
  return { kind: 'normal', a1: QUESTIONS[i], a2: ANSWERS[j] }
}

/* ============================ 主流程 ============================ */

function banner() {
  console.log('')
  console.log('  互动墙 · 现场彩排模拟')
  console.log('  ────────────────────────────────────────────')
  console.log(`  接口      ${BASE}`)
  console.log(`  设备      ${USERS} 台（答题 ${Math.round(SUBMIT_RATE * 100)}% · 投票 ${Math.round(VOTE_RATE * 100)}%）`)
  console.log(`  时间      答题 ${SUBMIT_SECS}s，投票 ${Math.round(SUBMIT_SECS * 0.65 + VOTE_SECS)}s 后收尾`)
  console.log(`  边界样本  ${Math.round(EDGE * 100)}%（超长 / 极短 / 敏感词 / 重复提交）`)
  console.log(`  种子      ${SEED}${DO_RESET ? ' · 开始前先清空' : ''}`)
  console.log('')
}

async function health() {
  try {
    const r = await req('/api/health')
    if (r.status === 200 && r.data?.ok) return true
  } catch {}
  console.error(`  连不上 ${BASE}`)
  console.error('  本地：在项目目录跑 npm run dev（同时起前后端）或 npm start')
  console.error('  线上：确认宝塔里 Node 项目状态是「运行中」')
  process.exit(1)
}

async function login() {
  const r = await req('/api/admin/login', { method: 'POST', body: { password: PASSWORD } })
  if (r.status !== 200 || !r.data?.ok) {
    console.error(`  后台登录失败（密码 ${PASSWORD}）：${r.data?.error || r.status}`)
    process.exit(1)
  }
}

async function reset() {
  const r = await req('/api/admin/reset', { method: 'POST' })
  if (r.status !== 200) {
    console.error(`  重置失败：${r.data?.error || r.status}`)
    process.exit(1)
  }
  console.log('  已清空全部提交 / 投票 / 抽奖（标题、两问、奖项设置保留）')
}

async function config() {
  const r = await req('/api/public/config')
  const s = r.data?.settings || {}
  return {
    maxLen: Math.max(10, Number(s.maxLen) || 60),
    requireTail: s.requireTail !== false,
    votesPerUser: Math.max(1, Number(s.votesPerUser) || 3),
    allowMultiSubmit: !!s.allowMultiSubmit
  }
}

/** 每台设备：随机尾号、是否答题、是否投票、投几票 */
function buildUsers() {
  const users = []
  for (let i = 0; i < USERS; i++) {
    const submits = rnd() < SUBMIT_RATE
    // 投票的人里，有一部分是「只看不写」的，符合现场真实构成
    const votesQty = (() => {
      if (rnd() >= VOTE_RATE) return 0
      const r = rnd()
      return r < 0.42 ? 1 : r < 0.75 ? 2 : 3
    })()
    users.push({
      i,
      deviceId: `sim-${SEED}-${String(i).padStart(3, '0')}`,
      tail: String(1000 + Math.floor(rnd() * 9000)),
      submits,
      qty: votesQty,
      // 有一部分人只投 1 票就投完了，也有人一上来就投满
      submitted: null
    })
  }
  return users
}

async function submitOne(u, cfg) {
  const pair = buildPair(cfg.maxLen)
  const body = { a1: pair.a1, a2: pair.a2, deviceId: u.deviceId }
  if (cfg.requireTail) body.tail = u.tail

  const r = await retry429(() => req('/api/public/submissions', { method: 'POST', body }))
  if (r.status === 200) {
    counters.submit++
    u.submitted = { id: r.data.id, code: r.data.code, status: r.data.status, kind: pair.kind }
    return
  }
  if (r.status === 409) {
    counters.submitDup++
    u.submitted = { code: r.data?.code, status: 'dup' }
    return
  }
  counters.submitBad++
  if (!QUIET) console.log(`  ! ${u.deviceId} 提交被拒 ${r.status} ${r.data?.error || ''}`)
}

/** 同一台手机再提一次：现场真会有人手滑，得验证会被拦住 */
async function submitAgain(u, cfg) {
  const body = { a1: '我又提交了一次，看看会不会重复', a2: '试试', deviceId: u.deviceId }
  if (cfg.requireTail) body.tail = u.tail
  const r = await req('/api/public/submissions', { method: 'POST', body })
  if (r.status === 409) counters.submitDup++
  else if (r.status === 200) counters.submit++
}

/** 加权挑目标：越靠前、票越多的越容易被投（幂律长尾，榜单才有梯度） */
function weightedPick(pool, k) {
  const list = pool.slice()
  const out = []
  while (out.length < k && list.length) {
    const w = list.map((c, i) => (1 / Math.pow(i + 1, 0.95)) * (1 + (c.likes || 0) * 0.12))
    const total = w.reduce((a, b) => a + b, 0)
    let t = rnd() * total
    let hit = list.length - 1
    for (let i = 0; i < w.length; i++) {
      t -= w[i]
      if (t <= 0) {
        hit = i
        break
      }
    }
    out.push(list[hit])
    list.splice(hit, 1)
  }
  return out
}

async function voteFor(u, cfg) {
  const wall = await req('/api/public/wall?voterKey=' + encodeURIComponent(u.deviceId))
  if (wall.status !== 200) return
  let pool = (wall.data.cards || []).filter((c) => !u.submitted || c.id !== u.submitted.id)
  const used = wall.data.used || 0
  const remain = Math.min(u.qty - used, (wall.data.remaining ?? cfg.votesPerUser))
  if (process.env.SIM_DEBUG) {
    console.log(`  [dbg] ${u.deviceId} qty=${u.qty} used=${used} remain=${remain} pool=${pool.length}`)
  }
  if (remain <= 0 || !pool.length) return

  const targets = weightedPick(pool, remain)
  for (const c of targets) {
    const r = await retry429(() =>
      req('/api/public/votes', { method: 'POST', body: { submissionId: c.id, voterKey: u.deviceId } })
    )
    if (r.status === 200) {
      counters.vote++
      c.likes = r.data.likes
    } else if (r.status === 403 || r.status === 409) {
      // 票用完 / 已投过：正常现象，不算错误
      if (r.status === 403) break
    } else {
      counters.failed++
    }
    await sleep(60 + rnd() * 240)
  }
}

async function phase(p) {
  const r = await req('/api/admin/phase', { method: 'POST', body: { phase: p } })
  return r.status === 200
}

async function drawShow() {
  const st = await req('/api/admin/state')
  const rounds = st.data?.settings?.drawRounds || []
  console.log('')
  console.log('  演练奖项（会真的占用抽奖池）')
  for (const rd of rounds) {
    const prep = await req('/api/admin/draw/prepare', {
      method: 'POST',
      body: { awardName: rd.name, count: rd.count }
    })
    if (prep.status !== 200) {
      console.log(`  - ${rd.name}：${prep.data?.error || prep.status}`)
      continue
    }
    await sleep(600)
    const rv = await req('/api/admin/draw/reveal', { method: 'POST' })
    const codes = (rv.data?.draw?.winners || []).map((w) => w.code).join(' ')
    console.log(`  - ${rd.name} ×${rd.count}：${codes}`)
    await sleep(400)
  }
}

async function summary() {
  // --no-admin 时没有后台权限，/api/admin/state 会 401，只能从大屏接口读出统计
  const st = NO_ADMIN ? { data: null } : await req('/api/admin/state')
  const sc = await req('/api/public/screen')
  const s = st.data || {}
  const d = sc.data || {}
  const subs = s.submissions || []
  const pending = subs.filter((x) => x.status === 'pending').length
  const approved = subs.length
    ? subs.filter((x) => x.status === 'approved' && !x.hidden).length
    : d.stats?.approved ?? 0
  const long = subs.filter((x) => x.status === 'approved' && (x.a1.length >= 55 || x.a2.length >= 55)).length

  console.log('')
  console.log('  ────────────────────────────────────────────')
  console.log(`  提交成功   ${counters.submit} 条（其中重复被拦 ${counters.submitDup} 次）`)
  console.log(`  提交被拒   ${counters.submitBad} 条 · 限流重试 ${counters.throttled} 次`)
  console.log(`  投票成功   ${counters.vote} 张 · 失败 ${counters.failed} 次`)
  if (subs.length) {
    console.log(`  当前上墙   ${approved} 条 · 待审 ${pending} 条（敏感词命中，需后台放行）`)
    console.log(`  满 55 字   ${long} 条（大屏卡片会被截断，显示「全文」角标）`)
  } else {
    console.log(`  当前上墙   ${approved} / ${d.stats?.total ?? '-'} 条（大屏统计，待审明细需登录后台看）`)
  }
  console.log(`  总票数     ${d.stats?.votes ?? '-'} · 投票人 ${s.stats?.voters ?? '-'}`)
  console.log(`  大屏阶段   ${d.phase}`)
  const topN = Math.max(1, Math.min(6, Number(d.settings?.popularTopN) || 5))
  const top = (d.top || []).slice(0, topN)
  if (top.length) {
    console.log(`  人气榜前 ${top.length}`)
    top.forEach((t, i) => console.log(`    ${i + 1}. ${t.code}  ${t.likes} 票`))
  }
  const ms = d.phase === 'live' ? 'live' : d.phase
  if (ms !== 'live') console.log('  ! 阶段不是 live，大屏不会显示内容墙，可加 --reset 或在后台点「上墙」')
  console.log('')
}

/* ============================ 编排 ============================ */

async function main() {
  banner()
  await health()
  // 后台权限：重置、切阶段、抽奖演练都要用到（--password 或 ADMIN_PASSWORD）
  if (NO_ADMIN) {
    if (DO_RESET || RESET_ONLY || DO_DRAW) {
      console.error('  --no-admin 不能和 --reset / --reset-only / --draw 一起用（这几个动作都需要后台权限）')
      process.exit(1)
    }
    console.log('  跳过登录（--no-admin）：只灌数据，不动大屏阶段和已有内容')
  } else {
    await login()
  }
  if (RESET_ONLY) {
    await reset()
    console.log('  只清空，不模拟。大屏现在是空的待机页。')
    console.log('')
    return
  }
  if (DO_RESET) await reset()
  // 一开始就切到内容墙，否则整场彩排大屏都在待机页，看不到内容往上冒
  if (!NO_ADMIN) {
    await phase('live')
    if (!QUIET) console.log('  大屏已切到内容墙：可另开窗口看 ' + BASE + '/screen')
  } else if (!QUIET) {
    console.log('  大屏阶段没动：想看内容上墙，去后台点「内容墙」，或另开 ' + BASE + '/screen')
  }
  const cfg = await config()
  console.log(`  现场设置：每条最多 ${cfg.maxLen} 字 · 每人 ${cfg.votesPerUser} 票 · 一人一条=${!cfg.allowMultiSubmit}`)

  const users = buildUsers()
  const submitters = users.filter((u) => u.submits)
  const voters = users.filter((u) => u.qty > 0)
  console.log(`  参与答题 ${submitters.length} 人 · 参与投票 ${voters.length} 人（其中只看不写 ${voters.filter((u) => !u.submits).length} 人）`)

  const t0 = Date.now()
  const subWindow = SUBMIT_SECS * 1000
  const voteStart = subWindow * 0.35
  const voteEnd = subWindow + VOTE_SECS * 1000

  const tasks = []

  for (const u of submitters) {
    // 入场是陆续的：前 10% 时间比较冷，后面逐渐密起来
    const p = Math.pow(rnd(), 1.35)
    tasks.push({ at: t0 + p * subWindow, run: () => submitOne(u, cfg) })
    // 少部分人提交完还想改/再交一次
    if (rnd() < EDGE) tasks.push({ at: t0 + p * subWindow + 4000 + rnd() * 8000, run: () => submitAgain(u, cfg) })
  }

  for (const u of voters) {
    // 投票通常发生在看完几条之后，撒在整个投票窗口里
    const p = 0.25 + rnd() * 0.75
    tasks.push({ at: t0 + voteStart + p * (voteEnd - voteStart), run: () => voteFor(u, cfg) })
  }

  tasks.sort((a, b) => a.at - b.at)

  const total = tasks.length
  let done = 0
  let lastPct = -10
  for (const t of tasks) {
    const wait = t.at - Date.now()
    if (wait > 0) await sleep(wait)
    try {
      await t.run()
    } catch (e) {
      counters.failed++
      if (!QUIET) console.log(`  ! 请求异常 ${e.message}`)
    }
    done++
    const pct = Math.floor((done / total) * 100)
    if (!QUIET && pct >= lastPct + 10) {
      lastPct = pct
      console.log(`  ${String(pct).padStart(3)}% │ 提交 ${counters.submit} · 票 ${counters.vote}`)
    }
  }

  await sleep(800)
  if (DO_DRAW) await drawShow()
  // 收尾统一回到内容墙，彩排完大屏就能直接验收
  if (!NO_ADMIN) await phase('live')
  await summary()
  console.log('  大屏 http://' + BASE.replace(/^https?:\/\//, '') + '/screen   手机 /submit   后台 /admin')
  console.log('')
}

main().catch((e) => {
  console.error('模拟中断：', e)
  process.exit(1)
})
