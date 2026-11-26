<template>
  <div class="m-page">
    <div class="m-wrap">
      <header class="head">
        <div class="eyebrow">MY TICKET</div>
        <h1 class="display gold-text h1">{{ mine ? '我的牌号' : '找回牌号' }}</h1>
        <div class="hairline" style="margin-top: 16px" />
      </header>

      <!-- 没有本地记录：找回 -->
      <section v-if="!mine" class="fade-up find-box">
        <p class="tip">
          换过手机、清过缓存都没关系。输入你提交时填的手机尾号 4 位，就能找回牌号。
        </p>
        <div class="field">
          <span class="field-label">手机尾号 4 位</span>
          <input
            v-model="findTail"
            class="input tail-input"
            inputmode="numeric"
            maxlength="4"
            placeholder="0000"
            @input="findTail = findTail.replace(/\D/g, '').slice(0, 4)"
          />
        </div>
        <button class="btn btn-gold btn-block" :disabled="finding" @click="doFind">
          {{ finding ? '查找中…' : '找回我的牌号' }}
        </button>

        <div v-if="hits.length" class="hits">
          <div class="diamond" style="margin: 20px 0 14px"><span class="faint">找到 {{ hits.length }} 条</span></div>
          <p v-if="hits.length > 1" class="tip dup-tip">
            这个尾号有 {{ hits.length }} 条记录——同尾号很正常，但牌号各不相同。点内容是你写的那条。
          </p>
          <button v-for="h in hits" :key="h.id" class="hit" @click="pick(h)">
            <span class="hit-code">{{ h.code }}</span>
            <span class="hit-main">
              <span class="hit-preview">{{ h.preview }}…</span>
              <span v-if="h.at" class="hit-at">{{ fmtTime(h.at) }} 提交</span>
            </span>
            <span class="hit-likes">♥ {{ h.likes }}</span>
          </button>
        </div>
        <p v-if="findDone && !hits.length" class="tip err">没找到这个尾号的记录，确认一下是不是填错了？</p>

        <div class="diamond" style="margin: 26px 0 18px"><span class="faint">还没有提交过</span></div>
        <button class="btn btn-ghost btn-block" @click="$router.push('/submit')">去填写</button>
      </section>

      <!-- 有记录 -->
      <template v-else>
        <section class="ticket fade-up">
          <div class="ticket-top">
            <span class="ticket-label">牌号</span>
            <span class="badge" :class="statusClass">{{ statusText }}</span>
          </div>
          <div class="ticket-code display">{{ mine.code }}</div>

          <div class="stats">
            <div class="stat">
              <b>{{ item?.likes ?? 0 }}</b>
              <span>获得点赞</span>
            </div>
            <div class="stat-line" />
            <div class="stat">
              <b>{{ item?.rank ? '#' + item.rank : '—' }}</b>
              <span>当前排名</span>
            </div>
            <div class="stat-line" />
            <div class="stat">
              <b>{{ item?.tail || '—' }}</b>
              <span>手机尾号</span>
            </div>
          </div>
        </section>

        <section v-if="item" class="answers">
          <div class="ans">
            <div class="ans-q"><span class="q-no">01</span>{{ cfg.q1 }}</div>
            <p class="ans-a">{{ item.a1 }}</p>
          </div>
          <div class="ans">
            <div class="ans-q"><span class="q-no">02</span>{{ cfg.q2 }}</div>
            <p class="ans-a">{{ item.a2 }}</p>
          </div>
        </section>

        <!-- 编辑 -->
        <section v-if="canEdit" class="edit-box">
          <button v-if="!editing" class="btn btn-ghost btn-block btn-sm" @click="startEdit">
            改一下我的答案（{{ editLeft }} 内可改）
          </button>
          <div v-else class="edit-form">
            <textarea v-model="editA1" class="textarea" :maxlength="maxLen" rows="3" />
            <textarea v-model="editA2" class="textarea" :maxlength="maxLen" rows="3" />
            <p v-if="editErr" class="err">{{ editErr }}</p>
            <div style="display: flex; gap: 10px">
              <button class="btn btn-gold" style="flex: 1" :disabled="saving" @click="saveEdit">
                {{ saving ? '保存中…' : '保存' }}
              </button>
              <button class="btn btn-ghost" @click="editing = false">取消</button>
            </div>
          </div>
        </section>

        <div class="actions">
          <button class="btn btn-red" style="flex: 1" @click="$router.push('/wall')">去看看别人的，顺手投票</button>
        </div>

        <p class="foot-hint faint">
          换设备了？在 <a class="link" @click="$router.push('/me?find=1')">找回页</a> 用尾号重新关联。
        </p>
      </template>
    </div>

    <!-- 中奖全屏提醒 -->
    <transition name="win">
      <div v-if="wonBanner" class="win-mask" @click="dismissWin">
        <div class="win-card">
          <div class="eyebrow">CONGRATULATIONS</div>
          <div class="win-award">{{ wonBanner.awardName }}</div>
          <div class="win-code display">{{ mine.code }}</div>
          <div class="win-tail">手机尾号 {{ item?.tail }}</div>
          <div class="win-line" />
          <p class="win-tip">你中奖了！请到领奖处出示这个牌号</p>
          <button class="btn btn-gold btn-block" @click="dismissWin">知道了</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, mySubmission, saveMySubmission, clearMySubmission } from '../api.js'
import { loadConfig, state } from '../state.js'

const route = useRoute()
const router = useRouter()
const cfg = computed(() => state.config || { q1: '', q2: '', maxLen: 60 })
const maxLen = computed(() => cfg.value.maxLen || 60)

const mine = ref(null)
const item = ref(null)
const canEdit = ref(false)
const editLeft = ref('')

const wonBanner = ref(null)

const findTail = ref('')
const finding = ref(false)
const findDone = ref(false)
const hits = ref([])

const editing = ref(false)
const editA1 = ref('')
const editA2 = ref('')
const editErr = ref('')
const saving = ref(false)

let timer = null

const statusText = computed(() => {
  const s = item.value?.hidden ? 'hidden' : item.value?.status
  return s === 'approved' ? '已上墙' : s === 'pending' ? '审核中' : s === 'rejected' ? '未通过' : '已遮蔽'
})
const statusClass = computed(() => (item.value?.status === 'approved' && !item.value?.hidden ? 'badge-ok' : 'badge-red'))

function fmtLeft(ms) {
  if (ms <= 0) return '已结束'
  const m = Math.ceil(ms / 60000)
  return m <= 1 ? '不到 1 分钟' : `剩 ${m} 分钟`
}

async function refresh() {
  if (!mine.value) return
  try {
    const d = await api(`/public/submissions/${mine.value.id}`)
    item.value = d.item
    canEdit.value = d.canEdit
    // 中奖提醒：本地记录过就不重复弹
    const seen = localStorage.getItem('ly_won_seen') || ''
    const w = (d.won || []).find((x) => x.id !== seen)
    if (w) wonBanner.value = w
    editLeft.value = fmtLeft(new Date(d.item.editableUntil) - Date.now())
    // 同步状态到本地
    const local = mySubmission()
    if (local) {
      local.status = d.item.status
      local.code = d.item.code
      saveMySubmission(local)
    }
  } catch (e) {
    if (e.status === 404) {
      clearMySubmission()
      mine.value = null
    }
  }
}

onMounted(async () => {
  await loadConfig()
  mine.value = mySubmission()
  if (!mine.value) {
    if (route.query.find !== '1') {
      // 没有本地记录，直接展示找回
    }
  } else {
    await refresh()
    timer = setInterval(refresh, 5000)
  }
})

onBeforeUnmount(() => clearInterval(timer))

async function doFind() {
  findDone.value = false
  hits.value = []
  if (!/^\d{4}$/.test(findTail.value)) return
  finding.value = true
  try {
    const d = await api('/public/find', { method: 'POST', body: { tail: findTail.value } })
    hits.value = d.items
    findDone.value = true
  } catch {
    findDone.value = true
  } finally {
    finding.value = false
  }
}

function fmtTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`
}

function pick(h) {
  saveMySubmission({ id: h.id, code: h.code, editToken: h.editToken, status: h.status, at: Date.now() })
  mine.value = mySubmission()
  router.replace('/me')
  refresh()
}

function dismissWin() {
  if (wonBanner.value) {
    try {
      localStorage.setItem('ly_won_seen', wonBanner.value.id)
    } catch {}
    wonBanner.value = null
  }
}

function startEdit() {
  editing.value = true
  editA1.value = item.value.a1
  editA2.value = item.value.a2
}

async function saveEdit() {
  editErr.value = ''
  if (!editA1.value.trim() || !editA2.value.trim()) {
    editErr.value = '两个都要填哦'
    return
  }
  saving.value = true
  try {
    await api(`/public/submissions/${mine.value.id}`, {
      method: 'PATCH',
      body: { a1: editA1.value, a2: editA2.value, editToken: mine.value.editToken }
    })
    editing.value = false
    await refresh()
  } catch (e) {
    editErr.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.head {
  padding-top: 42px;
}
.h1 {
  font-size: 26px;
  margin-top: 10px;
}

.ticket {
  margin-top: 26px;
  padding: 22px 20px 18px;
  border-radius: 18px;
  background:
    radial-gradient(120% 90% at 50% -20%, rgba(231, 194, 125, 0.16), transparent 60%),
    linear-gradient(180deg, rgba(255, 246, 234, 0.07), rgba(255, 246, 234, 0.02));
  border: 1px solid var(--c-line-strong);
}
.ticket-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ticket-label {
  font-size: 12px;
  letter-spacing: 0.3em;
  color: var(--c-gold-dim);
}
.ticket-code {
  font-size: 48px;
  text-align: center;
  margin: 10px 0 18px;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(178deg, #fff6e2 4%, var(--c-gold) 52%, #b8913f 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  letter-spacing: 0.06em;
}
.stats {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--c-line);
}
.stat {
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.stat b {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.stat span {
  font-size: 11px;
  color: var(--c-faint);
}
.stat-line {
  width: 1px;
  height: 26px;
  background: var(--c-line);
}

.answers {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ans {
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(255, 246, 234, 0.035);
  border: 1px solid var(--c-line);
}
.ans-q {
  font-size: 12px;
  color: var(--c-gold-dim);
  display: flex;
  gap: 7px;
  line-height: 1.5;
}
.q-no {
  font-variant-numeric: tabular-nums;
  font-weight: 800;
}
.ans-a {
  margin-top: 8px;
  font-size: 15px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.edit-box {
  margin-top: 16px;
}
.edit-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.err {
  color: var(--c-danger);
  font-size: 13px;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.foot-hint {
  margin-top: 20px;
  text-align: center;
  font-size: 12px;
}
.link {
  color: var(--c-gold);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.win-mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 24px;
  background: radial-gradient(80% 60% at 50% 40%, rgba(120, 12, 18, 0.96), rgba(6, 0, 1, 0.98));
  backdrop-filter: blur(6px);
}
.win-card {
  width: 100%;
  max-width: 340px;
  padding: 32px 24px 24px;
  border-radius: 20px;
  text-align: center;
  border: 1px solid rgba(247, 227, 182, 0.6);
  background: linear-gradient(180deg, rgba(231, 194, 125, 0.16), rgba(231, 194, 125, 0.03));
  box-shadow: 0 30px 80px -30px rgba(231, 194, 125, 0.5);
  animation: popIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes popIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(14px);
  }
}
.win-award {
  margin-top: 10px;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: var(--c-gold-2);
}
.win-code {
  font-size: 54px;
  margin: 10px 0 4px;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(178deg, #fff6e2, var(--c-gold) 55%, #b8913f);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.win-tail {
  font-size: 13px;
  color: var(--c-muted);
  letter-spacing: 0.1em;
}
.win-line {
  height: 1px;
  margin: 20px 0 16px;
  background: linear-gradient(90deg, transparent, var(--c-gold-dim), transparent);
}
.win-tip {
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--c-ink);
  margin-bottom: 18px;
}
.win-enter-active,
.win-leave-active {
  transition: opacity 0.3s ease;
}
.win-enter-from,
.win-leave-to {
  opacity: 0;
}

/* 找回 */
.find-box {
  margin-top: 26px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.tip {
  font-size: 14px;
  line-height: 1.8;
  color: var(--c-muted);
}
.tip.err {
  color: var(--c-danger);
}
.tail-input {
  text-align: center;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.5em;
  text-indent: 0.5em;
  font-variant-numeric: tabular-nums;
}
.hits {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hit {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 14px;
  border-radius: 12px;
  border: 1px solid var(--c-line);
  background: rgba(255, 246, 234, 0.04);
  text-align: left;
}
.hit-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hit-at {
  font-size: 11px;
  color: var(--c-faint);
  font-variant-numeric: tabular-nums;
}
.dup-tip {
  margin: 0 0 4px;
  font-size: 12.5px;
  line-height: 1.6;
}
.hit:active {
  background: rgba(255, 246, 234, 0.09);
}
.hit-code {
  font-weight: 800;
  color: var(--c-gold);
  font-variant-numeric: tabular-nums;
}
.hit-preview {
  font-size: 13px;
  color: var(--c-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hit-likes {
  font-size: 12px;
  color: var(--c-faint);
}
</style>
