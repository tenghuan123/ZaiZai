import { _electron } from 'playwright'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const executable = process.argv.find(value => value.startsWith('--executable='))?.slice('--executable='.length)
const directory = resolve('.cache/pet-runs', `${executable ? 'packaged' : 'built'}-${Date.now()}`)
await mkdir(directory, { recursive: true })
const env = { ...process.env, TIA_M0_DATA_DIR: join(directory, 'data') }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
const report = { directory, checks: [], errors: [], status: 'running' }
let app
try {
  app = await _electron.launch({ executablePath: executable ? resolve(executable) : require('electron'),
    args: executable ? [] : [resolve('.')], env, timeout: 30_000 })
  let page = await app.firstWindow()
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()) })
  await page.waitForSelector('.widget')
  let canvas = page.locator('.pet-sprite')
  async function ready(action, petId) {
    await page.waitForFunction(({ action, petId }) => {
      const canvas = document.querySelector('.pet-sprite')
      return canvas?.dataset.petAction === action && canvas.dataset.status === 'ready' && (!petId || canvas.dataset.petId === petId)
    }, { action, petId })
  }
  async function snapshot() {
    const result = await page.evaluate(() => window.desktop.bootstrap())
    assert.equal(result.ok, true); return result.value
  }
  async function moving() {
    const before = await canvas.getAttribute('data-frame')
    await page.waitForFunction(before => document.querySelector('.pet-sprite')?.dataset.frame !== before, before)
  }
  await ready('idle'); await moving()
  assert.equal((await snapshot()).settings.petId, 'strawberry-bunny-v3')
  const hitAreas = await page.evaluate(() => {
    const pet = document.querySelector('.pet').getBoundingClientRect()
    const control = document.querySelector('[aria-label="仅显示桌宠"]').getBoundingClientRect()
    return { petBottom: pet.bottom, controlTop: control.top }
  })
  assert.ok(hitAreas.petBottom <= hitAreas.controlTop)
  report.checks.push('built-in V3 loads via production buddy-app protocol and does not cover window controls')

  await page.getByRole('button', { name: '桌宠动作', exact: true }).click()
  const actions = { idle: '待机眨眼', react: '挥手回应', celebrate: '鼓掌庆祝', all_done: '跳跃欢呼', remind: '摇铃提醒', drink_water: '喝水提醒', stretch: '头顶伸展' }
  const selector = page.getByRole('combobox', { name: '桌宠角色', exact: true })
  for (const petId of ['strawberry-bunny-v3', 'hu-xianya', 'teng-huan']) {
    await selector.selectOption(petId)
    await ready('idle', petId)
    assert.equal((await snapshot()).settings.petId, petId)
    if (petId === 'teng-huan') assert.match(await page.locator('.pet-pack-description').innerText(), /v1\.0\.2/)
    for (const [action, label] of Object.entries(actions)) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await ready(action, petId); await moving()
      assert.equal(await canvas.getAttribute('data-playback-key'), `preview:${action}`)
    }
  }
  await page.screenshot({ path: join(directory, 'actions.png'), omitBackground: true })

  const selected = (await snapshot()).settings
  const databasePath = (await snapshot()).diagnostics.databasePath
  function sql(statement) {
    const result = spawnSync(require('electron'), ['-e', "const DB=require('better-sqlite3');const db=new DB(process.argv[1]);db.exec(process.argv[2]);db.close()", databasePath, statement],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  sql("CREATE TRIGGER pet_selection_failure BEFORE UPDATE ON app_settings WHEN json_extract(NEW.value,'$.petId')='strawberry-bunny-v3' BEGIN SELECT RAISE(ABORT,'pet selection storage failure'); END")
  await selector.selectOption('strawberry-bunny-v3')
  await page.getByRole('alert').filter({ hasText: '本地数据读写失败' }).waitFor()
  assert.equal(await selector.inputValue(), 'teng-huan')
  assert.deepEqual((await snapshot()).settings, selected)
  assert.equal(await canvas.getAttribute('data-pet-id'), 'teng-huan')
  sql('DROP TRIGGER pet_selection_failure')
  await page.getByRole('button', { name: '关闭错误提示', exact: true }).click()
  await selector.selectOption('strawberry-bunny-v3'); await ready('idle', 'strawberry-bunny-v3')
  await selector.selectOption('teng-huan'); await ready('idle', 'teng-huan')
  report.checks.push('all three installed characters animate all seven actions, Teng Huan uses v1.0.2, and a real storage failure preserves the current choice until a successful retry')
  await page.getByRole('button', { name: '返回清单', exact: true }).click()
  await ready('idle')
  report.checks.push('all seven actual app previews animate, and returning to the task list restores idle')

  await page.getByRole('button', { name: '互动桌宠，双击展开或收起', exact: true }).press('Enter')
  await page.getByRole('button', { name: '我在这里，陪你把今天安排好。', exact: true }).waitFor()
  await ready('react'); await moving(); await ready('idle')
  report.checks.push('Teng Huan keyboard interaction uses his own dialogue, waves once, then returns to idle')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => document.querySelector('.pet-sprite')?.dataset.paused === 'true', null, { polling: 100 })
  let before = await canvas.getAttribute('data-frame')
  await page.waitForTimeout(200)
  assert.equal(await canvas.getAttribute('data-frame'), before)
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await moving()
  const visibleRevision = (await snapshot()).revision
  await page.evaluate(() => window.desktop.hide())
  await page.waitForFunction(async () => (await window.desktop.bootstrap()).value.window.animationsPaused, null, { polling: 100 })
  assert.ok((await snapshot()).revision > visibleRevision)
  await page.waitForFunction(() => document.querySelector('.pet-sprite')?.dataset.paused === 'true', null, { polling: 100 })
  before = await canvas.getAttribute('data-frame')
  await page.waitForTimeout(250)
  assert.equal(await canvas.getAttribute('data-frame'), before)
  await app.evaluate(({ app }) => app.emit('activate'))
  await page.waitForFunction(async () => !(await window.desktop.bootstrap()).value.window.animationsPaused, null, { polling: 100 })
  await moving()
  report.checks.push('reduced-motion and hidden-window states stop the frame clock; showing the window resumes it')

  await page.getByRole('button', { name: '仅显示桌宠', exact: true }).click()
  for (let attempt = 0; attempt < 100 && (await snapshot()).window.bounds.height !== 224; attempt++) await page.waitForTimeout(20)
  assert.equal((await snapshot()).window.bounds.height, 224)
  await ready('idle')
  await page.screenshot({ path: join(directory, 'compact.png'), omitBackground: true })
  await page.getByRole('button', { name: '展开清单', exact: true }).click()
  assert.equal((await snapshot()).window.bounds.height, 560)
  await page.waitForFunction(() => document.querySelector('.card')?.inert === false && !document.querySelector('.widget')?.classList.contains('compact'))
  await page.locator('.card').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)) })
  report.checks.push('the actual compact and expanded native window sizes still fit the new character')

  for (const title of ['素材验收甲', '素材验收乙']) {
    await page.getByLabel('新增待办', { exact: true }).fill(title)
    await page.getByRole('button', { name: '快捷新增任务', exact: true }).click()
    await page.getByRole('article', { name: title, exact: true }).waitFor()
  }
  await page.getByRole('button', { name: '完成：素材验收甲', exact: true }).click()
  await ready('celebrate'); await ready('idle')
  await page.getByRole('button', { name: '完成：素材验收乙', exact: true }).click()
  await ready('all_done'); await ready('idle')
  report.checks.push('successful task completion plays clap; finishing today plays the separate all-done animation')

  await page.getByRole('button', { name: '定时或重复', exact: true }).click()
  await page.getByLabel('任务名称', { exact: true }).fill('场景选择验证')
  await page.getByLabel('提醒动作', { exact: true }).selectOption('water')
  await page.getByLabel('到点提醒', { exact: true }).uncheck()
  await page.getByRole('button', { name: '保存安排', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal((await snapshot()).today.items.find(item => item.occurrence?.title === '场景选择验证').occurrence.scene, 'water')
  report.checks.push('the task editor saves an explicit water scene through the real task service')

  // Keep this run local and silent while testing the real due-reminder pipeline.
  await app.evaluate(({ Notification }) => { Notification.isSupported = () => false })
  for (const [scene, action] of [['generic', 'remind'], ['water', 'drink_water'], ['stretch', 'stretch']]) {
    const created = await page.evaluate(scene => {
      const now = new Date()
      return window.desktop.tasks.createOnce({ requestId: crypto.randomUUID(), title: '动作提醒验收', scheduledDate: now.toLocaleDateString('sv-SE'),
        scheduledTime: now.toTimeString().slice(0, 5), reminderEnabled: true, scene })
    }, scene)
    assert.equal(created.ok, true)
    await ready(action)
    await page.getByRole('button', { name: '互动桌宠，双击展开或收起', exact: true }).press('Enter')
    assert.equal(await canvas.getAttribute('data-pet-action'), action)
    await page.getByRole('button', { name: '桌宠动作', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '挥手回应', exact: true }).isDisabled(), true)
    if (scene === 'water') {
      const pending = (await snapshot()).activeReminderIds
      await selector.selectOption('strawberry-bunny-v3'); await ready(action, 'strawberry-bunny-v3')
      assert.deepEqual((await snapshot()).activeReminderIds, pending)
      await selector.selectOption('teng-huan'); await ready(action, 'teng-huan')
      assert.deepEqual((await snapshot()).activeReminderIds, pending)
    }
    await page.getByRole('button', { name: '返回清单', exact: true }).click()
    await page.getByRole('button', { name: '收起这次提醒', exact: true }).click()
    await ready('idle')
  }
  report.checks.push('due bell/water/stretch scenes override clicks and previews; character switching preserves the pending reminder and its scene until acknowledgment')
  await page.screenshot({ path: join(directory, 'expanded.png'), omitBackground: true })
  const saved = await snapshot()
  await app.close()
  app = await _electron.launch({ executablePath: executable ? resolve(executable) : require('electron'),
    args: executable ? [] : [resolve('.')], env, timeout: 30_000 })
  page = await app.firstWindow()
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()) })
  canvas = page.locator('.pet-sprite')
  await ready('idle', 'teng-huan'); await moving()
  assert.equal((await snapshot()).settings.petId, 'teng-huan')
  assert.deepEqual((await snapshot()).today.progress, saved.today.progress)
  await page.screenshot({ path: join(directory, 'reopened.png'), omitBackground: true })
  report.checks.push('a complete application restart restores Teng Huan and preserves task progress')
  assert.deepEqual(report.errors, [])
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || String(error); process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
