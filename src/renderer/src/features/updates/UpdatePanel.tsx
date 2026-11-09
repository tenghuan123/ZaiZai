import { useEffect, useRef, useState } from 'react'
import type { Updates } from './use-updates'

export function UpdatePanel({ updates, onInstall, onWhatsNew, busy }: {
  updates: Updates; onInstall: () => Promise<void>; onWhatsNew: () => void; busy: boolean
}): React.JSX.Element {
  const status = updates.state?.status
  const canCheck = status && ['idle', 'up-to-date', 'error'].includes(status.phase)
  return <section className="preference-group update-panel" aria-label="软件更新">
    <div className="preference-row"><span><strong>✨ 软件更新</strong><small>当前版本 {updates.state?.currentVersion ?? '读取中…'}</small></span>
      <div className="preference-tools">{status?.phase === 'ready'
        ? <button disabled={busy} onClick={() => { void onInstall() }}>重启更新</button>
        : <button disabled={busy || !canCheck} onClick={() => { void updates.check() }}>{status?.phase === 'checking' ? '检查中…' : '检查更新'}</button>}</div></div>
    <div className="update-description" role="status">
      {!status ? '正在读取更新状态…' : status.phase === 'disabled' ? status.reason : status.phase === 'idle' ? '自动检查新版本，下载完成后由你决定何时重启。'
        : status.phase === 'checking' ? '正在检查新版本…' : status.phase === 'up-to-date' ? '当前已经是最新版本。'
          : status.phase === 'error' ? status.message : status.phase === 'downloading' ? `发现版本 ${status.version}，正在后台下载 ${status.progress}%`
            : status.phase === 'ready' ? `版本 ${status.version} 已下载，重启后完成更新。` : '正在启动更新，请稍候…'}
      {status && 'progress' in status && status.phase === 'downloading' && <progress aria-label="更新下载进度" max={100} value={status.progress} />}
      {status && 'notes' in status && status.notes && <details><summary>更新内容</summary><p className="update-notes">{status.notes}</p></details>}
    </div>
    {updates.state?.whatsNew && <div className="preference-tools"><button disabled={busy} onClick={onWhatsNew}>本版本新功能</button></div>}
    {updates.error && <p className="editor-error" role="alert">{updates.error}</p>}
  </section>
}

export function WhatsNewDialog({ version, notes, automatic, onClose, error }: {
  version: string; notes: string; automatic: boolean; onClose: () => void | Promise<void>; error: string
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  async function close(): Promise<void> {
    if (busy) return
    setBusy(true)
    try { await onClose() }
    finally { setBusy(false) }
  }
  const items = notes.split(/\r?\n/).map(line => line.trim().replace(/^[-*]\s+/, '')).filter(Boolean)
  return <dialog ref={dialog} className="task-editor whats-new-dialog" aria-labelledby="whats-new-heading"
    onCancel={event => { event.preventDefault(); void close() }}>
    <header>
      <p>{automatic ? '已更新到' : '当前版本'} v{version}</p>
      <h2 id="whats-new-heading">本版本新功能</h2>
    </header>
    <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <footer className="editor-actions"><button className="primary" autoFocus disabled={busy} onClick={() => { void close() }}>知道了</button></footer>
  </dialog>
}
