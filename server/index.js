/**
 * index.js —— 单进程入口：API + 前端静态托管
 * 启动：node server/index.js   或   npm start
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handle } from './api.js'
import * as store from './store.js'
import { getPassword } from './auth.js'

// Node 16 起才能跑（`import.meta.url` 换成 fileURLToPath，别用 Node 20 的 import.meta.dirname）
const NODE_MAJOR = Number(process.versions.node.split('.')[0])
if (NODE_MAJOR < 16) {
  console.error(`\n  Node 版本过低：当前 v${process.versions.node}，需要 v16 或更高。\n`)
  process.exit(1)
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

// 极简 .env 读取（零依赖）。已存在的环境变量优先，不会被文件覆盖。
try {
  const envFile = path.join(ROOT, '.env')
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
} catch (e) {
  console.warn('[env] .env 读取失败', e.message)
}
const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'

store.init()

const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
}

function sendFile(res, file, req) {
  const ext = path.extname(file).toLowerCase()
  const stat = fs.statSync(file)
  const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag })
    return res.end()
  }
  const isHtml = ext === '.html'
  res.writeHead(200, {
    'Content-Type': STATIC_MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    ETag: etag,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=86400'
  })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  let url
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  } catch {
    res.writeHead(400)
    return res.end('bad request')
  }

  // 接口
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return handle(req, res, url)
  }

  const method = req.method
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405)
    return res.end('method not allowed')
  }

  // 用户上传的背景图
  if (url.pathname.startsWith('/uploads/')) {
    const name = path.basename(url.pathname)
    const file = path.join(store.UPLOAD_DIR, name)
    if (fs.existsSync(file)) return sendFile(res, file, req)
    res.writeHead(404)
    return res.end('not found')
  }

  // 前端静态资源
  const safe = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '')
  let file = path.join(DIST, safe)
  if (!file.startsWith(DIST)) {
    res.writeHead(403)
    return res.end('forbidden')
  }
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return sendFile(res, file, req)

  // SPA 兜底
  const index = path.join(DIST, 'index.html')
  if (fs.existsSync(index)) return sendFile(res, index, req)

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(
    '<meta charset="utf-8"><body style="background:#170305;color:#f7e3b6;font-family:sans-serif;padding:40px">' +
      '<h2>前端还没构建</h2><p>本地开发：<code>npm run dev</code>（另开一个终端跑 <code>npm run dev:server</code>）</p>' +
      '<p>生产构建：<code>npm run build</code> 后再启动本服务。</p></body>'
  )
})

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  端口 ${PORT} 已被占用。`)
    console.error(`  先关掉占用的进程，或换端口启动：PORT=3001 node server/index.js\n`)
    process.exit(1)
  }
  console.error(e)
  process.exit(1)
})

function lanIps() {
  const out = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address)
    }
  }
  return out
}

server.listen(PORT, HOST, () => {
  const d = store.get()
  const lan = lanIps()[0]
  console.log('')
  console.log('  互动墙 已启动')
  console.log('  ─────────────────────────────')
  console.log(`  大屏      http://localhost:${PORT}/screen`)
  console.log(`  填写      http://localhost:${PORT}/submit`)
  console.log(`  内容墙    http://localhost:${PORT}/wall`)
  console.log(`  后台      http://localhost:${PORT}/admin`)
  if (lan) console.log(`  手机访问  http://${lan}:${PORT}/submit  （同一 WiFi，扫码调试用）`)
  console.log(`  数据      ${store.paths.DB_FILE}`)
  console.log(`  密码      ${process.env.ADMIN_PASSWORD ? '已由环境变量设置' : `${getPassword()}（默认，建议修改）`}`)
  console.log(`  当前阶段  ${d.settings.phase}`)
  console.log('')
})

process.on('SIGTERM', () => {
  store.flush().finally(() => process.exit(0))
})
