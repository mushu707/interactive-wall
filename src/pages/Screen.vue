<template>
  <div class="screen" :class="'phase-' + phase" @mousemove="bumpCursor">
    <!-- 背景 -->
    <div class="bg" :style="bgStyle" />
    <div class="bg-dim" :style="{ opacity: bgDim }" />
    <div class="vignette" />
    <div class="glow" />

    <!-- 顶栏 -->
    <header class="top">
      <div class="brand">
        <div class="eyebrow">{{ phase === 'idle' ? 'SCAN TO JOIN' : 'LIVE WALL' }}</div>
        <div class="title-row">
          <h1 class="title display">{{ settings.title }}</h1>
          <span class="title-sub" v-if="settings.subtitle">{{ settings.subtitle }}</span>
        </div>
      </div>
      <div class="top-right">
        <div class="live-pill" v-if="phase === 'live'">
          <span class="dot" /> 实时
        </div>
      </div>
    </header>

    <!-- 今日两问：常驻在大屏最醒目的位置 -->
    <section class="qband" v-if="phase === 'live'">
      <div class="qb-item">
        <span class="qb-no">①</span>
        <span class="qb-text">{{ settings.q1 }}</span>
      </div>
      <span class="qb-div" />
      <div class="qb-item">
        <span class="qb-no">②</span>
        <span class="qb-text">{{ settings.q2 }}</span>
      </div>
    </section>

    <!-- 待机：引导页 -->
    <main v-if="phase === 'idle'" class="hero">
      <div class="hero-qr">
        <div class="qr-frame">
          <canvas ref="qrCanvasBig" class="qr-big" />
        </div>
      </div>
      <div class="hero-copy">
        <h2 class="hero-h display">扫码，留下你今年<br />最想说的一句话</h2>
        <div class="hero-qs">
          <div><i>①</i>{{ settings.q1 }}</div>
          <div><i>②</i>{{ settings.q2 }}</div>
        </div>
        <p class="hero-p">
          回答这两个问题，拿到你的专属牌号<br />
          现场循环播放，还能给大家投票
        </p>
        <div class="hero-rule" />
        <div class="hero-stats">
          <div><b>{{ stats.approved }}</b><span>已上墙</span></div>
          <div><b>{{ stats.votes }}</b><span>已投票</span></div>
        </div>
        <button class="hero-go" @click="setPhase('live')">进入内容墙 →</button>
        <p class="hero-hint">按 <kbd>H</kbd> 呼出控场条 · 或在后台点「上墙」</p>
      </div>
    </main>

    <!-- 内容墙 -->
    <main v-else-if="phase === 'live' || phase === 'result'" class="live-wrap">
      <section class="wall">
        <transition name="page" mode="out-in">
          <div class="grid" :key="pageNo">
            <article
              v-for="c in currentPage"
              :key="c.id"
              class="tile"
              :class="{ fresh: freshIds.has(c.id), pulse: pulseIds.has(c.id), clamped: clipped.has(c.id) }"
              :data-id="c.id"
              @click="openDetail(c)"
              @animationend="onPulseEnd(c.id)"
            >
              <div class="tile-head">
                <span class="tile-code">{{ c.code }}</span>
                <span class="tile-flags">
                  <span class="tile-more" v-if="clipped.has(c.id)">全文</span>
                  <span class="tile-like" v-if="settings.showVotesOnWall">
                    <span class="heart">♥</span>{{ c.likes }}
                  </span>
                </span>
              </div>
              <div class="tile-body">
                <p class="tile-a"><i class="q-mark">①</i>{{ c.a1 }}</p>
                <p class="tile-b"><i class="q-mark">②</i>{{ c.a2 }}</p>
              </div>
              <div class="tile-foot">
                <span class="tile-meta">{{ hhmm(c.at) }} 上墙</span>
                <span class="tile-tail" v-if="c.tail">尾号 {{ c.tail }}</span>
              </div>
            </article>
            <div v-if="!cards.length" class="empty">
              <p>还没有内容上墙</p>
              <span>扫码成为第一个</span>
            </div>
          </div>
        </transition>
        <div class="pager" v-if="pages > 1" :class="{ paused }">
          <button class="pg-arrow prev" type="button" aria-label="上一页" @click="goPage(pageNo - 1)">‹</button>
          <div class="pips">
            <button
              v-for="(p, i) in pages"
              :key="i"
              type="button"
              class="pip"
              :class="{ on: i === pageNo }"
              :aria-label="`第 ${i + 1} 页`"
              @click="goPage(i)"
            />
          </div>
          <button class="pg-arrow next" type="button" aria-label="下一页" @click="goPage(pageNo + 1)">›</button>
          <span v-if="paused" class="pg-pause">已暂停 · 空格继续</span>
        </div>
      </section>

      <aside class="side">
        <div class="side-qr" v-if="settings.showQrOnScreen">
          <canvas ref="qrCanvas" class="qr" />
          <div class="qr-text">扫码上墙</div>
        </div>
        <div class="side-title">
          <span class="eyebrow">TOP LIKED</span>
          <h3>人气榜</h3>
        </div>
        <ol class="rank">
          <li v-for="(t, i) in top" :key="t.id" class="rank-item">
            <span class="rank-no" :class="'n' + (i + 1)">{{ i + 1 }}</span>
            <div class="rank-main">
              <div class="rank-line">
                <span class="rank-code">{{ t.code }}</span>
                <span class="rank-likes">{{ t.likes }} 票</span>
              </div>
              <div class="rank-bar"><i :style="{ width: barWidth(t.likes) }" /></div>
            </div>
          </li>
          <li v-if="!top.length" class="rank-empty">还没有人投票</li>
        </ol>
        <div class="side-foot">
          <span>共 {{ stats.approved }} 条上墙</span>
          <span>{{ stats.votes }} 票</span>
        </div>
      </aside>
    </main>

    <!-- 抽奖舞台 -->
    <transition name="draw">
      <div v-if="phase === 'drawing' || phase === 'result'" class="stage">
        <div class="stage-head">
          <div class="eyebrow" :class="{ gold: phase === 'result' }">
            {{ phase === 'result' ? 'CONGRATULATIONS' : 'DRAWING' }}
          </div>
          <h2 class="award display">{{ draw?.awardName || '幸运奖' }}</h2>
          <div class="award-line" />
        </div>

        <!-- 翻滚 -->
        <div v-if="phase === 'drawing'" class="roll-area">
          <div class="roll-cols" :class="'cols-' + rollCols.length">
            <div v-for="(code, i) in rollCols" :key="i" class="roll-slot">
              <span class="roll-code display">{{ code }}</span>
            </div>
          </div>
          <p class="roll-hint">正在抽取 · 共 {{ draw?.poolSize || cards.length }} 位参与者</p>
        </div>

        <!-- 揭晓：≤3 人保留内容卡（带答案）；≥4 人切牌号名单，点一下看全文 -->
        <div v-else-if="isRoster" class="roster-wrap">
          <div class="roster" :class="['c' + rosterCols, { wide: rosterTotal <= 5 }]">
            <button
              v-for="(w, i) in rosterPageItems"
              :key="w.code"
              class="roster-card"
              :style="{ animationDelay: Math.min(i, 11) * 0.04 + 's' }"
              @click="openWinner(w)"
            >
              <span class="roster-code display">{{ w.code }}</span>
              <span class="roster-tail">尾号 {{ w.tail }}</span>
            </button>
          </div>
          <div v-if="rosterPages > 1" class="roster-pager">
            <button class="rp-btn" @click="goRosterPage(-1)">‹</button>
            <span class="rp-no">{{ rosterPageNo + 1 }} / {{ rosterPages }}</span>
            <button class="rp-btn" @click="goRosterPage(1)">›</button>
          </div>
          <p class="roster-hint">点牌号可看完整回答 · 共 {{ rosterTotal }} 位</p>
        </div>
        <div v-else class="winners" :class="'n' + Math.min(3, Math.max(1, (draw?.winners || []).length))">
          <div
            v-for="(w, i) in draw?.winners || []"
            :key="w.code"
            class="winner"
            :style="{ animationDelay: i * 0.12 + 's' }"
          >
            <div class="winner-code display gold-text">{{ w.code }}</div>
            <div class="winner-tail">手机尾号 {{ w.tail }}</div>
            <div class="winner-qa">
              <p class="winner-a"><i class="q-mark">①</i>{{ w.a1 }}</p>
              <p class="winner-a"><i class="q-mark">②</i>{{ w.a2 }}</p>
            </div>
          </div>
        </div>

        <div class="stage-foot" v-if="phase === 'result'">
          <span>请中奖的伙伴留意手机提示，到领奖处出示牌号</span>
        </div>
      </div>
    </transition>

    <!-- 人气奖（投票最高，与随机抽奖相互独立） -->
    <transition name="draw">
      <div v-if="phase === 'popular'" class="stage popular-stage">
        <div class="stage-head">
          <div class="eyebrow gold">MOST LIKED</div>
          <h2 class="award display">{{ popular?.awardName || '人气奖' }}</h2>
          <div class="award-line" />
        </div>

        <div v-if="popular" class="pop-wrap" :class="{ solo: popular.winners.length === 1 }">
          <div class="pop-main">
            <div class="pop-top">
              <span class="pop-rank" v-if="popular.winners.length > 1">第 1 名</span>
              <span class="pop-code display gold-text">{{ popular.winners[0].code }}</span>
              <span class="pop-like"><b>{{ popular.winners[0].likes }}</b> 票</span>
            </div>
            <p class="pop-a"><i class="q-mark">①</i>{{ popular.winners[0].a1 }}</p>
            <p class="pop-b"><i class="q-mark">②</i>{{ popular.winners[0].a2 }}</p>
            <div class="pop-foot">
              <span>手机尾号 {{ popular.winners[0].tail }}</span>
              <span class="pop-total">全场 {{ popular.totalVotes }} 票</span>
            </div>
          </div>
          <ol v-if="popular.winners.length > 1" class="pop-rest">
            <li v-for="w in popular.winners.slice(1)" :key="w.code" @click="openWinner(w)">
              <span class="pr-rank">{{ w.rank }}</span>
              <span class="pr-code display">{{ w.code }}</span>
              <span class="pr-tail">尾号 {{ w.tail }}</span>
              <span class="pr-like">{{ w.likes }} 票</span>
            </li>
          </ol>
        </div>
        <p v-else class="pop-empty">还没有人投票</p>

        <div class="stage-foot">
          <span>{{ popular && popular.winners.length > 1 ? `前 ${popular.winners.length} 名 · ` : '' }}全场投票产生 · 同票按提交时间先后 · 与随机抽奖相互独立</span>
        </div>
      </div>
    </transition>

    <!-- 底栏 -->
    <footer class="foot">
      <span v-if="settings.screenFooter">{{ settings.screenFooter }}</span>
      <span v-else>{{ settings.title }} · 扫码参与 · 为喜欢的内容投票</span>
    </footer>

    <!-- 全文浮层：卡片被截断时点一下看完整内容，15 秒后自动收起 -->
    <transition name="fade">
      <div v-if="detail" class="detail" @click="closeDetail">
        <div class="detail-card">
          <div class="detail-top">
            <span class="detail-code display gold-text">{{ detail.code }}</span>
            <span class="detail-like" v-if="settings.showVotesOnWall && detail.likes != null">♥ {{ detail.likes }}</span>
          </div>
          <p class="detail-a"><i class="q-mark">①</i>{{ detail.a1 }}</p>
          <p class="detail-b"><i class="q-mark">②</i>{{ detail.a2 }}</p>
          <div class="detail-foot">
            <span v-if="detail.at || detail.tail">
              <template v-if="detail.at">{{ hhmm(detail.at) }} 上墙</template>
              <template v-if="detail.tail">{{ detail.at ? ' · ' : '' }}尾号 {{ detail.tail }}</template>
            </span>
            <span v-else class="faint">中奖名单里的完整回答</span>
            <span class="detail-hint">点击任意处关闭</span>
          </div>
        </div>
      </div>
    </transition>

    <!-- 控场浮层 -->
    <transition name="fade">
      <div v-if="hud" class="hud">
        <span class="hud-phase">{{ phaseLabel }}</span>
        <button @click="setPhase('live')">回现场</button>
        <button @click="togglePause">{{ paused ? '继续轮播' : '暂停轮播' }}</button>
        <button v-if="phase === 'drawing'" @click="reveal">立即揭晓</button>
        <button v-if="phase === 'result' || phase === 'popular'" @click="setPhase('live')">收起结果</button>
        <button @click="goAdmin">控场后台</button>
        <span class="hud-tip">按 H 隐藏</span>
      </div>
    </transition>

    <!-- 轻提示 -->
    <transition name="fade">
      <div v-if="tip" class="tip">{{ tip }}</div>
    </transition>

    <!-- 接口不通时的兜底提示（不然大屏就是一片空白，看不出原因） -->
    <transition name="fade">
      <div v-if="apiError" class="net-err">
        <div class="net-card">
          <div class="net-eyebrow">CONNECTION LOST</div>
          <h3 class="net-h">连不上后台接口</h3>
          <p class="net-msg">{{ apiError }}</p>
          <p class="net-tip">
            本地开发：在项目目录跑 <code>npm run dev</code>（会同时启动前端和后端）。<br />
            已部署：确认宝塔里的 Node 项目状态是「运行中」。
          </p>
          <button class="net-btn" @click="retry">重试</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import QRCode from 'qrcode'
import { api } from '../api.js'
import { applyTheme } from '../state.js'

const router = useRouter()

const settings = ref({ title: '互动墙', subtitle: '', pageSeconds: 22, showQrOnScreen: true })
const phase = ref('idle')
const cards = ref([])
const top = ref([])
const draw = ref(null)
const popular = ref(null)
const stats = ref({ approved: 0, votes: 0 })
const bgDim = computed(() => settings.value.bgDim ?? 0.55)

const verCards = ref(-1)
const verSettings = ref(-1)
const pageNo = ref(0)
const paused = ref(false)
const perPage = ref(9)
const freshIds = ref(new Set())
// 只驱动那一次呼吸动画；动画播完就摘掉，翻页重建 DOM 时不会重播
const pulseIds = ref(new Set())
const rollCols = ref([])
const hud = ref(false)
const apiError = ref('')
const tip = ref('')
const detail = ref(null)
const clipped = ref(new Set())
let tipTimer = null
let detailTimer = null

const qrCanvas = ref(null)
const qrCanvasBig = ref(null)

let pollTimer = null
let pageTimer = null
let rollTimer = null
let seenIds = new Set()
let freshTimers = {}
// 首屏拿到卡片时不能算「刚上墙」：否则强制刷新后满屏卡片一起闪金框
let firstCardsSync = true
// 已经闪过的牌号，翻页或重新挂载都不再重播
const flashedOnce = new Set()

const bgStyle = computed(() => {
  const img = settings.value.bgImage
  return img ? { backgroundImage: `url("${img}")` } : {}
})

const pages = computed(() => Math.max(1, Math.ceil(cards.value.length / perPage.value)))
const currentPage = computed(() => {
  const start = pageNo.value * perPage.value
  return cards.value.slice(start, start + perPage.value)
})

/* 揭晓名单：≤3 人保留内容卡，≥4 人切具名网格；超 20 人分页（每页 20，8 秒一轮） */
const ROSTER_PER_PAGE = 20
const rosterTotal = computed(() => draw.value?.winners?.length || 0)
const isRoster = computed(() => rosterTotal.value >= 4)
const rosterPages = computed(() => Math.max(1, Math.ceil(rosterTotal.value / ROSTER_PER_PAGE)))
const rosterCols = computed(() => {
  const n = rosterTotal.value
  // 尽量不留下「孤零零的最后一行」：4 人排一行、5 人排一行、6 人和 9 人走三列
  if (n <= 4) return 4
  if (n === 5) return 5
  if (n === 6 || n === 9) return 3
  if (n <= 12) return 4
  return 5
})
const rosterPageNo = ref(0)
const rosterPageItems = computed(() => {
  const start = rosterPageNo.value * ROSTER_PER_PAGE
  return (draw.value?.winners || []).slice(start, start + ROSTER_PER_PAGE)
})

const phaseLabel = computed(
  () =>
    ({ idle: '待机', live: '内容墙', drawing: '抽奖中', result: '已揭晓', popular: '人气奖' })[phase.value] ||
    phase.value
)

function hhmm(iso) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function barWidth(likes) {
  const max = Math.max(1, top.value[0]?.likes || 1)
  return Math.max(6, Math.round((likes / max) * 100)) + '%'
}

/* ---------------- 轮询 ---------------- */
/** 人气奖数据兜底：老版本后端只返回 { card }，直接读 winners 会让整块大屏渲染抛错变黑，
 *  这里统一成 winners 数组，旧结构也能降级成「单张票王卡」正常显示。 */
function normalizePopular(p) {
  if (!p || typeof p !== 'object') return null
  if (Array.isArray(p.winners) && p.winners.length) return p
  const c = p.card
  if (c && c.code) {
    return {
      awardName: p.awardName || '人气奖',
      totalVotes: p.totalVotes || 0,
      topN: 1,
      winners: [
        {
          rank: 1,
          id: c.id,
          code: c.code,
          tail: c.tail,
          likes: p.likes ?? c.likes ?? 0,
          a1: c.a1 || '',
          a2: c.a2 || '',
          at: c.at
        }
      ]
    }
  }
  return null
}

/** 呼吸动画只播一次：结束后摘掉 pulse，翻页把 DOM 重建也不会重播 */
function onPulseEnd(id) {
  if (!pulseIds.value.has(id)) return
  const s = new Set(pulseIds.value)
  s.delete(id)
  pulseIds.value = s
}

async function poll() {
  try {
    const d = await api('/public/screen')
    apiError.value = ''
    let needQr = false
    if (d.ver.settings !== verSettings.value) {
      verSettings.value = d.ver.settings
      settings.value = d.settings
      applyTheme(d.settings.theme)
      needQr = true
    }
    // 阶段切换会挂载/卸载二维码画布，必须重画，否则侧栏二维码是空白
    const phaseChanged = d.phase !== phase.value
    if (phaseChanged) needQr = true
    stats.value = d.stats
    phase.value = d.phase
    // 从抽奖/人气奖切回内容墙：保留原来的页码，把自动翻页的表重新起
    if (phaseChanged && d.phase === 'live') startPaging()
    top.value = d.top
    draw.value = d.draw
    popular.value = normalizePopular(d.popular)

    if (d.ver.cards !== verCards.value) {
      const incoming = new Set(d.cards.map((c) => c.id))
      // 首屏（含强制刷新）拿到的既有内容不算新增，只有真·新上墙的才闪
      const added = firstCardsSync ? [] : d.cards.filter((c) => !seenIds.has(c.id))
      cards.value = d.cards
      for (const c of added) {
        if (flashedOnce.has(c.id)) continue
        flashedOnce.add(c.id)
        const set = new Set(freshIds.value)
        set.add(c.id)
        freshIds.value = set
        const pset = new Set(pulseIds.value)
        pset.add(c.id)
        pulseIds.value = pset
        // 高亮边框保持 6 秒
        clearTimeout(freshTimers[c.id])
        freshTimers[c.id] = setTimeout(() => {
          const s2 = new Set(freshIds.value)
          s2.delete(c.id)
          freshIds.value = s2
        }, 6000)
      }
      // 已被删除的牌号从记忆里清掉，长活动也不累积
      for (const id of flashedOnce) if (!incoming.has(id)) flashedOnce.delete(id)
      seenIds = incoming
      firstCardsSync = false
      verCards.value = d.ver.cards
      if (pageNo.value >= pages.value) pageNo.value = 0
    } else {
      // 只更新票数，不动 DOM 顺序
      const map = new Map(d.cards.map((c) => [c.id, c]))
      cards.value = cards.value.map((c) => map.get(c.id) || c)
    }

    if (needQr) {
      await nextTick()
      drawQr()
    }

    if (phase.value === 'live' || phase.value === 'result') {
      await nextTick()
      measureClamped()
    }

    if (phase.value === 'drawing') {
      if (!rollTimer) startRoll()
      schedulePoll(700)
    } else {
      stopRoll()
      schedulePoll(2000)
    }
  } catch (e) {
    apiError.value = e.message || '接口请求失败'
    schedulePoll(3000)
  }
}

async function retry() {
  clearTimeout(pollTimer)
  await poll()
}

function schedulePoll(ms) {
  clearTimeout(pollTimer)
  pollTimer = setTimeout(poll, ms)
}

/* ---------------- 翻页 ---------------- */
/** 手动翻页：点圆点 / 箭头 / 方向键都走这里，跳完重新计时，免得刚点完就被自动翻走 */
function goPage(n, manual = true) {
  const total = pages.value
  if (!total || phase.value !== 'live') return
  const next = ((n % total) + total) % total
  if (next === pageNo.value) return
  pageNo.value = next
  if (manual) startPaging()
}

function startPaging() {
  clearInterval(pageTimer)
  pageTimer = null
  if (paused.value) return
  pageTimer = setInterval(() => {
    if (phase.value !== 'live') return
    pageNo.value = (pageNo.value + 1) % pages.value
  }, Math.max(8, settings.value.pageSeconds || 22) * 1000)
}

/** 暂停/继续自动轮播：台上讲某条内容时用，免得画面自己翻走 */
function togglePause() {
  paused.value = !paused.value
  startPaging()
  say(paused.value ? '轮播已暂停（空格继续）' : '轮播继续')
}

/* ---------------- 抽奖翻滚 ---------------- */
function startRoll() {
  const pool = draw.value?.rolling?.length
    ? draw.value.rolling
    : cards.value.map((c) => c.code)
  if (!pool.length) return
  const n = Math.min(3, Math.max(1, draw.value?.count || 1))
  rollCols.value = Array.from({ length: n }, () => pool[Math.floor(Math.random() * pool.length)])
  rollTimer = setInterval(() => {
    rollCols.value = rollCols.value.map(() => pool[Math.floor(Math.random() * pool.length)])
  }, 85)
}

function stopRoll() {
  if (rollTimer) {
    clearInterval(rollTimer)
    rollTimer = null
  }
}

/* ---------------- 二维码 ---------------- */
function qrTarget() {
  return settings.value.qrUrl || location.origin + '/submit'
}

async function drawQr() {
  const url = qrTarget()
  const opts = {
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#1a0406ff', light: '#f7e3b6ff' }
  }
  await nextTick()
  for (const [el, size] of [
    [qrCanvas.value, 360],
    [qrCanvasBig.value, 760]
  ]) {
    if (!el) continue
    try {
      await QRCode.toCanvas(el, url, { ...opts, width: size })
      // qrcode 会给 canvas 写内联宽高，必须清掉才能让 CSS 接管
      el.style.width = ''
      el.style.height = ''
    } catch {}
  }
}

/* ---------------- 交互 ---------------- */
let cursorTimer = null
function bumpCursor() {
  if (!hud.value) return
  clearTimeout(cursorTimer)
  cursorTimer = setTimeout(() => (hud.value = false), 6000)
}

function toggleHud() {
  hud.value = !hud.value
  if (hud.value) bumpCursor()
}

function say(msg) {
  tip.value = msg
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => (tip.value = ''), 3200)
}

async function setPhase(p) {
  try {
    await api('/admin/phase', { method: 'POST', body: { phase: p } })
    phase.value = p
    // 回到内容墙时重新起表，页码保留
    if (p === 'live') startPaging()
  } catch (e) {
    if (e.status === 401) {
      say('需要先在后台登录，1 秒后带你去登录页')
      setTimeout(() => router.push('/admin'), 1100)
    } else {
      say(e.message)
    }
  }
}

async function reveal() {
  try {
    await api('/admin/draw/reveal', { method: 'POST' })
  } catch (e) {
    say(e.status === 401 ? '需要先在后台登录' : e.message)
  }
}

function goAdmin() {
  router.push('/admin')
}

/* ---------------- 全文浮层 ---------------- */
/* 中奖名单里点开某一位的完整回答：复用全文浮层，票数能查到就带上 */
function openWinner(w) {
  if (!w) return
  const like = w.likes != null ? w.likes : cards.value.find((c) => c.code === w.code)?.likes
  openDetail({ code: w.code, a1: w.a1, a2: w.a2, tail: w.tail, likes: like })
}

/** 数字键 1～9：打开当前页第 N 位（揭晓名单或人气奖） */
function openWinnerAt(i) {
  if (phase.value === 'result' && isRoster.value) {
    const w = rosterPageItems.value[i]
    if (w) openWinner(w)
  } else if (phase.value === 'popular') {
    const w = popular.value?.winners?.[i]
    if (w) openWinner(w)
  }
}

let rosterTimer = null
function syncRosterTimer() {
  clearInterval(rosterTimer)
  rosterTimer = null
  if (phase.value === 'result' && rosterPages.value > 1) {
    rosterTimer = setInterval(() => {
      rosterPageNo.value = (rosterPageNo.value + 1) % rosterPages.value
    }, 8000)
  }
}

function goRosterPage(delta) {
  if (rosterPages.value <= 1) return
  rosterPageNo.value = (rosterPageNo.value + delta + rosterPages.value) % rosterPages.value
  syncRosterTimer()
}

function openDetail(c) {
  detail.value = c
  clearTimeout(detailTimer)
  detailTimer = setTimeout(() => (detail.value = null), 15000)
}

function closeDetail() {
  clearTimeout(detailTimer)
  detail.value = null
}

/** 检测哪些卡片被 line-clamp 截断，只有截断的才显示「全文」角标 */
function measureClamped() {
  const next = new Set()
  document.querySelectorAll('.grid .tile').forEach((el) => {
    const id = el.dataset.id
    let cut = false
    el.querySelectorAll('.tile-a, .tile-b').forEach((p) => {
      // 阈值 6px：整行才是真截断，亚像素级的溢出只是换了行，不该显示「全文」
      const over = p.scrollHeight - p.clientHeight > 6
      p.classList.toggle('cut', over)
      if (over) cut = true
    })
    if (cut && id) next.add(id)
  })
  const changed =
    next.size !== clipped.value.size || [...next].some((x) => !clipped.value.has(x))
  if (changed) clipped.value = next
}

function onKey(e) {
  if (e.key === 'h' || e.key === 'H') toggleHud()
  // 翻页笔大多映射成方向键，直接给它们用；揭晓名单分页时优先翻名单
  if (e.key === 'ArrowRight') {
    if (phase.value === 'result' && rosterPages.value > 1) goRosterPage(1)
    else goPage(pageNo.value + 1)
  }
  if (e.key === 'ArrowLeft') {
    if (phase.value === 'result' && rosterPages.value > 1) goRosterPage(-1)
    else goPage(pageNo.value - 1)
  }
  // 1～9：看第 N 位中奖人的完整回答
  if (/^[1-9]$/.test(e.key)) openWinnerAt(Number(e.key) - 1)
  if (e.code === 'Space') {
    e.preventDefault()
    togglePause()
  }
  if (e.key === 'Escape') {
    hud.value = false
    closeDetail()
  }
}

/* ---------------- 生命周期 ---------------- */
onMounted(async () => {
  // 按屏幕高度决定每屏卡片数（3 列固定，行数自适应）
  const rows = window.innerHeight >= 1000 ? 3 : 2
  perPage.value = rows * 3
  poll()
  startPaging()
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', () => {
    perPage.value = (window.innerHeight >= 1000 ? 3 : 2) * 3
  })
})

watch(
  () => settings.value.pageSeconds,
  () => startPaging()
)

// 翻页动画结束后重新测量截断情况
watch(pageNo, () => {
  // 换页会重建 DOM，把还没播完的呼吸动画标记清掉，翻回来不再重播
  if (pulseIds.value.size) pulseIds.value = new Set()
  setTimeout(measureClamped, 520)
})

// 换了一场抽奖 / 换了阶段：名单回到第一页，分页计时器跟着重起
watch(
  [() => draw.value?.id, rosterTotal, () => phase.value],
  () => {
    rosterPageNo.value = 0
    syncRosterTimer()
  }
)

onBeforeUnmount(() => {
  clearTimeout(pollTimer)
  clearInterval(pageTimer)
  clearTimeout(detailTimer)
  clearInterval(rosterTimer)
  stopRoll()
  Object.values(freshTimers).forEach(clearTimeout)
  window.removeEventListener('keydown', onKey)
})
</script>

<style scoped>
.tip {
  position: fixed;
  left: 50%;
  bottom: 8vh;
  transform: translateX(-50%);
  z-index: 260;
  padding: 0.85vw 1.6vw;
  border-radius: 99px;
  font-size: 0.95vw;
  color: #2a0603;
  background: linear-gradient(180deg, #f7e3b6, #dcb579);
  box-shadow: 0 1.4vw 3vw -1vw rgba(0, 0, 0, 0.7);
}

.net-err {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  padding: 4vw;
  background: rgba(6, 0, 1, 0.78);
  backdrop-filter: blur(10px);
}
.net-card {
  width: 50vw;
  max-width: 1080px;
  padding: 2.4vw 2.8vw 2.1vw;
  border-radius: 1.2vw;
  text-align: center;
  border: 1px solid rgba(231, 194, 125, 0.34);
  background: linear-gradient(180deg, rgba(231, 194, 125, 0.1), rgba(231, 194, 125, 0.02));
  box-shadow: 0 3vw 7vw -2vw rgba(0, 0, 0, 0.8);
}
.net-eyebrow {
  font-size: 0.72vw;
  letter-spacing: 0.4em;
  color: var(--c-danger);
}
.net-h {
  margin-top: 0.7vw;
  font-size: 2vw;
  font-weight: 800;
  color: var(--c-gold-2);
}
.net-msg {
  margin-top: 0.9vw;
  font-size: 1.12vw;
  line-height: 1.7;
  color: #fff3df;
}
.net-tip {
  margin-top: 0.9vw;
  font-size: 0.92vw;
  line-height: 1.9;
  color: rgba(255, 246, 234, 0.55);
}
.net-tip code {
  padding: 0.1vw 0.4vw;
  border-radius: 0.3vw;
  background: rgba(255, 246, 234, 0.1);
  color: var(--c-gold-2);
}
.net-btn {
  margin-top: 1.5vw;
  padding: 0.7vw 2.4vw;
  border-radius: 99px;
  font-size: 1vw;
  font-weight: 700;
  color: #3d0b00;
  background: linear-gradient(180deg, #f7e3b6, #d9b072);
}
.net-btn:hover {
  filter: brightness(1.06);
}

.screen {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: var(--c-bg-0);
  color: var(--c-ink);
  font-size: 1vw;
}

.bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  transform: scale(1.03);
  filter: saturate(1.05);
}
.bg-dim {
  position: absolute;
  inset: 0;
  background: #120204;
  transition: opacity 0.6s ease;
}
.vignette {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(70% 60% at 50% 42%, transparent 0%, rgba(6, 0, 1, 0.55) 72%, rgba(4, 0, 1, 0.92) 100%),
    linear-gradient(180deg, rgba(6, 0, 1, 0.75) 0%, transparent 22%, transparent 74%, rgba(4, 0, 1, 0.9) 100%);
}
.glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(40% 30% at 8% 0%, rgba(193, 39, 45, 0.36), transparent 70%),
    radial-gradient(36% 28% at 96% 6%, rgba(231, 194, 125, 0.14), transparent 70%);
  mix-blend-mode: screen;
  pointer-events: none;
}

/* ---------- 顶栏 ---------- */
.top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 3.2vh 3.2vw 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  z-index: 5;
}
.title-row {
  display: flex;
  align-items: baseline;
  gap: 0.9vw;
  margin-top: 0.5vw;
  white-space: nowrap;
}
.title {
  font-size: 2.45vw;
  letter-spacing: 0.1em;
  color: #fff8ec;
  text-shadow: 0 0.3vw 2vw rgba(0, 0, 0, 0.55);
}
.title-sub {
  padding-left: 0.9vw;
  border-left: 1px solid rgba(231, 194, 125, 0.28);
  font-size: 1.05vw;
  letter-spacing: 0.14em;
  color: rgba(231, 194, 125, 0.82);
}

/* ---------- 今日两问 ---------- */
.qband {
  position: absolute;
  /* 用 vw 混算，1366×768 与 1920×1080 都不会压到标题 */
  top: calc(3.2vh + 5.1vw);
  left: 3.2vw;
  right: 3.2vw;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 1.5vw;
  padding: 0.58vw 1.5vw;
  border-radius: 0.8vw;
  border: 1px solid rgba(231, 194, 125, 0.24);
  background: linear-gradient(
    90deg,
    rgba(231, 194, 125, 0.14) 0%,
    rgba(231, 194, 125, 0.045) 45%,
    rgba(231, 194, 125, 0.1) 100%
  );
  box-shadow: inset 0 0 3vw -1vw rgba(231, 194, 125, 0.35);
}
.qb-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.85vw;
  min-width: 0;
}
.qb-no {
  flex-shrink: 0;
  width: 1.95vw;
  height: 1.95vw;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 1vw;
  color: #340703;
  background: linear-gradient(180deg, #f9e8c1, #d8ad68);
  box-shadow: 0 0.4vw 1.2vw -0.4vw rgba(231, 194, 125, 0.75);
}
.qb-text {
  font-size: 1.3vw;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #fff6e6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.qb-div {
  flex-shrink: 0;
  width: 1px;
  height: 2.3vh;
  background: rgba(231, 194, 125, 0.24);
}
.top-right {
  display: flex;
  align-items: center;
  gap: 1.2vw;
}
.live-pill {
  display: flex;
  align-items: center;
  gap: 0.5vw;
  padding: 0.35vw 0.9vw;
  border-radius: 99px;
  font-size: 0.7vw;
  letter-spacing: 0.2em;
  border: 1px solid rgba(231, 194, 125, 0.35);
  color: var(--c-gold);
  background: rgba(0, 0, 0, 0.25);
}
.dot {
  width: 0.42vw;
  height: 0.42vw;
  border-radius: 50%;
  background: #ff5a4d;
  box-shadow: 0 0 0.6vw #ff5a4d;
  animation: blink 1.6s ease-in-out infinite;
}
@keyframes blink {
  50% {
    opacity: 0.35;
  }
}
.side-qr {
  align-self: center;
  flex-shrink: 0;
  margin-bottom: 0.8vw;
  padding: 0.6vw 0.6vw 0.42vw;
  border-radius: 0.7vw;
  background: linear-gradient(180deg, #f7e3b6, #e2c58c);
  box-shadow: 0 1.2vw 3vw -0.8vw rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  text-align: center;
}
.qr {
  width: 10vw !important;
  height: 10vw !important;
  display: block;
  border-radius: 0.25vw;
}
.qr-text {
  margin-top: 0.3vw;
  font-size: 0.68vw;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: #5a1d08;
}

/* ---------- 待机 ---------- */
.hero {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5vw;
  padding: 0 8vw;
  z-index: 4;
}
.qr-frame {
  padding: 1.2vw;
  border-radius: 1.2vw;
  background: linear-gradient(180deg, #fbf0d6, #e6c993);
  box-shadow: 0 2vw 5vw -1vw rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.35) inset;
}
.qr-big {
  width: 22vw !important;
  height: 22vw !important;
  display: block;
  border-radius: 0.4vw;
}
.hero-h {
  font-size: 3.3vw;
  line-height: 1.32;
  letter-spacing: 0.04em;
  color: #fff9ef;
}
.hero-p {
  margin-top: 1.3vw;
  font-size: 1.06vw;
  line-height: 2;
  color: var(--c-gold-dim);
  letter-spacing: 0.08em;
}
.hero-qs {
  margin-top: 1.5vw;
  padding-left: 1.1vw;
  border-left: 2px solid rgba(231, 194, 125, 0.4);
  display: flex;
  flex-direction: column;
  gap: 0.55vw;
}
.hero-qs div {
  display: flex;
  align-items: baseline;
  gap: 0.5vw;
  font-size: 1.5vw;
  line-height: 1.6;
  color: rgba(255, 246, 234, 0.86);
  white-space: nowrap;
}
.hero-qs i {
  font-style: normal;
  font-size: 0.9em;
  color: var(--c-gold);
}
.hero-rule {
  width: 9vw;
  height: 1px;
  margin: 1.6vw 0 0;
  background: linear-gradient(90deg, var(--c-gold-dim), transparent);
}
.hero-stats {
  display: flex;
  gap: 3vw;
  margin-top: 1.6vw;
}
.hero-go {
  margin-top: 2vw;
  padding: 0.72vw 2vw;
  border-radius: 99px;
  font-size: 0.98vw;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: rgba(255, 246, 234, 0.72);
  border: 1px solid rgba(231, 194, 125, 0.34);
  background: rgba(231, 194, 125, 0.06);
  transition: all 0.25s ease;
}
.hero-go:hover {
  color: #2a0603;
  background: linear-gradient(180deg, #f7e3b6, #d9b072);
  border-color: transparent;
}
.hero-hint {
  margin-top: 0.9vw;
  font-size: 0.78vw;
  letter-spacing: 0.06em;
  color: rgba(255, 246, 234, 0.3);
}
.hero-hint kbd {
  padding: 0.08vw 0.34vw;
  border-radius: 0.2vw;
  border: 1px solid rgba(255, 246, 234, 0.24);
  font-family: inherit;
  font-size: 0.9em;
}
.hero-stats b {
  display: block;
  font-size: 2vw;
  color: var(--c-gold-2);
  font-variant-numeric: tabular-nums;
}
.hero-stats span {
  font-size: 0.8vw;
  letter-spacing: 0.2em;
  color: var(--c-faint);
}

/* ---------- 内容墙 ---------- */
.live-wrap {
  position: absolute;
  top: calc(3.2vh + 9vw);
  bottom: 7vh;
  left: 3.2vw;
  right: 2.4vw;
  display: flex;
  gap: 1.6vw;
  z-index: 4;
}
.wall {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 1fr;
  gap: 1vw;
  min-height: 0;
}
.tile {
  position: relative;
  padding: 1.05vw 1.15vw;
  border-radius: 0.85vw;
  border: 1px solid rgba(231, 194, 125, 0.18);
  background: linear-gradient(165deg, rgba(255, 246, 234, 0.085), rgba(255, 246, 234, 0.022));
  backdrop-filter: blur(6px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: border-color 0.4s ease, background 0.4s ease, transform 0.4s ease;
}
.tile::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12%;
  bottom: 12%;
  width: 2px;
  background: linear-gradient(180deg, transparent, rgba(231, 194, 125, 0.55), transparent);
}
.tile.fresh {
  border-color: rgba(247, 227, 182, 0.75);
  background: linear-gradient(165deg, rgba(231, 194, 125, 0.22), rgba(231, 194, 125, 0.06));
  box-shadow: 0 0 2.4vw -0.4vw rgba(231, 194, 125, 0.55);
}
/* 呼吸动画单独挂在 .pulse 上：播完就摘，翻页重建 DOM 不会重播 */
.tile.fresh.pulse {
  animation: freshPulse 2.4s ease-in-out 2;
}
@keyframes freshPulse {
  50% {
    box-shadow: 0 0 3.4vw 0 rgba(231, 194, 125, 0.35);
  }
}
.tile-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.tile-code {
  font-size: 0.86vw;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--c-gold);
  font-variant-numeric: tabular-nums;
}
.tile-like {
  font-size: 0.8vw;
  color: rgba(255, 246, 234, 0.52);
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  gap: 0.2vw;
}
.heart {
  color: var(--c-red-soft);
  font-size: 0.7vw;
}
.tile-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.45vw;
}
.q-mark {
  font-style: normal;
  margin-right: 0.42vw;
  font-size: 0.86em;
  color: var(--c-gold);
  opacity: 0.85;
}
.tile-a {
  flex: 0 0 auto;
  font-size: 0.95vw;
  line-height: 1.5;
  font-weight: 600;
  color: #fffaf0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.tile-b {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  padding-top: 0.45vw;
  font-size: 0.95vw;
  line-height: 1.5;
  font-weight: 600;
  color: #fffaf0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.tile-b::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 1.6vw;
  height: 1px;
  background: linear-gradient(90deg, rgba(231, 194, 125, 0.75), transparent);
}
.tile-foot {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6vw;
}
.tile-meta {
  font-size: 0.68vw;
  letter-spacing: 0.1em;
  color: rgba(255, 246, 234, 0.3);
  font-variant-numeric: tabular-nums;
}
.tile-tail {
  font-size: 0.66vw;
  letter-spacing: 0.14em;
  color: rgba(231, 194, 125, 0.55);
}
/* 被截断的卡片：头部给一个「全文」角标，点卡片看完整内容 */
.tile-flags {
  display: flex;
  align-items: center;
  gap: 0.5vw;
}
.tile-more {
  flex-shrink: 0;
  font-size: 0.6vw;
  line-height: 1.25;
  padding: 0 0.34vw;
  border-radius: 99px;
  color: rgba(255, 240, 210, 0.92);
  border: 1px solid rgba(231, 194, 125, 0.45);
  background: rgba(231, 194, 125, 0.14);
}
.tile.clamped {
  cursor: pointer;
}
/* 被截断的那一头做个渐隐，观众一眼能看出「还有下文」，而不是像排版出错 */
.tile-a.cut,
.tile-b.cut {
  -webkit-mask-image: linear-gradient(180deg, #000 74%, transparent 100%);
  mask-image: linear-gradient(180deg, #000 74%, transparent 100%);
}

/* 全文浮层 */
.detail {
  position: fixed;
  inset: 0;
  z-index: 280;
  display: grid;
  place-items: center;
  padding: 5vh 6vw;
  background: rgba(6, 0, 1, 0.72);
  backdrop-filter: blur(8px);
}
.detail-card {
  width: min(62vw, 1200px);
  max-height: 86vh;
  overflow: auto;
  padding: 2.6vw 3vw 2.2vw;
  border-radius: 1.2vw;
  border: 1px solid rgba(231, 194, 125, 0.42);
  background: linear-gradient(168deg, rgba(58, 10, 12, 0.96), rgba(26, 3, 5, 0.97));
  box-shadow: 0 3vw 7vw -2vw rgba(0, 0, 0, 0.85);
  animation: popIn 0.28s ease-out;
}
@keyframes popIn {
  from {
    opacity: 0;
    transform: translateY(1.2vw) scale(0.985);
  }
}
.detail-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1vw;
}
.detail-code {
  font-size: 1.9vw;
  letter-spacing: 0.12em;
}
.detail-like {
  font-size: 1.1vw;
  color: rgba(255, 246, 234, 0.6);
  font-variant-numeric: tabular-nums;
}
.detail-a {
  margin-top: 1.4vw;
  font-size: 2.1vw;
  line-height: 1.55;
  font-weight: 700;
  color: #fffaf0;
  word-break: break-word;
}
.detail-b {
  margin-top: 1vw;
  font-size: 2.1vw;
  line-height: 1.55;
  font-weight: 400;
  color: rgba(255, 246, 234, 0.9);
  word-break: break-word;
}
.detail-foot {
  margin-top: 1.8vw;
  padding-top: 1vw;
  border-top: 1px solid rgba(231, 194, 125, 0.2);
  display: flex;
  justify-content: space-between;
  font-size: 0.86vw;
  letter-spacing: 0.1em;
  color: rgba(231, 194, 125, 0.7);
}
.detail-hint {
  opacity: 0.6;
}
.empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6vw;
  color: var(--c-faint);
  font-size: 1.4vw;
}
.empty span {
  font-size: 0.9vw;
  letter-spacing: 0.2em;
}

.pager {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5vw;
  height: 1.6vw;
  flex-shrink: 0;
}
.pips {
  display: flex;
  gap: 0.5vw;
}
/* 视觉上还是 3px 细条，热区靠 ::after 撑到 ~40px，鼠标/触摸都打得中 */
.pip {
  position: relative;
  width: 1.4vw;
  height: 0.16vw;
  padding: 0;
  border: 0;
  border-radius: 99px;
  background: rgba(255, 246, 234, 0.16);
  cursor: pointer;
  transition: background 0.4s ease;
}
.pip::after {
  content: '';
  position: absolute;
  left: -0.12vw;
  right: -0.12vw;
  top: -1.05vw;
  bottom: -1.05vw;
}
.pip.on {
  background: var(--c-gold);
}
.pip:hover {
  background: rgba(255, 246, 234, 0.46);
}
.pip.on:hover {
  background: var(--c-gold);
}
.pg-arrow {
  width: 1.5vw;
  height: 1.5vw;
  padding: 0;
  border: 0;
  background: none;
  color: rgba(255, 246, 234, 0.55);
  font-size: 1.5vw;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.3s ease, color 0.3s ease;
}
.pager:hover .pg-arrow {
  opacity: 1;
}
.pg-arrow:hover {
  color: var(--c-gold);
}
.pg-pause {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.68vw;
  letter-spacing: 0.16em;
  color: rgba(231, 194, 125, 0.72);
}

/* 翻页动效 */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.55s ease, transform 0.55s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(1.2vh) scale(0.995);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-1.2vh) scale(0.995);
}

/* ---------- 侧栏 ---------- */
.side {
  width: 21vw;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 1.2vw;
  border-radius: 1vw;
  border: 1px solid rgba(231, 194, 125, 0.16);
  background: linear-gradient(180deg, rgba(255, 246, 234, 0.06), rgba(255, 246, 234, 0.015));
  backdrop-filter: blur(8px);
}
.side-title h3 {
  font-size: 1.32vw;
  margin-top: 0.32vw;
  letter-spacing: 0.12em;
  color: #fff8ec;
}
.rank {
  list-style: none;
  margin: 0.85vw 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.42vw;
  flex: 1;
  overflow: hidden;
}
.rank-item {
  display: flex;
  align-items: center;
  gap: 0.7vw;
}
.rank-no {
  width: 1.32vw;
  height: 1.32vw;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 0.3vw;
  font-size: 0.78vw;
  font-weight: 800;
  color: rgba(255, 246, 234, 0.5);
  background: rgba(255, 255, 255, 0.05);
  font-variant-numeric: tabular-nums;
}
.rank-no.n1 {
  color: #3d1400;
  background: linear-gradient(170deg, #fbeecb, #d9ae5c);
}
.rank-no.n2 {
  color: #1a1a1a;
  background: linear-gradient(170deg, #f2f4f7, #b9bfc9);
}
.rank-no.n3 {
  color: #2a1200;
  background: linear-gradient(170deg, #f0cfae, #b07a45);
}
.rank-main {
  flex: 1;
  min-width: 0;
}
.rank-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5vw;
}
.rank-code {
  font-size: 0.86vw;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: rgba(255, 246, 234, 0.9);
  font-variant-numeric: tabular-nums;
}
.rank-likes {
  font-size: 0.72vw;
  color: var(--c-gold-dim);
  font-variant-numeric: tabular-nums;
}
.rank-bar {
  margin-top: 0.3vw;
  height: 0.22vw;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.07);
  overflow: hidden;
}
.rank-bar i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, rgba(193, 39, 45, 0.9), var(--c-gold));
  transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}
.rank-empty {
  font-size: 0.8vw;
  color: var(--c-faint);
  letter-spacing: 0.1em;
}
.side-foot {
  display: flex;
  justify-content: space-between;
  padding-top: 0.9vw;
  border-top: 1px solid rgba(231, 194, 125, 0.14);
  font-size: 0.72vw;
  color: var(--c-faint);
  letter-spacing: 0.1em;
}

/* ---------- 抽奖舞台 ---------- */
.stage {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(60% 52% at 50% 44%, #6d0a12 0%, #2c0409 46%, #0b0102 78%),
    #0b0102;
}
.stage-head {
  text-align: center;
  margin-bottom: 3vw;
}
.award {
  font-size: 4.2vw;
  letter-spacing: 0.2em;
  margin-top: 0.8vw;
  background: linear-gradient(180deg, #fff6e2, var(--c-gold) 58%, #b88a35);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 0 4vw rgba(231, 194, 125, 0.35);
}
.award-line {
  width: 26vw;
  height: 1px;
  margin: 1.2vw auto 0;
  background: linear-gradient(90deg, transparent, var(--c-gold-dim), transparent);
}
.roll-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.4vw;
}
.roll-cols {
  display: flex;
  gap: 2vw;
}
.roll-slot {
  width: 17vw;
  height: 8.5vw;
  display: grid;
  place-items: center;
  border-radius: 1vw;
  border: 1px solid rgba(231, 194, 125, 0.38);
  background: linear-gradient(180deg, rgba(231, 194, 125, 0.14), rgba(231, 194, 125, 0.03));
  box-shadow: inset 0 0 3vw rgba(231, 194, 125, 0.12), 0 2vw 5vw -1.5vw #000;
  overflow: hidden;
}
.roll-code {
  font-size: 4.2vw;
  letter-spacing: 0.08em;
  color: #fff4dd;
  font-variant-numeric: tabular-nums;
  filter: blur(0.02vw);
}
.cols-1 .roll-slot {
  width: 26vw;
}
.roll-hint {
  font-size: 1vw;
  letter-spacing: 0.24em;
  color: var(--c-gold-dim);
  animation: breathe 2.2s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    opacity: 0.45;
  }
}

.winners {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: stretch;
  gap: 1.6vw;
  max-width: 88vw;
}
/* 中奖人数少就把卡片放宽：字能放大，后排也看得清 */
.winners.n1 .winner {
  width: 40vw;
}
.winners.n2 .winner {
  width: 30vw;
}
.winners.n3 .winner {
  width: 24vw;
}
.winner {
  width: 24vw;
  padding: 1.8vw 1.7vw 1.5vw;
  border-radius: 1vw;
  text-align: center;
  background: linear-gradient(170deg, rgba(231, 194, 125, 0.22), rgba(231, 194, 125, 0.05));
  border: 1px solid rgba(247, 227, 182, 0.55);
  box-shadow: 0 2vw 5vw -1.5vw rgba(231, 194, 125, 0.4);
  animation: winIn 0.85s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes winIn {
  from {
    opacity: 0;
    transform: translateY(2.4vw) scale(0.9);
    filter: blur(6px);
  }
  to {
    opacity: 1;
    transform: none;
    filter: none;
  }
}
.winner-code {
  font-size: 3.4vw;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}
.winner-tail {
  margin-top: 0.34vw;
  font-size: 0.9vw;
  letter-spacing: 0.16em;
  color: rgba(255, 246, 234, 0.72);
}
.winner-qa {
  margin-top: 0.8vw;
  padding-top: 0.8vw;
  border-top: 1px solid rgba(231, 194, 125, 0.22);
  text-align: left;
}
/* 两个问题都要上大屏：同一字号，各留 5 行（远超 60 字上限），正常篇幅不会被截 */
.winner-a {
  font-size: 1.16vw;
  line-height: 1.62;
  color: rgba(255, 246, 234, 0.82);
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.winners.n1 .winner-a {
  font-size: 1.34vw;
}
.winners.n3 .winner-a {
  font-size: 1.06vw;
}
.winner-a + .winner-a {
  margin-top: 0.72vw;
}
.winner-a .q-mark {
  margin-right: 0.4vw;
  font-size: 0.92em;
}
/* 中奖名单（≥4 人）：只放牌号与尾号，牌号是唯一凭据，必须一眼看清 */
.roster-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.3vw;
  max-width: 92vw;
}
.roster {
  display: grid;
  justify-content: center;
  gap: 1.05vw;
}
.roster.c3 {
  grid-template-columns: repeat(3, 21vw);
}
.roster.c4 {
  grid-template-columns: repeat(4, 16.2vw);
}
.roster.c5 {
  grid-template-columns: repeat(5, 13.2vw);
}
/* 4～5 人只有一行，卡片放宽、字号放大，别显得空 */
.roster.wide.c4 {
  grid-template-columns: repeat(4, 17.6vw);
}
.roster.wide.c5 {
  grid-template-columns: repeat(5, 15.4vw);
}
.roster.wide .roster-card {
  padding: 1.35vw 0.6vw 1.2vw;
}
.roster.wide.c4 .roster-code {
  font-size: 2.62vw;
}
.roster.wide.c5 .roster-code {
  font-size: 2.3vw;
}
.roster-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.28vw;
  padding: 1.05vw 0.6vw 0.95vw;
  border-radius: 0.65vw;
  border: 1px solid rgba(247, 227, 182, 0.5);
  background: linear-gradient(170deg, rgba(231, 194, 125, 0.22), rgba(231, 194, 125, 0.05));
  box-shadow: 0 1.2vw 3vw -1.2vw rgba(231, 194, 125, 0.38);
  cursor: pointer;
  animation: winIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
  transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
}
.roster-card:hover {
  transform: translateY(-0.3vw) scale(1.03);
  border-color: rgba(247, 227, 182, 0.95);
  box-shadow: 0 1.6vw 3.6vw -1.2vw rgba(231, 194, 125, 0.6);
}
.roster-code {
  font-size: 2.7vw;
  letter-spacing: 0.05em;
  color: #ffe9b8;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.roster.c4 .roster-code {
  font-size: 2.35vw;
}
.roster.c5 .roster-code {
  font-size: 1.98vw;
}
.roster-tail {
  font-size: 0.8vw;
  letter-spacing: 0.12em;
  color: rgba(255, 246, 234, 0.6);
}
.roster.c5 .roster-tail {
  font-size: 0.72vw;
}
.roster-pager {
  display: flex;
  align-items: center;
  gap: 1.1vw;
}
.rp-btn {
  width: 2.2vw;
  height: 2.2vw;
  border-radius: 50%;
  border: 1px solid rgba(231, 194, 125, 0.35);
  background: rgba(255, 246, 234, 0.06);
  color: var(--c-ink);
  font-size: 1.2vw;
  line-height: 1;
}
.rp-btn:hover {
  background: rgba(231, 194, 125, 0.22);
}
.rp-no {
  font-size: 0.85vw;
  letter-spacing: 0.18em;
  color: var(--c-gold-dim);
  font-variant-numeric: tabular-nums;
}
.roster-hint {
  font-size: 0.82vw;
  letter-spacing: 0.14em;
  color: var(--c-faint);
}
.stage-foot {
  margin-top: 2.6vw;
  font-size: 0.9vw;
  letter-spacing: 0.16em;
  color: var(--c-faint);
}

.draw-enter-active,
.draw-leave-active {
  transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), filter 0.55s ease;
}
.draw-enter-from {
  transform: scale(1.05);
  filter: blur(10px);
  opacity: 1;
}
.draw-leave-to {
  transform: scale(0.98);
  filter: blur(6px);
  opacity: 0;
}
.phase-drawing .top,
.phase-drawing .live-wrap,
.phase-drawing .foot,
.phase-result .top,
.phase-result .foot,
.phase-popular .top,
.phase-popular .qband,
.phase-popular .live-wrap,
.phase-popular .foot {
  opacity: 0;
  transition: opacity 0.4s ease;
}

/* ---------- 人气奖 ---------- */
.popular-stage {
  background:
    radial-gradient(58% 52% at 50% 42%, #6a4a12 0%, #3a1f05 42%, #100501 78%),
    #100501;
}
/* 人气奖：第 1 名大卡 + 第 2～6 名竖排小条（前 N 名由后台设置决定） */
.pop-wrap {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 1.8vw;
  width: 78vw;
}
.pop-wrap.solo {
  width: auto;
}
.pop-main {
  flex: 0 0 44vw;
  padding: 2.1vw 2.4vw 1.9vw;
  border-radius: 1vw;
  border: 1px solid rgba(247, 227, 182, 0.5);
  background: linear-gradient(165deg, rgba(231, 194, 125, 0.16), rgba(231, 194, 125, 0.03));
  box-shadow: 0 2.4vw 6vw -2vw rgba(231, 194, 125, 0.45);
  animation: popIn 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.pop-wrap.solo .pop-main {
  width: 46vw;
  flex: 0 0 auto;
}
.pop-rest {
  flex: 1 1 0;
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.72vw;
}
.pop-rest li {
  display: flex;
  align-items: baseline;
  gap: 0.7vw;
  padding: 0.8vw 1.1vw;
  border-radius: 0.55vw;
  border: 1px solid rgba(247, 227, 182, 0.26);
  background: linear-gradient(120deg, rgba(231, 194, 125, 0.12), rgba(231, 194, 125, 0.03));
  cursor: pointer;
  animation: winIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  transition: transform 0.22s ease, border-color 0.22s ease;
}
.pop-rest li:hover {
  transform: translateX(0.25vw);
  border-color: rgba(247, 227, 182, 0.7);
}
.pr-rank {
  flex: 0 0 1.4vw;
  font-size: 1.05vw;
  color: rgba(255, 246, 234, 0.45);
  font-variant-numeric: tabular-nums;
}
.pr-code {
  font-size: 1.72vw;
  color: #ffe9b8;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}
.pr-tail {
  font-size: 0.76vw;
  letter-spacing: 0.1em;
  color: rgba(255, 246, 234, 0.5);
}
.pr-like {
  margin-left: auto;
  font-size: 0.86vw;
  letter-spacing: 0.08em;
  color: rgba(231, 194, 125, 0.85);
}
.pop-rank {
  font-size: 1.02vw;
  letter-spacing: 0.2em;
  color: var(--c-gold);
  flex-shrink: 0;
  align-self: center;
}
.pop-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1.5vw;
  padding-bottom: 1.2vw;
  border-bottom: 1px solid rgba(231, 194, 125, 0.22);
}
.pop-code {
  font-size: 4.4vw;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}
.pop-like {
  flex-shrink: 0;
  font-size: 0.98vw;
  letter-spacing: 0.14em;
  color: rgba(255, 246, 234, 0.6);
}
.pop-like b {
  margin-right: 0.25vw;
  font-size: 2.4vw;
  color: #ffe9b8;
}
.pop-a {
  margin-top: 1.4vw;
  font-size: 1.7vw;
  line-height: 1.5;
  font-weight: 700;
  color: #fffaf0;
  word-break: break-word;
}
.pop-b {
  margin-top: 0.7vw;
  font-size: 1.7vw;
  line-height: 1.5;
  font-weight: 700;
  color: #fffaf0;
  word-break: break-word;
}
.pop-a .q-mark,
.pop-b .q-mark {
  font-size: 0.8em;
}
.pop-foot {
  margin-top: 1.5vw;
  padding-top: 1vw;
  border-top: 1px solid rgba(231, 194, 125, 0.18);
  display: flex;
  justify-content: space-between;
  font-size: 0.9vw;
  letter-spacing: 0.12em;
  color: rgba(231, 194, 125, 0.72);
}
.pop-empty {
  font-size: 1.2vw;
  color: rgba(255, 246, 234, 0.5);
}

/* ---------- 底栏 ---------- */
.foot {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1.5vh 3.2vw;
  font-size: 0.74vw;
  letter-spacing: 0.06em;
  color: rgba(255, 246, 234, 0.34);
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 1.4vw;
}
.legend {
  display: inline-flex;
  align-items: center;
  gap: 0.5vw;
}
.legend i {
  font-style: normal;
  font-size: 0.92vw;
  color: var(--c-gold);
  opacity: 0.8;
}
.legend-sep {
  width: 1px;
  height: 0.9vw;
  background: rgba(231, 194, 125, 0.22);
}

/* ---------- 控场浮层 ---------- */
.hud {
  position: fixed;
  left: 50%;
  bottom: 2.4vh;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.6vw;
  padding: 0.55vw 0.7vw;
  border-radius: 99px;
  background: rgba(10, 2, 3, 0.9);
  border: 1px solid rgba(231, 194, 125, 0.3);
  backdrop-filter: blur(10px);
  z-index: 60;
  font-size: 0.72vw;
}
.hud button {
  padding: 0.45vw 0.9vw;
  border-radius: 99px;
  background: rgba(255, 246, 234, 0.08);
  color: var(--c-ink);
  letter-spacing: 0.06em;
}
.hud button:hover {
  background: rgba(231, 194, 125, 0.22);
}
.hud-phase {
  padding: 0 0.6vw;
  color: var(--c-gold);
  letter-spacing: 0.14em;
}
.hud-tip {
  padding: 0 0.6vw;
  color: var(--c-faint);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
