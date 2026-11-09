import { useEffect, useRef, useState } from 'react'
import type { AppResult } from '../../../../shared/contracts'
import type { DailyReport } from '../../../../shared/tasks'
import { TaskCategoryBadge, taskCategories } from './TaskCategoryBadge'

export function DailyReportDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const draftField = useRef<HTMLTextAreaElement>(null)
  const generateButton = useRef<HTMLButtonElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<AppResult<DailyReport> | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showDraft, setShowDraft] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(() => {
    const previousFocus = document.activeElement
    const element = dialog.current
    element?.showModal()
    return () => {
      element?.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  useEffect(() => {
    let active = true
    void window.desktop.tasks.getDailyReport().then(response => {
      if (!active) return
      if (response.ok) setSelected(new Set(response.value.items.filter(item => item.category === 'work').map(item => item.id)))
      setResult(response)
    }).catch(() => {
      if (active) setResult({ ok: false, error: { code: 'UNAVAILABLE', message: '暂时无法读取今天完成的任务，请重试。' } })
    })
    return () => { active = false }
  }, [attempt])

  const report = result?.ok ? result.value : null
  const groups = report ? taskCategories.map(({ value }) => ({
    category: value, items: report.items.filter(item => item.category === value)
  })).filter(group => group.items.length > 0) : []
  const timeFormat = report && new Intl.DateTimeFormat('zh-CN', { timeZone: report.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

  function toggleItem(id: string, checked: boolean): void {
    setSelected(previous => {
      const next = new Set(previous)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }

  function generateDraft(): void {
    const items = groups.flatMap(group => group.items.filter(item => selected.has(item.id)))
    if (!items.length) return
    setDraft('今日完成：\n' + items.map((item, index) => `${index + 1}. ${item.title}`).join('\n'))
    setShowDraft(true)
    setCopyStatus('')
  }

  async function copyDraft(): Promise<void> {
    if (!draft?.trim()) return
    try {
      await navigator.clipboard.writeText(draft)
      setCopyStatus('已复制到剪贴板')
    } catch {
      draftField.current?.focus()
      draftField.current?.select()
      setCopyStatus('已选中草稿，请使用系统复制快捷键')
    }
  }

  return <dialog ref={dialog} className="task-editor daily-report" aria-labelledby="daily-report-title"
    onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="editor-heading">
      <div><h2 id="daily-report-title">今日日报</h2>{report && <p className="report-date">{report.date.slice(5, 7)}月{report.date.slice(8)}日（今天）</p>}</div>
      <button type="button" aria-label="关闭日报" onClick={onClose}>×</button>
    </header>
    {!result && <p role="status">正在读取今天完成的任务…</p>}
    {result && !result.ok && <div className="editor-error" role="alert">{result.error.message}
      <button type="button" onClick={() => { setResult(null); setAttempt(value => value + 1) }}>重新读取</button></div>}
    {report && (showDraft ? <section className="report-step">
      <label htmlFor="daily-report-draft">日报草稿 <span className="report-muted">· 可修改或补充</span></label>
      <textarea id="daily-report-draft" ref={draftField} autoFocus rows={7} value={draft ?? ''}
        onChange={event => { setDraft(event.target.value); setCopyStatus('') }} />
      <p className="report-copy-status" role="status">{copyStatus}</p>
      <footer className="report-actions">
        <button type="button" className="secondary" onClick={() => {
          setShowDraft(false)
          requestAnimationFrame(() => generateButton.current?.focus())
        }}>返回选择</button>
        <button type="button" className="primary" disabled={!draft?.trim()} onClick={() => { void copyDraft() }}>复制日报</button>
      </footer>
    </section> : <section className="report-step">
      {groups.length ? <p className="report-help">选择要写进日报的事项。工作任务默认勾选。</p>
        : <p className="report-empty">今天还没有已完成的任务</p>}
      <div className="report-groups">
        {groups.map(group => <fieldset key={group.category ?? ''}>
          <legend><TaskCategoryBadge category={group.category} /> <span className="report-muted">{group.items.length} 项</span></legend>
          <div className="report-items">
            {group.items.map(item => <label key={item.id}>
              <input type="checkbox" checked={selected.has(item.id)} onChange={event => toggleItem(item.id, event.target.checked)} />
              <span>{item.title}</span><time>{timeFormat && timeFormat.format(item.completedAtMs)}</time>
            </label>)}
          </div>
        </fieldset>)}
      </div>
      <footer className="report-actions">
        <span aria-live="polite">已选 {selected.size} 项</span>
        <button type="button" ref={generateButton} className="primary" disabled={!selected.size} onClick={generateDraft}>
          {draft === null ? '生成草稿' : '重新生成草稿'}
        </button>
      </footer>
    </section>)}
  </dialog>
}
