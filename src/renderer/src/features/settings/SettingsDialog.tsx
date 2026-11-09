import { useEffect, useRef, useState } from 'react'
import type { AppResult, SettingsPatch, Snapshot } from '../../../../shared/contracts'
import { LARGE_SIZE, STANDARD_SIZE } from '../../../../shared/window'
import { UpdatePanel } from '../updates/UpdatePanel'
import type { Updates } from '../updates/use-updates'

export function SettingsDialog({ snapshot, command, onClose, onWhatsNew, updates }: {
  snapshot: Snapshot; command: <T>(action: () => Promise<AppResult<T>>) => Promise<AppResult<T>>; onClose: () => void
  updates: Updates; onWhatsNew: () => void
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingPatch, setPendingPatch] = useState<SettingsPatch>({})
  const [offwork, setOffwork] = useState(snapshot.settings.offworkTime ?? '')
  const settings = { ...snapshot.settings, ...pendingPatch }
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  useEffect(() => { setOffwork(snapshot.settings.offworkTime ?? '') }, [snapshot.settings.offworkTime])
  async function update(patch: SettingsPatch): Promise<boolean> {
    if (saving.current) return false
    saving.current = true; setBusy(true); setPendingPatch(patch); setError('')
    try {
      const result = await command(() => window.desktop.settings.update({ expectedVersion: snapshot.settings.version, patch }))
      if (!result.ok) setError(result.error.message)
      return result.ok
    } finally { saving.current = false; setBusy(false); setPendingPatch({}) }
  }
  function close(): void {
    if (saving.current) return
    if (offwork !== (snapshot.settings.offworkTime ?? '')) {
      void update({ offworkTime: offwork || null }).then(saved => { if (saved) onClose() })
    } else onClose()
  }
  async function installUpdate(): Promise<void> {
    if (saving.current) return
    if (offwork !== (snapshot.settings.offworkTime ?? '') && !await update({ offworkTime: offwork || null })) return
    await updates.install()
  }
  return <dialog ref={dialog} className="settings-dialog task-editor" aria-labelledby="settings-heading" onCancel={event => { event.preventDefault(); close() }}>
    <header className="editor-heading"><div><h2 id="settings-heading">⚙ 组件偏好设置</h2><p>管理自启动、铃声、桌面层级与窗口尺寸</p></div>
      <button aria-label="关闭设置" disabled={busy} onClick={close}>×</button></header>
    <fieldset disabled={busy} className="preference-groups">
      <UpdatePanel updates={updates} onInstall={installUpdate} onWhatsNew={onWhatsNew} busy={busy} />
      <section className="preference-group">
        <label className="preference-row"><span><strong>🚀 开机自动启动</strong><small>登录系统后自动唤醒桌宠与提醒</small></span>
          <input aria-label="开机自动启动" type="checkbox" checked={settings.openAtLogin} onChange={event => { void update({ openAtLogin: event.target.checked }) }} /></label>
        <div className="preference-row"><span><strong>🔔 提醒摇铃声音</strong><small>到点提醒时播放清脆手摇铃音效</small></span>
          <div className="preference-tools"><button className="bell-preview" onClick={() => { void command(() => window.desktop.previewReminderSound()) }}>🔊 试听</button>
            <input aria-label="提醒摇铃声音" type="checkbox" checked={settings.reminderSoundEnabled} onChange={event => { void update({ reminderSoundEnabled: event.target.checked }) }} /></div></div>
      </section>
      <section className="preference-group">
        <div><div className="preference-row"><strong>🖥 窗口显示层级</strong><div className="segmented">
          <button aria-pressed={settings.alwaysOnTop} onClick={() => { void update({ alwaysOnTop: true }) }}>📌 始终置顶</button>
          <button aria-pressed={!settings.alwaysOnTop} onClick={() => { void update({ alwaysOnTop: false }) }}>🖥 仅在桌面</button></div></div>
          <p className="preference-description">{settings.alwaysOnTop ? '始终浮在最前；切换为「仅在桌面」后其他软件可遮挡它' : '打开其他软件时留在窗口下方，回到桌面可见'}</p></div>
        <div><div className="preference-row"><strong>📐 框框尺寸预设</strong><div className="segmented">
          <button aria-pressed={settings.expandedSize.width === STANDARD_SIZE.width && settings.expandedSize.height === STANDARD_SIZE.height} onClick={() => { void update({ expandedSize: STANDARD_SIZE }) }}>标准尺寸</button>
          <button aria-pressed={settings.expandedSize.width === LARGE_SIZE.width && settings.expandedSize.height === LARGE_SIZE.height} onClick={() => { void update({ expandedSize: LARGE_SIZE }) }}>拉大框框</button></div></div>
          <p className="preference-description">当前：{snapshot.window.panel.bounds.width} × {snapshot.window.panel.bounds.height} px，也可拖拽主面板右下角</p></div>
      </section>
      <section className="preference-group"><div className="preference-row"><strong>🕒 固定下班时间</strong><div className="preference-tools">
        <button onClick={() => { void update({ offworkTime: '18:00' }) }}>18:00</button><button onClick={() => { void update({ offworkTime: null }) }}>清空</button></div></div>
        <input aria-label="固定下班时间" type="time" value={offwork} onChange={event => setOffwork(event.target.value)} />
      </section>
      <label className="preference-row default-reminder"><span>新任务默认开启提醒</span><input aria-label="新任务默认提醒" type="checkbox" checked={settings.defaultReminderEnabled} onChange={event => { void update({ defaultReminderEnabled: event.target.checked }) }} /></label>
    </fieldset>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <details className="settings-details"><summary>运行状态与本地数据</summary><p>菜单栏 / 托盘：{snapshot.diagnostics.trayReady ? '已创建' : '不可用'} · 系统通知：{snapshot.diagnostics.notificationSupported ? '系统支持' : '不可用'}</p>
      <p className="data-path">{snapshot.diagnostics.databasePath}</p></details>
    <footer className="editor-actions"><button className="primary" disabled={busy} onClick={close}>完成</button></footer>
  </dialog>
}
