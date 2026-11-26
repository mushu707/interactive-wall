<template>
  <div class="admin">
    <!-- 登录 -->
    <div v-if="!admin.authed" class="login-wrap">
      <div class="login-card fade-up">
        <div class="eyebrow">CONTROL ROOM</div>
        <h1 class="display gold-text login-title">控场后台</h1>
        <p class="login-sub">输入管理密码进入</p>
        <input
          v-model="password"
          class="input"
          type="password"
          placeholder="管理密码"
          autocomplete="current-password"
          @keyup.enter="doLogin"
        />
        <p v-if="admin.error" class="err">{{ admin.error }}</p>
        <button class="btn btn-gold btn-block" :disabled="busy" @click="doLogin">
          {{ busy ? '验证中…' : '进入' }}
        </button>
        <p class="hint faint">默认密码 admin888，可在服务器环境变量 ADMIN_PASSWORD 修改</p>
      </div>
    </div>

    <!-- 后台 -->
    <template v-else>
      <nav class="nav">
        <div class="nav-brand">
          <span class="nav-logo">IW</span>
          <div>
            <div class="nav-name">控场后台</div>
            <div class="nav-phase">
              <span class="pdot" :class="phaseKey" />{{ phaseText }}
            </div>
          </div>
        </div>
        <button
          v-for="t in tabs"
          :key="t.key"
          class="nav-item"
          :class="{ on: admin.tab === t.key }"
          @click="admin.tab = t.key"
        >
          <span class="ni-icon" v-html="t.icon" />
          {{ t.label }}
          <span v-if="t.key === 'list' && pendingCount" class="ni-badge">{{ pendingCount }}</span>
        </button>
        <div class="nav-foot">
          <button class="btn btn-ghost btn-xs" @click="refresh">刷新</button>
          <button class="btn btn-ghost btn-xs" @click="doLogout">退出</button>
        </div>
      </nav>

      <main class="main">
        <transition name="fade" mode="out-in">
          <OverviewPanel v-if="admin.tab === 'overview'" key="overview" />
          <ListPanel v-else-if="admin.tab === 'list'" key="list" />
          <SettingsPanel v-else-if="admin.tab === 'settings'" key="settings" />
          <DataPanel v-else key="data" />
        </transition>
      </main>

      <transition name="toast">
        <div v-if="admin.toast" class="toast">{{ admin.toast }}</div>
      </transition>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { admin, checkAuth, login, logout, load } from '../adminStore.js'
import OverviewPanel from '../components/admin/OverviewPanel.vue'
import ListPanel from '../components/admin/ListPanel.vue'
import SettingsPanel from '../components/admin/SettingsPanel.vue'
import DataPanel from '../components/admin/DataPanel.vue'

const password = ref('')
const busy = ref(false)

const tabs = [
  { key: 'overview', label: '控场', icon: '◎' },
  { key: 'list', label: '内容', icon: '☰' },
  { key: 'settings', label: '设置', icon: '⚙' },
  { key: 'data', label: '数据', icon: '⇩' }
]

const pendingCount = computed(() => admin.data?.stats?.pending || 0)

const phaseText = computed(
  () =>
    ({ idle: '待机中', live: '内容墙直播', drawing: '抽奖中', result: '已揭晓' })[
      admin.data?.settings?.phase
    ] || '—'
)
const phaseKey = computed(() => admin.data?.settings?.phase || 'idle')

let timer = null

async function doLogin() {
  if (!password.value) return
  busy.value = true
  await login(password.value)
  busy.value = false
  password.value = ''
}

async function doLogout() {
  await logout()
}

function refresh() {
  load(true)
}

onMounted(async () => {
  await checkAuth()
  timer = setInterval(() => {
    if (admin.authed) load(true).catch(() => {})
  }, 8000)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped>
.admin {
  min-height: 100vh;
  display: flex;
  background:
    radial-gradient(90% 50% at 12% 0%, rgba(193, 39, 45, 0.22), transparent 60%),
    linear-gradient(180deg, var(--c-bg-1), var(--c-bg-0) 40%, #0a0102);
}

/* 登录 */
.login-wrap {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 24px;
}
.login-card {
  width: 100%;
  max-width: 360px;
  padding: 32px 26px 24px;
  border-radius: 18px;
  border: 1px solid var(--c-line-strong);
  background: linear-gradient(180deg, rgba(255, 246, 234, 0.07), rgba(255, 246, 234, 0.02));
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.login-title {
  font-size: 26px;
  margin-top: 6px;
}
.login-sub {
  font-size: 13px;
  color: var(--c-muted);
  margin-bottom: 4px;
}
.err {
  color: var(--c-danger);
  font-size: 13px;
}
.hint {
  font-size: 11.5px;
  line-height: 1.6;
  margin-top: 2px;
}

/* 侧栏 */
.nav {
  width: 190px;
  flex-shrink: 0;
  padding: 22px 14px;
  border-right: 1px solid var(--c-line);
  background: rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px 18px;
}
.nav-logo {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #4a1c05;
  background: linear-gradient(170deg, #fbeecb, var(--c-gold) 60%, #c9a253);
}
.nav-name {
  font-size: 14px;
  font-weight: 700;
}
.nav-phase {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--c-faint);
  margin-top: 2px;
}
.pdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-faint);
}
.pdot.live {
  background: #6fd08c;
  box-shadow: 0 0 6px #6fd08c;
}
.pdot.drawing {
  background: #ffb347;
  box-shadow: 0 0 6px #ffb347;
}
.pdot.result {
  background: var(--c-gold);
  box-shadow: 0 0 6px var(--c-gold);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 9px;
  font-size: 13.5px;
  color: var(--c-muted);
  text-align: left;
  transition: background 0.16s ease, color 0.16s ease;
}
.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--c-ink);
}
.nav-item.on {
  background: rgba(231, 194, 125, 0.13);
  color: var(--c-gold-2);
  font-weight: 700;
}
.ni-icon {
  width: 16px;
  text-align: center;
  opacity: 0.8;
}
.ni-badge {
  margin-left: auto;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 99px;
  font-size: 11px;
  display: grid;
  place-items: center;
  background: var(--c-red);
  color: #fff;
}
.nav-foot {
  margin-top: auto;
  display: flex;
  gap: 6px;
}

.main {
  flex: 1;
  min-width: 0;
  padding: 26px 30px 40px;
  overflow-x: hidden;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 30px;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 600;
  color: #3a0d06;
  background: rgba(255, 246, 234, 0.95);
  box-shadow: 0 14px 34px -14px #000;
  z-index: 90;
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 720px) {
  .admin {
    flex-direction: column;
  }
  .nav {
    width: auto;
    flex-direction: row;
    align-items: center;
    padding: 10px 12px;
    border-right: none;
    border-bottom: 1px solid var(--c-line);
    overflow-x: auto;
  }
  .nav-brand,
  .nav-foot {
    display: none;
  }
  .nav-item {
    padding: 8px 12px;
    white-space: nowrap;
  }
  .main {
    padding: 18px 14px 40px;
  }
}
</style>
