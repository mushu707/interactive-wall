<template>
  <div>
    <div class="pg-head">
      <div>
        <h2 class="pg-title">数据与备份</h2>
        <p class="pg-desc">
          数据全部存在服务器的 <code>data/db.json</code>，每 10 分钟自动留一份快照在 <code>data/snapshots/</code>。
          活动开始前建议导出一次，结束后再导出一次存档。
        </p>
      </div>
    </div>

    <section class="sec">
      <div class="sec-head"><span class="sec-title">导出</span></div>
      <div class="sec-body">
        <div class="rowflex">
          <a class="btn btn-ghost btn-sm" href="/api/admin/export/submissions.csv">提交记录 CSV</a>
          <a class="btn btn-ghost btn-sm" href="/api/admin/export/likes.csv">投票记录 CSV</a>
          <a class="btn btn-ghost btn-sm" href="/api/admin/export/draws.csv">中奖记录 CSV</a>
          <a class="btn btn-gold btn-sm" href="/api/admin/backup">全量备份 JSON</a>
        </div>
        <p class="form-note">CSV 带 BOM，Excel 直接双击打开不会乱码。</p>
      </div>
    </section>

    <section class="sec">
      <div class="sec-head">
        <span class="sec-title">抽奖记录</span>
        <span class="sec-hint">共 {{ draws.length }} 次</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>奖项</th>
              <th>中奖牌号</th>
              <th>尾号</th>
              <th>抽取时间</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in draws" :key="d.id">
              <td class="nowrap"><b>{{ d.awardName }}</b> · {{ d.count }} 位</td>
              <td>
                <span v-for="w in d.winners" :key="w.code" class="code-cell" style="margin-right: 10px">
                  {{ w.code }}
                </span>
              </td>
              <td class="nowrap faint">
                <template v-for="(w, i) in d.winners" :key="w.code">
                  <span :class="{ 'dup-tail': dupTails.has(w.tail) }" :title="dupTails.has(w.tail) ? '这个尾号有多人使用，核对身份请以牌号为准' : ''">{{ w.tail }}</span>
                  <span v-if="dupTails.has(w.tail)" class="dup-mark">⚠</span>{{ i < d.winners.length - 1 ? ' / ' : '' }}
                </template>
              </td>
              <td class="nowrap faint">{{ full(d.createdAt) }}</td>
              <td>
                <span class="chip" :class="d.revealed ? 'ok' : 'warn'">{{ d.revealed ? '已揭晓' : '未揭晓' }}</span>
              </td>
            </tr>
            <tr v-if="!draws.length">
              <td colspan="5" style="text-align: center; padding: 34px; color: var(--c-faint)">还没有抽过奖</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="sec">
      <div class="sec-head">
        <span class="sec-title">危险操作</span>
        <span class="sec-hint">换下一场活动时用，会清空所有提交、投票、抽奖记录，设置保留</span>
      </div>
      <div class="sec-body danger-zone">
        <div>
          <b style="font-size: 14px">重置本场活动</b>
          <p class="form-note">
            牌号会从 LY-001 重新开始。重置前请先导出 CSV 或全量备份——这一步不可撤销。
          </p>
        </div>
        <button class="btn btn-red btn-sm" @click="resetEvent">重置活动</button>
      </div>
    </section>

    <section class="sec">
      <div class="sec-head"><span class="sec-title">现场检查清单</span></div>
      <div class="sec-body">
        <ul class="checklist">
          <li>用手机 4G/5G（不是公司 WiFi）扫码，确认能打开、能提交</li>
          <li>准备两台手机，一台提交、一台投票，确认票数实时变化</li>
          <li>大屏按 F11 全屏，确认文字在最后一排也看得清</li>
          <li>试抽一次奖：确认暗场 → 揭晓 → 收起回现场三步都正常</li>
          <li>后台换个密码（服务器环境变量 ADMIN_PASSWORD），别用默认的</li>
          <li>活动结束后立刻点「提交记录 CSV」存档</li>
        </ul>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { admin, actions, say } from '../../adminStore.js'

const draws = computed(() => admin.data?.draws || [])

// 尾号重复是正常现象（150 人里 67% 概率至少一对），这里只做标记，
// 让发奖的人知道「光看尾号不够，要按牌号核对」。
const dupTails = computed(() => {
  const cnt = new Map()
  for (const s of admin.data?.submissions || []) {
    if (!s.tail) continue
    cnt.set(s.tail, (cnt.get(s.tail) || 0) + 1)
  }
  const out = new Set()
  for (const [t, n] of cnt) if (n > 1) out.add(t)
  return out
})

function full(iso) {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function resetEvent() {
  if (!confirm('确认清空本场全部数据？此操作不可撤销。')) return
  if (!confirm('再确认一次：所有提交和投票都会消失。')) return
  actions.resetEvent()
  say('已重置，牌号从 LY-001 重新开始')
}
</script>

<style scoped>
.dup-tail {
  color: #e8a33d;
}
.dup-mark {
  color: #e8a33d;
  margin-left: 1px;
  font-size: 11px;
}
.danger-zone {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  border-color: rgba(255, 123, 114, 0.28);
  background: rgba(255, 123, 114, 0.05);
}
code {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
}
.checklist {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 2;
  color: var(--c-muted);
}
.checklist li::marker {
  color: var(--c-gold);
}
</style>
