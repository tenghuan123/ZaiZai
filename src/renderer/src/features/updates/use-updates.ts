import { useEffect, useState } from 'react'
import type { UpdateState } from '../../../../shared/updates'

const api = window.desktop.updates
export function useUpdates() {
  const [state, setState] = useState<UpdateState | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true, receivedEvent = false
    const unsubscribe = api.subscribe(next => { receivedEvent = true; setState(next); setError('') })
    void api.getState().then(result => {
      if (!live || receivedEvent) return
      if (result.ok) setState(result.value)
      else setError(result.error.message)
    }).catch(() => { if (live) setError('更新状态暂时无法读取，请重新打开应用。') })
    return () => { live = false; unsubscribe() }
  }, [])
  async function run(action: () => ReturnType<typeof api.check>): Promise<void> {
    setError('')
    try { const result = await action(); if (!result.ok) setError(result.error.message) }
    catch { setError('更新操作未确认，请稍后重试。') }
  }
  return { state, error, check: () => run(() => api.check()), install: () => run(() => api.install()),
    acknowledgeWhatsNew: () => run(() => api.acknowledgeWhatsNew()) }
}
export type Updates = ReturnType<typeof useUpdates>
