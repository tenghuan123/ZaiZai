import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

process.chdir(fileURLToPath(new URL('../', import.meta.url)))
const articulated = process.argv.includes('--articulated')
const assets = articulated ? 'assets/articulated-arms' : 'assets/motion-ready'
const model = articulated ? 'public/model-articulated' : 'public/model'
const report = articulated ? 'evidence/articulated-arms/texture-padding.json' : 'evidence/texture-padding.json'
const geometry = JSON.parse(await readFile(`${assets}/runtime-geometry.json`, 'utf8'))
const moc = await readFile(`${model}/strawberry-bunny.moc3`)
if (createHash('sha256').update(moc).digest('hex') !== geometry.mocSha256) throw new Error('MOC3 changed: refresh neutral Core geometry before padding this export')
const manifest = JSON.parse(await readFile(`${assets}/${articulated ? 'rig' : 'manifest'}.json`, 'utf8'))
const original = await readFile('assets/reference-preserved/source.png')
if (createHash('sha256').update(original).digest('hex') !== (articulated ? manifest.sourceSha256 : manifest.provenance.sourceSha256)) throw new Error('Original artwork does not match the model source')
const source = await sharp(original).ensureAlpha().raw().toBuffer()
const base = await readFile(`${assets}/texture_00.export.png`)
const { data: atlas, info } = await sharp(base).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const padded = Buffer.from(atlas), changes = []

for (const mesh of geometry.drawables) {
  if (!mesh.opacity || mesh.id === 'HairUnderpaint') continue
  const layer = manifest.layers.find(layer => layer.name === mesh.id)
  const points = mesh.positions.map((value, i) => (i % 2 ? .5 - value : value + .5) * 320)
  const uv = mesh.uvs.map((value, i) => (i % 2 ? 1 - value : value) * (i % 2 ? info.height : info.width))
  let transform
  for (let i = 2; i < points.length - 2; i += 2) {
    const x1 = points[i] - points[0], y1 = points[i + 1] - points[1]
    const x2 = points[i + 2] - points[0], y2 = points[i + 3] - points[1], determinant = x1 * y2 - y1 * x2
    if (Math.abs(determinant) < 1) continue
    const u1 = uv[i] - uv[0], v1 = uv[i + 1] - uv[1], u2 = uv[i + 2] - uv[0], v2 = uv[i + 3] - uv[1]
    const a = (u1 * y2 - u2 * y1) / determinant, b = (u2 * x1 - u1 * x2) / determinant
    const c = (v1 * y2 - v2 * y1) / determinant, d = (v2 * x1 - v1 * x2) / determinant
    transform = { a, b, c, d, tx: uv[0] - a * points[0] - b * points[1], ty: uv[1] - c * points[0] - d * points[1] }
    break
  }
  if (!transform || !layer) throw new Error('Missing affine geometry for ' + mesh.id)
  const { a, b, c, d, tx, ty } = transform, determinant = a * d - b * c
  for (let i = 0; i < points.length; i += 2) {
    if (Math.abs(a * points[i] + b * points[i + 1] + tx - uv[i]) > .01 || Math.abs(c * points[i] + d * points[i + 1] + ty - uv[i + 1]) > .01) throw new Error('Non-affine neutral mesh: ' + mesh.id)
  }
  const toSource = (u, v) => [(d * (u - tx) - b * (v - ty)) / determinant, (a * (v - ty) - c * (u - tx)) / determinant]
  const us = uv.filter((_, i) => i % 2 === 0), vs = uv.filter((_, i) => i % 2 === 1)
  let count = 0
  for (let y = Math.max(0, Math.floor(Math.min(...vs))); y < Math.min(info.height, Math.ceil(Math.max(...vs))); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...us))); x < Math.min(info.width, Math.ceil(Math.max(...us))); x++) {
      const index = (y * info.width + x) * 4
      if (atlas[index + 3] < 245) continue
      const [sx, sy] = toSource(x + .5, y + .5)
      if (sx < layer.left - 1 || sy < layer.top - 1 || sx > layer.left + layer.width + 1 || sy > layer.top + layer.height + 1) continue
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 4) continue
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue
        const target = (ny * info.width + nx) * 4
        if (padded[target + 3]) continue
        const [px, py] = toSource(nx + .5, ny + .5), ox = Math.floor(px), oy = Math.floor(py)
        if (ox < 0 || oy < 0 || ox >= 320 || oy >= 320) continue
        const from = (oy * 320 + ox) * 4
        if (source[from + 3] < 245) continue
        // Extend this part's own edge color. Copying the adjacent shirt into hair or
        // an arm would expose white fragments when those parts rotate independently.
        atlas.copy(padded, target, index, index + 4)
        count++
      }
    }
  }
  changes.push({ mesh: mesh.id, pixels: count })
}
const output = await sharp(padded, { raw: info }).png().toBuffer()
await writeFile(`${model}/strawberry-bunny.1024/texture_00.png`, output)
await writeFile(report, JSON.stringify({ generatedAt: new Date().toISOString(), method: 'Two-pixel overlap using each original part edge color, restricted to the original character silhouette; no visible source texels replaced', sourceAtlasSha256: createHash('sha256').update(base).digest('hex'), outputSha256: createHash('sha256').update(output).digest('hex'), changes }, null, 2) + '\n')
console.log(changes)
