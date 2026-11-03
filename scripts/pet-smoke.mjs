import { _electron } from 'playwright'
import { createRequire } from 'node:module'
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
  const page = await app.firstWindow()
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()) })
  await page.waitForSelector('.widget')
  const canvas = page.locator('.pet-sprite')
  async function ready(action) {
    await page.waitForFunction(action => {
      const canvas = document.querySelector('.pet-sprite')
      return canvas?.dataset.petAction === action && canvas.dataset.status === 'ready'
    }, action)
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
  for (const [action, label] of Object.entries(actions)) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await ready(action); await moving()
    assert.equal(await canvas.getAttribute('data-playback-key'), `preview:${action}`)
  }
  await page.screenshot({ path: join(directory, 'actions.png'), omitBackground: true })
  await page.getByRole('button', { name: '返回清单', exact: true }).click()
  await ready('idle')
  report.checks.push('all seven actual app previews animate, and returning to the task list restores idle')

  await page.getByRole('button', { name: '互动桌宠，双击展开或收起', exact: true }).press('Enter')
  await ready('react'); await moving(); await ready('idle')
  report.checks.push('a keyboard pet interaction plays wave once, then returns to idle')

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
  for (const [scene, action] of [['water', 'drink_water'], ['stretch', 'stretch']]) {
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
    await page.getByRole('button', { name: '返回清单', exact: true }).click()
    await page.getByRole('button', { name: '收起这次提醒', exact: true }).click()
    await ready('idle')
  }
  report.checks.push('due water/stretch scenes override clicks and previews, and acknowledgment releases reminder priority')
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
