import { useEffect, useRef, useState } from 'react'
import { spriteFrame } from '../../../../shared/pet'
import type { PetPlayback } from '../../../../shared/pet'
import fallbackImage from '../../assets/pet.svg'
import { petActionLabels } from './pet-pack'
import type { PetPack } from './pet-pack'

interface AnimationClock { elapsed: number; previous: number | null; frame: number; raf: number | null; finished: boolean; tick: (now: number) => void }

export function PetSprite({ pack: petPack, playback, paused, onFinished }: {
  pack: PetPack; playback: PetPlayback; paused: boolean; onFinished: (key: string) => void
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const clock = useRef<AnimationClock | null>(null)
  const pausedRef = useRef(paused)
  const onFinishedRef = useRef(onFinished)
  const [unavailable, setUnavailable] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [pageHidden, setPageHidden] = useState(() => document.hidden)
  const stopped = paused || reducedMotion || pageHidden
  pausedRef.current = stopped
  onFinishedRef.current = onFinished

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const changed = (): void => setReducedMotion(preference.matches)
    preference.addEventListener('change', changed)
    return () => preference.removeEventListener('change', changed)
  }, [])

  useEffect(() => {
    const changed = (): void => {
      // A hidden native window may freeze React before its next commit.
      const current = clock.current
      if (current) {
        current.previous = null
        if (current.raf !== null) cancelAnimationFrame(current.raf)
        current.raf = null
        if (!document.hidden && !pausedRef.current && current.frame >= 0 && !current.finished) current.raf = requestAnimationFrame(current.tick)
      }
      setPageHidden(document.hidden)
    }
    document.addEventListener('visibilitychange', changed)
    return () => document.removeEventListener('visibilitychange', changed)
  }, [])

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    let cancelled = false
    const state = petPack.states[playback.action]
    const image = new Image()
    const current: AnimationClock = { elapsed: 0, previous: null, frame: -1, raf: null, finished: false, tick: () => {} }
    clock.current = current
    const draw = (index: number): void => {
      context.clearRect(0, 0, petPack.frameWidth, petPack.frameHeight)
      context.drawImage(image, index % state.cols * petPack.frameWidth, Math.floor(index / state.cols) * petPack.frameHeight,
        petPack.frameWidth, petPack.frameHeight, 0, 0, petPack.frameWidth, petPack.frameHeight)
      current.frame = index
      element.dataset.frame = String(index)
      element.dataset.status = 'ready'
    }
    current.tick = (now: number): void => {
      current.raf = null
      if (cancelled || pausedRef.current || document.hidden || current.finished) { current.previous = null; return }
      if (current.previous !== null) current.elapsed += now - current.previous
      current.previous = now
      const next = spriteFrame(current.elapsed, state.frames, state.fps, playback.loop)
      if (next.index !== current.frame) draw(next.index)
      if (next.finished) {
        current.finished = true
        onFinishedRef.current(playback.key)
      } else current.raf = requestAnimationFrame(current.tick)
    }
    element.dataset.status = 'loading'
    const failed = (): void => {
      if (cancelled) return
      element.dataset.status = 'unavailable'
      setUnavailable(true)
      console.error(`桌宠素材无法读取：${petPack.id}/${playback.action}`)
      if (!playback.loop) onFinishedRef.current(playback.key)
    }
    image.onload = () => {
      if (cancelled) return
      const rows = Math.ceil(state.frames / state.cols)
      if (image.naturalWidth !== state.cols * petPack.frameWidth || image.naturalHeight !== rows * petPack.frameHeight) {
        failed(); return
      }
      setUnavailable(false)
      draw(0)
      if (!pausedRef.current && !document.hidden) current.raf = requestAnimationFrame(current.tick)
    }
    image.onerror = failed
    image.src = state.url
    return () => {
      cancelled = true
      image.onload = null; image.onerror = null
      if (current.raf !== null) cancelAnimationFrame(current.raf)
      if (clock.current === current) clock.current = null
    }
  }, [petPack, playback.key, playback.action, playback.loop])

  useEffect(() => {
    const current = clock.current
    if (!current) return
    current.previous = null
    if (stopped) {
      if (current.raf !== null) cancelAnimationFrame(current.raf)
      current.raf = null
    } else if (current.frame >= 0 && !current.finished && current.raf === null) current.raf = requestAnimationFrame(current.tick)
  }, [stopped])

  return <>
    <canvas ref={canvas} className="pet-sprite" width={petPack.frameWidth} height={petPack.frameHeight}
      role="img" aria-label={`${petPack.name}：${petActionLabels[playback.action]}`} hidden={unavailable}
      data-pet-id={petPack.id} data-pet-action={playback.action} data-playback-key={playback.key} data-paused={stopped} />
    {unavailable && <img className="pet-fallback" src={fallbackImage} alt="桌宠素材暂时不可用，显示备用角色" draggable={false} />}
  </>
}
