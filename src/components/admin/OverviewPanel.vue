<template>
  <div>
    <div class="pg-head">
      <div>
        <h2 class="pg-title">控场台</h2>
        <p class="pg-desc">
          大屏会跟随这里的状态变化，最慢 2 秒同步。随机抽奖分两段：先「开始抽奖」（大屏进入暗场翻滚），
          再「揭晓」（定格中奖名单）。人气奖按票数单独揭晓，两者互不影响。
        </p>
      </div>
      <div class="rowflex">
        <a class="btn btn-ghost btn-sm" href="/screen" target="_blank">打开大屏 ↗</a>
        <a class="btn btn-ghost btn-sm" href="/submit" target="_blank">打开填写页 ↗</a>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi gold">
        <b>{{ stats.approved }}</b><span>已上墙</span>
      </div>
      <div class="kpi">
        <b>{{ stats.pending }}</b><span>待审核</span>
      </div>
      <div class="kpi">
        <b>{{ stats.total }}</b><span>提交总数</span>
      </div>
      <div class="kpi">
        <b>{{ stats.votes }}</b><span>投票数</span>
      </div>
      <div class="kpi">
        <b>{{ stats.voters }}</b><span>参与投票人数</span>
      </div>
    </div>

    <!-- 阶段 -->
    <section class="sec">
      <div class="sec-head">
        <span class="sec-title">大屏阶段</span>
        <span class="sec-hint">待机时大屏显示超大二维码引导扫码</span>
      </div>
      <div class="phase-row">
        <button
          v-for="p in phases"
          :key="p.key"
          class="phase-btn"
          :class="{ on: phase === p.key }"
          @click="actions.setPhase(p.key)"
        >
          <b>{{ p.label }}</b><span>{{ p.desc }}</span>
        </button>
      </div>
    </section>

    <!-- 抽奖 -->
    <section class="sec">
      <div class="sec-head">
        <span class="sec-title">抽奖</span>
        <span class="sec-hint">
          抽奖池：{{ poolSize }} 条{{ settings.excludeWinners ? '（已中奖不再参与）' : '（允许重复中奖）' }}
        </span>
      </div>

      <div class="award-grid">
        <button
          v-for="(r, i) in settings.drawRounds || []"
          :key="i"
          class="award-btn"
          :class="{ done: isDone(r.name) }"
          :disabled="locked"
          @click="actions.prepareDraw(r.name, r.count)"
        >
          <span class="aw-top">
            <b>{{ r.name }}</b>
            <span v-if="isDone(r.name)" class="done-tag">已完成</span>
          </span>
          <span>抽 {{ r.count }} 位</span>
        </button>
      </div>

      <div class="rowflex" style="margin-top: 12px">
        <input v-model="customName" class="input input-sm" placeholder="临时奖项名" style="max-width: 160px" />
        <input v-model.number="customCount" class="input input-sm" type="number" min="1" max="50" style="width: 84px" />
        <button class="btn btn-gold btn-sm" :disabled="locked || !customName" @click="customDraw">
          临时抽一次
        </button>
        <span class="sec-hint">奖项编排在「设置」里改</span>
      </div>

      <!-- 当前抽奖 -->
      <div v-if="current" class="draw-now">
        <div class="dn-left">
          <span class="chip" :class="current.revealed ? 'ok' : 'warn'">
            {{ current.revealed ? '已揭晓' : '翻滚中' }}
          </span>
          <div class="dn-title">{{ current.awardName }} · {{ current.count }} 位</div>
          <div class="dn-sub">
            {{ current.revealed ? current.winners.map((w) => w.code).join('、') : '大屏正在翻滚，点「揭晓」定格' }}
          </div>
        </div>
        <div class="rowflex">
          <button v-if="!current.revealed" class="btn btn-gold btn-sm" @click="actions.reveal()">揭晓</button>
          <button v-if="current.revealed" class="btn btn-ghost btn-sm" @click="actions.setPhase('live')">
            收起回现场
          </button>
          <button v-if="current.revealed" class="btn btn-ghost btn-sm" @click="confirmRedraw">重抽</button>
        </div>
      </div>
    </section>

    <!-- 人气奖 -->
    <section class="sec">
      <div class="sec-head">
        <span class="sec-title">{{ settings.popularAwardName || '人气奖' }}</span>
        <span class="sec-hint">按票数取前 {{ topN }} 名（同票按提交时间），与随机抽奖分开颁奖</span>
      </div>
      <div v-if="topList.length" class="pop-list">
        <div v-for="(t, i) in topList" :key="t.id" class="pop-item">
          <span class="pi-rank">{{ i + 1 }}</span>
          <span class="chip ok">{{ t.code }}</span>
          <span v-if="wonAwardOf(t.code)" class="chip warn">{{ wonAwardOf(t.code) }}</span>
          <div class="pi-body">
            <div class="dn-title"><i class="pm">①</i>{{ t.a1 }}</div>
            <div class="dn-sub"><i class="pm">②</i>{{ t.a2 }}</div>
          </div>
          <span class="pop-votes"><b>{{ t.likes }}</b> 票</span>
        </div>
        <div class="rowflex" style="margin-top: 10px">
          <button class="btn btn-gold btn-sm" :disabled="locked" @click="actions.setPhase('popular')">
            大屏揭晓
          </button>
          <span class="faint" style="font-size: 12px">
            颁奖按牌号核对，尾号只作二次确认
          </span>
        </div>
      </div>
      <p v-else class="faint" style="font-size: 13px">还没有已上墙的内容</p>
    </section>

    <!-- 日志 -->
    <section class="sec">
      <div class="sec-head">
        <span class="sec-title">最近操作</span>
        <span class="sec-hint">审核、遮蔽、抽奖、重置都会留痕</span>
      </div>
      <div class="sec-body logs">
        <div v-for="(l, i) in logs" :key="i" class="log-item">
          <span class="log-time">{{ hhmm(l.at) }}</span>
          <span class="log-act">{{ l.action }}</span>
          <span class="log-detail">{{ l.detail }}</span>
        </div>
        <p v-if="!logs.length" class="faint" style="font-size: 13px">还没有操作记录</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { admin, actions } from '../../adminStore.js'

const phases = [
  { key: 'idle', label: '待机', desc: '引导扫码' },
  { key: 'live', label: '上墙', desc: '内容循环' },
  { key: 'drawing', label: '抽奖中', desc: '暗场翻滚' },
  { key: 'result', label: '揭晓', desc: '定格名单' },
  { key: 'popular', label: '人气奖', desc: '投票最高' }
]

const phase = computed(() => admin.data?.settings?.phase || 'idle')
const settings = computed(() => admin.data?.settings || {})
const topN = computed(() => Math.max(1, Math.min(6, Number(settings.value.popularTopN) || 5)))
const approvedList = computed(() =>
  (admin.data?.submissions || []).filter((x) => x.status === 'approved' && !x.hidden)
)
const topList = computed(() =>
  approvedList.value
    .slice()
    .sort((a, b) => (b.likes || 0) - (a.likes || 0) || new Date(a.createdAt) - new Date(b.createdAt))
    .slice(0, topN.value)
)
// 已经中过奖的人仍可拿人气奖（不互斥），这里只做提示，方便主持人心里有数
const wonMap = computed(() => {
  const m = new Map()
  for (const dr of admin.data?.draws || []) {
    if (!dr.revealed) continue
    for (const w of dr.winners || []) if (!m.has(w.code)) m.set(w.code, dr.awardName)
  }
  return m
})
const wonAwardOf = (code) => {
  const award = wonMap.value.get(code)
  return award ? `已中${award}` : ''
}
const stats = computed(() => admin.data?.stats || {})
const logs = computed(() => admin.data?.logs || [])
const current = computed(() => admin.data?.draws?.[0] || null)

const locked = computed(() => phase.value === 'drawing')
const poolSize = computed(() => {
  const approved = stats.value.approved || 0
  if (!settings.value.excludeWinners) return approved
  const won = new Set()
  for (const d of admin.data?.draws || []) {
    if (d.revealed) d.winners.forEach((w) => won.add(w.id))
  }
  return Math.max(0, approved - won.size)
})

const customName = ref('')
const customCount = ref(1)

function isDone(name) {
  return (admin.data?.draws || []).some((d) => d.awardName === name && d.revealed)
}

function customDraw() {
  actions.prepareDraw(customName.value, Number(customCount.value) || 1)
  customName.value = ''
}

function confirmRedraw() {
  if (confirm('重抽会用新名单替换当前结果，确认吗？')) actions.redraw()
}

function hhmm(iso) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.pop-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pop-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--c-line-strong);
  background: rgba(255, 246, 234, 0.03);
}
.pi-rank {
  flex: 0 0 18px;
  font-size: 13px;
  color: var(--c-gold);
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.pi-body {
  flex: 1;
  min-width: 0;
}
.pi-body .dn-title,
.pi-body .dn-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--c-line-strong);
  background: linear-gradient(180deg, rgba(231, 194, 125, 0.09), rgba(231, 194, 125, 0.02));
}
.pop-info {
  min-width: 0;
  flex: 1;
}
.pm {
  font-style: normal;
  margin-right: 6px;
  color: var(--c-gold);
  opacity: 0.8;
}
.pop-votes {
  font-size: 12.5px;
  color: var(--c-muted);
}
.pop-votes b {
  font-size: 20px;
  color: var(--c-gold-2);
  margin-right: 2px;
}
.draw-now {
  margin-top: 14px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--c-line-strong);
  background: linear-gradient(180deg, rgba(231, 194, 125, 0.1), rgba(231, 194, 125, 0.02));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.dn-title {
  font-size: 16px;
  font-weight: 800;
  margin-top: 8px;
  letter-spacing: 0.05em;
}
.dn-sub {
  margin-top: 5px;
  font-size: 12.5px;
  color: var(--c-muted);
  line-height: 1.6;
}
</style>
