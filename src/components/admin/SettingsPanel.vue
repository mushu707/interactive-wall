<template>
  <div v-if="form">
    <div class="pg-head">
      <div>
        <h2 class="pg-title">活动设置</h2>
        <p class="pg-desc">改完点右下角保存。大屏与手机端会在 2 秒内自动生效。</p>
      </div>
      <label class="btn btn-ghost btn-sm" style="position: relative; overflow: hidden">
        上传背景图
        <input type="file" accept="image/*" style="position: absolute; inset: 0; opacity: 0" @change="onFile" />
      </label>
    </div>

    <!-- 活动信息 -->
    <section class="sec">
      <div class="sec-head"><span class="sec-title">活动信息</span></div>
      <div class="sec-body form-rows">
        <div class="form-row">
          <span class="field-label">活动标题</span>
          <div>
            <input v-model="form.title" class="input" placeholder="互动墙" />
            <p class="form-note">会显示在大屏左上角和填写页顶部</p>
          </div>
        </div>
        <div class="form-row">
          <span class="field-label">副标题</span>
          <input v-model="form.subtitle" class="input" placeholder="扫码上墙 · 内容投票 · 现场抽奖" />
        </div>
        <div class="form-row">
          <span class="field-label">主题色</span>
          <div class="theme-picks">
            <button
              v-for="t in themes"
              :key="t.key"
              class="theme-pick"
              :class="{ on: form.theme === t.key }"
              @click="form.theme = t.key"
            >
              <span class="sw-dot" :style="{ background: t.dot }" />{{ t.label }}
            </button>
          </div>
        </div>
        <div class="form-row">
          <span class="field-label">大屏背景图</span>
          <div>
            <div class="bg-preview" v-if="form.bgImage">
              <img :src="form.bgImage" alt="" />
              <button class="btn btn-xs btn-ghost" @click="form.bgImage = ''">移除</button>
            </div>
            <input v-model="form.bgImage" class="input input-sm" placeholder="也可以直接填图片地址" style="margin-top: 8px" />
            <p class="form-note">建议 1920×1080 以上、横向构图。系统会自动压暗，保证文字看得清。</p>
            <div class="rowflex" style="margin-top: 10px">
              <span class="field-label" style="min-width: auto">压暗程度</span>
              <input v-model.number="form.bgDim" type="range" min="0" max="0.9" step="0.05" style="flex: 1; max-width: 260px" />
              <span class="faint" style="font-size: 12px">{{ Math.round(form.bgDim * 100) }}%</span>
            </div>
          </div>
        </div>
        <div class="form-row">
          <span class="field-label">大屏底栏</span>
          <input v-model="form.screenFooter" class="input" placeholder="留空则显示默认文案" />
        </div>
      </div>
    </section>

    <!-- 题目 -->
    <section class="sec">
      <div class="sec-head"><span class="sec-title">两个问题</span></div>
      <div class="sec-body form-rows">
        <div class="form-row">
          <span class="field-label">问题一</span>
          <input v-model="form.q1" class="input" />
        </div>
        <div class="form-row">
          <span class="field-label">问题二</span>
          <input v-model="form.q2" class="input" />
        </div>
        <div class="form-row">
          <span class="field-label">人气奖名称</span>
          <div class="rowflex">
            <input v-model="form.popularAwardName" class="input input-sm" style="width: 180px" placeholder="人气奖" />
            <span class="faint" style="font-size: 12px">票数最高的一条，与随机抽奖互不影响</span>
          </div>
        </div>
        <div class="form-row">
          <span class="field-label">人气奖人数</span>
          <div class="rowflex">
            <input
              v-model.number="form.popularTopN"
              type="number"
              min="1"
              max="6"
              class="input input-sm"
              style="width: 100px"
            />
            <span class="faint" style="font-size: 12px">
              取票数前 N 名上大屏，默认 5；填 1 就只颁票王。最多 6（大屏右侧小条再多就挤了）
            </span>
          </div>
        </div>
        <div class="form-row">
          <span class="field-label">每题字数上限</span>
          <div class="rowflex">
            <input v-model.number="form.maxLen" type="number" min="10" max="200" class="input input-sm" style="width: 100px" />
            <span class="faint" style="font-size: 12px">建议 40–60，太长上墙放不下</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 参与规则 -->
    <section class="sec">
      <div class="sec-head"><span class="sec-title">参与与投票规则</span></div>
      <div class="sec-body form-rows">
        <div class="form-row">
          <span class="field-label">每人票数</span>
          <div class="rowflex">
            <input v-model.number="form.votesPerUser" type="number" min="1" max="10" class="input input-sm" style="width: 90px" />
            <span class="faint" style="font-size: 12px">100 人场景建议 3 票，制造稀缺感</span>
          </div>
        </div>
        <div class="form-row">
          <span class="field-label">修改时限</span>
          <div class="rowflex">
            <input v-model.number="form.editWindowMinutes" type="number" min="0" max="240" class="input input-sm" style="width: 90px" />
            <span class="faint" style="font-size: 12px">分钟，0 表示不允许改</span>
          </div>
        </div>
        <div class="form-row">
          <span class="field-label">开关</span>
          <div>
            <label class="switch-row">
              <span class="switch" :class="{ on: form.requireTail }" @click="form.requireTail = !form.requireTail" />
              <div>
                <div style="font-size: 13.5px">必填手机尾号 4 位</div>
                <div class="form-note">抽奖中奖时用来确认身份，不加这项现场会喊不出人</div>
              </div>
            </label>
            <label class="switch-row">
              <span class="switch" :class="{ on: form.showTailOnWall }" @click="form.showTailOnWall = !form.showTailOnWall" />
              <div>
                <div style="font-size: 13.5px">上墙时显示手机尾号</div>
                <div class="form-note">默认关闭，只在「我的牌号」和「中奖公告」显示</div>
              </div>
            </label>
            <label class="switch-row">
              <span class="switch" :class="{ on: form.showVotesOnWall }" @click="form.showVotesOnWall = !form.showVotesOnWall" />
              <div>
                <div style="font-size: 13.5px">大屏卡片上显示票数</div>
              </div>
            </label>
            <label class="switch-row">
              <span class="switch" :class="{ on: form.allowMultiSubmit }" @click="form.allowMultiSubmit = !form.allowMultiSubmit" />
              <div>
                <div style="font-size: 13.5px">允许一台手机提交多条</div>
                <div class="form-note">打开后可应对「帮邻座代填」，但一人多票的风险也会上来</div>
              </div>
            </label>
          </div>
        </div>
      </div>
    </section>

    <!-- 内容安全 -->
    <section class="sec">
      <div class="sec-head">
        <span class="sec-title">内容安全</span>
        <span class="sec-hint">100 人现场，默认全自动上墙 + 敏感词拦截 + 一键遮蔽</span>
      </div>
      <div class="sec-body form-rows">
        <div class="form-row">
          <span class="field-label">自动上墙</span>
          <div>
            <label class="switch-row" style="padding-top: 0">
              <span class="switch" :class="{ on: form.autoApprove }" @click="form.autoApprove = !form.autoApprove" />
              <div>
                <div style="font-size: 13.5px">{{ form.autoApprove ? '提交即上墙（推荐）' : '先审后上墙' }}</div>
                <div class="form-note">
                  {{ form.autoApprove ? '命中敏感词的内容仍会进待审队列' : '百人现场不建议：一个人审不过来，大屏会空着' }}
                </div>
              </div>
            </label>
          </div>
        </div>
        <div class="form-row">
          <span class="field-label">敏感词</span>
          <div>
            <textarea v-model="sensitiveText" class="textarea" rows="4" placeholder="每行一个，或用逗号分隔" />
            <p class="form-note">
              命中后不会上墙，直接进「待审」。建议补上本场活动需要回避的词（如公司名、领导名、内部梗）。
            </p>
          </div>
        </div>
        <div class="form-row">
          <span class="field-label">举报阈值</span>
          <div class="rowflex">
            <input v-model.number="form.reportThreshold" type="number" min="1" max="20" class="input input-sm" style="width: 90px" />
            <span class="faint" style="font-size: 12px">人次举报后自动下墙待审</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 大屏 -->
    <section class="sec">
      <div class="sec-head"><span class="sec-title">大屏</span></div>
      <div class="sec-body form-rows">
        <div class="form-row">
          <span class="field-label">每屏停留</span>
          <div class="rowflex">
            <input v-model.number="form.pageSeconds" type="number" min="8" max="120" class="input input-sm" style="width: 90px" />
            <span class="faint" style="font-size: 12px">秒。一屏最多 9 条，100 条约 {{ Math.ceil(100 / 9) * form.pageSeconds }} 秒一轮</span>
          </div>
        </div>
        <div class="form-row">
          <span class="field-label">二维码地址</span>
          <div>
            <input v-model="form.qrUrl" class="input" placeholder="留空自动使用当前域名 + /submit" />
            <p class="form-note">
              如果微信拦截了当前域名，在这里换一个新域名即可，不用重新打包。
            </p>
          </div>
        </div>
        <div class="form-row">
          <span class="field-label">大屏显示二维码</span>
          <span class="switch" :class="{ on: form.showQrOnScreen }" @click="form.showQrOnScreen = !form.showQrOnScreen" />
        </div>
      </div>
    </section>

    <!-- 抽奖编排 -->
    <section class="sec">
      <div class="sec-head">
        <span class="sec-title">抽奖编排</span>
        <span class="sec-hint">按议程节奏排，每个环节结束后抽一次</span>
      </div>
      <div class="sec-body">
        <div v-for="(r, i) in form.drawRounds" :key="i" class="round-row">
          <span class="round-no">{{ i + 1 }}</span>
          <input v-model="r.name" class="input input-sm" placeholder="奖项名" style="max-width: 150px" />
          <input v-model.number="r.count" type="number" min="1" max="50" class="input input-sm" style="width: 76px" />
          <span class="faint" style="font-size: 12px">位</span>
          <button class="btn btn-xs btn-ghost" style="color: var(--c-danger)" @click="form.drawRounds.splice(i, 1)">
            删除
          </button>
        </div>
        <div class="rowflex" style="margin-top: 10px">
          <button class="btn btn-ghost btn-sm" @click="form.drawRounds.push({ name: '新奖项', count: 1 })">
            + 增加一轮
          </button>
          <label class="switch-row" style="margin-left: auto; padding: 0">
            <span class="switch" :class="{ on: form.excludeWinners }" @click="form.excludeWinners = !form.excludeWinners" />
            <span style="font-size: 13px">已中奖者不再参与后续轮次</span>
          </label>
        </div>
      </div>
    </section>

    <div class="save-bar">
      <span class="faint" style="font-size: 12px">{{ dirty ? '有未保存的修改' : '全部已保存' }}</span>
      <button class="btn btn-ghost btn-sm" :disabled="!dirty" @click="reset">撤销</button>
      <button class="btn btn-gold btn-sm" :disabled="!dirty || saving" @click="save">
        {{ saving ? '保存中…' : '保存设置' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { admin, actions, say, uploadImage } from '../../adminStore.js'

const themes = [
  { key: 'red', label: '喜庆红金', dot: 'linear-gradient(135deg,#8E1B1F,#E7C27D)' },
  { key: 'deep', label: '深空蓝紫', dot: 'linear-gradient(135deg,#1A1F45,#A9C2FF)' },
  { key: 'ink', label: '墨黑哑金', dot: 'linear-gradient(135deg,#24211D,#D9C9A3)' }
]

const form = ref(null)
const dirty = ref(false)
const saving = ref(false)

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

watch(
  () => admin.data?.settings,
  (v) => {
    if (!v) return
    if (!form.value || !dirty.value) {
      form.value = clone(v)
      if (!Array.isArray(form.value.drawRounds)) form.value.drawRounds = []
      dirty.value = false
    }
  },
  { immediate: true, deep: false }
)

watch(
  form,
  () => {
    if (form.value) dirty.value = true
  },
  { deep: true }
)

const sensitiveText = computed({
  get: () => (form.value?.sensitiveWords || []).join('\n'),
  set: (v) => {
    if (!form.value) return
    form.value.sensitiveWords = v
      .split(/[\n,，、;；]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
})

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    const url = await uploadImage(file)
    form.value.bgImage = url
    dirty.value = true
    say('背景图已上传，记得点保存')
  } catch (err) {
    say(err.message)
  }
}

async function save() {
  saving.value = true
  await actions.saveSettings(clone(form.value))
  saving.value = false
  dirty.value = false
}

function reset() {
  form.value = clone(admin.data.settings)
  dirty.value = false
}
</script>

<style scoped>
.bg-preview {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid var(--c-line);
  background: rgba(0, 0, 0, 0.2);
}
.bg-preview img {
  width: 180px;
  height: 101px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}
.round-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.round-no {
  width: 22px;
  font-size: 12px;
  color: var(--c-faint);
  font-variant-numeric: tabular-nums;
}
.save-bar {
  position: sticky;
  bottom: 0;
  margin-top: 22px;
  padding: 12px 4px;
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
  background: linear-gradient(180deg, transparent, rgba(10, 2, 3, 0.9) 40%);
  backdrop-filter: blur(6px);
}
</style>
