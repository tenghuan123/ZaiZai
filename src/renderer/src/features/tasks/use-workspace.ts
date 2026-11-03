import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppResult, Snapshot } from '../../../../shared/contracts'
import type { DayView, RepeatPlan } from '../../../../shared/tasks'

const api = window.desktop
interface Workspace { snapshot: Snapshot; day: DayView; plans: RepeatPlan[]; historyDates: string[] }
export function useWorkspace(selectedDate: string | null) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const request = useRef(0)
  const selection = useRef(selectedDate)
  selection.current = selectedDate

  const refresh = useCallback(async (): Promise<void> => {
    const token = ++request.current
    const selected = selection.current
    try {
      const result = await api.bootstrap()
      if (token !== request.current || selected !== selection.current) return
      if (!result.ok) { setError(result.error.message); return }
      const snapshot = result.value
      const date = selected ?? snapshot.today.date
      const [plans, day, history] = await Promise.all([
        api.plans.list(), date === snapshot.today.date
          ? Promise.resolve({ ...result, value: snapshot.today }) : api.tasks.getDay(date),
        api.tasks.getHistoryDates({ from: '0001-01-01', to: snapshot.today.date })
      ])
      if (token !== request.current || selected !== selection.current) return
      if (!plans.ok) { setError(plans.error.message); return }
      if (!day.ok) { setError(day.error.message); return }
      if (!history.ok) { setError(history.error.message); return }
      if ([plans, day, history].some(value => value.sessionId !== result.sessionId)) {
        setError('主进程会话已变化，请重新读取清单。'); return
      }
      if ([plans, day, history].some(value => value.revision !== result.revision)) {
        // A command landed between the reads. Reread instead of mixing two database revisions.
        await refresh(); return
      }
      setWorkspace(previous => previous?.snapshot.sessionId === snapshot.sessionId && previous.snapshot.revision > snapshot.revision
        ? previous : { snapshot, day: day.value, plans: plans.value, historyDates: history.value })
    } catch { if (token === request.current) setError('与桌面主进程的连接中断，请重新读取。') }
    finally { if (token === request.current && selected === selection.current) setLoading(false) }
  }, [])

  useEffect(() => {
    setLoading(true)
    const unsubscribe = api.subscribe(() => { void refresh() })
    void refresh()
    return () => { unsubscribe(); request.current++ }
  }, [refresh, selectedDate])

  const command = useCallback(async <T,>(action: () => Promise<AppResult<T>>): Promise<AppResult<T>> => {
    setError('')
    try {
      const result = await action()
      if (result.ok || result.error.code === 'CONFLICT' || result.error.code === 'NOT_FOUND') await refresh()
      if (!result.ok) setError(result.error.message)
      return result
    } catch {
      const message = '操作结果未确认，请重试或重新读取。新增操作重试会沿用原请求。'
      setError(message)
      return { ok: false, error: { code: 'UNAVAILABLE', message } }
    }
  }, [refresh])
  const day = workspace && workspace.day.date === (selectedDate ?? workspace.snapshot.today.date) ? workspace.day : null
  return { workspace, day, loading, error, setError, refresh, command }
}
