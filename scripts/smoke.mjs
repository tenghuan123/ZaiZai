import { desktopPages } from './desktop-pages.mjs'
import { _electron } from 'playwright'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { runWorkspaceChecks } from './workspace-smoke.mjs'

const require = createRequire(import.meta.url)
const executableArgument = process.argv.find(value => value.startsWith('--executable='))?.slice('--executable='.length)
const requireNotification = process.argv.includes('--require-notification')
const executablePath = executableArgument ? resolve(executableArgument) : require('electron')
const args = executableArgument ? [] : [resolve('.')]
const runDirectory = resolve('.cache/m2-runs', `${executableArgument ? 'packaged' : 'development'}-${Date.now()}`)
const dataDirectory = join(runDirectory, 'data')
await mkdir(dataDirectory, { recursive: true })
const env = { ...process.env, TIA_M0_DATA_DIR: dataDirectory }
delete env.ELECTRON_RUN_AS_NODE
const report = { startedAt: new Date().toISOString(), runDirectory, executablePath, checks: [], errors: [] }
let application

async function waitUntil(action, description, timeout = 20_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await action()
    if (result) return result
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out: ${description}`)
}
async function snapshot(page) {
  const result = await page.evaluate(() => window.desktop.bootstrap())
  assert.equal(result.ok, true, result.error?.message)
  return result.value
}
async function launch() {
  const start = Date.now()
  application = await _electron.launch({ executablePath, args, env, timeout: 30_000 })
  const { panel: page, pet } = await desktopPages(application)
  for (const view of [page, pet]) view.on('pageerror', error => report.errors.push(error.message))
  await page.waitForFunction(() => !!window.desktop && !!document.querySelector('.widget'))
  return { page, pet, startupMs: Date.now() - start }
}
async function quit(page) {
  const closed = application.waitForEvent('close')
  await page.evaluate(() => window.desktop.quit()).catch(error => {
    if (!/closed|destroyed/i.test(error.message)) throw error
  })
  await closed
  application = undefined
}

try {
  let { page, pet, startupMs } = await launch()
  report.startupMs = startupMs
  let state = await snapshot(page)
  assert.equal(state.diagnostics.trayReady, true)
  assert.equal(state.window.bounds.width, 356)
  assert.equal(state.window.panel.bounds.height, 378)
  report.runtime = state.diagnostics.versions
  report.checks.push('native window and tray created; SQLite opened')
  await page.screenshot({ path: join(runDirectory, 'expanded.png'), omitBackground: true })
  await page.getByRole('button', { name: '仅显示桌宠', exact: true }).click()
  const stablePet = state.window.bounds
  await waitUntil(async () => !(await snapshot(page)).window.panel.visible, 'task panel folds then hides')
  state = await snapshot(page)
  assert.equal(state.window.mode, 'compact')
  assert.deepEqual(state.window.bounds, stablePet)
  await pet.screenshot({ path: join(runDirectory, 'compact.png'), omitBackground: true })
  await pet.getByRole('button', { name: '展开清单', exact: true }).click()
  assert.equal((await snapshot(page)).window.panel.visible, true)
  assert.deepEqual((await snapshot(page)).window.bounds, stablePet)
  report.checks.push('task panel folds and expands while the pet native window stays fixed')

  const invalid = await page.evaluate(() => window.desktop.tasks.createOnce({ requestId: crypto.randomUUID(), title: 'bad input',
    scheduledDate: '2026-02-30', scheduledTime: null, reminderEnabled: true, scene: 'generic' }))
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'VALIDATION')
  report.checks.push('main process rejects invalid calendar date with a typed error')

  const databasePath = state.diagnostics.databasePath
  function databaseSQL(sql) {
    const result = spawnSync(require('electron'), ['-e', "const DB=require('better-sqlite3');const db=new DB(process.argv[1]);db.exec(process.argv[2]);db.close()", databasePath, sql],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  databaseSQL("CREATE TRIGGER smoke_write_failure BEFORE INSERT ON task_occurrences WHEN NEW.title='模拟写入失败' BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END")
  await page.getByLabel('新增待办', { exact: true }).fill('模拟写入失败')
  await page.getByRole('button', { name: '快捷新增任务', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '本地数据读写失败' }).waitFor()
  assert.equal(await page.getByLabel('新增待办', { exact: true }).inputValue(), '模拟写入失败')
  assert.equal((await snapshot(page)).today.items.length, 0)
  databaseSQL('DROP TRIGGER smoke_write_failure')
  report.checks.push('real SQLite write failure returns STORAGE, preserves UI draft, and creates no task')

  const hiddenTask = await page.evaluate(async () => {
    await window.desktop.hide()
    return window.desktop.tasks.createOnce({ requestId: crypto.randomUUID(), title: '隐藏后的后台提醒验证',
      scheduledDate: new Date(Date.now() + 60_000).toLocaleDateString('sv-SE'), scheduledTime: new Date(Date.now() + 60_000).toTimeString().slice(0, 5), reminderEnabled: true })
  })
  assert.equal(hiddenTask.ok, true)
  // A seconds-precision fixture, like migrated M0 data, keeps this lifecycle check independent of minute boundaries.
  databaseSQL(`UPDATE task_occurrences SET due_at_ms=${Date.now() + 3000} WHERE id='${hiddenTask.value.id}'`)
  await page.evaluate(id => window.desktop.tasks.setCompleted({ id }, false), hiddenTask.value.id)
  await waitUntil(async () => !(await snapshot(page)).window.visible, 'native window hidden')
  const scheduled = (await snapshot(page)).reminders[0]
  const blockedAt = await application.evaluate(({ BrowserWindow }) => {
    void BrowserWindow.getAllWindows()[0].webContents.executeJavaScript('(() => { const end = Date.now() + 8500; while (Date.now() < end) {} })()').catch(() => {})
    return Date.now()
  })
  // The renderer is deliberately occupied; only the main-process scheduler can fire in this interval.
  await new Promise(resolve => setTimeout(resolve, 9000))
  state = await waitUntil(async () => {
    const current = await snapshot(page)
    const reminder = current.reminders.find(item => item.id === scheduled.id)
    return reminder && ['submitted', 'failed', 'unavailable'].includes(reminder.dispatchState) ? current : null
  }, 'native notification outcome')
  const dispatched = state.reminders.find(item => item.id === scheduled.id)
  const events = (await readFile(join(dataDirectory, 'm0-events.ndjson'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  const claimed = events.find(event => event.event === 'reminders-claimed' && event.ids.includes(scheduled.id))
  assert.equal(claimed.windowVisible, false)
  assert.ok(Date.parse(claimed.at) >= blockedAt, 'scheduler must claim after renderer is blocked')
  assert.ok(Date.parse(claimed.at) - blockedAt < 8500, 'scheduler must fire before renderer unblocks')
  report.notification = { state: dispatched.dispatchState, error: dispatched.lastError }
  report.checks.push('reminder dispatched from main process while native window hidden and renderer busy')
  if (requireNotification) assert.equal(dispatched.dispatchState, 'submitted', dispatched.lastError)

  // A second app launch must restore the first instance instead of creating another scheduler.
  await new Promise((resolveExit, reject) => {
    const second = spawn(executablePath, args, { env, stdio: 'ignore' })
    second.once('error', reject)
    second.once('exit', code => code === 0 ? resolveExit() : reject(new Error(`Second instance exited ${code}`)))
  })
  await waitUntil(async () => (await snapshot(page)).window.visible, 'second instance restores original window')
  report.checks.push('single-instance relaunch restores the original hidden window')
  await pet.getByRole('button', { name: '完成了', exact: true }).click()
  await waitUntil(async () => (await snapshot(page)).reminders[0].completedAt !== null, 'completion saved')
  assert.equal((await snapshot(page)).activeReminderIds.length, 0)
  report.checks.push('bubble completion saves state and dismisses active reminder')

  await page.getByLabel('新增待办', { exact: true }).fill('重启恢复验证')
  await page.getByRole('button', { name: '快捷新增任务', exact: true }).click()
  await waitUntil(async () => (await snapshot(page)).today.items.length === 2, 'untimed second task persisted')
  const firstDay = (await snapshot(page)).today.date
  const requestId = crypto.randomUUID()
  const created = await page.evaluate(async ({ requestId, date }) => {
    const input = { requestId, title: '创建重试验证', scheduledDate: date, scheduledTime: null, reminderEnabled: false, scene: 'generic' }
    const first = await window.desktop.tasks.createOnce(input)
    const second = await window.desktop.tasks.createOnce(input)
    return { first, second }
  }, { requestId, date: firstDay })
  assert.equal(created.first.ok, true)
  assert.equal(created.second.value.id, created.first.value.id)
  await page.evaluate(id => window.desktop.tasks.removeOccurrence({ id }), created.first.value.id)
  assert.equal((await snapshot(page)).today.items.length, 2)
  report.checks.push('typed preload task command retries use one persisted ID; removal updates the same day projection')
  const concurrent = await page.evaluate(async () => {
    const [before, written, after] = await Promise.all([
      window.desktop.bootstrap(),
      window.desktop.tasks.createOnce({ requestId: crypto.randomUUID(), title: '快照版本验证',
        scheduledDate: new Date().toLocaleDateString('sv-SE'), scheduledTime: null, reminderEnabled: false, scene: 'generic' }),
      window.desktop.bootstrap()
    ])
    if (written.ok) await window.desktop.tasks.removeOccurrence({ id: written.value.id })
    return { before, written, after }
  })
  for (const result of [concurrent.before, concurrent.after]) {
    assert.equal(result.ok, true)
    assert.equal(result.revision, result.value.revision)
    assert.equal(result.sessionId, result.value.sessionId)
  }
  assert.equal(concurrent.written.ok, true)
  report.checks.push('concurrent reads and writes return the revision belonging to each snapshot')
  await page.getByRole('button', { name: '仅显示桌宠', exact: true }).click()
  report.metricsNote = 'Process working sets include shared pages; sampled after a deliberately busy renderer. Not an idle resource budget measurement.'
  report.metrics = await application.evaluate(({ app }) => app.getAppMetrics().map(item => ({ type: item.type, memory: item.memory, cpu: item.cpu })))
  await quit(page)
  const afterExit = await readFile(join(dataDirectory, 'm0-events.ndjson'), 'utf8')
  assert.ok(afterExit.includes('app-quit'))
  ;({ page, pet } = await launch())
  state = await snapshot(page)
  assert.equal(state.today.items.length, 2)
  assert.equal(state.today.progress.completed, 1)
  assert.equal(state.window.mode, 'compact')
  assert.equal(state.window.panel.visible, false)
  assert.equal(state.activeReminderIds.length, 0)
  report.checks.push('explicit quit exits process; restart restores SQLite data and compact preference without repeating old reminder')
  const workspaceChecks = await runWorkspaceChecks({ page, pet, snapshot, waitUntil, runDirectory, databaseSQL,
    withMainClock: async (now, action) => {
      await application.evaluate((_electron, time) => {
        globalThis.__m2OriginalNow = Date.now
        Date.now = () => time
      }, now)
      try { await action() } finally {
        await application.evaluate(() => { Date.now = globalThis.__m2OriginalNow; delete globalThis.__m2OriginalNow })
        await snapshot(page)
      }
    },
    restart: async () => { await quit(page); ({ page, pet } = await launch()); return { page, pet } } })
  report.checks.push(...workspaceChecks)
  await quit(page)
  assert.deepEqual(report.errors, [])
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.failure = error.stack || String(error)
  process.exitCode = 1
} finally {
  if (application) await application.close().catch(() => {})
  await writeFile(join(runDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
