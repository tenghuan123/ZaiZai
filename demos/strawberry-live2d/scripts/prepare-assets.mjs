import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { writePsdBuffer, readPsd } from 'ag-psd'

const directory = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(directory, 'assets')
const width = 1000, height = 1280
const atlas = await readFile(resolve(output, 'parts-atlas-v1.png'))
// The generated atlas did not keep exact grid boundaries. Use inspected component regions,
// so an arm's bounding box cannot accidentally include hair from the row above it.
const crops = [
  [12, 8, 300, 342], [325, 40, 285, 270], [625, 5, 315, 340], [942, 20, 312, 315],
  [30, 350, 260, 310], [395, 350, 210, 310], [705, 350, 150, 320], [1010, 350, 170, 320],
  [25, 690, 250, 235], [365, 690, 250, 235], [660, 710, 250, 210], [1000, 710, 250, 210],
  [70, 1050, 180, 100], [390, 1040, 170, 130], [705, 1040, 170, 120], [940, 1020, 314, 170]
]
const layout = [
  { name: 'HairBack', cell: 0, x: 170, y: 185, width: 660, height: 835 },
  // Paired generated components use viewer order; all L/R IDs use the character's left/right.
  { name: 'LegL', cell: 7, x: 512, y: 925, width: 108, height: 255 },
  { name: 'LegR', cell: 6, x: 380, y: 925, width: 108, height: 255 },
  { name: 'Body', cell: 3, x: 305, y: 614, width: 390, height: 390 },
  // Relaxed hands lie in front of the skirt, rather than disappearing behind its outer frills.
  { name: 'ArmL', cell: 5, x: 590, y: 658, width: 110, height: 275 },
  { name: 'ArmR', cell: 4, x: 300, y: 658, width: 110, height: 275 },
  { name: 'Face', cell: 1, x: 315, y: 302, width: 370, height: 350 },
  { name: 'Blush', cell: 15, x: 340, y: 535, width: 320, height: 70, hidden: true },
  // Align pupils to the reference face; outer lashes make the artwork bounds asymmetric.
  { name: 'EyeLOpen', cell: 9, x: 546, y: 421, width: 112, height: 137 },
  { name: 'EyeROpen', cell: 8, x: 342, y: 421, width: 112, height: 137 },
  { name: 'EyeLClosed', cell: 11, x: 546, y: 421, width: 112, height: 137, hidden: true },
  { name: 'EyeRClosed', cell: 10, x: 342, y: 421, width: 112, height: 137, hidden: true },
  { name: 'MouthSmile', cell: 12, x: 472, y: 578, width: 56, height: 24 },
  { name: 'MouthOpen', cell: 13, x: 475, y: 565, width: 50, height: 51, hidden: true },
  { name: 'MouthSmirk', cell: 14, x: 472, y: 578, width: 56, height: 24, hidden: true },
  { name: 'HairFront', cell: 2, x: 211, y: 151, width: 578, height: 490 }
]
await mkdir(resolve(output, 'layers'), { recursive: true })
const psdLayers = [], composite = [], receipt = []
for (const part of layout) {
  const [left, top, cellWidth, cellHeight] = crops[part.cell]
  const cell = await sharp(atlas).extract({ left, top, width: cellWidth, height: cellHeight }).ensureAlpha().raw().toBuffer()
  let minX = cellWidth, minY = cellHeight, maxX = -1, maxY = -1
  for (let y = 0; y < cellHeight; y++) for (let x = 0; x < cellWidth; x++) {
    if (cell[(y * cellWidth + x) * 4 + 3] > 96) {
      minX = Math.min(minX, x); minY = Math.min(minY, y)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) throw new Error(`Empty generated component: ${part.name}`)
  minX = Math.max(0, minX - 3); minY = Math.max(0, minY - 3)
  maxX = Math.min(cellWidth - 1, maxX + 3); maxY = Math.min(cellHeight - 1, maxY + 3)
  const png = await sharp(cell, { raw: { width: cellWidth, height: cellHeight, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize(part.width, part.height, { fit: 'fill' }).png().toBuffer()
  const data = await sharp(png).raw().toBuffer()
  await writeFile(resolve(output, 'layers', `${part.name}.png`), png)
  psdLayers.push({ name: part.name, left: part.x, top: part.y,
    hidden: part.hidden ?? false, imageData: { width: part.width, height: part.height, data: new Uint8ClampedArray(data) } })
  if (!part.hidden) composite.push({ input: png, left: part.x, top: part.y })
  receipt.push({ ...part, sourceCrop: { left: left + minX, top: top + minY, width: maxX - minX + 1, height: maxY - minY + 1 }, sha256: createHash('sha256').update(png).digest('hex') })
}
const preview = await sharp({ create: { width, height, channels: 4, background: '#00000000' } }).composite(composite).png().toBuffer()
await writeFile(resolve(output, 'assembled-preview.png'), preview)
await mkdir(resolve(directory, 'public/art'), { recursive: true })
await writeFile(resolve(directory, 'public/art/assembled-preview.png'), preview)
await sharp(preview).flatten({ background: '#fff9f6' }).resize(700).jpeg({ quality: 92 }).toFile(resolve(output, 'assembled-preview.jpg'))
const pixels = await sharp(preview).raw().toBuffer()
const psd = writePsdBuffer({ width, height, channels: 4, bitsPerChannel: 8,
  imageData: { width, height, data: new Uint8ClampedArray(pixels) }, children: psdLayers })
await writeFile(resolve(output, 'strawberry-bunny.psd'), psd)
const inspected = readPsd(psd, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true })
if (inspected.children?.length !== layout.length) throw new Error('PSD layer count does not match generated components')
await writeFile(resolve(output, 'layers.json'), JSON.stringify({ width, height, atlasSha256: createHash('sha256').update(atlas).digest('hex'), layers: receipt }, null, 2) + '\n')
console.log(JSON.stringify({ layers: inspected.children.map(layer => layer.name), width, height, psdBytes: psd.length }))
