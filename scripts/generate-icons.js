// scripts/generate-icons.js
//
// Sinh icon PNG (16/32/48/128) cho manifest — hình vuông bo góc màu accent
// #967DD6. Chỉ dùng Node built-in (zlib để deflate raw bitmap thành PNG hợp
// lệ, không thêm dependency nào). Chạy: `node scripts/generate-icons.js`.

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
const SIZES = [16, 32, 48, 128]
const ACCENT = [0x96, 0x7d, 0xd6] // rgb(150,125,214)

// --- CRC32 (bảng chuẩn dùng trong spec PNG) --------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

// Bo góc: bán kính ~18% cạnh, dùng khoảng cách tới góc gần nhất so với r để
// quyết định pixel có nằm trong hình bo tròn hay bị cắt trong suốt.
function inRoundedSquare(x, y, size, r) {
  const cx = x < r ? r : x > size - 1 - r ? size - 1 - r : x
  const cy = y < r ? r : y > size - 1 - r ? size - 1 - r : y
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function buildPng(size) {
  const r = Math.round(size * 0.18)
  const raw = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4)
    raw[rowStart] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      const off = rowStart + 1 + x * 4
      const inside = inRoundedSquare(x, y, size, r)
      raw[off] = ACCENT[0]
      raw[off + 1] = ACCENT[1]
      raw[off + 2] = ACCENT[2]
      raw[off + 3] = inside ? 255 : 0
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT_DIR, { recursive: true })
for (const size of SIZES) {
  const file = path.join(OUT_DIR, `icon${size}.png`)
  writeFileSync(file, buildPng(size))
  console.log(`đã ghi ${file}`)
}
