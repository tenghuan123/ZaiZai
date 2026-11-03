import { _electron } from 'playwright'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const executable = process.argv.find(value => value.startsWith('--executable='))?.slice('--executable='.length)
const directory = resolve('.cache/calendar-runs', `${executable ? 'packaged' : 'built'}-${Date.now()}`)
await mkdir(directory, { recursive: true })
const env = { ...process.env, TIA_M0_DATA_DIR: join(directory, 'data') }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
const report = { directory, checks: [], errors: [], status: 'running' }
let app
try {
  app = await _electron.launch({ executablePath: executable ? resolve(executable) : require('electron'), args: executable ? [] : [resolve('.')], env, timeout: 30_000 })
  const page = await app.firstWindow()
  page.setDefaultTimeout(10_000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.waitForSelector('.widget')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const button = name => page.getByRole('button', { name, exact: true })
  const row = name => page.getByRole('article', { name, exact: true })
  const dialog = () => page.getByRole('dialog', { name: '按日期查看任务', exact: true })
  async function snapshot() {
    const result = await page.evaluate(() => window.desktop.bootstrap())
    assert.equal(result.ok, true); return result.value
  }
  async function until(predicate, description) {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (await predicate()) return
      await page.waitForTimeout(20)
    }
    throw new Error(`Timed out: ${description}`)
  }
  function shifted(date, days) {
    const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days)
    return value.toISOString().slice(0, 10)
  }
  async function open() { await button('日期与历史').click(); await dialog().waitFor() }
  async function choose(date) {
    await open()
    await page.getByLabel('查看日期', { exact: true }).fill(date)
    await dialog().getByRole('button', { name: '查看', exact: true }).click()
    await dialog().waitFor({ state: 'hidden' })
    await until(async () => await page.locator('.progress-caption > span').first().getAttribute('title') === date &&
      !await page.getByText('正在读取这一天…', { exact: true }).isVisible(), 'selected day loaded')
  }
  async function layout() {
    return page.evaluate(() => {
      const list = document.querySelector('.reminder-list').getBoundingClientRect()
      const footer = document.querySelector('.quick-add, .history-note').getBoundingClientRect()
      const card = document.querySelector('.card').getBoundingClientRect()
      return { listTop: list.top, listHeight: list.height, listBottom: list.bottom, footerTop: footer.top, footerBottom: footer.bottom, cardBottom: card.bottom }
    })
  }
  const today = (await snapshot()).today.date
  const tomorrow = shifted(today, 1), yesterday = shifted(today, -1)
  const baseline = await layout()
  assert.equal(await button('日期与历史').getAttribute('title'), '查看历史待办和未来安排')
  await open()
  await dialog().getByText('查看历史待办和未来安排，选一天即可切换。', { exact: true }).waitFor()
  assert.deepEqual(await layout(), baseline)
  assert.equal(await page.getByRole('combobox', { name: '已有记录日期' }).count(), 0)
  await page.screenshot({ path: join(directory, 'calendar.png'), omitBackground: true })
  await page.keyboard.press('Escape')
  await dialog().waitFor({ state: 'hidden' })
  assert.equal(await button('日期与历史').evaluate(element => document.activeElement === element), true)
  report.checks.push('the accessible date icon retains a purpose tooltip and opens an explanatory modal without compressing the list; Escape restores focus')

  await open()
  const bounds = await dialog().boundingBox()
  await page.mouse.click(bounds.x - 5, bounds.y + 10)
  await dialog().waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.progress-caption > span').first().getAttribute('title'), today)
  report.checks.push('clicking outside dismisses the picker without changing the selected day')

  await open(); await button('明天').click()
  await dialog().waitFor({ state: 'hidden' })
  await page.getByText('这天还没有安排', { exact: true }).waitFor()
  assert.ok((await page.locator('.progress-caption').innerText()).includes('明天'))
  assert.deepEqual(await layout(), baseline)
  const empty = await page.getByText('这天还没有安排', { exact: true }).boundingBox()
  assert.ok(empty.y + empty.height <= baseline.listBottom)
  assert.equal(await page.locator('.selected-day-banner').count(), 0)
  assert.equal(await page.getByLabel('新增待办', { exact: true }).getAttribute('placeholder'), '添加这一天的待办…')
  await page.screenshot({ path: join(directory, 'tomorrow-empty.png'), omitBackground: true })
  report.checks.push('selecting tomorrow closes the overlay, merges date/progress/return into one row, and leaves the full empty state and footer visible')

  const before = (await snapshot()).today.progress
  await page.getByLabel('新增待办', { exact: true }).fill('明天快捷新增')
  await button('快捷新增任务').click(); await row('明天快捷新增').waitFor()
  const future = await page.evaluate(date => window.desktop.tasks.getDay(date), tomorrow)
  assert.equal(future.value.items.length, 1)
  assert.equal(future.value.items[0].occurrence.scheduledDate, tomorrow)
  assert.deepEqual((await snapshot()).today.progress, before)
  assert.equal(await page.locator('.progress-caption > span').first().getAttribute('title'), tomorrow)
  await page.screenshot({ path: join(directory, 'tomorrow-task.png'), omitBackground: true })
  report.checks.push('quick add while viewing tomorrow saves to tomorrow and keeps the view there; today statistics are unchanged')

  const databasePath = (await snapshot()).diagnostics.databasePath
  function sql(statement) {
    const result = spawnSync(require('electron'), ['-e', "const DB=require('better-sqlite3');const db=new DB(process.argv[1]);db.exec(process.argv[2]);db.close()", databasePath, statement],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  sql("CREATE TRIGGER calendar_failure BEFORE INSERT ON task_occurrences WHEN NEW.title='未来保存失败' BEGIN SELECT RAISE(ABORT,'calendar storage failure'); END")
  await page.getByLabel('新增待办', { exact: true }).fill('未来保存失败')
  await button('快捷新增任务').click()
  await page.getByRole('alert').filter({ hasText: '本地数据读写失败' }).waitFor()
  assert.equal(await page.getByLabel('新增待办', { exact: true }).inputValue(), '未来保存失败')
  assert.equal(await page.locator('.progress-caption > span').first().getAttribute('title'), tomorrow)
  sql('DROP TRIGGER calendar_failure')
  await button('关闭错误提示').click()
  await button('快捷新增任务').click(); await row('未来保存失败').waitFor()
  assert.equal((await page.evaluate(date => window.desktop.tasks.getDay(date), tomorrow)).value.items.length, 2)
  report.checks.push('a failed future quick add keeps the draft and selected day; retry creates one task on that day')

  const old = await page.evaluate(date => window.desktop.tasks.createOnce({ requestId: crypto.randomUUID(), title: '历史待办', scheduledDate: date,
    scheduledTime: null, reminderEnabled: false }), yesterday)
  assert.equal(old.ok, true)
  await choose(yesterday); await row('历史待办').waitFor()
  assert.equal(await page.getByLabel('新增待办', { exact: true }).count(), 0)
  await page.getByText('历史待办可点「移到今天」继续处理', { exact: true }).waitFor()
  await open()
  assert.equal(await button(yesterday).locator('.calendar-record-dot').count(), 1)
  await button(yesterday).click(); await dialog().waitFor({ state: 'hidden' })
  await page.screenshot({ path: join(directory, 'history.png'), omitBackground: true })
  await row('历史待办').getByRole('button', { name: '移到今天', exact: true }).click()
  await row('历史待办').waitFor({ state: 'hidden' })
  await button('返回今天').click(); await row('历史待办').waitFor()
  assert.equal((await snapshot()).today.items.find(item => item.occurrence?.id === old.value.id).occurrence.sourceDate, yesterday)
  report.checks.push('historical dates show a recorded dot; history replaces new-task controls with a short explanation and still moves the same task to today')

  await choose('2024-02-29'); await open()
  assert.equal(await page.locator('.calendar-grid button').count(), 29)
  assert.equal(await button('2024-02-29').getAttribute('aria-pressed'), 'true')
  await button('下个月').click()
  assert.equal(await page.locator('.calendar-grid button').count(), 31)
  await button('上个月').click()
  await button('关闭日期选择').click()
  await choose('2020-08-01'); await open()
  assert.equal(await page.locator('.calendar-grid > *').count(), 42)
  assert.equal(await page.locator('.calendar-grid button').count(), 31)
  const picker = await dialog().boundingBox()
  const view = page.viewportSize() ?? await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  assert.ok(picker.y >= 0 && picker.y + picker.height <= view.height)
  await button('今天').click(); await dialog().waitFor({ state: 'hidden' })
  report.checks.push('month navigation handles leap February and a six-row month, keeps selection explicit, and fits inside the native window')

  await page.screenshot({ path: join(directory, 'today.png'), omitBackground: true })
  assert.deepEqual(report.errors, [])
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || String(error); process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
