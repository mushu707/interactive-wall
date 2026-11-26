/**
 * seed.js —— 生成演示数据，用于本地调试和现场彩排
 * 用法： node server/seed.js [人数]
 * 注意：会清空当前所有提交 / 投票 / 抽奖记录
 */
import crypto from 'node:crypto'
import * as store from './store.js'
import { QUESTIONS, ANSWERS } from './quotes.js'

const N = Math.max(1, Math.min(300, Number(process.argv[2]) || 36))

function pad(n) {
  return String(n).padStart(3, '0')
}

function main() {
  store.init()
  store.resetEvent(true)

  const d = store.get()
  const now = Date.now()

  for (let i = 0; i < N; i++) {
    const item = {
      id: crypto.randomUUID(),
      code: store.nextCode(),
      tail: String(1000 + Math.floor(Math.random() * 9000)),
      a1: QUESTIONS[i % QUESTIONS.length],
      a2: ANSWERS[i % ANSWERS.length],
      status: 'approved',
      hidden: false,
      likes: 0,
      reportCount: 0,
      deviceId: 'seed-' + pad(i),
      ipHash: crypto.randomBytes(6).toString('hex'),
      editToken: crypto.randomBytes(12).toString('hex'),
      createdAt: new Date(now - (N - i) * 40_000).toISOString(),
      updatedAt: new Date(now - (N - i) * 40_000).toISOString()
    }
    d.submissions.push(item)
  }

  // 模拟投票：前几条内容获得更多票，形成榜单梯度
  const votesPerUser = d.settings.votesPerUser || 3
  const voters = Math.round(N * 0.8)
  let vid = 0
  for (let v = 0; v < voters; v++) {
    const voterKey = 'seedvoter-' + pad(v)
    const picks = new Set()
    while (picks.size < votesPerUser) {
      const r = Math.random()
      // 幂律分布：靠前的内容更容易被投
      const idx = Math.min(N - 1, Math.floor(Math.pow(r, 2.2) * N))
      if (picks.has(idx)) continue
      picks.add(idx)
    }
    for (const idx of picks) {
      const sub = d.submissions[idx]
      d.votes.push({
        id: ++vid,
        submissionId: sub.id,
        voterKey,
        createdAt: new Date(now - Math.random() * 3600_000).toISOString()
      })
      sub.likes++
    }
  }
  d.meta.voteSeq = vid
  d.meta.cardsVer = 1
  d.meta.votesVer = 1
  d.settings.phase = 'live'
  store.log('seed', `生成 ${N} 条提交 / ${vid} 张票`)
  store.commit()

  store.flush().then(() => {
    console.log(`已生成 ${N} 条提交、${vid} 张投票，大屏阶段设为 live`)
    console.log('打开 http://localhost:3000/screen 查看')
  })
}

main()
