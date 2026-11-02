import { _electron } from 'playwright'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const executableArgument = process.argv.find(value => value.startsWith('--executable='))?.slice('--executable='.length)
const requireNotification = process.argv.includes('--require-notification')
const executablePath = executableArgument ? resolve(executableArgument) : require('electron')
const args = executableArgument ? [] : [resolve('.')]
const runDirectory = resolve('.cache/m0-runs', `${executableArgument ? 'packaged' : 'development'}-${Date.now()}`)
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
  assert.equal(result.ok, true, result.error)
  return result.value
}
async function launch() {
  const start = Date.now()
  application = await _electron.launch({ executablePath, args, env, timeout: 30_000 })
  const page = await application.firstWindow()
  page.on('pageerror', error => report.errors.push(error.message))
  await page.waitForFunction(() => !!window.desktop && !!document.querySelector('.widget'))
  return { page, startupMs: Date.now() - start }
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
  let { page, startupMs } = await launch()
  report.startupMs = startupMs
  let state = await snapshot(page)
  assert.equal(state.diagnostics.trayReady, true)
  assert.equal(state.window.bounds.width, 356)
  assert.equal(state.window.bounds.height, 560)
  report.runtime = state.diagnostics.versions
  report.checks.push('native window and tray created; SQLite opened')
  await page.screenshot({ path: join(runDirectory, 'expanded.png'), omitBackground: true })
  await page.getByRole('button', { name: '仅显示桌宠', exact: true }).click()
  state = await snapshot(page)
  assert.equal(state.window.mode, 'compact')
  assert.equal(state.window.bounds.height, 224)
  const nativeBounds = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
  assert.equal(nativeBounds.height, 224)
  await page.screenshot({ path: join(runDirectory, 'compact.png'), omitBackground: true })
  await page.getByRole('button', { name: '展开清单', exact: true }).click()
  assert.equal((await snapshot(page)).window.bounds.height, 560)
  report.checks.push('expanded ↔ compact changes actual native window bounds')

  const invalid = await page.evaluate(() => window.desktop.scheduleReminder({ title: 'bad input', delaySeconds: 0, hideAfterScheduling: false }))
  assert.equal(invalid.ok, false)
  report.checks.push('main process rejects invalid reminder delay')

  await page.getByLabel('提醒内容', { exact: true }).fill('隐藏后的后台提醒验证')
  await page.getByRole('button', { name: '添加并隐藏', exact: true }).click()
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
    return reminder && ['submitted', 'failed'].includes(reminder.dispatchState) ? current : null
  }, 'native notification outcome')
  const dispatched = state.reminders.find(item => item.id === scheduled.id)
  const events = (await readFile(join(dataDirectory, 'm0-events.ndjson'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  const claimed = events.find(event => event.event === 'reminders-claimed' && event.ids.includes(scheduled.id))
  assert.equal(claimed.windowVisible, false)
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
  await page.getByRole('button', { name: '完成了', exact: true }).click()
  await waitUntil(async () => (await snapshot(page)).reminders[0].completedAt !== null, 'completion saved')
  assert.equal((await snapshot(page)).activeReminderIds.length, 0)
  report.checks.push('bubble completion saves state and dismisses active reminder')

  await page.getByLabel('提醒内容', { exact: true }).fill('重启恢复验证')
  await page.getByLabel('提醒延迟', { exact: true }).selectOption('60')
  await page.getByRole('button', { name: '添加提醒', exact: true }).click()
  await waitUntil(async () => (await snapshot(page)).reminders.length === 2, 'second reminder persisted')
  await page.getByRole('button', { name: '仅显示桌宠', exact: true }).click()
  report.metricsNote = 'Process working sets include shared pages; sampled after a deliberately busy renderer. Not an idle resource budget measurement.'
  report.metrics = await application.evaluate(({ app }) => app.getAppMetrics().map(item => ({ type: item.type, memory: item.memory, cpu: item.cpu })))
  await quit(page)
  const afterExit = await readFile(join(dataDirectory, 'm0-events.ndjson'), 'utf8')
  assert.ok(afterExit.includes('app-quit'))
  ;({ page } = await launch())
  state = await snapshot(page)
  assert.equal(state.reminders.length, 2)
  assert.equal(state.reminders.filter(item => item.completedAt !== null).length, 1)
  assert.equal(state.window.mode, 'compact')
  assert.equal(state.window.bounds.height, 224)
  assert.equal(state.activeReminderIds.length, 0)
  report.checks.push('explicit quit exits process; restart restores SQLite data and compact preference without repeating old reminder')
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
