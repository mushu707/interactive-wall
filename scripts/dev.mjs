/**
 * 一键开发：同时启动后端（:3000）和前端（:5173）。
 * 零依赖 —— 只用 node:child_process。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'

const procs = []
let exiting = false

function run(name, cmd, args, color) {
  const p = spawn(cmd, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin
  })
  const tag = `\x1b[${color}m[${name}]\x1b[0m`
  const pipe = (stream) => {
    stream.setEncoding('utf8')
    let buf = ''
    stream.on('data', (chunk) => {
      buf += chunk
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() || ''
      for (const line of lines) process.stdout.write(`${tag} ${line}\n`)
    })
  }
  pipe(p.stdout)
  pipe(p.stderr)

  p.on('exit', (code) => {
    if (exiting) return
    process.stdout.write(`${tag} 进程退出（code ${code}）\n`)
    shutdown(code ?? 1)
  })
  procs.push(p)
  return p
}

function shutdown(code = 0) {
  if (exiting) return
  exiting = true
  for (const p of procs) {
    if (!p.killed) {
      try {
        p.kill('SIGTERM')
      } catch {}
    }
  }
  setTimeout(() => process.exit(code), 200)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('\n  启动中：后端 :3000 + 前端 :5173\n')
run('server', process.execPath, [path.join('server', 'index.js')], '36')
setTimeout(() => run('web', 'npx', ['vite'], '35'), 600)
