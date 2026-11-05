import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../', import.meta.url))
const input = resolve(root, 'assets/articulated-arms'), output = resolve(root, 'evidence/articulated-arms')
await mkdir(output, { recursive: true })
const rig = JSON.parse(await readFile(resolve(input, 'rig.json'), 'utf8'))
const images = new Map()
for (const layer of rig.layers) {
  const png = await readFile(resolve(input, layer.file))
  images.set(layer.name, `<image x="${layer.left}" y="${layer.top}" width="${layer.width}" height="${layer.height}" href="data:image/png;base64,${png.toString('base64')}"/>`)
}
const draw = name => images.get(name)
function arm(side, shoulder = 0, elbow = 0, wrist = 0) {
  const j = rig.joints[side]
  return `<g transform="rotate(${shoulder} ${j.shoulder})">${elbow ? draw('ElbowUnderlap' + side) : ''}${draw('UpperArm' + side)}<g transform="rotate(${elbow} ${j.elbow})">${wrist ? draw('WristUnderlap' + side) : ''}${draw('Forearm' + side)}<g transform="rotate(${wrist} ${j.wrist})">${draw('Hand' + side)}</g></g></g>`
}
const poses = [
  { name: 'neutral', title: '原画静止', a: 0, e: 0, w: 0 },
  { name: 'enter', title: '抬臂与弯肘', a: -25, e: -50, w: 0 },
  { name: 'raised', title: '挥手姿态草稿', a: -45, e: -95, w: 0 },
  { name: 'wave', title: '手腕摆动草稿', a: -45, e: -95, w: -20 }
]
const composites = []
for (const [index, pose] of poses.entries()) {
  let body = pose.a ? draw('HairUnderpaint') : ''
  for (const name of ['HairBack', 'LegR', 'LegL', 'Body']) body += draw(name)
  body += arm('R') + arm('L', pose.a, pose.e, pose.w)
  for (const name of ['Head', 'EyeROpen', 'EyeLOpen', 'MouthSmile']) body += draw(name)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">${body}</svg>`
  await writeFile(resolve(output, pose.name + '.svg'), svg)
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  await writeFile(resolve(output, pose.name + '.png'), png)
  composites.push({ input: await sharp(png).resize(480, 480).png().toBuffer(), left: index * 480, top: 72 })
}
let text = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="570"><style>text{font-family:PingFang SC,sans-serif;fill:#775e67}</style><text x="24" y="28" font-size="20">分层动作候选 · 尚未在 Cubism 绑定，不能代表导出模型效果</text>'
for (const [index, pose] of poses.entries()) text += `<text x="${index * 480 + 240}" y="62" font-size="17" text-anchor="middle">${pose.title}</text>`
text += '</svg>'
composites.push({ input: Buffer.from(text), left: 0, top: 0 })
await sharp({ create: { width: 1920, height: 570, channels: 3, background: '#fff8f5' } }).composite(composites).png().toFile(resolve(output, 'pose-candidates.png'))
