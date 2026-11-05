import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { writePsdBuffer, readPsd } from 'ag-psd'
import { neutralLayerNames, eyeBoxes, ownerAt } from './source-parts.mjs'

const directory = fileURLToPath(new URL('../', import.meta.url))
const sourceDirectory = resolve(directory, '../../resources/pets/strawberry-bunny-v3/keyframes/idle')
const output = resolve(directory, 'assets/reference-preserved')
await mkdir(resolve(output, 'layers'), { recursive: true })
await mkdir(resolve(directory, 'public/art'), { recursive: true })
await mkdir(resolve(directory, 'evidence'), { recursive: true })

const original = await readFile(resolve(sourceDirectory, '00.png'))
const { data: source, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
assert.equal(info.width, 320); assert.equal(info.height, 320)
const { width, height } = info
const names = neutralLayerNames
const eyeR = eyeBoxes.R, eyeL = eyeBoxes.L

const owners = new Array(width * height)
const bounds = Object.fromEntries(names.map(name => [name, { left:width, top:height, right:0, bottom:0, pixels:0 }]))
let visiblePixels = 0
for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
  if (!source[(y*width+x)*4+3]) continue
  const name = ownerAt(x,y), box = bounds[name]
  owners[y*width+x] = name
  box.left=Math.min(box.left,x); box.top=Math.min(box.top,y)
  box.right=Math.max(box.right,x+1); box.bottom=Math.max(box.bottom,y+1); box.pixels++
  visiblePixels++
}

const psdLayers = [], exported = [], reconstructed = Buffer.alloc(source.length)
const coverage = new Uint8Array(width * height)
for (const name of names) {
  const box = bounds[name]
  assert.ok(box.pixels > 0, `${name} has no source pixels`)
  const layerWidth = box.right-box.left, layerHeight = box.bottom-box.top
  const pixels = Buffer.alloc(layerWidth * layerHeight * 4)
  for (let y=box.top;y<box.bottom;y++) for (let x=box.left;x<box.right;x++) {
    if (owners[y*width+x] !== name) continue
    const from = (y*width+x)*4, to = ((y-box.top)*layerWidth+x-box.left)*4
    source.copy(pixels,to,from,from+4)
    pixels.copy(reconstructed,from,to,to+4)
    coverage[y*width+x]++
  }
  const png = await sharp(pixels,{raw:{width:layerWidth,height:layerHeight,channels:4}}).png().toBuffer()
  await writeFile(resolve(output,'layers',`${name}.png`),png)
  psdLayers.push({name,left:box.left,top:box.top,imageData:{width:layerWidth,height:layerHeight,data:new Uint8ClampedArray(pixels)}})
  exported.push({name,left:box.left,top:box.top,width:layerWidth,height:layerHeight,sourcePixels:box.pixels,sha256:createHash('sha256').update(png).digest('hex')})
}

let mismatchedVisiblePixels = 0, alphaMismatches = 0
for (let pixel=0;pixel<width*height;pixel++) {
  const offset=pixel*4
  if (source[offset+3] !== reconstructed[offset+3]) alphaMismatches++
  if (!source[offset+3]) continue
  assert.equal(coverage[pixel],1,'Every visible original pixel must belong to exactly one neutral layer')
  if (!source.subarray(offset,offset+4).equals(reconstructed.subarray(offset,offset+4))) mismatchedVisiblePixels++
}
assert.equal(mismatchedVisiblePixels,0); assert.equal(alphaMismatches,0)

// These closed-eye candidates also come from the existing character, not a redrawn face.
// Their cut edges and motion still require review before binding; they are hidden by default.
const blinkFile = await readFile(resolve(sourceDirectory,'20.png'))
for (const [name,rectangle] of [['EyeRClosed',eyeR],['EyeLClosed',eyeL]]) {
  const png = await sharp(blinkFile).extract(rectangle).ensureAlpha().png().toBuffer()
  const pixels = await sharp(png).raw().toBuffer()
  await writeFile(resolve(output,'layers',`${name}.png`),png)
  psdLayers.push({name,left:rectangle.left,top:rectangle.top,hidden:true,imageData:{width:rectangle.width,height:rectangle.height,data:new Uint8ClampedArray(pixels)}})
  exported.push({name,...rectangle,hidden:true,sourceFrame:'20.png',status:'candidate; edge and animation review pending',sha256:createHash('sha256').update(png).digest('hex')})
}

const psd = writePsdBuffer({width,height,channels:4,bitsPerChannel:8,imageData:{width,height,data:new Uint8ClampedArray(reconstructed)},children:psdLayers})
await writeFile(resolve(output,'strawberry-bunny.psd'),psd)
const inspected = readPsd(psd,{skipLayerImageData:true,skipCompositeImageData:true,skipThumbnail:true})
assert.equal(inspected.children.length,12)
for (const layer of exported) {
  const actual=inspected.children.find(value=>value.name===layer.name)
  assert.equal(actual.left,layer.left); assert.equal(actual.top,layer.top); assert.equal(!!actual.hidden,!!layer.hidden)
}

await copyFile(resolve(sourceDirectory,'00.png'),resolve(output,'source.png'))
await copyFile(resolve(sourceDirectory,'00.png'),resolve(output,'assembled-preview.png'))
await copyFile(resolve(sourceDirectory,'00.png'),resolve(directory,'public/art/reference-idle.png'))
const sha256=createHash('sha256').update(original).digest('hex')
const report={checkedAt:new Date().toISOString(),status:'neutral-reference-preserved; rig preparation incomplete',
  source:'resources/pets/strawberry-bunny-v3/keyframes/idle/00.png',sourceSha256:sha256,width,height,
  visiblePixels,mismatchedVisiblePixels,alphaMismatches,neutralLayers:names.length,totalPsdLayers:inspected.children.length,
  neutralScale:'1:1; no independent resizing, mirroring, or repainting',layers:exported,
  pending:['refine separation boundaries and complete only hidden surfaces','review closed-eye candidate edges','create and export real Cubism model','verify deformation and dialogue playback in runtime'],runtimeVerified:false}
await writeFile(resolve(output,'layers.json'),JSON.stringify(report,null,2)+'\n')
await writeFile(resolve(directory,'evidence/reference-preservation.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({width,height,visiblePixels,mismatchedVisiblePixels,alphaMismatches,layers:inspected.children.length,sourceSha256:sha256}))
