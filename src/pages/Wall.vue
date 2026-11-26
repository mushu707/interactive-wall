<template>
  <div class="m-page wall-page">
    <div class="m-wrap">
      <header class="head">
        <div class="eyebrow">WALL · 内容墙</div>
        <div class="row">
          <h1 class="display gold-text h1">今晚的声音</h1>
          <div class="tickets" :class="{ empty: remaining === 0 }">
            <span class="t-label">我的票</span>
            <span class="t-num">{{ remaining }}</span>
          </div>
        </div>
        <p class="sub">把票投给最打动你的那几句 · 每人 {{ votesPerUser }} 票，投出不可撤回</p>
        <div class="legend-row" v-if="state.config">
          <span class="lg"><i>①</i><em>{{ state.config.q1 }}</em></span>
          <span class="lg"><i>②</i><em>{{ state.config.q2 }}</em></span>
        </div>
        <div class="tabs">
          <button class="tab" :class="{ on: sort === 'hot' }" @click="sort = 'hot'">最热</button>
          <button class="tab" :class="{ on: sort === 'new' }" @click="sort = 'new'">最新</button>
          <span class="count faint">{{ cards.length }} 条</span>
        </div>
      </header>

      <p v-if="remaining === 0 && cards.length" class="empty-tip fade-up">
        你的 {{ votesPerUser }} 票已经投完啦，去看大屏吧
      </p>

      <section class="list">
        <article v-for="(c, i) in sorted" :key="c.id" class="wcard" :class="{ top: sort === 'hot' && i < 3 && c.likes > 0 }">
          <div class="wc-head">
            <span class="wc-code">{{ c.code }}</span>
            <span class="wc-likes" :class="{ hot: c.likes > 0 }">♥ {{ c.likes }}</span>
          </div>
          <p class="wc-a"><i class="q-mark">①</i>{{ c.a1 }}</p>
          <p class="wc-b"><i class="q-mark">②</i>{{ c.a2 }}</p>
          <div class="wc-foot">
            <span class="wc-time faint">{{ timeAgo(c.at) }}</span>
            <div class="wc-right">
              <button class="report-btn" @click="report(c)">举报</button>
              <button
              class="vote-btn"
              :class="{ done: c.mine }"
              :disabled="c.mine || remaining === 0 || votingId === c.id"
              @click="vote(c)"
            >
                {{ c.mine ? '已投' : remaining === 0 ? '票已用完' : '投一票' }}
              </button>
            </div>
          </div>
        </article>
      </section>

      <p v-if="!cards.length" class="empty-tip">还没有内容上墙，你是第一个？</p>

      <div class="bottom-bar">
        <button class="btn btn-ghost btn-sm" @click="$router.push('/me')">我的牌号</button>
        <button class="btn btn-gold btn-sm" @click="$router.push('/submit')">我也说一句</button>
      </div>
    </div>

    <transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api, deviceId } from '../api.js'
import { loadConfig, state } from '../state.js'

const cards = ref([])
const votesPerUser = ref(3)
const remaining = ref(3)
const sort = ref('hot')
const votingId = ref('')
const toast = ref('')

let timer = null
let toastTimer = null

const sorted = computed(() => {
  const arr = cards.value.slice()
  if (sort.value === 'hot') {
    arr.sort((a, b) => b.likes - a.likes || new Date(a.at) - new Date(b.at))
  } else {
    arr.sort((a, b) => new Date(b.at) - new Date(a.at))
  }
  return arr
})

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return '刚刚'
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前'
  return Math.floor(s / 3600) + ' 小时前'
}

async function report(c) {
  if (!confirm('举报这条内容不合适？管理员会复核。')) return
  try {
    await api('/public/report', { method: 'POST', body: { id: c.id } })
    showToast('已收到举报，谢谢')
  } catch (e) {
    showToast(e.message)
  }
}

function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2200)
}

async function load(silent = false) {
  try {
    const d = await api(`/public/wall?voterKey=${encodeURIComponent(deviceId())}`)
    cards.value = d.cards
    remaining.value = d.remaining
    votesPerUser.value = d.votesPerUser
  } catch (e) {
    if (!silent) showToast(e.message)
  }
}

async function vote(c) {
  votingId.value = c.id
  try {
    const d = await api('/public/votes', {
      method: 'POST',
      body: { submissionId: c.id, voterKey: deviceId() }
    })
    c.likes = d.likes
    c.mine = true
    remaining.value = d.remaining
    showToast('投票成功，谢谢你的喜欢')
  } catch (e) {
    if (e.status === 409) {
      c.mine = true
      showToast('这一条你已经投过了')
    } else {
      showToast(e.message)
    }
  } finally {
    votingId.value = ''
  }
}

onMounted(async () => {
  await loadConfig()
  await load()
  timer = setInterval(() => load(true), 8000)
})

onBeforeUnmount(() => {
  clearInterval(timer)
  clearTimeout(toastTimer)
})
</script>

<style scoped>
.wall-page {
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
}
.head {
  padding-top: 34px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}
.h1 {
  font-size: 24px;
}
.sub {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--c-muted);
  line-height: 1.7;
}

.tickets {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 99px;
  border: 1px solid var(--c-line-strong);
  background: rgba(231, 194, 125, 0.08);
  white-space: nowrap;
}
.tickets.empty {
  opacity: 0.45;
}
.t-label {
  font-size: 11px;
  color: var(--c-gold-dim);
}
.t-num {
  font-size: 20px;
  font-weight: 800;
  color: var(--c-gold-2);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
}
.tab {
  padding: 6px 14px;
  border-radius: 99px;
  font-size: 13px;
  color: var(--c-muted);
  border: 1px solid transparent;
}
.tab.on {
  color: var(--c-gold-2);
  border-color: var(--c-line-strong);
  background: rgba(231, 194, 125, 0.1);
}
.count {
  margin-left: auto;
  font-size: 12px;
}

.list {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wcard {
  padding: 15px 16px 12px;
  border-radius: 14px;
  border: 1px solid var(--c-line);
  background: rgba(255, 246, 234, 0.035);
  transition: border-color 0.2s ease;
}
.wcard.top {
  border-color: rgba(231, 194, 125, 0.42);
  background: linear-gradient(180deg, rgba(231, 194, 125, 0.09), rgba(255, 246, 234, 0.02));
}
.wc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wc-code {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--c-gold);
  font-variant-numeric: tabular-nums;
}
.wc-likes {
  font-size: 12px;
  color: var(--c-faint);
  font-variant-numeric: tabular-nums;
}
.wc-likes.hot {
  color: var(--c-red-soft);
}
.legend-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 10px;
}
.lg {
  display: flex;
  gap: 6px;
  font-size: 11.5px;
  line-height: 1.5;
  color: rgba(255, 246, 234, 0.34);
  min-width: 0;
}
.lg i {
  font-style: normal;
  color: var(--c-gold);
  opacity: 0.75;
  flex-shrink: 0;
}
.lg em {
  font-style: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.q-mark {
  font-style: normal;
  margin-right: 5px;
  font-size: 0.9em;
  color: var(--c-gold);
  opacity: 0.8;
}
.wc-a {
  margin-top: 9px;
  font-size: 15px;
  line-height: 1.65;
  font-weight: 600;
  word-break: break-word;
}
.wc-b {
  margin-top: 8px;
  font-size: 15px;
  line-height: 1.65;
  font-weight: 600;
  word-break: break-word;
}
.wc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}
.wc-time {
  font-size: 11px;
}
.wc-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.report-btn {
  font-size: 11px;
  color: var(--c-faint);
  padding: 4px 2px;
}
.report-btn:hover {
  color: var(--c-danger);
}
.vote-btn {
  padding: 6px 16px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 700;
  color: #4a1c05;
  background: linear-gradient(170deg, #fbeecb, var(--c-gold) 55%, #c9a253);
  box-shadow: 0 6px 16px -8px rgba(231, 194, 125, 0.7);
}
.vote-btn.done {
  background: none;
  color: var(--c-faint);
  border: 1px solid var(--c-line);
  box-shadow: none;
}
.vote-btn:disabled:not(.done) {
  background: rgba(255, 246, 234, 0.06);
  color: var(--c-faint);
  box-shadow: none;
}

.empty-tip {
  margin-top: 26px;
  text-align: center;
  font-size: 13px;
  color: var(--c-muted);
  line-height: 1.7;
}

.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
  display: flex;
  gap: 10px;
  justify-content: center;
  background: linear-gradient(180deg, transparent, rgba(10, 2, 3, 0.86) 32%, rgba(10, 2, 3, 0.98));
  backdrop-filter: blur(6px);
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 92px;
  transform: translateX(-50%);
  padding: 10px 18px;
  border-radius: 99px;
  font-size: 13px;
  background: rgba(255, 246, 234, 0.94);
  color: #3a0d06;
  font-weight: 600;
  box-shadow: 0 12px 30px -12px rgba(0, 0, 0, 0.8);
  z-index: 99;
  white-space: nowrap;
  max-width: 88vw;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
