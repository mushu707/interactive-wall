<template>
  <div>
    <div class="pg-head">
      <div>
        <h2 class="pg-title">内容与审核</h2>
        <p class="pg-desc">
          命中敏感词或已被举报达阈值的会落进「待审」。发现不合适的，随时点「遮蔽」——大屏 2 秒内消失，不必删除。
        </p>
      </div>
      <div class="rowflex">
        <input v-model="q" class="input input-sm" placeholder="搜索牌号 / 尾号 / 内容" style="width: 190px" />
      </div>
    </div>

    <div class="filters">
      <button
        v-for="f in filters"
        :key="f.key"
        class="filter"
        :class="{ on: filter === f.key }"
        @click="filter = f.key"
      >
        {{ f.label }} {{ countOf(f.key) }}
      </button>
    </div>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>牌号</th>
            <th>尾号</th>
            <th>内容</th>
            <th>状态</th>
            <th>赞</th>
            <th>时间</th>
            <th style="text-align: right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in visible" :key="s.id">
            <td class="code-cell">{{ s.code }}</td>
            <td class="nowrap faint">{{ s.tail || '—' }}</td>
            <td class="ans-cell">
              {{ s.a1 }}
              <em>{{ s.a2 }}</em>
            </td>
            <td>
              <span class="chip" :class="statusClass(s)">{{ statusText(s) }}</span>
              <span v-if="s.reportCount" class="chip bad" style="margin-left: 4px">举报 {{ s.reportCount }}</span>
            </td>
            <td class="nowrap">{{ s.likes }}</td>
            <td class="nowrap faint">{{ hhmm(s.createdAt) }}</td>
            <td class="nowrap" style="text-align: right;">
              <button v-if="s.status !== 'approved'" class="btn btn-xs btn-gold" style="margin-left: 8px" @click="actions.patchSub(s.id, { status: 'approved' }, '已通过')">
                通过
              </button>
              <button v-if="s.status === 'approved'" class="btn btn-xs btn-ghost" style="margin-left: 8px" @click="actions.patchSub(s.id, { status: 'pending' }, '已转入待审')">
                下墙
              </button>
              <button
                v-if="s.status !== 'rejected'"
                class="btn btn-xs btn-ghost"
                style="margin-left: 8px"
                @click="actions.patchSub(s.id, { status: 'rejected' }, '已驳回')"
              >
                驳回
              </button>
              <button
                class="btn btn-xs btn-ghost"
                :style="s.hidden ? 'color:var(--c-ok)' : ''"
                style="margin-left: 8px"
                @click="actions.patchSub(s.id, { hidden: !s.hidden }, s.hidden ? '已恢复' : '已遮蔽')"
              >
                {{ s.hidden ? '恢复' : '遮蔽' }}
              </button>
              <button class="btn btn-xs btn-ghost" style="margin-left: 8px" @click="resetLikes(s)">清赞</button>
              <button class="btn btn-xs btn-ghost" style="color: var(--c-danger); margin-left: 8px" @click="del(s)">删</button>
            </td>
          </tr>
          <tr v-if="!visible.length">
            <td colspan="7" style="text-align: center; padding: 40px; color: var(--c-faint)">
              这里还没有内容
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { admin, actions } from '../../adminStore.js'

const filter = ref('all')
const q = ref('')

const filters = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待审' },
  { key: 'approved', label: '已上墙' },
  { key: 'hidden', label: '已遮蔽' },
  { key: 'rejected', label: '已驳回' }
]

const list = computed(() => admin.data?.submissions || [])

function match(s, key) {
  if (key === 'all') return true
  if (key === 'hidden') return s.hidden
  if (key === 'approved') return s.status === 'approved' && !s.hidden
  return s.status === key
}

const visible = computed(() => {
  const kw = q.value.trim().toLowerCase()
  return list.value.filter((s) => {
    if (!match(s, filter.value)) return false
    if (!kw) return true
    return (
      s.code.toLowerCase().includes(kw) ||
      (s.tail || '').includes(kw) ||
      s.a1.toLowerCase().includes(kw) ||
      s.a2.toLowerCase().includes(kw)
    )
  })
})

function countOf(key) {
  return list.value.filter((s) => match(s, key)).length
}

function statusText(s) {
  if (s.hidden) return '已遮蔽'
  return { approved: '已上墙', pending: '待审', rejected: '已驳回' }[s.status] || s.status
}
function statusClass(s) {
  if (s.hidden) return 'bad'
  return { approved: 'ok', pending: 'warn', rejected: 'bad' }[s.status] || ''
}

function hhmm(iso) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function resetLikes(s) {
  if (confirm(`把 ${s.code} 的 ${s.likes} 个赞清零？`)) actions.resetLikes(s.id)
}

function del(s) {
  if (confirm(`删除 ${s.code}？这条记录和它的票都会消失，不可恢复。`)) actions.delSub(s.id)
}
</script>
