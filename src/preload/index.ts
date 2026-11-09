import { contextBridge, ipcRenderer } from 'electron'
import { channels } from '../shared/contracts'
import type { AppEvent, AppResult, DesktopAPI, PetPresentation } from '../shared/contracts'
import type { UpdateState } from '../shared/updates'

function invoke<T>(channel: string, input?: unknown): Promise<AppResult<T>> {
  return ipcRenderer.invoke(channel, input) as Promise<AppResult<T>>
}
const desktop: DesktopAPI = {
  bootstrap: () => invoke(channels.bootstrap),
  updates: {
    getState: () => invoke(channels.updateState), check: () => invoke(channels.updateCheck), install: () => invoke(channels.updateInstall),
    subscribe: listener => {
      const handler = (_event: Electron.IpcRendererEvent, state: UpdateState): void => listener(state)
      ipcRenderer.on(channels.updateChanged, handler)
      return () => { ipcRenderer.removeListener(channels.updateChanged, handler) }
    }
  },
  tasks: {
    getDay: date => invoke(channels.day, date), getHistoryDates: range => invoke(channels.history, range),
    getDailyReport: () => invoke(channels.dailyReport),
    createOnce: input => invoke(channels.createOnce, input), updateOnce: input => invoke(channels.updateOnce, input),
    setPriority: (ref, priority) => invoke(channels.priority, { ref, priority }),
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
  openPanel: target => invoke(channels.openPanel, target),
  presentPet: presentation => invoke(channels.presentPet, presentation),
  getHumorContent: () => invoke(channels.humorContent),
  subscribePet: listener => {
    const handler = (_event: Electron.IpcRendererEvent, presentation: PetPresentation): void => listener(presentation)
    ipcRenderer.on(channels.petPresentation, handler)
    return () => { ipcRenderer.removeListener(channels.petPresentation, handler) }
  },
  hide: () => invoke(channels.hide), requestClose: () => invoke(channels.close), quit: () => invoke(channels.quit),
  beginDrag: () => invoke(channels.dragStart), moveDrag: () => invoke(channels.dragMove), endDrag: () => invoke(channels.dragEnd),
  beginResize: () => invoke(channels.resizeStart), endResize: () => invoke(channels.resizeEnd),
  previewReminderSound: () => invoke(channels.previewSound), showContextMenu: () => invoke(channels.contextMenu),
  subscribeSound: listener => {
    const handler = (): void => listener()
    ipcRenderer.on(channels.playSound, handler)
    return () => { ipcRenderer.removeListener(channels.playSound, handler) }
  },
  subscribe: listener => {
    const handler = (_event: Electron.IpcRendererEvent, event: AppEvent): void => listener(event)
    ipcRenderer.on(channels.changed, handler)
    return () => { ipcRenderer.removeListener(channels.changed, handler) }
  }
}
contextBridge.exposeInMainWorld('desktop', desktop)
