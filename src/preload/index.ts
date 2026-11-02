import { contextBridge, ipcRenderer } from 'electron'
import { channels } from '../shared/contracts'
import type { AppEvent, AppResult, DesktopAPI } from '../shared/contracts'

function invoke<T>(channel: string, input?: unknown): Promise<AppResult<T>> {
  return ipcRenderer.invoke(channel, input) as Promise<AppResult<T>>
}
const desktop: DesktopAPI = {
  bootstrap: () => invoke(channels.bootstrap),
  tasks: {
    getDay: date => invoke(channels.day, date), getHistoryDates: range => invoke(channels.history, range),
    createOnce: input => invoke(channels.createOnce, input), updateOnce: input => invoke(channels.updateOnce, input),
    setCompleted: (ref, completed) => invoke(channels.complete, { ref, completed }),
    removeOccurrence: ref => invoke(channels.remove, ref), moveToToday: ref => invoke(channels.move, ref)
  },
  plans: {
    list: () => invoke(channels.plans), create: input => invoke(channels.createPlan, input),
    update: input => invoke(channels.updatePlan, input), setPaused: (id, paused) => invoke(channels.pausePlan, { id, paused }),
    end: id => invoke(channels.endPlan, id)
  },
  settings: { update: input => invoke(channels.settings, input) },
  acknowledgeReminder: value => invoke(channels.acknowledge, value), setMode: value => invoke(channels.mode, value),
  hide: () => invoke(channels.hide), requestClose: () => invoke(channels.close), quit: () => invoke(channels.quit),
  beginDrag: () => invoke(channels.dragStart), endDrag: () => invoke(channels.dragEnd),
  subscribe: listener => {
    const handler = (_event: Electron.IpcRendererEvent, event: AppEvent): void => listener(event)
    ipcRenderer.on(channels.changed, handler)
    return () => { ipcRenderer.removeListener(channels.changed, handler) }
  }
}
contextBridge.exposeInMainWorld('desktop', desktop)
