/**
 * qa.mjs —— 用 Chrome DevTools 协议做布局测量与截图
 * 用法：node scripts/qa.mjs <url> <width> <height> <out.png> [cookiePassword]
 */
const PORT = 9222

async function cdpTargets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  return r.json()
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener('open', () => resolve(new Cdp(ws)))
    ws.addEventListener('error', reject)
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const [, , url, w, h, out, pass, js] = process.argv

const targets = await cdpTargets()
const page = targets.find((t) => t.type === 'page')
const cdp = await connect(page.webSocketDebuggerUrl)

await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: Number(w),
  height: Number(h),
  deviceScaleFactor: 1,
  mobile: Number(w) < 600
})

if (pass) {
  // 先在页面上下文里登录
  await cdp.send('Page.navigate', { url: 'about:blank' })
  await sleep(300)
}

await cdp.send('Page.navigate', { url })
await sleep(1200)

if (pass) {
  await cdp.send('Runtime.evaluate', {
    expression: `fetch('/api/admin/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'${pass}'})}).then(()=>location.replace('${url}'))`,
    awaitPromise: false
  })
  await sleep(2600)
}

if (js) {
  await cdp.send('Runtime.evaluate', { expression: js, awaitPromise: true })
  await sleep(1200)
}

const metrics = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const d = document.documentElement;
    const wrap = document.querySelector('.m-wrap') || document.querySelector('.live-wrap');
    const cards = [...document.querySelectorAll('.wcard, .tile')].slice(0,3).map(el => {
      const r = el.getBoundingClientRect();
      return {l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width)};
    });
    const over = [...document.querySelectorAll('*')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.right > d.clientWidth + 1 && r.width > 0;
    }).slice(0,6).map(el => el.className + ' | ' + Math.round(el.getBoundingClientRect().right));
    return JSON.stringify({
      clientW: d.clientWidth, scrollW: d.scrollWidth, bodyW: document.body.scrollWidth,
      wrapW: wrap ? Math.round(wrap.getBoundingClientRect().width) : null,
      wrapLeft: wrap ? Math.round(wrap.getBoundingClientRect().left) : null,
      cards, over
    }, null, 1);
  })()`,
  returnByValue: true
})

console.log(metrics.result.value)

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
const fs = await import('node:fs')
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('shot ->', out)
process.exit(0)
