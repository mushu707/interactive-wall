/** 一次性布局测量：node scripts/measure.mjs <url> <width> <height> <selectorA,selectorB,...> */
const PORT = 9222
const [, , url, w, h, sels] = process.argv

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

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = targets.find((t) => t.type === 'page')
const cdp = await new Promise((resolve, reject) => {
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  ws.addEventListener('open', () => resolve(new Cdp(ws)))
  ws.addEventListener('error', reject)
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: Number(w),
  height: Number(h),
  deviceScaleFactor: 1,
  mobile: false
})
await cdp.send('Page.navigate', { url })
await sleep(2500)

const list = sels.split(',')
const res = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const list = ${JSON.stringify(list)};
    const out = {};
    for (const sel of list) {
      const els = [...document.querySelectorAll(sel)];
      out[sel] = els.map((el, i) => {
        const r = el.getBoundingClientRect();
        return { i, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), overY: Math.round(el.scrollHeight - r.height), overX: Math.round(el.scrollWidth - r.width) };
      });
    }
    return JSON.stringify({ vh: innerHeight, vw: innerWidth, out }, null, 1);
  })()`,
  returnByValue: true
})
console.log(res.result.value)
process.exit(0)
