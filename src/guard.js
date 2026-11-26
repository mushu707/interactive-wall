/**
 * 渲染异常兜底。
 *
 * 背景：大屏是无人值守的，一旦某个组件在渲染时抛错（最典型的是「前端已更新、后端没重启」，
 * 接口字段对不上），Vue 会把那一整块 DOM 打成空白 —— 现场看到的就是纯黑屏，没有任何信息。
 * 这里把任何未捕获的渲染/脚本错误变成屏幕底部一条提示，并自动刷新重试。
 *
 * 只在 /screen 自动刷新：后台正在填表单时被刷掉比报错更烦人。
 */
const RELOAD_KEY = 'ly_guard_reloads'
const MAX_RELOAD = 3
const COUNTDOWN = 10

let shown = false

function bar(text) {
  const wrap = document.createElement('div')
  wrap.style.cssText = [
    'position:fixed',
    'left:0',
    'right:0',
    'bottom:0',
    'z-index:9999',
    'display:flex',
    'gap:12px',
    'align-items:center',
    'justify-content:center',
    'padding:14px 20px',
    'background:#3b0508',
    'border-top:2px solid rgba(231,194,125,.75)',
    'color:#ffe9c2',
    'font:14px/1.5 system-ui,-apple-system,"Microsoft YaHei",sans-serif',
    'box-shadow:0 -8px 30px rgba(0,0,0,.5)'
  ].join(';')
  const b = document.createElement('b')
  b.textContent = '大屏渲染出错'
  b.style.cssText = 'color:#f7e3b6;letter-spacing:.08em;flex-shrink:0'
  const t = document.createElement('span')
  t.textContent = text
  t.style.cssText = 'opacity:.85;max-width:80vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
  wrap.append(b, t)
  document.body.appendChild(wrap)
  return t
}

export function reportFatal(err, info) {
  if (shown) return
  shown = true

  const msg = (err && (err.message || err.reason?.message)) || (err && err.reason) || err || ''
  const detail = String(msg).slice(0, 160) || String(info || '未知错误')
  const tip = bar(detail)

  if (!location.pathname.startsWith('/screen')) {
    tip.textContent = '请按 F5 刷新页面 · ' + detail
    return
  }

  // 连续崩 3 次就别再刷了，否则会变成无限刷新，现场更没法收拾
  let tries = 0
  try {
    tries = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
  } catch {
    tries = MAX_RELOAD
  }
  if (tries >= MAX_RELOAD) {
    tip.textContent = `连续出错 ${tries} 次，已停止自动刷新，请手动按 F5 · ${detail}`
    return
  }

  let left = COUNTDOWN
  const tick = () => {
    tip.textContent = `${left} 秒后自动刷新 · ${detail}`
    if (left-- <= 0) {
      try {
        sessionStorage.setItem(RELOAD_KEY, String(tries + 1))
      } catch {
        /* 隐私模式下写不进去也无所谓 */
      }
      location.reload()
      return
    }
    setTimeout(tick, 1000)
  }
  tick()
}

/** 稳定运行一分钟后清零重试计数，避免白天偶发一次错误导致晚上不再自动刷新 */
export function armReloadReset() {
  setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_KEY)
    } catch {
      /* ignore */
    }
  }, 60000)
}

export function installGuard(app) {
  app.config.errorHandler = (err, _instance, info) => {
    console.error('[大屏] 渲染异常：', err, info)
    reportFatal(err, info)
  }
  window.addEventListener('error', (e) => {
    // 图片/字体加载失败也会冒到这里（无 message），那些不该弹提示
    if (!e.message) return
    reportFatal(e.error || e.message, 'window.onerror')
  })
  window.addEventListener('unhandledrejection', (e) => {
    reportFatal(e.reason, 'unhandledrejection')
  })
}
