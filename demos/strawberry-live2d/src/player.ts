import type { Beat, Scene } from './scenes'
import { gestures, type GestureId } from './gestures.ts'

export interface AudioClip { file: string; durationMs: number; envelope: number[] }
export interface AudioManifest { binMs: number; clips: Record<string, AudioClip> }
export type PlaybackEvent =
  | { type: 'beat'; beat: Beat; index: number; mouth: () => number; progress: () => number }
  | { type: 'gesture'; id: GestureId; progress: () => number }
  | { type: 'progress'; value: number }
  | { type: 'finished' }
  | { type: 'stopped' }
  | { type: 'error'; message: string }

/** One run owns its audio, clock and abort signal. A later run cannot receive its callbacks. */
export class ScenePlayer {
  private run: AbortController | null = null
  private audio: HTMLAudioElement | null = null
  private paused = false
  private muted = false

  constructor(private manifest: AudioManifest, private emit: (event: PlaybackEvent) => void) {}

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.audio) this.audio.muted = muted
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) this.audio?.pause()
    else if (this.audio) {
      const run = this.run
      void this.audio.play().catch(error => {
        if (run && this.run === run && !run.signal.aborted) this.fail(run, error)
      })
    }
  }

  stop(): void {
    const run = this.run
    if (!run) return
    this.run = null
    run.abort()
    this.audio?.pause()
    this.audio = null
    this.paused = false
    this.emit({ type: 'stopped' })
  }

  async preview(id: GestureId): Promise<void> {
    this.stop()
    const run = new AbortController()
    this.run = run
    this.paused = false
    let elapsed = 0
    const duration = gestures[id].durationMs
    this.emit({ type: 'gesture', id, progress: () => elapsed / duration })
    await this.pauseBetweenBeats(duration, run, value => {
      elapsed = value
      this.emit({ type: 'progress', value: value / duration })
    })
    if (!run.signal.aborted && this.run === run) {
      this.run = null
      this.emit({ type: 'finished' })
    }
  }

  async play(scene: Scene): Promise<void> {
    this.stop()
    const run = new AbortController()
    this.run = run
    this.paused = false
    try {
      const durations = scene.beats.map(beat => this.clip(beat).durationMs + beat.pauseAfterMs)
      const total = durations.reduce((sum, duration) => sum + duration, 0)
      let elapsed = 0
      for (const [index, beat] of scene.beats.entries()) {
        if (run.signal.aborted) return
        const clip = this.clip(beat), audio = new Audio(`/audio/${clip.file}`)
        let speechEnded = false, pauseElapsed = 0
        audio.preload = 'auto'; audio.muted = this.muted
        this.audio = audio
        this.emit({ type: 'beat', beat, index,
          mouth: () => audio.paused || audio.ended ? 0 : clip.envelope[Math.floor(audio.currentTime * 1000 / this.manifest.binMs)] ?? 0,
          progress: () => Math.min(1, ((speechEnded ? clip.durationMs : Math.min(clip.durationMs, audio.currentTime * 1000)) + pauseElapsed) / durations[index]) })
        await this.speak(audio, run, value => this.emit({ type: 'progress', value: (elapsed + value) / total }))
        if (run.signal.aborted) return
        speechEnded = true
        this.audio = null
        elapsed += clip.durationMs
        await this.pauseBetweenBeats(beat.pauseAfterMs, run, value => {
          pauseElapsed = value
          this.emit({ type: 'progress', value: (elapsed + value) / total })
        })
        elapsed += beat.pauseAfterMs
      }
      if (!run.signal.aborted && this.run === run) {
        this.run = null
        this.emit({ type: 'progress', value: 1 })
        this.emit({ type: 'finished' })
      }
    } catch (error) { if (!run.signal.aborted) this.fail(run, error) }
  }

  private clip(beat: Beat): AudioClip {
    const clip = this.manifest.clips[beat.id]
    if (!clip) throw new Error(`缺少台词配音：${beat.id}`)
    return clip
  }

  private fail(run: AbortController, error: unknown): void {
    if (this.run !== run) return
    this.stop()
    this.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }

  private async speak(audio: HTMLAudioElement, run: AbortController, progress: (ms: number) => void): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let frame = 0
      const finish = (error?: Error): void => {
        cancelAnimationFrame(frame)
        audio.onended = null; audio.onerror = null
        run.signal.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve()
      }
      const abort = (): void => { audio.pause(); finish() }
      audio.onended = () => finish()
      audio.onerror = () => finish(new Error(`配音无法播放：${audio.src.split('/').pop()}`))
      run.signal.addEventListener('abort', abort, { once: true })
      const update = (): void => {
        if (run.signal.aborted) return
        progress(audio.currentTime * 1000)
        frame = requestAnimationFrame(update)
      }
      frame = requestAnimationFrame(update)
      void audio.play().catch(error => {
        // Pausing or stopping can reject an outstanding play() promise without a media failure.
        if (!run.signal.aborted && !this.paused) finish(error instanceof Error ? error : new Error(String(error)))
      })
    })
  }

  private async pauseBetweenBeats(durationMs: number, run: AbortController, progress: (ms: number) => void): Promise<void> {
    await new Promise<void>(resolve => {
      let elapsed = 0, previous = performance.now(), frame = 0
      const finish = (): void => { cancelAnimationFrame(frame); run.signal.removeEventListener('abort', finish); resolve() }
      run.signal.addEventListener('abort', finish, { once: true })
      const update = (now: number): void => {
        if (run.signal.aborted) return
        if (!this.paused) elapsed += Math.min(now - previous, 100)
        previous = now
        progress(Math.min(durationMs, elapsed))
        if (elapsed >= durationMs) finish()
        else frame = requestAnimationFrame(update)
      }
      frame = requestAnimationFrame(update)
    })
  }
}
