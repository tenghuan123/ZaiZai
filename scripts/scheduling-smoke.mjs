import { _electron } from 'playwright'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const directory = resolve('.cache/scheduling-runs', String(Date.now()))
await mkdir(directory, { recursive: true })
const env = { ...process.env, TIA_M0_DATA_DIR: join(directory, 'data') }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const report = { directory, checks: [], errors: [], status: 'running' }
let app, page
const button = name => page.getByRole('button', { name, exact: true })
const row = title => page.getByRole('article', { name: title, exact: true })
const dialog = () => page.getByRole('dialog')
async function until(action, message) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) { if (await action()) return; await new Promise(resolve => setTimeout(resolve, 50)) }
  throw new Error(`Timed out: ${message}`)
}
async function snapshot() {
  const result = await page.evaluate(() => window.desktop.bootstrap())
  assert.equal(result.ok, true, result.error?.message); return result.value
}
async function launch() {
  app = await _electron.launch({ executablePath: require('electron'), args: [resolve('.')], env, timeout: 30_000 })
  page = await app.firstWindow(); page.setDefaultTimeout(15_000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.waitForSelector('.widget')
}
async function quit() {
  const closed = app.waitForEvent('close'); await page.evaluate(() => window.desktop.quit()); await closed; app = undefined
}
async function saveEditor() { await dialog().getByRole('button', { name: '保存安排', exact: true }).click(); await dialog().waitFor({ state: 'hidden' }) }
async function plansTab() { await page.getByRole('navigation').getByRole('button', { name: /^周期计划/ }).click() }
async function settings() { await button('组件偏好设置').click(); await dialog().waitFor() }
async function closeSettings() { await dialog().getByRole('button', { name: '完成', exact: true }).click(); await dialog().waitFor({ state: 'hidden' }) }

try {
  await launch()
  const today = (await snapshot()).today.date
  assert.deepEqual((await snapshot()).settings.expandedSize, { width: 356, height: 480 })
  for (const title of ['普通待办', '紧急待办']) {
    await page.getByLabel('新增待办', { exact: true }).fill(title)
    if (title.startsWith('紧急')) await button('紧急任务').click()
    await button('快捷新增任务').click(); await row(title).waitFor()
  }
  assert.equal(await page.locator('.reminder-row').first().getAttribute('aria-label'), '紧急待办')
  await row('普通待办').hover(); await button('标为紧急：普通待办').click()
  await until(async () => (await snapshot()).today.items.every(item => item.occurrence.priority === 'urgent'), 'inline priority saved')
  await button('改为普通：普通待办').click()
  await until(async () => (await snapshot()).today.items.find(item => item.occurrence.title === '普通待办').occurrence.priority === 'normal', 'inline priority restored')
  report.checks.push('quick urgent creation, urgent-first order, inline toggle and progress tags work through UI and SQLite')

  await button('定时或重复').click()
  await dialog().getByRole('button', { name: '周期重复计划', exact: true }).click()
  await dialog().getByLabel('任务名称', { exact: true }).fill('每周复盘')
  await dialog().getByRole('button', { name: '📆 每周计划', exact: true }).click()
  await dialog().getByRole('button', { name: '🔥 紧急任务（置顶）', exact: true }).click()
  await dialog().getByLabel('到点提醒', { exact: true }).uncheck()
  await page.screenshot({ path: join(directory, 'weekly-editor.png'), omitBackground: true })
  await saveEditor()
  let plans = await page.evaluate(() => window.desktop.plans.list())
  const weekly = plans.value.find(plan => plan.title === '每周复盘')
  assert.deepEqual(weekly.recurrence, { type: 'weekly', weekdays: [1, 5] })
  assert.equal(weekly.priority, 'urgent')
  await plansTab(); await button('＋ 新建计划').click()
  await dialog().getByLabel('任务名称', { exact: true }).fill('月底账单')
  await dialog().getByRole('button', { name: '🗓 每月计划', exact: true }).click()
  await dialog().getByRole('button', { name: '1号', exact: true }).click()
  await dialog().getByLabel('每月自定义日期', { exact: true }).fill('31')
  await dialog().getByRole('button', { name: '＋ 添加日期', exact: true }).click()
  await dialog().getByLabel('每月最后一天', { exact: true }).check()
  await dialog().getByLabel('到点提醒', { exact: true }).uncheck()
  await page.screenshot({ path: join(directory, 'monthly-editor.png'), omitBackground: true })
  await saveEditor(); await plansTab()
  await row('月底账单').waitFor()
  plans = await page.evaluate(() => window.desktop.plans.list())
  assert.deepEqual(plans.value.find(plan => plan.title === '月底账单').recurrence, { type: 'monthly', days: [31], lastDay: true })
  await row('每周复盘').getByRole('button', { name: '编辑', exact: true }).click()
  await dialog().getByRole('button', { name: '周二', exact: true }).click(); await saveEditor()
  assert.deepEqual((await page.evaluate(() => window.desktop.plans.list())).value.find(plan => plan.id === weekly.id).recurrence.weekdays, [1, 2, 5])
  await row('每周复盘').getByRole('button', { name: '暂停', exact: true }).click()
  await row('每周复盘').getByText('已暂停', { exact: true }).waitFor()
  await row('每周复盘').getByRole('button', { name: '恢复', exact: true }).click()
  await row('每周复盘').getByText('生效中', { exact: true }).waitFor()
  await page.screenshot({ path: join(directory, 'plans.png'), omitBackground: true })
  report.checks.push('weekly/monthly UI creates, edits, pauses and resumes actual plans; custom 31st and last-day choice persist')

  await settings()
  await dialog().getByRole('button', { name: '拉大框框', exact: true }).click()
  await until(async () => (await snapshot()).window.bounds.height === 610, 'large native window')
  assert.equal((await snapshot()).window.bounds.width, 440)
  await page.screenshot({ path: join(directory, 'settings.png'), omitBackground: true })
  await dialog().getByRole('button', { name: '🖥 仅在桌面', exact: true }).click()
  await until(async () => !(await snapshot()).window.alwaysOnTop, 'desktop layer native')
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), false)
  await dialog().getByLabel('固定下班时间', { exact: true }).fill('19:30')
  await closeSettings()
  assert.equal((await snapshot()).settings.offworkTime, '19:30')
  await button('切换桌面层级').click(); await until(async () => (await snapshot()).window.alwaysOnTop, 'header layer native')
  report.checks.push('settings presets change actual native bounds; settings/header layer toggles agree with BrowserWindow')

  // Transparent windows use app-controlled bounds; inject screen cursor positions at the native boundary.
  await app.evaluate(({ screen }) => {
    globalThis.__originalCursor = screen.getCursorScreenPoint
    globalThis.__cursor = { x: 700, y: 300 }
    screen.getCursorScreenPoint = () => globalThis.__cursor
  })
  const handle = button('调整窗口尺寸'), box = await handle.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 5, box.y + box.height / 2 - 5)
  await page.waitForTimeout(80)
  await app.evaluate(() => { globalThis.__cursor = { x: 740, y: 350 } })
  await until(async () => (await snapshot()).window.bounds.width === 480, 'resize changes native width')
  await page.mouse.up()
  await until(async () => (await snapshot()).settings.expandedSize.width === 480, 'resize saved')
  await app.evaluate(({ screen }) => { screen.getCursorScreenPoint = globalThis.__originalCursor; delete globalThis.__originalCursor; delete globalThis.__cursor })
  const resized = (await snapshot()).settings.expandedSize
  assert.deepEqual(resized, { width: 480, height: 660 })
  await button('仅显示桌宠').click(); await until(async () => (await snapshot()).window.bounds.height === 224, 'compact')
  await button('展开清单').click(); await until(async () => (await snapshot()).window.bounds.height === 660, 'restore size after compact')
  await button('调整窗口尺寸').dblclick(); await until(async () => (await snapshot()).window.bounds.height === 480, 'double-click standard')
  await button('调整窗口尺寸').dblclick(); await until(async () => (await snapshot()).window.bounds.height === 610, 'double-click large')
  report.checks.push('resize pointer path updates native bounds with injected cursor positions; saved size restores after compact; double-click presets work')

  await page.evaluate(() => {
    window.__sounds = 0; window.__oscillators = 0
    window.desktop.subscribeSound(() => window.__sounds++)
    const create = AudioContext.prototype.createOscillator
    AudioContext.prototype.createOscillator = function () { window.__oscillators++; return create.call(this) }
  })
  await settings(); await dialog().getByRole('button', { name: '🔊 试听', exact: true }).click()
  await until(async () => await page.evaluate(() => window.__oscillators) === 8, 'bell synthesized')
  await dialog().getByLabel('提醒摇铃声音', { exact: true }).uncheck(); await closeSettings()
  async function dueBatch(names) {
    // Freeze just before a minute, insert both times, then advance main clock and wake the scheduler via resume.
    const base = Date.now(), due = base + 120_000
    await app.evaluate((_electron, time) => { globalThis.__originalNow = Date.now; Date.now = () => time }, base)
    const date = new Date(due).toLocaleDateString('sv-SE'), time = new Date(due).toTimeString().slice(0, 5)
    await page.evaluate(async ({ names, date, time }) => {
      for (const title of names) {
        const result = await window.desktop.tasks.createOnce({ requestId: crypto.randomUUID(), title, scheduledDate: date, scheduledTime: time, reminderEnabled: true })
        if (!result.ok) throw new Error(result.error.message)
      }
    }, { names, date, time })
    await app.evaluate(({ powerMonitor }, time) => { Date.now = () => time; powerMonitor.emit('resume') }, due)
    await until(async () => (await snapshot()).reminders.filter(reminder => names.includes(reminder.title) && reminder.dispatchState !== 'pending').length === names.length, 'batch claimed')
    await app.evaluate(() => { Date.now = globalThis.__originalNow; delete globalThis.__originalNow })
  }
  await dueBatch(['静音提醒甲', '静音提醒乙'])
  assert.equal(await page.evaluate(() => window.__sounds), 1)
  await settings(); await dialog().getByLabel('提醒摇铃声音', { exact: true }).check(); await closeSettings()
  await page.evaluate(() => window.desktop.hide())
  await dueBatch(['有声提醒甲', '有声提醒乙'])
  await until(async () => await page.evaluate(() => window.__oscillators) === 16, 'one bell per hidden batch')
  assert.equal(await page.evaluate(() => window.__sounds), 2)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show())
  report.checks.push('preview creates the eight-oscillator bell; mute suppresses automatic sound; a two-task batch signals once while window hidden (controlled clock)')

  await settings()
  await dialog().getByLabel('开机自动启动', { exact: true }).click()
  await dialog().getByRole('alert').filter({ hasText: '安装版' }).waitFor()
  assert.equal((await snapshot()).settings.openAtLogin, false)
  // Exercise success/rejection through the real IPC service without registering the development Electron executable at login.
  await app.evaluate(({ app }) => {
    globalThis.__loginRead = app.getLoginItemSettings; globalThis.__loginWrite = app.setLoginItemSettings
    globalThis.__packaged = Object.getOwnPropertyDescriptor(app, 'isPackaged')
    Object.defineProperty(app, 'isPackaged', { configurable: true, value: true })
    globalThis.__loginEnabled = false; globalThis.__rejectLogin = false
    app.getLoginItemSettings = () => ({ openAtLogin: globalThis.__loginEnabled, status: globalThis.__loginEnabled ? 'enabled' : 'not-registered', executableWillLaunchAtLogin: globalThis.__loginEnabled })
    app.setLoginItemSettings = ({ openAtLogin }) => { if (!globalThis.__rejectLogin) globalThis.__loginEnabled = openAtLogin }
  })
  await dialog().getByLabel('开机自动启动', { exact: true }).check()
  await until(async () => (await snapshot()).settings.openAtLogin, 'login setting saved after native acceptance')
  await app.evaluate(() => { globalThis.__rejectLogin = true })
  await dialog().getByLabel('开机自动启动', { exact: true }).click()
  await dialog().getByRole('alert').filter({ hasText: '系统未接受' }).waitFor()
  assert.equal((await snapshot()).settings.openAtLogin, true)
  await app.evaluate(() => { globalThis.__rejectLogin = false })
  await dialog().getByLabel('开机自动启动', { exact: true }).uncheck()
  await until(async () => !(await snapshot()).settings.openAtLogin, 'login disabled')
  await app.evaluate(({ app }) => {
    app.getLoginItemSettings = globalThis.__loginRead; app.setLoginItemSettings = globalThis.__loginWrite
    if (globalThis.__packaged) Object.defineProperty(app, 'isPackaged', globalThis.__packaged)
    else delete app.isPackaged
  })
  await closeSettings()
  report.checks.push('development login setting fails visibly without saving; injected native acceptance/rejection verifies real IPC rollback and UI recovery')
  await page.getByRole('navigation').getByRole('button', { name: /^待办/ }).click()
  await page.screenshot({ path: join(directory, 'tasks.png'), omitBackground: true })
  await quit(); await launch()
  assert.deepEqual((await snapshot()).settings.expandedSize, { width: 440, height: 610 })
  assert.equal((await snapshot()).window.bounds.width, 440)
  assert.equal((await snapshot()).window.bounds.height, 610)
  assert.equal((await snapshot()).today.items.find(item => item.occurrence?.title === '紧急待办').occurrence.priority, 'urgent')
  assert.equal((await page.evaluate(() => window.desktop.plans.list())).value.length, 2)
  report.checks.push('restart restores native size, priority and both recurrence rules from SQLite')
  await quit()
  assert.deepEqual(report.errors, [])
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || String(error); process.exitCode = 1
  if (page && !page.isClosed()) { report.state = await snapshot().then(value => ({ settings: value.settings, window: value.window })).catch(() => null); report.dialog = await dialog().innerText().catch(() => ''); await page.screenshot({ path: join(directory, 'failure.png'), omitBackground: true }).catch(() => {}) }
} finally {
  if (app) await app.close().catch(() => {})
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
