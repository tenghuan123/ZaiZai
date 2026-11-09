import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'

const directory = fileURLToPath(new URL('./', import.meta.url))
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined })
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', error => errors.push(error.message))
const result = { errors, poses: [], playback: [] }
try {
  await page.goto('http://127.0.0.1:5187/')
  await page.waitForFunction(() => document.body.dataset.ready === 'true')
  for (const id of ['greet', 'explain']) {
    await page.locator(`.gesture-button[data-gesture="${id}"]`).click()
    await page.waitForFunction(() => Number(document.querySelector('#character').dataset.gestureProgress) > .45)
    await page.locator('#play').click()
    const snapshot = () => page.locator('#character').evaluate(canvas => ({ ...canvas.dataset }))
    const paused = await snapshot()
    await page.waitForTimeout(180)
    assert.deepEqual(await snapshot(), paused)
    await page.locator('#stage').screenshot({ path: directory + id + '-hold.png' })
    await page.locator('#play').click()
    await page.waitForFunction(() => document.querySelector('#emotion-label').textContent === '动作演完啦')
    await page.waitForFunction(() => {
      const c = document.querySelector('#character')
      return Number(c.dataset.armLeft) < .002 && Number(c.dataset.elbowLeft) < .002 && Math.abs(Number(c.dataset.wristLeft)) < .002
    })
    result.playback.push({ id, pauseFrozen: true, returned: true })
  }
  result.geometry = await page.evaluate(async () => {
    const { ArmSkinning } = await import('/src/arm-skinning.ts')
    const C = window.Live2DCubismCore
    const moc = C.Moc.fromArrayBuffer(await (await fetch('/model-articulated/strawberry-bunny.moc3')).arrayBuffer())
    const model = C.Model.fromMoc(moc), p = model.parameters, d = model.drawables
    model.update()
    const skinning = new ArmSkinning(d), neutral = d.vertexPositions.map(p => p.slice())
    const area = (points, a, b, c) => (points[b * 2] - points[a * 2]) * (points[c * 2 + 1] - points[a * 2 + 1]) - (points[b * 2 + 1] - points[a * 2 + 1]) * (points[c * 2] - points[a * 2])
    let samples = 0, flips = 0, finite = true, coreUnchanged = true, restExact = true
    let maximumDeltaPixels = 0
    const flippedTriangles = []
    try {
      for (const side of ['L', 'R']) for (const shoulder of [0, .5, .95]) for (const elbow of [0, .25, .5, .75, 1]) for (const wrist of [-.65, 0, .65]) {
        p.values.set(p.defaultValues)
        for (const [id, value] of [[`ParamArm${side}`, shoulder], [`ParamElbow${side}`, elbow], [`ParamWrist${side}`, wrist]]) p.values[p.ids.indexOf(id)] = value
        model.update()
        const original = d.vertexPositions.map(points => points.slice())
        for (let mesh = 0; mesh < d.count; mesh++) {
          const output = skinning.vertices(mesh)
          finite &&= Array.from(output).every(Number.isFinite)
          coreUnchanged &&= d.vertexPositions[mesh].every((v, i) => v === original[mesh][i])
          if (elbow === 0) restExact &&= output.every((v, i) => v === original[mesh][i])
          for (let v = 0; v < output.length; v++) maximumDeltaPixels = Math.max(maximumDeltaPixels, Math.abs(output[v] - original[mesh][v]) * 320)
          for (let tri = 0; tri < d.indices[mesh].length; tri += 3) {
            const [a, b, c] = d.indices[mesh].slice(tri, tri + 3)
            if (area(neutral[mesh], a, b, c) * area(output, a, b, c) < -1e-12) {
              flips++
              flippedTriangles.push({ side, shoulder, elbow, wrist, mesh: d.ids[mesh], triangle: [a, b, c], nativeArea: area(original[mesh], a, b, c), outputArea: area(output, a, b, c) })
            }
          }
        }
        samples++
      }
      return { samples, flips, flippedTriangles, finite, coreUnchanged, restExact, maximumDeltaPixels }
    } finally { model.release(); moc._release() }
  })
  assert.equal(result.geometry.finite, true)
  assert.equal(result.geometry.coreUnchanged, true)
  assert.equal(result.geometry.restExact, true)
  if (result.geometry.flips) console.log(JSON.stringify(result.geometry, null, 2))
  assert.equal(result.geometry.flips, 0, 'skinning inverted a triangle')

  // One WebGL model per page. Switch only the vertex getter, then render the
  // frozen pose twice so both captures have identical parameters and eye frame.
  await page.route('**/elbow-test', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;background:#fff8f5"><section id="elbow-comparison" style="width:560px;background:#fff8f5;text-align:center;padding-top:12px;color:#493b35"><p id="comparison-title" style="margin:0;height:42px;font:18px sans-serif"></p><div id="test-stage" style="width:560px;height:560px"><canvas id="test-canvas"></canvas></div></section></body></html>' }))
  await page.goto('http://127.0.0.1:5187/elbow-test')
  await page.evaluate(async () => {
    const { StrawberryViewer } = await import('/src/viewer.ts')
    window.__elbowViewer = await StrawberryViewer.load(document.querySelector('#test-canvas'), document.querySelector('#test-stage'))
    window.__softVertices = window.__elbowViewer.model.internalModel.coreModel.getDrawableVertices
  })
  for (const pose of [
    { name: 'neutral', values: {} },
    { name: 'quarter', values: { ParamArmL: .95, ParamElbowL: .25 } },
    { name: 'half', values: { ParamArmL: .95, ParamElbowL: .5 } },
    { name: 'three-quarter', values: { ParamArmL: .95, ParamElbowL: .75 } },
    { name: 'full', values: { ParamArmL: .95, ParamElbowL: 1 } },
    { name: 'right', values: { ParamArmR: .95, ParamElbowR: 1, ParamWristR: .65 } },
    { name: 'both', values: { ParamArmR: .7, ParamElbowR: .8, ParamArmL: .7, ParamElbowL: .8, ParamBodyAngleZ: 1 } },
    { name: 'returned', values: {} }
  ]) {
    await page.evaluate(values => { window.__elbowViewer.setPose(values); window.__elbowViewer.setPaused(false) }, pose.values)
    await page.waitForFunction(values => ['ParamArmL', 'ParamArmR', 'ParamElbowL', 'ParamElbowR', 'ParamBodyAngleZ'].every(id => Math.abs(window.__elbowViewer.motion.pose[id] - (values[id] || 0)) < .0001), pose.values)
    await page.evaluate(() => window.__elbowViewer.setPaused(true))
    const images = []
    for (const soft of [false, true]) {
      await page.evaluate(soft => {
        const v = window.__elbowViewer, core = v.model.internalModel.coreModel
        core.getDrawableVertices = soft ? window.__softVertices : index => core.getModel().drawables.vertexPositions[index]
        document.querySelector('#comparison-title').textContent = soft ? '修改后' : '修改前'
        v.app.render()
      }, soft)
      images.push(await page.locator('#elbow-comparison').screenshot())
    }
    const { width, height } = await sharp(images[0]).metadata()
    await sharp({ create: { width: width * 2, height, channels: 4, background: '#fff8f5' } }).composite(images.map((input, i) => ({ input, left: width * i, top: 0 }))).png().toFile(directory + pose.name + '-comparison.png')
    if (pose.name === 'neutral') assert.deepEqual(await sharp(images[0]).extract({ left: 0, top: 108, width, height: height - 108 }).raw().toBuffer(), await sharp(images[1]).extract({ left: 0, top: 108, width, height: height - 108 }).raw().toBuffer())
    result.poses.push(pose)
  }
  assert.deepEqual(errors, [])
  await writeFile(directory + 'result.json', JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
} finally { await browser.close() }
