/**
 * zip.mjs —— 零依赖 ZIP 写入器
 *
 * 为什么不用 PowerShell 的 Compress-Archive：
 * Windows PowerShell 5.1 写出来的条目名用反斜杠（`server\api.js`），
 * 到了 Linux 上解压会变成名为 `server\api.js` 的单个文件，目录结构全丢，
 * 站点直接起不来。这个坑在本地 Windows 上完全看不出来。
 *
 * 这里按 ZIP 规范手写：条目名一律用正斜杠，deflate 压缩，UTF-8 文件名。
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** JS Date → DOS 时间/日期 */
function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time: time & 0xffff, date: date & 0xffff }
}

/** 递归收集文件，返回 [{ rel, abs }]，rel 一律正斜杠 */
export function walk(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name)
    const st = fs.statSync(abs)
    if (st.isDirectory()) walk(abs, base, out)
    else out.push({ rel: path.relative(base, abs).split(path.sep).join('/'), abs })
  }
  return out
}

/**
 * @param {string} outFile 目标 zip
 * @param {{rel:string, abs:string}[]} files 要打包的文件（rel 用正斜杠）
 */
export function writeZip(outFile, files) {
  const chunks = []
  const central = []
  let offset = 0

  for (const { rel, abs } of files) {
    const data = fs.readFileSync(abs)
    const crc = crc32(data)
    const deflated = zlib.deflateRawSync(data, { level: 9 })
    const useDeflate = deflated.length < data.length
    const body = useDeflate ? deflated : data
    const method = useDeflate ? 8 : 0

    const nameBuf = Buffer.from(rel, 'utf8')
    const st = fs.statSync(abs)
    const { time, date } = dosTime(st.mtime)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // 本地文件头签名
    local.writeUInt16LE(20, 4) // 需要版本 2.0
    local.writeUInt16LE(0x0800, 6) // flag: UTF-8 文件名
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28) // extra 长度

    chunks.push(local, nameBuf, body)

    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0) // 中央目录签名
    cen.writeUInt16LE(20, 4) // 创建版本
    cen.writeUInt16LE(20, 6) // 需要版本
    cen.writeUInt16LE(0x0800, 8)
    cen.writeUInt16LE(method, 10)
    cen.writeUInt16LE(time, 12)
    cen.writeUInt16LE(date, 14)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(body.length, 20)
    cen.writeUInt32LE(data.length, 24)
    cen.writeUInt16LE(nameBuf.length, 28)
    cen.writeUInt16LE(0, 30) // extra
    cen.writeUInt16LE(0, 32) // comment
    cen.writeUInt16LE(0, 34) // disk
    cen.writeUInt16LE(0, 36) // 内部属性
    cen.writeUInt32LE(0o644 << 16, 38) // 外部属性：普通文件
    cen.writeUInt32LE(offset, 42)

    central.push(cen, nameBuf)
    offset += local.length + nameBuf.length + body.length
  }

  const cenBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cenBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, Buffer.concat([...chunks, cenBuf, eocd]))
  return files.length
}
