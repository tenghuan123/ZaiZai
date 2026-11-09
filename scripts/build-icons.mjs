import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// macOS native tools only convert sizes/formats; the approved artwork stays in the master PNG.
const destination = resolve('resources/branding')
const iconset = resolve('.cache/branding/zaizai.iconset')
await mkdir(iconset, { recursive: true })
const normalized = resolve(destination, 'zaizai.png')
execFileSync('sips', ['-z', '1024', '1024', resolve(destination, 'zaizai-master.png'), '--out', normalized], { stdio: 'ignore' })
const sizes = new Map()
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
  const file = resolve('.cache/branding', `${size}.png`)
  execFileSync('sips', ['-z', String(size), String(size), normalized, '--out', file], { stdio: 'ignore' })
  sizes.set(size, file)
}
for (const size of [16, 32, 128, 256, 512]) {
  await copyFile(sizes.get(size), resolve(iconset, `icon_${size}x${size}.png`))
  await copyFile(sizes.get(size * 2), resolve(iconset, `icon_${size}x${size}@2x.png`))
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', resolve(destination, 'zaizai.icns')], { stdio: 'inherit' })

// ICO container with PNG representations, including native 16–256 px sizes for Windows.
const windowsSizes = [16, 24, 32, 48, 64, 128, 256]
const images = await Promise.all(windowsSizes.map(size => readFile(sizes.get(size))))
const header = Buffer.alloc(6 + 16 * images.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
let offset = header.length
for (let index = 0; index < images.length; index++) {
  const entry = 6 + index * 16
  header[entry] = windowsSizes[index] % 256
  header[entry + 1] = windowsSizes[index] % 256
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(images[index].length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += images[index].length
}
await writeFile(resolve(destination, 'zaizai.ico'), Buffer.concat([header, ...images]))

const menuBarArtwork = resolve(destination, 'zaizai-menubar.svg')
for (const scale of [1, 2]) {
  const size = String(18 * scale)
  const dpi = String(72 * scale)
  const name = scale === 1 ? 'trayTemplate.png' : 'trayTemplate@2x.png'
  execFileSync('sips', ['-s', 'format', 'png', '-z', size, size, '-s', 'dpiWidth', dpi, '-s', 'dpiHeight', dpi,
    menuBarArtwork, '--out', resolve('resources/tray', name)], { stdio: 'ignore' })
}
console.log('Generated zaizai app and macOS menu bar icons')
