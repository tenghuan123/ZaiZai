import { useEffect, useRef, useState } from 'react'
import type { DayItem } from '../../../../shared/tasks'
import { PET_AREA } from '../../../../shared/window'
import { itemKey } from './TaskList'

export interface TaskCompletion {
  item: DayItem
  phase: 'saving' | 'checking' | 'undoing' | 'leaving'
  origin: { x: number; y: number }
  target: { x: number; y: number }
}
interface CompletionJob extends TaskCompletion { timer?: ReturnType<typeof setTimeout> }

export function useTaskCompletion(commit: (item: DayItem, completed: boolean) => Promise<boolean>, petAnchor?: { x: number; y: number }) {
  const jobs = useRef(new Map<string, CompletionJob>())
  const [pending, setPending] = useState<ReadonlyMap<string, TaskCompletion>>(new Map())
  const latestCommit = useRef(commit)
  latestCommit.current = commit
  const publish = (): void => setPending(new Map(jobs.current))

  function finishPreview(key: string, job: CompletionJob): void {
    job.phase = 'checking'; publish()
    job.timer = setTimeout(() => {
      job.phase = 'leaving'; publish()
      job.timer = setTimeout(() => { jobs.current.delete(key); publish() }, 260)
    }, 620)
  }

  useEffect(() => () => {
    for (const job of jobs.current.values()) clearTimeout(job.timer)
    jobs.current.clear()
  }, [])

  function toggle(item: DayItem, button: HTMLButtonElement): void {
    const key = itemKey(item)
    const previous = jobs.current.get(key)
    if (previous) {
      if (previous.phase !== 'checking') return
      clearTimeout(previous.timer)
      previous.phase = 'undoing'; publish()
      void latestCommit.current(previous.item, false).then(saved => {
        if (jobs.current.get(key) !== previous) return
        if (saved) { jobs.current.delete(key); publish() }
        else finishPreview(key, previous)
      })
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      void latestCommit.current(item, true)
      return
    }
    const bounds = button.getBoundingClientRect()
    const origin = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    const job: CompletionJob = { item, phase: 'saving',
      origin, target: petAnchor ? {
        x: Math.max(0, Math.min(window.innerWidth, petAnchor.x + PET_AREA.width / 2 - window.screenX)),
        y: Math.max(0, Math.min(window.innerHeight, petAnchor.y + PET_AREA.height / 2 - window.screenY))
      } : origin }
    jobs.current.set(key, job); publish()
    // Persist first. Animation never owns task state; cancelling sends an explicit undo command.
    void latestCommit.current(item, true).then(saved => {
      if (jobs.current.get(key) !== job) return
      if (!saved) { jobs.current.delete(key); publish(); return }
      finishPreview(key, job)
    })
  }
  return { pending, toggle }
}
