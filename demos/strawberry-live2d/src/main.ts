import './style.css'
import { scenes, type Scene } from './scenes'
import { ScenePlayer, type AudioManifest, type PlaybackEvent } from './player'
import { StrawberryViewer, type CharacterPlayback } from './viewer'
import { LayerStudy } from './layer-study'
import { gestures, type GestureId } from './gestures'

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing demo element: ${id}`)
  return found as T
}

const play = element<HTMLButtonElement>('play'), restart = element<HTMLButtonElement>('restart')
const status = element('model-status'), dialogue = element('dialogue'), emotion = element('emotion-label')
const direction = element('direction'), accent = element('accent'), notice = element('notice')
const stage = element('stage'), reference = element<HTMLInputElement>('reference')
let canvas = element<HTMLCanvasElement>('character')
let selected = scenes[0]
let selectedGesture: GestureId | null = null
let viewer: CharacterPlayback | null = null, player: ScenePlayer | null = null
let playing = false, pausedByUser = false
let mode: 'study' | 'live2d' = 'live2d', loadAttempt = 0

function showError(message: string): void { notice.setAttribute('role', 'alert'); notice.textContent = message; notice.hidden = false }
function setPlaying(value: boolean): void {
  playing = value; pausedByUser = false
  play.innerHTML = value ? '暂停表演 <span>Ⅱ</span>' : '开始表演 <span>↗</span>'
  document.querySelectorAll<HTMLButtonElement>('.gesture-button').forEach(button => button.setAttribute('aria-pressed', String(value && button.dataset.gesture === selectedGesture)))
}
function renderBeats(scene: Scene): void {
  element('beat-list').replaceChildren(...scene.beats.map((beat, index) => {
    const item = document.createElement('li')
    const number = document.createElement('span'); number.className = 'beat-number'; number.textContent = String(index + 1).padStart(2, '0')
    const content = document.createElement('div'), text = document.createElement('p'), subtitle = document.createElement('small')
    text.textContent = beat.text; subtitle.textContent = `${beat.emotion} · 停顿 ${(beat.pauseAfterMs / 1000).toFixed(2)} 秒`
    content.append(text, subtitle); item.append(number, content)
    return item
  }))
}
function select(scene: Scene): void {
  player?.stop(); selected = scene; selectedGesture = null; viewer?.setPose({}); viewer?.setPaused(false); setPlaying(false)
  setReference(false)
  dialogue.textContent = '今天，想听哪个小段子？'; emotion.textContent = viewer ? '等你开场' : '原角色对照'
  direction.textContent = viewer ? scene.description : '选择分层预演，检查原角色的表情与动作。'
  accent.textContent = ''; element('progress').style.width = '0%'
  delete stage.dataset.beat
  for (const id of manual) element<HTMLInputElement>(id).value = id === 'eye' ? '1' : '0'
  document.querySelectorAll<HTMLButtonElement>('.scene-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scene === scene.id)))
  renderBeats(scene)
}

for (const [index, scene] of scenes.entries()) {
  const button = document.createElement('button')
  button.className = 'scene-card'; button.dataset.scene = scene.id; button.setAttribute('aria-pressed', String(index === 0))
  const number = document.createElement('span'); number.className = 'scene-number'; number.textContent = String(index + 1).padStart(2, '0')
  const content = document.createElement('span'), title = document.createElement('strong'), caption = document.createElement('small')
  title.textContent = scene.title; caption.textContent = scene.description; content.append(title, caption)
  const arrow = document.createElement('span'); arrow.className = 'scene-arrow'; arrow.textContent = '↗'
  button.append(number, content, arrow); button.addEventListener('click', () => select(scene)); element('scenes').append(button)
}
renderBeats(selected)

function previewGesture(id: GestureId): void {
  if (!player || !viewer) return
  selectedGesture = id; setReference(false); viewer.setPaused(false)
  const bounds = stage.getBoundingClientRect()
  // In a short or stacked layout, clicking a control can scroll the actor out
  // of view. Reveal it before starting its finite, silent preview.
  if (bounds.top < 16 || bounds.bottom > innerHeight - 16) stage.scrollIntoView({ block: 'center', behavior: 'instant' })
  void player.preview(id)
}

for (const [id, gesture] of Object.entries(gestures) as [GestureId, typeof gestures[GestureId]][]) {
  const button = document.createElement('button')
  button.className = 'gesture-button'; button.dataset.gesture = id
  button.textContent = gesture.title; button.title = gesture.description
  button.setAttribute('aria-pressed', 'false'); button.disabled = true
  button.addEventListener('click', () => previewGesture(id))
  element('gestures').append(button)
}

function onPlayback(event: PlaybackEvent): void {
  if (event.type === 'beat') {
    selectedGesture = null; setPlaying(true)
    viewer?.setGesture(event.beat.gesture, event.progress, event.mouth)
    dialogue.textContent = event.beat.text; emotion.textContent = event.beat.emotion; direction.textContent = event.beat.direction
    accent.textContent = event.beat.accent === 'sweat' ? '﹏' : event.beat.accent === 'sparkle' ? '✧' : event.beat.accent === 'sleep' ? 'z Z' : ''
    accent.dataset.type = event.beat.accent ?? ''
    element('bubble').getAnimations().forEach(animation => animation.cancel())
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) element('bubble').animate([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220 })
    Array.from(element('beat-list').children).forEach((item, index) => item.classList.toggle('active', index === event.index))
    stage.dataset.beat = event.beat.id
  } else if (event.type === 'gesture') {
    selectedGesture = event.id; setPlaying(true)
    viewer?.setGesture(event.id, event.progress)
    delete stage.dataset.beat
    dialogue.textContent = '先看看这个小动作。'; emotion.textContent = gestures[event.id].title
    direction.textContent = gestures[event.id].description; accent.textContent = ''
    element('progress').style.width = '0%'
    Array.from(element('beat-list').children).forEach(item => item.classList.remove('active'))
  } else if (event.type === 'progress') element('progress').style.width = `${event.value * 100}%`
  else if (event.type === 'finished' || event.type === 'stopped') {
    setPlaying(false); viewer?.setPose({}); accent.textContent = ''
    if (event.type === 'finished') {
      emotion.textContent = selectedGesture ? '动作演完啦' : '讲完啦'
      direction.textContent = selectedGesture ? '回到自然姿态，可以再试一个。' : '再来一段？'
    }
  } else showError(`表演已停止：${event.message}。可以重新点击开始重试。`)
}

play.addEventListener('click', () => {
  if (!player || !viewer) return
  if (playing) {
    pausedByUser = !pausedByUser; syncPause()
    play.innerHTML = pausedByUser ? '继续表演 <span>↗</span>' : '暂停表演 <span>Ⅱ</span>'
  } else { viewer.setPaused(false); if (selectedGesture) previewGesture(selectedGesture); else void player.play(selected) }
})
restart.addEventListener('click', () => {
  if (!player || !viewer) return
  player.stop(); viewer.setPaused(false)
  if (selectedGesture) previewGesture(selectedGesture)
  else void player.play(selected)
})
element<HTMLInputElement>('voice').addEventListener('change', event => player?.setMuted(!(event.currentTarget as HTMLInputElement).checked))
document.addEventListener('visibilitychange', () => {
  syncPause()
})
const manual = ['eye', 'mouth', 'tilt', 'arm'] as const
for (const id of manual) element<HTMLInputElement>(id).disabled = true
element<HTMLButtonElement>('reset-pose').disabled = true
for (const id of manual) element<HTMLInputElement>(id).addEventListener('input', () => {
  player?.stop(); selectedGesture = null; setReference(false); viewer?.setPaused(false)
  const value = (key: typeof manual[number]): number => Number(element<HTMLInputElement>(key).value)
  viewer?.setPose({ ParamEyeLOpen: value('eye'), ParamEyeROpen: value('eye'), ParamAngleZ: value('tilt'), ParamArmL: value('arm') }, () => value('mouth'))
  emotion.textContent = '你来当导演'; direction.textContent = '拖动滑块，观察模型参数如何改变画面。'
})
element('reset-pose').addEventListener('click', () => {
  for (const id of manual) element<HTMLInputElement>(id).value = id === 'eye' ? '1' : '0'
  player?.stop(); selectedGesture = null; setReference(false); viewer?.setPose({}); emotion.textContent = '自然表情'; direction.textContent = '选择一个段子，开始表演。'
})

function syncPause(): void {
  const paused = document.hidden || pausedByUser || reference.checked
  player?.setPaused(paused); viewer?.setPaused(paused)
}
function setReference(visible: boolean): void {
  reference.checked = visible
  const image = element<HTMLImageElement>('art-preview')
  image.src = '/art/reference-idle.png'; image.hidden = !visible
  canvas.hidden = visible
  play.disabled = !viewer || visible; restart.disabled = !viewer || visible
  syncPause()
}
reference.addEventListener('change', () => setReference(reference.checked))
element('mode-study').addEventListener('click', () => { if (player) void loadMode('study') })
element('mode-live2d').addEventListener('click', () => { if (player) void loadMode('live2d') })

async function loadMode(next: 'study' | 'live2d'): Promise<void> {
  const attempt = ++loadAttempt
  player?.stop(); viewer?.destroy(); viewer = null; mode = next
  reference.disabled = true; setReference(false)
  play.disabled = true; restart.disabled = true
  for (const id of manual) element<HTMLInputElement>(id).disabled = true
  document.querySelectorAll<HTMLButtonElement>('.gesture-button').forEach(button => { button.disabled = true })
  element<HTMLButtonElement>('reset-pose').disabled = true
  document.body.dataset.ready = 'false'; document.body.dataset.mode = mode
  for (const name of ['study', 'live2d']) element('mode-' + name).setAttribute('aria-pressed', String(name === mode))
  const replacement = document.createElement('canvas')
  replacement.id = 'character'; replacement.setAttribute('aria-label', mode === 'study' ? '草莓兔分层动作预演' : '草莓兔 Live2D 角色')
  canvas.replaceWith(replacement); canvas = replacement
  status.textContent = mode === 'study' ? '正在载入分层素材…' : '正在载入 Live2D 模型…'
  status.dataset.state = 'pending'; notice.hidden = true
  try {
    const candidate = mode === 'study' ? await LayerStudy.load(canvas, stage) : await StrawberryViewer.load(canvas, stage)
    if (attempt !== loadAttempt) { candidate.destroy(); return }
    viewer = candidate
    status.textContent = mode === 'study' ? '分层动作预演' : 'Live2D 模型已就绪'
    status.dataset.state = mode === 'study' ? 'study' : 'ready'
    notice.setAttribute('role', 'note')
    notice.textContent = mode === 'study' ? '当前用于对照原角色拆层、表情和动作衔接；可切换到 Live2D 模型。' : '正在使用真实 Live2D 模型。'
    notice.hidden = false
    reference.disabled = false; play.disabled = false; restart.disabled = false
    document.body.dataset.ready = 'true'
    for (const id of manual) element<HTMLInputElement>(id).disabled = false
    document.querySelectorAll<HTMLButtonElement>('.gesture-button').forEach(button => { button.disabled = false })
    element<HTMLButtonElement>('reset-pose').disabled = false
    select(selected)
    emotion.textContent = '等你开场'; direction.textContent = '选择段子播放，也可以勾选原图对照。'
    syncPause()
  } catch (error) {
    if (attempt !== loadAttempt) return
    status.textContent = mode === 'study' ? '分层素材未就绪' : 'Live2D 模型未就绪'
    status.dataset.state = 'pending'; setReference(true)
    emotion.textContent = '原角色对照'
    direction.textContent = mode === 'study' ? '素材检查未通过，请查看下方原因。' : '模型加载未通过，请查看下方原因，也可以切回分层动作预演。'
    showError(error instanceof Error ? error.message : String(error))
  }
}

async function initialize(): Promise<void> {
  try {
    const response = await fetch('/audio/envelopes.json')
    if (!response.ok) throw new Error('尚未生成中文配音文件。')
    const audio: AudioManifest = await response.json()
    player = new ScenePlayer(audio, onPlayback)
    await loadMode('live2d')
  } catch (error) {
    status.textContent = '配音未就绪'; setReference(true)
    showError(error instanceof Error ? error.message : String(error))
  }
}
void initialize()
window.addEventListener('pagehide', () => {
  ++loadAttempt
  const previous = viewer
  viewer = null
  player?.stop()
  player = null
  previous?.destroy()
}, { once: true })
