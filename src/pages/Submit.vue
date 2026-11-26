<template>
  <div class="m-page">
    <div class="m-wrap">
      <header class="head">
        <div class="eyebrow">SCAN TO JOIN</div>
        <h1 class="title display gold-text">{{ cfg.title }}</h1>
        <p class="sub">{{ cfg.subtitle }}</p>
        <div class="hairline" style="margin-top: 18px" />
      </header>

      <!-- 已提交 -->
      <section v-if="done" class="ticket fade-up">
        <div class="ticket-top">
          <span class="ticket-label">你的牌号</span>
          <span class="badge" :class="done.status === 'approved' ? 'badge-ok' : ''">
            {{ done.status === 'approved' ? '已上墙' : '审核中' }}
          </span>
        </div>
        <div class="ticket-code display">{{ done.code }}</div>
        <p class="ticket-hint">
          记住这个牌号。抽奖时中奖，大屏会显示它和你的手机尾号。
        </p>
        <p v-if="done.tailDup > 0" class="ticket-note">
          这个尾号还有 {{ done.tailDup }} 位同事，领奖时请以<strong>牌号</strong>为准，尾号只作二次确认。
        </p>
        <div class="ticket-actions">
          <button class="btn btn-gold" style="flex: 1" @click="go('/me')">查看我的</button>
          <button class="btn btn-ghost" style="flex: 1" @click="go('/wall')">去投票</button>
        </div>
      </section>

      <!-- 填写 -->
      <form v-else class="form fade-up" @submit.prevent="submit">
        <div class="q" v-for="(q, i) in questions" :key="i">
          <div class="q-head">
            <span class="q-no">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="q-text">{{ q.text }}</span>
          </div>
          <textarea
            v-model="q.value"
            class="textarea"
            :maxlength="maxLen"
            :placeholder="i === 0 ? '把那个一直想不通的问题写下来…' : '比如：靠一群不肯认输的人'"
            rows="3"
          />
          <div class="q-foot">
            <span class="counter">{{ q.value.length }}/{{ maxLen }}</span>
          </div>
        </div>

        <div class="field tail" v-if="cfg.requireTail">
          <span class="field-label">手机尾号 4 位</span>
          <input
            v-model="tail"
            class="input tail-input"
            inputmode="numeric"
            maxlength="4"
            placeholder="0000"
            @input="tail = tail.replace(/\D/g, '').slice(0, 4)"
          />
          <span class="hint">只用于中奖时确认是谁，不会公开显示</span>
        </div>

        <p v-if="error" class="err">{{ error }}</p>

        <button class="btn btn-gold btn-block submit-btn" :disabled="busy">
          {{ busy ? '提交中…' : '提交上墙' }}
        </button>
      </form>

      <footer class="foot">
        <span class="faint">已经提交过？</span>
        <a class="link" @click="go('/me?find=1')">用尾号找回牌号</a>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, deviceId, mySubmission, saveMySubmission } from '../api.js'
import { loadConfig, state } from '../state.js'

const router = useRouter()
const cfg = computed(() => state.config || { title: '互动墙', subtitle: '', q1: '', q2: '', maxLen: 60, requireTail: true })
const maxLen = computed(() => cfg.value.maxLen || 60)

const questions = reactive([
  { text: '', value: '' },
  { text: '', value: '' }
])
const tail = ref('')
const busy = ref(false)
const error = ref('')
const done = ref(null)

function go(p) {
  router.push(p)
}

onMounted(async () => {
  await loadConfig()
  questions[0].text = cfg.value.q1
  questions[1].text = cfg.value.q2

  const mine = mySubmission()
  if (mine && mine.code) {
    done.value = { code: mine.code, status: mine.status || 'approved' }
  }
})

async function submit() {
  error.value = ''
  const a1 = questions[0].value.trim()
  const a2 = questions[1].value.trim()
  if (!a1 || !a2) {
    error.value = '两个问题都答一下嘛'
    return
  }
  if (cfg.value.requireTail && !/^\d{4}$/.test(tail.value)) {
    error.value = '请填写手机号后 4 位'
    return
  }
  busy.value = true
  try {
    const d = await api('/public/submissions', {
      method: 'POST',
      body: { a1, a2, tail: tail.value, deviceId: deviceId() }
    })
    saveMySubmission({ id: d.id, code: d.code, editToken: d.editToken, status: d.status, at: Date.now() })
    done.value = { code: d.code, status: d.status, tailDup: d.tailDup || 0 }
  } catch (e) {
    if (e.status === 409 && e.data?.code) {
      saveMySubmission({
        id: e.data.id,
        code: e.data.code,
        editToken: e.data.editToken,
        status: 'approved',
        at: Date.now()
      })
      done.value = { code: e.data.code, status: 'approved' }
    } else {
      error.value = e.message
    }
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.head {
  padding-top: 34px;
  text-align: center;
}

.title {
  margin-top: 14px;
  font-size: 34px;
  line-height: 1.25;
}

.sub {
  margin-top: 10px;
  font-size: 14px;
  color: var(--c-muted);
  letter-spacing: 0.04em;
}

.form {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.q {
  position: relative;
}

.q-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.q-no {
  font-size: 12px;
  font-weight: 800;
  color: var(--c-gold-dim);
  letter-spacing: 0.12em;
  padding-top: 3px;
  font-variant-numeric: tabular-nums;
}

.q-text {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  flex: 1;
}

.q-foot {
  margin-top: 6px;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.counter {
  color: rgba(255, 246, 234, 0.4);
}

.tail {
  margin-top: 2px;
}
.tail-input {
  text-align: center;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.5em;
  text-indent: 0.5em;
  font-variant-numeric: tabular-nums;
  padding: 14px;
}

.hint {
  font-size: 12px;
  color: var(--c-faint);
}

.err {
  color: var(--c-danger);
  font-size: 14px;
  text-align: center;
}

.submit-btn {
  height: 54px;
  font-size: 17px;
  letter-spacing: 0.24em;
  margin-top: 4px;
}

/* 牌号小票 */
.ticket {
  margin-top: 34px;
  padding: 26px 22px 22px;
  border-radius: 18px;
  background:
    radial-gradient(120% 90% at 50% -20%, rgba(231, 194, 125, 0.18), transparent 60%),
    linear-gradient(180deg, rgba(255, 246, 234, 0.07), rgba(255, 246, 234, 0.02));
  border: 1px solid var(--c-line-strong);
  box-shadow: 0 24px 60px -30px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  text-align: center;
}

.ticket-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ticket-label {
  font-size: 12px;
  letter-spacing: 0.3em;
  color: var(--c-gold-dim);
}

.ticket-code {
  font-size: 62px;
  margin: 16px 0 6px;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(178deg, #fff6e2 4%, var(--c-gold) 52%, #b8913f 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  letter-spacing: 0.08em;
}

.ticket-hint {
  font-size: 13px;
  color: var(--c-muted);
  line-height: 1.7;
  padding: 0 6px;
}

.ticket-note {
  margin: 10px 6px 0;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid rgba(201, 162, 75, 0.42);
  background: rgba(201, 162, 75, 0.1);
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--c-ink);
}

.ticket-note strong {
  color: var(--c-gold);
}

.ticket-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.foot {
  margin-top: 34px;
  text-align: center;
  font-size: 13px;
}

.link {
  color: var(--c-gold);
  margin-left: 6px;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--c-gold-dim);
}
</style>
