import { Application, Ticker } from 'pixi.js'
import type { Cubism4InternalModel, Live2DModel } from 'pixi-live2d-display/cubism4'
import { neutralPose, type ActingPose } from './scenes'
import { ActingMotion } from './acting-motion'
import { blinkOpenness, resolveEyeFrame } from './eye-motion'
import { sampleGesture, type GestureId } from './gestures'

export interface CharacterPlayback {
  setPose(pose:Partial<ActingPose>,mouth?:()=>number):void
  setGesture(id:GestureId,progress:()=>number,mouth?:()=>number):void
  setPaused(paused:boolean):void
  destroy():void
}

export class StrawberryViewer implements CharacterPlayback {
  private target = (): ActingPose => ({ ...neutralPose })
  private motion = new ActingMotion(neutralPose)
  private elapsed = 0
  private mouthOpen = 0
  private previous = performance.now()
  private mouth = (): number => 0
  private resizeObserver: ResizeObserver

  private constructor(private app: Application, private model: Live2DModel<Cubism4InternalModel>, private container: HTMLElement, private canvas: HTMLCanvasElement) {
    model.internalModel.motionManager.stopAllMotions()
    model.internalModel.eyeBlink = undefined
    model.internalModel.on('beforeModelUpdate', () => this.updateParameters())
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
  }

  static async load(canvas: HTMLCanvasElement, container: HTMLElement): Promise<StrawberryViewer> {
    await loadCore()
    const { Live2DModel } = await import('pixi-live2d-display/cubism4')
    Live2DModel.registerTicker(Ticker)
    const app = new Application({ view: canvas, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true })
    try {
      class StrawberryModel extends Live2DModel<Cubism4InternalModel> {}
      const model = await StrawberryModel.from('/model-articulated/strawberry-bunny.model3.json', { autoInteract: false })
      const actual = model.internalModel.coreModel.getModel()
      // Core 6 moved render orders from Drawables onto Model. This demo exports MOC 4.2,
      // so there are no offscreen passes; keep the old Pixi renderer's contract explicit.
      const core6 = actual as typeof actual & { getRenderOrders?: () => Int32Array; offscreens?: { count: number } }
      if (!actual.drawables.renderOrders) {
        const orders = core6.getRenderOrders?.()
        if (!orders || core6.offscreens?.count || orders.length !== actual.drawables.count ||
          new Set(orders).size !== orders.length || orders.some(order => order < 0 || order >= orders.length)) {
          model.destroy()
          throw new Error('当前模型使用了此演示渲染器不支持的绘制顺序或离屏效果。')
        }
        model.internalModel.coreModel.getDrawableRenderOrders = () => core6.getRenderOrders!()
      }
      const required = [...Object.keys(neutralPose), 'ParamMouthOpenY']
      const missing = required.filter(id => !actual.parameters.ids.includes(id))
      if (missing.length) { model.destroy(); throw new Error(`模型缺少表演参数：${missing.join('、')}`) }
      if (actual.drawables.count < 24) { model.destroy(); throw new Error('模型尚未包含完整的手臂关节分层。') }
      // An ID alone does not prove a binding. Compare the compiled model's drawable output at both ends.
      const savedValues = actual.parameters.values.slice()
      const bindings: { id: string; minimum: number; maximum: number; drawables: string[] }[] = []
      let eyeCombinations = 0
      let eyeError = ''
      let jointError = ''
      try {
        for (const id of required) {
          const index = actual.parameters.ids.indexOf(id)
          const minimum = actual.parameters.minimumValues[index], maximum = actual.parameters.maximumValues[index]
          actual.parameters.values.set(actual.parameters.defaultValues)
          actual.parameters.values[index] = minimum
          actual.update()
          const vertices = actual.drawables.vertexPositions.map(positions => positions.slice())
          const opacities = actual.drawables.opacities.slice()
          actual.parameters.values[index] = maximum
          actual.update()
          const changed = actual.drawables.ids.filter((_, drawable) =>
            Math.abs(actual.drawables.opacities[drawable] - opacities[drawable]) > 0.000001 ||
            actual.drawables.vertexPositions[drawable].some((value, vertex) => Math.abs(value - vertices[drawable][vertex]) > 0.000001))
          bindings.push({ id, minimum, maximum, drawables: changed })
        }
        for (const side of ['L', 'R']) {
          const expected = {
            [`ParamArm${side}`]: ['Hand', 'Forearm', 'UpperArm', 'WristUnderlap', 'ElbowUnderlap'].map(name => name + side),
            [`ParamElbow${side}`]: ['Hand', 'Forearm', 'WristUnderlap', 'ElbowUnderlap'].map(name => name + side),
            // The wrist backing has the same opacity at both extremes; check it against neutral below.
            [`ParamWrist${side}`]: ['Hand' + side]
          }
          for (const [id, names] of Object.entries(expected)) {
            const changed = bindings.find(binding => binding.id === id)!.drawables
            if (changed.length !== names.length || names.some(name => !changed.includes(name))) jointError = `模型关节绑定异常：${id}。`
          }
          for (const joint of ['Elbow', 'Wrist']) for (const value of joint === 'Wrist' ? [-1, 0, 1] : [0, 1]) {
            actual.parameters.values.set(actual.parameters.defaultValues)
            actual.parameters.values[actual.parameters.ids.indexOf(`Param${joint}${side}`)] = value
            actual.update()
            const mesh = actual.drawables.ids.indexOf(`${joint}Underlap${side}`)
            if (mesh < 0 || Math.abs(actual.drawables.opacities[mesh] - Number(value !== 0)) > .0001) jointError = `模型关节补片异常：${joint}${side}。`
          }
        }
        // Both eyes must work together: isolated endpoint checks miss accidental cross-bindings.
        for (const left of [0, 0.5, 1]) for (const right of [0, 0.5, 1]) {
          actual.parameters.values.set(actual.parameters.defaultValues)
          actual.parameters.values[actual.parameters.ids.indexOf('ParamEyeLOpen')] = left
          actual.parameters.values[actual.parameters.ids.indexOf('ParamEyeROpen')] = right
          actual.update()
          for (const [side, value] of [['L', left], ['R', right]] as const) {
            for (const [suffix, expected] of [['Closed', Number(value === 0)], ['Half', Number(value === 0.5)]] as const) {
              const id = `Eye${side}${suffix}`, index = actual.drawables.ids.indexOf(id)
              if (index < 0 || Math.abs(actual.drawables.opacities[index] - expected) > 0.0001) {
                eyeError = `模型眼部绑定异常：${id}，左眼 ${left} / 右眼 ${right}。`
              }
            }
          }
          eyeCombinations++
        }
      } finally {
        actual.parameters.values.set(savedValues)
        actual.update()
      }
      if (eyeError) { model.destroy(); throw new Error(eyeError) }
      if (jointError) { model.destroy(); throw new Error(jointError) }
      const unbound = bindings.filter(binding => !binding.drawables.length)
      if (unbound.length) { model.destroy(); throw new Error(`这些参数还没有实际改变模型：${unbound.map(binding => binding.id).join('、')}`) }
      app.stage.addChild(model)
      canvas.dataset.renderer = 'live2d-cubism'
      canvas.dataset.parameterCount = String(actual.parameters.count)
      canvas.dataset.drawableCount = String(actual.drawables.count)
      canvas.dataset.bindings = JSON.stringify(bindings)
      canvas.dataset.eyeCombinations = String(eyeCombinations)
      return new StrawberryViewer(app, model, container, canvas)
    } catch (error) { app.destroy(false, { children: true }); throw error }
  }

  setPose(pose: Partial<ActingPose>, mouth: () => number = () => 0): void {
    const target = { ...neutralPose, ...pose }
    this.target = () => target
    this.mouth = mouth
    delete this.canvas.dataset.gesture
    delete this.canvas.dataset.gestureProgress
  }

  setGesture(id: GestureId, progress: () => number, mouth: () => number = () => 0): void {
    this.target = () => {
      const time = progress()
      this.canvas.dataset.gestureProgress = time.toFixed(4)
      return sampleGesture(id, time)
    }
    this.canvas.dataset.gesture = id
    this.mouth = mouth
  }

  setPaused(paused: boolean): void {
    this.previous = performance.now()
    this.model.autoUpdate = !paused
    if (paused) this.app.stop()
    else this.app.start()
  }

  destroy(): void {
    this.resizeObserver.disconnect()
    this.app.destroy(false, { children: true, texture: true, baseTexture: true })
  }

  private resize(): void {
    const { width, height } = this.container.getBoundingClientRect()
    if (!width || !height) return
    this.app.renderer.resize(width, height)
    const ratio = Math.min(width * 0.84 / this.model.internalModel.width, height * 0.94 / this.model.internalModel.height)
    this.model.scale.set(ratio)
    this.model.anchor.set(0.5, 1)
    this.model.position.set(width / 2, height * 0.98)
  }

  private updateParameters(): void {
    const now = performance.now()
    const dt = Math.min((now - this.previous) / 1000, 0.1)
    this.previous = now
    this.elapsed += dt
    const seconds = this.elapsed, current = this.motion.advance(this.target(), dt)
    const core = this.model.internalModel.coreModel
    for (const id of Object.keys(current) as (keyof ActingPose)[]) {
      core.setParameterValueById(id, current[id])
    }
    const blink = blinkOpenness(seconds)
    const leftEye = resolveEyeFrame(current.ParamEyeLOpen, blink)
    const rightEye = resolveEyeFrame(current.ParamEyeROpen, blink)
    core.setParameterValueById('ParamEyeLOpen', leftEye)
    core.setParameterValueById('ParamEyeROpen', rightEye)
    const mouth = Math.max(0, Math.min(1, this.mouth()))
    this.mouthOpen += (mouth - this.mouthOpen) * (1 - Math.exp(-dt * (mouth > this.mouthOpen ? 38 : 24)))
    if (mouth === 0 && this.mouthOpen < 0.005) this.mouthOpen = 0
    core.setParameterValueById('ParamMouthOpenY', this.mouthOpen)
    // Breathing is optional; all required acting parameters are checked against real MOC3 output.
    if (core.getModel().parameters.ids.includes('ParamBreath')) core.setParameterValueById('ParamBreath', (Math.sin(seconds * 1.9) + 1) / 2)
    this.canvas.dataset.eye = current.ParamEyeLOpen.toFixed(3)
    this.canvas.dataset.blink = blink.toFixed(3)
    this.canvas.dataset.eyeLeftFrame = String(leftEye)
    this.canvas.dataset.eyeRightFrame = String(rightEye)
    this.canvas.dataset.mouth = core.getParameterValueById('ParamMouthOpenY').toFixed(3)
    this.canvas.dataset.tilt = current.ParamAngleZ.toFixed(3)
    this.canvas.dataset.armLeft = current.ParamArmL.toFixed(4)
    this.canvas.dataset.armRight = current.ParamArmR.toFixed(4)
    this.canvas.dataset.elbowLeft = current.ParamElbowL.toFixed(4)
    this.canvas.dataset.elbowRight = current.ParamElbowR.toFixed(4)
    this.canvas.dataset.wristLeft = current.ParamWristL.toFixed(4)
    this.canvas.dataset.wristRight = current.ParamWristR.toFixed(4)
    this.canvas.dataset.body = current.ParamBodyAngleZ.toFixed(4)
  }
}

async function loadCore(): Promise<void> {
  if ('Live2DCubismCore' in window) return
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/vendor/live2dcubismcore.min.js'
    script.onload = () => 'Live2DCubismCore' in window ? resolve() : reject(new Error('Cubism Core 文件没有提供运行库。'))
    script.onerror = () => reject(new Error('尚未放入官方 Cubism Core 运行库。'))
    document.head.append(script)
  })
}
