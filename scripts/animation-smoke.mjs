import { _electron } from 'playwright'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const executable = process.argv.find(value => value.startsWith('--executable='))?.slice('--executable='.length)
const directory = resolve('.cache/animation-runs', `${executable ? 'packaged' : 'built'}-${Date.now()}`)
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
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const row = title => page.getByRole('article', { name: title, exact: true })
  const button = name => page.getByRole('button', { name, exact: true })
  async function snapshot() {
    const result = await page.evaluate(() => window.desktop.bootstrap())
    assert.equal(result.ok, true); return result.value
  }
  async function add(title) {
    await page.getByLabel('新增待办', { exact: true }).fill(title)
    await button('快捷新增任务').click(); await row(title).waitFor()
  }
  async function until(predicate, description) {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (await predicate()) return
      await page.waitForTimeout(20)
    }
    throw new Error(`Timed out: ${description}`)
  }
  async function nativeHeight(height) {
    await until(async () => (await snapshot()).window.bounds.height === height, `native height ${height}`)
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().height), height)
  }
  const today = (await snapshot()).today.date
  await add('交互验收甲'); await add('交互验收乙'); await add('交互验收丙')
  const original = (await snapshot()).today.progress

  await button('完成：交互验收甲').click()
  await button('取消完成：交互验收甲').press('Enter')
  await page.waitForTimeout(750)
  assert.deepEqual((await snapshot()).today.progress, original)
  assert.equal(await page.locator('.completion-origin').count(), 0)
  await button('完成：交互验收甲').waitFor()
  report.checks.push('a second click in the 620 ms feedback sends an explicit undo, cancels every effect, and restores saved progress')

  await button('完成：交互验收甲').click()
  await page.waitForTimeout(160)
  assert.equal(await row('交互验收甲').getAttribute('data-completion-phase'), 'checking')
  assert.equal((await snapshot()).today.progress.completed, 1)
  assert.equal(await page.locator('.check-particle').count(), 8)
  await page.screenshot({ path: join(directory, 'completion-check.png'), omitBackground: true })
  await page.waitForFunction(() => document.querySelector('[aria-label="交互验收甲"]')?.dataset.completionPhase === 'leaving', null, { polling: 10 })
  assert.equal((await snapshot()).today.progress.completed, 1)
  await page.screenshot({ path: join(directory, 'completion-exit.png'), omitBackground: true })
  await row('交互验收甲').waitFor({ state: 'hidden' })
  await page.getByRole('navigation').getByRole('button', { name: /^已完成/ }).click()
  await button('撤销：交互验收甲').click()
  await page.getByRole('navigation').getByRole('button', { name: /^待办/ }).click()
  await row('交互验收甲').waitFor()
  assert.equal((await snapshot()).today.progress.completed, 0)
  report.checks.push('check/particles/stroke/stamp retain the row; confirmed persistence updates progress before a smooth exit; undo restores it')

  const databasePath = (await snapshot()).diagnostics.databasePath
  function sql(statement) {
    const result = spawnSync(require('electron'), ['-e', "const DB=require('better-sqlite3');const db=new DB(process.argv[1]);db.exec(process.argv[2]);db.close()", databasePath, statement],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  sql("CREATE TRIGGER animation_write_failure BEFORE UPDATE ON task_occurrences WHEN NEW.title='交互验收甲' AND NEW.status='completed' BEGIN SELECT RAISE(ABORT,'animation storage failure'); END")
  await button('完成：交互验收甲').click()
  await page.getByRole('alert').filter({ hasText: '本地数据读写失败' }).waitFor()
  await button('完成：交互验收甲').waitFor()
  assert.equal((await snapshot()).today.progress.completed, 0)
  assert.equal(await row('交互验收甲').locator('.checked').count(), 0)
  assert.equal(await page.locator('.completion-origin').count(), 0)
  sql('DROP TRIGGER animation_write_failure')
  await button('关闭错误提示').click()
  report.checks.push('a real SQLite completion failure restores the unchecked row, clears effects, and preserves progress')

  await button('完成：交互验收甲').click()
  await page.getByRole('navigation').getByRole('button', { name: /^已完成/ }).click()
  await button('撤销：交互验收甲').waitFor()
  await until(async () => (await snapshot()).today.progress.completed === 1, 'completion persisted after tab change')
  await page.getByRole('navigation').getByRole('button', { name: /^待办/ }).click()
  await button('完成：交互验收乙').click()
  await button('完成：交互验收丙').click()
  await until(async () => (await snapshot()).today.progress.percentage === 100, 'independent completions persisted')
  await page.waitForFunction(() => document.querySelector('.pet-sprite')?.dataset.petAction === 'all_done')
  await row('交互验收乙').waitFor({ state: 'hidden' })
  await row('交互验收丙').waitFor({ state: 'hidden' })
  report.checks.push('changing tabs preserves pending completion; two independent completions reach 100% and trigger all-done celebration')

  await button('仅显示桌宠').click()
  await page.waitForTimeout(70)
  const folding = await page.locator('.card').evaluate(card => ({ opacity: Number(getComputedStyle(card).opacity), inert: card.inert }))
  assert.ok(folding.opacity > 0 && folding.opacity < 1)
  assert.equal(folding.inert, true)
  assert.equal((await snapshot()).window.bounds.height, 480)
  await page.screenshot({ path: join(directory, 'menu-folding.png'), omitBackground: true })
  await nativeHeight(224)
  await page.screenshot({ path: join(directory, 'compact.png'), omitBackground: true })
  const separation = await page.evaluate(() => document.querySelector('.mini-dock').getBoundingClientRect().top - document.querySelector('.pet').getBoundingClientRect().bottom)
  assert.ok(separation >= 16)
  await button('展开清单').click(); await nativeHeight(480)
  await button('仅显示桌宠').waitFor()
  report.checks.push('the card folds while native height stays 480, then shrinks to 224; the compact dock clears the pet and expands back')

  // Reverse while the delayed compact resize is still pending.
  await page.evaluate(() => window.desktop.setMode('compact'))
  await page.waitForTimeout(60)
  await page.evaluate(() => window.desktop.setMode('expanded'))
  await page.waitForTimeout(450)
  assert.equal((await snapshot()).window.bounds.height, 480)
  assert.equal((await snapshot()).window.mode, 'expanded')
  await button('互动桌宠，双击展开或收起').dblclick(); await nativeHeight(224)
  await button('互动桌宠，双击展开或收起').dblclick(); await nativeHeight(480)
  report.checks.push('rapid reversal cancels the stale native resize; pet double-click uses the same animated mode transition')

  const tomorrowDate = new Date(`${today}T12:00:00Z`)
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
  const tomorrow = tomorrowDate.toISOString().slice(0, 10)
  const plan = await page.evaluate(date => window.desktop.plans.create({ requestId: crypto.randomUUID(), title: '未来预览动效',
    startDate: date, endDate: date, times: ['10:00'], reminderEnabled: false }), tomorrow)
  assert.equal(plan.ok, true)
  await button('日期与历史').click()
  await page.getByLabel('查看日期', { exact: true }).fill(tomorrow)
  await button('查看').click()
  await row('未来预览动效').waitFor()
  await button('完成：未来预览动效').click()
  await button('取消完成：未来预览动效').press('Enter')
  await page.waitForTimeout(700)
  const preview = await page.evaluate(date => window.desktop.tasks.getDay(date), tomorrow)
  assert.equal(preview.value.items[0].kind, 'saved')
  assert.equal(preview.value.items[0].occurrence.status, 'pending')
  await button('完成：未来预览动效').click()
  await row('未来预览动效').waitFor({ state: 'hidden' })
  const materialized = await page.evaluate(date => window.desktop.tasks.getDay(date), tomorrow)
  assert.equal(materialized.value.items.length, 1)
  assert.equal(materialized.value.items[0].kind, 'saved')
  assert.equal(materialized.value.progress.completed, 1)
  report.checks.push('a future preview completes and undoes through the same materialized occurrence; retry saves exactly one occurrence and exits its row')

  await button('返回今天').click()
  await add('减少动态效果')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await button('完成：减少动态效果').click()
  await row('减少动态效果').waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.completion-origin').count(), 0)
  await button('仅显示桌宠').click(); await nativeHeight(224)
  await button('展开清单').click(); await nativeHeight(480)
  await page.waitForTimeout(100)
  assert.equal(await page.locator('.card').evaluate(card => card.getAnimations().length), 0)
  report.checks.push('reduced motion completes directly without particles or delayed row removal, and mode switching has no CSS animation')

  await page.screenshot({ path: join(directory, 'expanded.png'), omitBackground: true })
  assert.deepEqual(report.errors, [])
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || String(error); process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
