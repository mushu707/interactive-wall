/**
 * pack.mjs —— 生成可直接上传宝塔的发布包
 * 用法： npm run pack
 * 产物： release/interactive-wall.zip
 *
 * 发布包里只有 dist/ + server/ + 一个零依赖的 package.json，
 * 服务器上不需要 npm install（npm 会秒退，不会装任何东西）。
 *
 * 先在系统临时目录里拼一个干净的分包，再压缩，最后同步一份到 release/。
 * 这样即使 release/ 里有旧文件删不掉（被编辑器/预览占用），也不会混进 zip。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { walk, writeZip } from './zip.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'release')
const ZIP = path.join(OUT, 'interactive-wall.zip')
const STAGE = path.join(os.tmpdir(), `ly-wall-pack-${Date.now()}`)

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name)
    const d = path.join(dest, name)
    if (fs.statSync(s).isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

function tryRemove(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true })
  } catch {
    /* 占用中就算了，临时目录系统会回收 */
  }
}

/* 1. 构建 */
console.log('1/4 构建前端…')
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

/* 2. 拼装干净的分包 */
console.log('2/4 拼装分包…')
copyDir(path.join(ROOT, 'dist'), path.join(STAGE, 'dist'))
copyDir(path.join(ROOT, 'server'), path.join(STAGE, 'server'))
// 彩排模拟器也带上：现场想直接在服务器上灌演练数据时能跑
fs.mkdirSync(path.join(STAGE, 'scripts'), { recursive: true })
fs.copyFileSync(path.join(ROOT, 'scripts', 'sim.mjs'), path.join(STAGE, 'scripts', 'sim.mjs'))
fs.copyFileSync(path.join(ROOT, 'README.md'), path.join(STAGE, 'README.md'))
fs.copyFileSync(path.join(ROOT, '.env.example'), path.join(STAGE, '.env.example'))
fs.mkdirSync(path.join(STAGE, 'data'), { recursive: true })

// 零依赖的运行期 package.json
fs.writeFileSync(
  path.join(STAGE, 'package.json'),
  JSON.stringify(
    {
      name: 'ly-wall',
      private: true,
      version: '1.0.0',
      type: 'module',
      engines: { node: '>=16' },
      scripts: { start: 'node server/index.js', sim: 'node scripts/sim.mjs' }
    },
    null,
    2
  )
)

/* 3. 压缩 */
console.log('3/4 打包 zip…')
fs.mkdirSync(OUT, { recursive: true })
tryRemove(ZIP)
try {
  const files = walk(STAGE)
  writeZip(ZIP, files)
  console.log(`  写入 ${files.length} 个文件（条目名使用正斜杠，Linux 解压不会散架）`)
} catch (e) {
  console.error('\n打包失败：zip 没生成。', e.code === 'EPERM' ? 'release/ 里的旧 zip 被占用，先关掉预览再试。' : e.message)
  process.exit(1)
}

/* 4. 顺手在 release/ 留一份解压好的目录，方便肉眼检查 */
console.log('4/4 同步 release/ 目录…')
for (const name of ['dist', 'server', 'README.md', '.env.example', 'package.json']) {
  const src = path.join(STAGE, name)
  const dest = path.join(OUT, name)
  try {
    tryRemove(dest)
    if (fs.statSync(src).isDirectory()) copyDir(src, dest)
    else fs.copyFileSync(src, dest)
  } catch {
    /* 旧文件被占用时跳过，zip 里一定是干净的 */
  }
}
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true })

tryRemove(STAGE)

const kb = (fs.statSync(ZIP).size / 1024).toFixed(0)
console.log(`\n完成：release/interactive-wall.zip（${kb} KB）`)
console.log('把这个 zip 上传到服务器 /www/wwwroot/ 解压即可。')
