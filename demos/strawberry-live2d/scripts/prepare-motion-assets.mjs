import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { writePsdBuffer } from 'ag-psd'
import { neutralLayerNames, eyeBoxes, ownerAt } from './source-parts.mjs'

const directory=fileURLToPath(new URL('../',import.meta.url))
const output=resolve(directory,'assets/motion-ready'), served=resolve(directory,'public/study')
const sourceDirectory=resolve(directory,'../../resources/pets/strawberry-bunny-v3/keyframes')
await mkdir(resolve(output,'layers'),{recursive:true});await mkdir(resolve(served,'layers'),{recursive:true})
const reference=JSON.parse(await readFile(resolve(directory,'assets/reference-preserved/layers.json'),'utf8'))
const original=await readFile(resolve(sourceDirectory,'idle/00.png'))
const pixels=await sharp(original).ensureAlpha().raw().toBuffer()
const {width,height}=reference
const assets=[],psdLayers=[]

async function add(name,png,left,top,hidden,source) {
  const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  await writeFile(resolve(output,'layers',name+'.png'),png)
  await writeFile(resolve(served,'layers',name+'.png'),png)
  assets.push({name,left,top,width:info.width,height:info.height,hidden,file:'layers/'+name+'.png',source,sha256:createHash('sha256').update(png).digest('hex')})
  psdLayers.push({name,left,top,hidden,imageData:{width:info.width,height:info.height,data:new Uint8ClampedArray(data)}})
}

const generated=await sharp(resolve(output,'hair-underpaint-generated.png')).resize(width,height,{fit:'fill'}).ensureAlpha().raw().toBuffer()
const backing=Buffer.alloc(pixels.length)
let underpaintPixels=0
const foreground = new Uint8Array(width*height)
for(let y=151;y<247;y++)for(let x=0;x<width;x++) {
  if(['Body','ArmR','ArmL','LegR','LegL'].includes(ownerAt(x,y)))foreground[y*width+x]=1
}
for(let y=148;y<255;y++)for(let x=0;x<width;x++) {
  const index=(y*width+x)*4
  // The generated drawing only supplies formerly occluded hair. Never replace the face,
  // clothes, or the silhouette. The original's interior alpha is mostly 253 rather than
  // 255, so the backing stays hidden at neutral and fades in only for limb/head motion.
  if(pixels[index+3]<245 || generated[index+3]<100 || (y<151 && pixels[index+1]>145))continue
  // Rear hair tilts independently from the dress/arms. Extend the hidden fill
  // beyond the original cut, otherwise their moving boundaries expose a white slit.
  let covered=false
  for(let dy=-8;dy<=8&&!covered;dy++)for(let dx=-8;dx<=8;dx++) {
    if(dx*dx+dy*dy>64)continue
    const px=x+dx,py=y+dy
    if(px>=0&&px<width&&py>=0&&py<height&&foreground[py*width+px]){covered=true;break}
  }
  if(!covered)continue
  generated.copy(backing,index,index,index+3);backing[index+3]=255;underpaintPixels++
}
assert.ok(underpaintPixels>1000)
const backingPng=await sharp(backing,{raw:{width,height,channels:4}}).png().toBuffer()
await add('HairUnderpaint',backingPng,0,0,true,'image_gen hidden hair completion; enabled only during local head/arm motion')
for(const name of neutralLayerNames) {
  const layer=reference.layers.find(value=>value.name===name)
  await add(name,await readFile(resolve(directory,'assets/reference-preserved/layers',name+'.png')),layer.left,layer.top,false,'original idle/00.png; unscaled source pixels')
}

async function expressionPatch(name,frame,rectangle,placement=rectangle) {
  const data=await sharp(resolve(sourceDirectory,frame+'.png')).extract(rectangle).ensureAlpha().raw().toBuffer()
  for(let y=0;y<rectangle.height;y++)for(let x=0;x<rectangle.width;x++) {
    const edge=Math.min(x+1,rectangle.width-x,y+1,rectangle.height-y)
    const index=(y*rectangle.width+x)*4+3
    data[index]=Math.round(data[index]*Math.min(1,edge/1.7))
  }
  const png=await sharp(data,{raw:{width:rectangle.width,height:rectangle.height,channels:4}}).png().toBuffer()
  await add(name,png,placement.left,placement.top,true,'existing '+frame+'.png; expression patch with a soft edge')
}
for(const side of ['R','L']) {
  await expressionPatch('Eye'+side+'Half','idle/19',eyeBoxes[side])
  await expressionPatch('Eye'+side+'Closed','idle/20',eyeBoxes[side])
}
// The speaking frame's painted mouth is left/below the neutral smile. Align its
// center to the original smile without repainting or reshaping the face.
await expressionPatch('MouthTalk','react/08',{left:149,top:131,width:22,height:15},{left:151,top:128})

const psd=writePsdBuffer({width,height,channels:4,bitsPerChannel:8,imageData:{width,height,data:new Uint8ClampedArray(pixels)},children:psdLayers})
await writeFile(resolve(output,'strawberry-bunny.psd'),psd)
await copyFile(resolve(sourceDirectory,'idle/00.png'),resolve(served,'reference.png'))
const manifest={format:'layer-study-not-cubism',width,height,reference:'reference.png',layers:assets,
  motionLimits:{headDegrees:5,armDegrees:15,bodyDegrees:1.5},
  provenance:{source:'original idle/00.png',sourceSha256:reference.sourceSha256,underpaintPixels,regeneratedFaceUsed:false},
  live2dRuntimeVerified:false}
await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
await writeFile(resolve(served,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify({layers:assets.length,underpaintPixels,sourceSha256:reference.sourceSha256,regeneratedFaceUsed:false}))
