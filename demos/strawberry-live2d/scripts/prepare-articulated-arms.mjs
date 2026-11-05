import { readFile, writeFile, mkdir, cp } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { writePsdBuffer, readPsd, initializeCanvas } from 'ag-psd'

const root = fileURLToPath(new URL('../', import.meta.url))
const input = resolve(root, 'assets/motion-ready'), output = resolve(root, 'assets/articulated-arms')
const evidence = resolve(root, 'evidence/articulated-arms')
await mkdir(resolve(output, 'layers'), { recursive: true })
await mkdir(evidence, { recursive: true })
const current = JSON.parse(await readFile(resolve(input, 'manifest.json'), 'utf8'))
const original = await readFile(resolve(root, 'assets/reference-preserved/source.png'))
const { data: source, info: { width, height } } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const layers = [], fullPixels = new Map(), psdLayers = []
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

async function add(name, pixels, hidden, provenance) {
  let left = width, top = height, right = 0, bottom = 0, count = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!pixels[(y * width + x) * 4 + 3]) continue
    left = Math.min(left, x); top = Math.min(top, y)
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1); count++
  }
  assert.ok(count > 0, `${name} has no pixels`)
  const w = right - left, h = bottom - top
  const data = await sharp(pixels, { raw: { width, height, channels: 4 } }).extract({ left, top, width: w, height: h }).raw().toBuffer()
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
  await writeFile(resolve(output, 'layers', name + '.png'), png)
  const layer = { name, left, top, width: w, height: h, hidden, file: 'layers/' + name + '.png', pixels: count, provenance, sha256: sha(png) }
  layers.push(layer); fullPixels.set(name, pixels)
  psdLayers.push({ name, left, top, hidden, imageData: { width: w, height: h, data: new Uint8ClampedArray(data) } })
}

async function readFull(layer) {
  const data = await sharp(resolve(input, layer.file)).ensureAlpha().raw().toBuffer()
  const full = Buffer.alloc(source.length)
  for (let y = 0; y < layer.height; y++) {
    data.copy(full, ((y + layer.top) * width + layer.left) * 4, y * layer.width * 4, (y + 1) * layer.width * 4)
  }
  return full
}

// Coordinates are in the original 320px canvas. Left/right mean the character's
// own sides. Cut each arm's own artwork; never mirror a hand or repaint the face.
const joints = {}
for (const side of ['R', 'L']) {
  const point = ([x, y]) => [side === 'R' ? x : width - x, y]
  joints[side] = { shoulder: point([137, 171]), elbow: point([129, 190]), wrist: point([117, 205]) }
}

for (const layer of current.layers) {
  const full = await readFull(layer)
  if (!/^Arm[RL]$/.test(layer.name)) {
    await add(layer.name, full, layer.hidden, 'unchanged motion-ready/' + layer.file)
    continue
  }
  const side = layer.name.at(-1), { elbow, wrist } = joints[side]
  const direction = side === 'R' ? -1 : 1
  const pieces = { UpperArm: Buffer.alloc(source.length), Forearm: Buffer.alloc(source.length), Hand: Buffer.alloc(source.length) }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4
    if (!full[index + 3]) continue
    const afterWrist = direction * 9 * (x + .5 - wrist[0]) + 6 * (y + .5 - wrist[1]) >= 0
    const afterElbow = direction * 10 * (x + .5 - elbow[0]) + 12 * (y + .5 - elbow[1]) >= 0
    const owner = afterWrist ? 'Hand' : afterElbow ? 'Forearm' : 'UpperArm'
    full.copy(pieces[owner], index, index, index + 4)
  }
  // Tiny joint backing is hidden at neutral. Copy local original arm colors
  // only; the backing still needs a bent-pose review in the actual Cubism rig.
  for (const [name, center, radius] of [['ElbowUnderlap', elbow, 3], ['WristUnderlap', wrist, 2]]) {
    const backing = Buffer.alloc(source.length)
    for (let y = center[1] - radius; y <= center[1] + radius; y++) for (let x = center[0] - radius; x <= center[0] + radius; x++) {
      if ((x - center[0]) ** 2 + (y - center[1]) ** 2 > radius ** 2) continue
      let nearest = -1, distance = Infinity
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        const sx = x + dx, sy = y + dy, at = (sy * width + sx) * 4
        if (sx < 0 || sy < 0 || sx >= width || sy >= height || !full[at + 3]) continue
        const d = dx * dx + dy * dy
        if (d < distance) { distance = d; nearest = at }
      }
      assert.ok(nearest >= 0)
      const at = (y * width + x) * 4
      full.copy(backing, at, nearest, nearest + 4)
      backing[at + 3] = 255
    }
    await add(name + side, backing, true, 'hidden local-color extension; joint coverage candidate, not approved final art')
  }
  for (const [name, data] of Object.entries(pieces)) await add(name + side, data, false, `exact partition of original ${layer.name}; no rescaling`)
}

const assembled = Buffer.alloc(source.length), coverage = new Uint8Array(width * height)
for (const layer of layers.filter(layer => !layer.hidden)) {
  const pixels = fullPixels.get(layer.name)
  for (let i = 0; i < width * height; i++) if (pixels[i * 4 + 3]) {
    pixels.copy(assembled, i * 4, i * 4, i * 4 + 4); coverage[i]++
  }
}
let mismatchedVisiblePixels = 0, alphaMismatches = 0
for (let i = 0; i < width * height; i++) {
  const at = i * 4
  if (source[at + 3] !== assembled[at + 3]) alphaMismatches++
  if (!source[at + 3]) continue
  assert.equal(coverage[i], 1, 'Every visible neutral pixel must have exactly one owner')
  if (!source.subarray(at, at + 4).equals(assembled.subarray(at, at + 4))) mismatchedVisiblePixels++
}
assert.equal(mismatchedVisiblePixels, 0); assert.equal(alphaMismatches, 0)
const psd = writePsdBuffer({ width, height, channels: 4, bitsPerChannel: 8, imageData: { width, height, data: new Uint8ClampedArray(assembled) }, children: psdLayers })
await writeFile(resolve(output, 'strawberry-bunny.psd'), psd)
// Cubism's replace workflow keeps the existing meshes and does not create
// meshes for all newly named source layers. Import this subset with "add all
// layers as new ArtMeshes" to avoid duplicating the face and clothes.
const armLayerNames = /^(UpperArm|Forearm|Hand|ElbowUnderlap|WristUnderlap)[RL]$/
const armLayers = psdLayers.filter(layer => armLayerNames.test(layer.name))
const armComposite = Buffer.alloc(source.length)
for (const layer of layers.filter(layer => armLayerNames.test(layer.name) && !layer.hidden)) {
  const data = fullPixels.get(layer.name)
  for (let i = 0; i < width * height; i++) if (data[i * 4 + 3]) data.copy(armComposite, i * 4, i * 4, i * 4 + 4)
}
await writeFile(resolve(output, 'strawberry-arm-joints.psd'), writePsdBuffer({ width, height, channels: 4, bitsPerChannel: 8, imageData: { width, height, data: new Uint8ClampedArray(armComposite) }, children: armLayers }))
initializeCanvas(() => { throw new Error('PSD verification must use raw image data') }, (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }))
const inspected = readPsd(psd, { useImageData: true, skipCompositeImageData: true, skipThumbnail: true, throwForMissingFeatures: true })
assert.equal(inspected.children.length, 24)
for (const layer of layers) {
  const actual = inspected.children.find(value => value.name === layer.name)
  assert.equal(actual.left, layer.left); assert.equal(actual.top, layer.top)
  assert.equal(!!actual.hidden, layer.hidden)
  assert.equal(actual.imageData.width, layer.width); assert.equal(actual.imageData.height, layer.height)
  const expected = await sharp(fullPixels.get(layer.name), { raw: { width, height, channels: 4 } }).extract({ left: layer.left, top: layer.top, width: layer.width, height: layer.height }).raw().toBuffer()
  assert.deepEqual(Buffer.from(actual.imageData.data), expected, 'PSD round trip changed ' + layer.name)
}
await writeFile(resolve(output, 'neutral.png'), await sharp(assembled, { raw: { width, height, channels: 4 } }).png().toBuffer())

const rig = {
  status: 'layered candidate; NOT a bound or exported Live2D model', width, height, sourceSha256: sha(original),
  neutral: { mismatchedVisiblePixels, alphaMismatches, uniquePixelOwnership: true }, joints, layers,
  hierarchy: ['BodyZ → ShoulderR → UpperArmR + ElbowR → ForearmR + WristR → HandR', 'BodyZ → ShoulderL → UpperArmL + ElbowL → ForearmL + WristL → HandL'],
  bindingRequired: ['shoulder/elbow/wrist rotation deformers on each arm', 'local deformation at the puff sleeve and elbow', 'underlap visibility only when the relevant joint bends', 'test hand beside the cheek, shoulder cut, and return to neutral', 'export a separate MOC3 and verify in the real Core before replacing the demo'],
  existingModelChanged: false, existingRuntimeChanged: false
}
await writeFile(resolve(output, 'rig.json'), JSON.stringify(rig, null, 2) + '\n')
await writeFile(resolve(evidence, 'preparation.json'), JSON.stringify({ status: rig.status, sourceSha256: rig.sourceSha256, layers: layers.length, ...rig.neutral, existingModelChanged: false }, null, 2) + '\n')
const study = resolve(root, 'public/study-articulated')
await mkdir(study, { recursive: true })
await cp(resolve(output, 'layers'), resolve(study, 'layers'), { recursive: true })
await writeFile(resolve(study, 'reference.png'), original)
await writeFile(resolve(study, 'manifest.json'), JSON.stringify({ width, height, reference: 'reference.png', joints, layers }, null, 2) + '\n')
console.log(JSON.stringify({ layers: layers.length, mismatchedVisiblePixels, alphaMismatches, sourceSha256: rig.sourceSha256, status: rig.status }))
