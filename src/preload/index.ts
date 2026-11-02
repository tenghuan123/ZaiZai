import { contextBridge, ipcRenderer } from 'electron'
import { channels } from '../shared/contracts'
import type { AppResult, DesktopAPI, Snapshot } from '../shared/contracts'

function invoke<T>(channel: string, input?: unknown): Promise<AppResult<T>> {
  return ipcRenderer.invoke(channel, input) as Promise<AppResult<T>>
}

const desktop: DesktopAPI = {
  bootstrap: () => invoke<Snapshot>(channels.bootstrap),
  scheduleReminder: input => invoke(channels.schedule, input),
  setCompleted: input => invoke(channels.complete, input),
  acknowledgeReminder: value => invoke(channels.acknowledge, value),
  setMode: value => invoke(channels.mode, value),
  setAlwaysOnTop: value => invoke(channels.alwaysOnTop, value),
  setOffworkTime: value => invoke(channels.offworkTime, value),
  hide: () => invoke(channels.hide),
  requestClose: () => invoke(channels.close),
  quit: () => invoke(channels.quit),
  beginDrag: () => invoke(channels.dragStart),
  endDrag: () => invoke(channels.dragEnd),
  subscribe: listener => {
    const handler = (): void => listener()
    ipcRenderer.on(channels.changed, handler)
    return () => { ipcRenderer.removeListener(channels.changed, handler) }
  }
}
contextBridge.exposeInMainWorld('desktop', desktop)
