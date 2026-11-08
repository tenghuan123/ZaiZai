import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent } from 'react'
import type { AppResult } from '../../shared/contracts'

const api = window.desktop

export function useWindowDrag(setError: (message: string) => void, onClick?: () => void, onDragStart?: () => void) {
  const gesture = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelClick = useCallback(() => clearTimeout(clickTimer.current), [])

  useEffect(() => {
    function onBlur(): void {
      cancelClick()
      gesture.current = null
    }
    window.addEventListener('blur', onBlur)
    return () => { window.removeEventListener('blur', onBlur); cancelClick() }
  }, [cancelClick])

  function send(action: () => Promise<AppResult<void>>): void {
    void action().then(result => { if (!result.ok) setError(result.error.message) })
      .catch(() => setError('窗口拖动中断，请重新拖动。'))
  }

  function finish(event: PointerEvent<HTMLElement>, clicked = false): void {
    const start = gesture.current
    if (start?.pointerId !== event.pointerId) return
    gesture.current = null
    if (start.moved) send(api.endDrag)
    else if (clicked && onClick) {
      cancelClick()
      clickTimer.current = setTimeout(onClick, 250)
    }
  }

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>): void {
      if (event.button !== 0 || !event.isPrimary) return
      if (gesture.current?.moved) send(api.endDrag)
      event.currentTarget.setPointerCapture(event.pointerId)
      gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
    },
    onPointerMove(event: PointerEvent<HTMLElement>): void {
      const start = gesture.current
      if (start?.pointerId !== event.pointerId) return
      if (!(event.buttons & 1)) { finish(event); return }
      if (start.moved) { send(api.moveDrag); return }
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return
      start.moved = true
      cancelClick()
      onDragStart?.()
      send(api.beginDrag)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event, true),
    onPointerCancel: finish,
    onLostPointerCapture: finish
  }
  return { handlers, cancelClick }
}
