import assert from 'node:assert/strict'

async function verifyTrayFailure({ application, page, pet, snapshot }) {
  const { today } = await snapshot(page)
  const title = '托盘失败仍同步'
  const previous = `今天 ${today.progress.completed}/${today.progress.total}`
  const next = `今天 ${today.progress.completed}/${today.progress.total + 1}`
  const petProgress = text => pet.waitForFunction(expected =>
    document.querySelector('.mini-dock')?.textContent?.match(/今天 \d+\/\d+/)?.[0] === expected, text, { timeout: 5000 })
  await petProgress(previous)
  await application.evaluate(({ Tray }) => {
    const original = Tray.prototype.setContextMenu
    globalThis.smokeTrayFailures = 0
    Tray.prototype.setContextMenu = () => {
      globalThis.smokeTrayFailures++
      throw new Error('smoke: tray refresh failed')
    }
    globalThis.restoreSmokeTray = () => { Tray.prototype.setContextMenu = original }
  })
  try {
    const created = await page.evaluate(({ date, title }) => window.desktop.tasks.createOnce({
      requestId: crypto.randomUUID(), title, scheduledDate: date, scheduledTime: null, reminderEnabled: false
    }), { date: today.date, title })
    assert.equal(created.ok, true)
    assert.ok(await application.evaluate(() => globalThis.smokeTrayFailures > 0), 'tray fault was exercised')
    // This raw IPC call has no renderer-side refresh. Both windows must receive the change.
    await page.getByText(title, { exact: true }).waitFor({ timeout: 5000 })
    await petProgress(next)
  } finally {
    await application.evaluate(() => {
      globalThis.restoreSmokeTray()
      delete globalThis.restoreSmokeTray
      delete globalThis.smokeTrayFailures
    })
  }
}

async function verifyBellFailure({ application, page, snapshot, waitUntil }) {
  const state = await snapshot(page)
  if (!state.settings.reminderSoundEnabled) {
    const enabled = await page.evaluate(expectedVersion => window.desktop.settings.update({
      expectedVersion, patch: { reminderSoundEnabled: true }
    }), state.settings.version)
    assert.equal(enabled.ok, true)
  }
  const title = '铃声失败仍提交通知'
  await application.evaluate(({ BrowserWindow, Notification }, title) => {
    const { webContents } = BrowserWindow.getAllWindows().find(window =>
      new URL(window.webContents.getURL()).searchParams.get('view') === 'pet')
    const originalSend = webContents.send
    const originalSupported = Notification.isSupported
    const originalShow = Notification.prototype.show
    globalThis.smokeReminderAttempts = { bell: 0, native: 0 }
    webContents.send = function (channel, ...args) {
      if (channel === 'reminders:play-sound') {
        globalThis.smokeReminderAttempts.bell++
        throw new Error('smoke: pet bell channel failed')
      }
      return originalSend.call(this, channel, ...args)
    }
    // Exercise the real notification adapter without depending on OS permissions or showing a toast.
    Notification.isSupported = () => true
    Notification.prototype.show = function () {
      if (this.body.includes(title)) globalThis.smokeReminderAttempts.native++
      this.emit('show')
    }
    globalThis.restoreSmokeReminder = () => {
      webContents.send = originalSend
      Notification.isSupported = originalSupported
      Notification.prototype.show = originalShow
    }
  }, title)
  try {
    const task = await page.evaluate(({ date, title }) => window.desktop.tasks.createOnce({
      requestId: crypto.randomUUID(), title, scheduledDate: date, scheduledTime: new Date().toTimeString().slice(0, 5),
      reminderEnabled: true
    }), { date: state.today.date, title })
    assert.equal(task.ok, true)
    const reminder = await waitUntil(async () => {
      const item = (await snapshot(page)).reminders.find(item => item.id === task.value.id)
      return item && ['submitted', 'failed', 'unavailable'].includes(item.dispatchState) ? item : null
    }, 'notification adapter settles even if the bell channel throws')
    const attempts = await application.evaluate(() => globalThis.smokeReminderAttempts)
    assert.ok(attempts.bell > 0, 'bell fault was exercised')
    assert.equal(attempts.native, 1, 'the due task was submitted exactly once')
    assert.equal(reminder.dispatchState, 'submitted', reminder.lastError)
    assert.ok((await snapshot(page)).activeReminderIds.includes(task.value.id))
    assert.equal((await page.evaluate(id => window.desktop.acknowledgeReminder(id), task.value.id)).ok, true)
  } finally {
    await application.evaluate(() => {
      globalThis.restoreSmokeReminder()
      delete globalThis.restoreSmokeReminder
      delete globalThis.smokeReminderAttempts
    })
  }
}

async function verifyRolloverFailure({ application, page, snapshot, databaseSQL, withMainClock, waitUntil }) {
  assert.equal((await snapshot(page)).window.visible, true)
  const tomorrow = await application.evaluate(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    date.setHours(12, 0, 0, 0)
    return { date: date.toLocaleDateString('sv-SE'), time: date.getTime() }
  })
  await withMainClock(tomorrow.time, async () => {
    databaseSQL(`CREATE TRIGGER smoke_rollover_failure BEFORE INSERT ON calendar_days WHEN NEW.local_date='${tomorrow.date}'
      BEGIN SELECT RAISE(ABORT,'smoke: day activation failed'); END`)
    try {
      const results = await page.evaluate(async date => ({
        day: await window.desktop.tasks.getDay(date),
        snapshot: await window.desktop.bootstrap(),
        plans: await window.desktop.plans.list(),
        updates: await window.desktop.updates.getState(),
        hide: await window.desktop.hide()
      }), tomorrow.date)
      for (const result of [results.day, results.snapshot]) {
        assert.equal(result.ok, false)
        assert.equal(result.error.code, 'STORAGE')
      }
      assert.equal(results.plans.ok, true, 'saved plans are independent of day activation')
      assert.equal(results.updates.ok, true, 'update status is independent of day activation')
      assert.equal(results.hide.ok, true, 'hide is independent of day activation')
      await waitUntil(() => application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every(window => !window.isVisible())), 'both native windows are hidden', 5000)
    } finally {
      databaseSQL('DROP TRIGGER smoke_rollover_failure')
    }
    const recovered = await snapshot(page)
    assert.equal(recovered.today.date, tomorrow.date)
    assert.equal(recovered.today.activated, true)
  })
}

export async function runFailureIsolationChecks(context) {
  await verifyTrayFailure(context)
  await verifyBellFailure(context)
  await verifyRolloverFailure(context)
  return [
    'a throwing tray refresh leaves task writes and both window updates working',
    'a throwing bell channel leaves native reminder submission and the in-app bubble working',
    'a failed day activation leaves window controls, update status and saved plans available, and retries after storage recovers'
  ]
}
