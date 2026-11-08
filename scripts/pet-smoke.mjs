import { _electron } from 'playwright'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { desktopPages } from './desktop-pages.mjs'

const require = createRequire(import.meta.url)
const executable = process.argv.find(value => value.startsWith('--executable='))?.slice('--executable='.length)
const selectedPetId = 'teng-junlong'
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
  let { pet: petPage, panel: page } = await desktopPages(app)
  for (const view of [page, petPage]) {
    view.on('pageerror', error => report.errors.push(error.message))
    view.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()) })
  }
  await page.waitForSelector('.widget')
  let canvas = petPage.locator('.pet-sprite')
  async function ready(action, petId) {
    await petPage.waitForFunction(({ action, petId }) => {
      const canvas = document.querySelector('.pet-sprite')
      return canvas?.dataset.petAction === action && canvas.dataset.status === 'ready' && (!petId || canvas.dataset.petId === petId)
    }, { action, petId })
  }
  async function snapshot() {
    const result = await page.evaluate(() => window.desktop.bootstrap())
    assert.equal(result.ok, true); return result.value
  }
  const pet = () => petPage.getByRole('button', { name: '互动桌宠，双击展开或收起', exact: true })
  const questions = () => petPage.getByRole('group', { name: '桌宠快捷气泡' })
  const answer = () => petPage.locator('.answer-bubble')
  const button = name => petPage.getByRole('button', { name, exact: true })
  async function screenPet() {
    const { bounds } = (await snapshot()).window
    const box = await pet().boundingBox()
    return { x: bounds.x + box.x, y: bounds.y + box.y }
  }
  async function openQuestions() {
    await pet().click()
    await questions().waitFor()
  }
  async function moving() {
    const before = await canvas.getAttribute('data-frame')
    await petPage.waitForFunction(before => document.querySelector('.pet-sprite')?.dataset.frame !== before, before)
  }
  await ready('idle'); await moving()
  assert.equal((await snapshot()).settings.petId, 'strawberry-bunny-v3')
  assert.equal(await petPage.locator('.card').count(), 0)
  assert.equal(await page.locator('.pet').count(), 0)
  report.checks.push('the character and task controls render in separate native windows')

  await page.getByRole('button', { name: '桌宠动作', exact: true }).click()
  const actions = { idle: '待机眨眼', react: '挥手回应', celebrate: '鼓掌庆祝', all_done: '跳跃欢呼', remind: '摇铃提醒', drink_water: '喝水提醒', stretch: '头顶伸展' }
  const selector = page.getByRole('combobox', { name: '桌宠角色', exact: true })
  for (const petId of ['strawberry-bunny-v3', 'hu-xianya', 'teng-huan', selectedPetId]) {
    await selector.selectOption(petId)
    await ready('idle', petId)
    assert.equal((await snapshot()).settings.petId, petId)
    if (petId === 'teng-huan') assert.match(await page.locator('.pet-pack-description').innerText(), /v1\.0\.2/)
    if (petId === selectedPetId) assert.match(await page.locator('.pet-pack-description').innerText(), /v1\.0\.1/)
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
  assert.equal(await selector.inputValue(), selectedPetId)
  assert.deepEqual((await snapshot()).settings, selected)
  assert.equal(await canvas.getAttribute('data-pet-id'), selectedPetId)
  sql('DROP TRIGGER pet_selection_failure')
  await page.getByRole('button', { name: '关闭错误提示', exact: true }).click()
  await selector.selectOption('strawberry-bunny-v3'); await ready('idle', 'strawberry-bunny-v3')
  await selector.selectOption(selectedPetId); await ready('idle', selectedPetId)
  report.checks.push('all four installed characters animate all seven actions, Teng Huan uses v1.0.2, Teng Junlong uses v1.0.1, and a real storage failure preserves the current choice until a successful retry')
  await page.getByRole('button', { name: '返回清单', exact: true }).click()
  await ready('idle')
  report.checks.push('all seven actual app previews animate, and returning to the task list restores idle')

  const clearedOffworkTime = await page.evaluate(async () => {
    const { settings } = (await window.desktop.bootstrap()).value
    return window.desktop.settings.update({ expectedVersion: settings.version, patch: { offworkTime: null } })
  })
  assert.equal(clearedOffworkTime.ok, true)
  await petPage.locator('.bubble').waitFor({ state: 'hidden' })
  await pet().press('Enter')
  await questions().waitFor()
  await ready('react'); await moving(); await ready('idle')
  assert.equal(await questions().getByRole('button').count(), 3)
  await button('离下班还有多久？').click()
  await button('点击设置下班时间').waitFor()
  const shortReply = await answer().boundingBox()
  await button('点击设置下班时间').click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('dialog').getByLabel('固定下班时间', { exact: true }).fill('23:59')
  await page.getByRole('dialog').getByRole('button', { name: '完成', exact: true }).click()
  await openQuestions()
  await button('离下班还有多久？').click()
  assert.match(await answer().innerText(), /离下班还有 \d\d:\d\d:\d\d|已下班/)
  await button('收起回答').click()
  await openQuestions()
  await button('讲一个笑话').click()
  const firstJoke = await answer().innerText()
  assert.ok((await answer().boundingBox()).width > shortReply.width)
  await button('再讲一个 ↻').click()
  assert.notEqual(await answer().innerText(), firstJoke)
  await pet().press('Escape')
  await answer().waitFor({ state: 'hidden' })
  report.checks.push('idle pet is quiet; keyboard and mouse open three actions, countdown uses settings, and jokes wrap and refresh')

  await petPage.emulateMedia({ reducedMotion: 'reduce' })
  await petPage.waitForFunction(() => document.querySelector('.pet-sprite')?.dataset.paused === 'true', null, { polling: 100 })
  let before = await canvas.getAttribute('data-frame')
  await page.waitForTimeout(200)
  assert.equal(await canvas.getAttribute('data-frame'), before)
  await petPage.emulateMedia({ reducedMotion: 'no-preference' }); await moving()
  const visibleRevision = (await snapshot()).revision
  await page.evaluate(() => window.desktop.hide())
  await page.waitForFunction(async () => (await window.desktop.bootstrap()).value.window.animationsPaused, null, { polling: 100 })
  assert.ok((await snapshot()).revision > visibleRevision)
  await petPage.waitForFunction(() => document.querySelector('.pet-sprite')?.dataset.paused === 'true', null, { polling: 100 })
  before = await canvas.getAttribute('data-frame')
  await page.waitForTimeout(250)
  assert.equal(await canvas.getAttribute('data-frame'), before)
  await app.evaluate(({ app }) => app.emit('activate'))
  await page.waitForFunction(async () => !(await window.desktop.bootstrap()).value.window.animationsPaused, null, { polling: 100 })
  await moving()
  report.checks.push('reduced-motion and hidden-window states stop the frame clock; showing the window resumes it')

  const collapse = () => page.getByRole('button', { name: '仅显示桌宠', exact: true }).click()
  async function waitPanel(visible) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await snapshot()).window.panel.visible === visible) return
      await page.waitForTimeout(20)
    }
    throw new Error(`Panel did not become ${visible ? 'visible' : 'hidden'}`)
  }
  const originalBounds = (await snapshot()).window.bounds
  await collapse()
  await waitPanel(false)
  await ready('idle')
  await petPage.screenshot({ path: join(directory, 'compact.png'), omitBackground: true })
  await button('展开清单').click()
  await waitPanel(true)
  assert.deepEqual((await snapshot()).window.bounds, originalBounds)
  await page.getByRole('button', { name: '仅显示桌宠', exact: true }).waitFor()
  report.checks.push('opening and folding the task window preserves the compact pet window')

  for (const title of ['素材验收甲', '素材验收乙']) {
    await page.getByLabel('新增待办', { exact: true }).fill(title)
    await page.getByRole('button', { name: '快捷新增任务', exact: true }).click()
    await page.getByRole('article', { name: title, exact: true }).waitFor()
  }
  await page.getByRole('button', { name: '完成：素材验收甲', exact: true }).click()
  await ready('celebrate'); await ready('idle')
  await page.getByRole('button', { name: '完成：素材验收乙', exact: true }).click()
  await ready('all_done'); await ready('idle')
  await openQuestions()
  await button('今日任务进度').click()
  assert.match(await answer().innerText(), /2\/2.*100%/)
  await button('收起回答').click()
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
    await openQuestions()
    await button('讲一个笑话').click()
    await button('再讲一个 ↻').waitFor()
    const created = await page.evaluate(scene => {
      const now = new Date()
      return window.desktop.tasks.createOnce({ requestId: crypto.randomUUID(), title: '动作提醒验收', scheduledDate: now.toLocaleDateString('sv-SE'),
        scheduledTime: now.toTimeString().slice(0, 5), reminderEnabled: true, scene })
    }, scene)
    assert.equal(created.ok, true)
    await ready(action)
    await petPage.locator('.reminder-bubble').getByText('动作提醒验收', { exact: true }).waitFor()
    assert.equal(await button('再讲一个 ↻').count(), 0)
    await pet().press('Enter')
    assert.equal(await canvas.getAttribute('data-pet-action'), action)
    if (scene === 'generic') {
      await button('查看清单').click()
      await page.locator(`[data-occurrence-id="${created.value.id}"].focused`).waitFor()
    }
    await page.getByRole('button', { name: '桌宠动作', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '挥手回应', exact: true }).isDisabled(), true)
    if (scene === 'water') {
      const pending = (await snapshot()).activeReminderIds
      await selector.selectOption('strawberry-bunny-v3'); await ready(action, 'strawberry-bunny-v3')
      assert.deepEqual((await snapshot()).activeReminderIds, pending)
      await selector.selectOption(selectedPetId); await ready(action, selectedPetId)
      assert.deepEqual((await snapshot()).activeReminderIds, pending)
    }
    await page.getByRole('button', { name: '返回清单', exact: true }).click()
    await button('收起这次提醒').click()
    await ready('idle')
    assert.equal(await answer().count(), 0)
  }
  report.checks.push('due bell/water/stretch scenes override clicks and previews; character switching preserves the pending reminder and its scene until acknowledgment')
  async function dragPet(target, missPointerUp = false) {
    const from = await screenPet()
    await app.evaluate(({ screen }, from) => {
      globalThis.petTestCursor = { x: from.x + 60, y: from.y + 60 }
      globalThis.readSystemCursor = screen.getCursorScreenPoint
      screen.getCursorScreenPoint = () => globalThis.petTestCursor
    }, from)
    try {
      const box = await pet().boundingBox()
      await petPage.mouse.move(box.x + 60, box.y + 60)
      await petPage.mouse.down()
      await petPage.mouse.move(box.x + 66, box.y + 60)
      await page.waitForTimeout(80)
      await app.evaluate((_electron, target) => { globalThis.petTestCursor = { x: target.x + 60, y: target.y + 60 } }, target)
      await petPage.mouse.move(box.x + 70, box.y + 60)
      for (let attempt = 0; attempt < 100; attempt++) {
        const position = await screenPet()
        if (position.x === target.x && position.y === target.y) break
        await page.waitForTimeout(50)
      }
      assert.deepEqual(await screenPet(), target)
      if (missPointerUp) {
        // Simulate a release that never reaches the pet's pointerup handler.
        await petPage.evaluate(() => window.addEventListener('pointerup', event => event.stopImmediatePropagation(),
          { once: true, capture: true }))
      }
      await petPage.mouse.move(-20, -20)
      await petPage.mouse.up()
      await app.evaluate((_electron, from) => { globalThis.petTestCursor = { x: from.x + 60, y: from.y + 60 } }, from)
      await page.waitForTimeout(100)
      assert.deepEqual(await screenPet(), target)
    } finally {
      await petPage.mouse.up()
      await app.evaluate(({ screen }) => {
        screen.getCursorScreenPoint = globalThis.readSystemCursor
        delete globalThis.readSystemCursor
        delete globalThis.petTestCursor
      })
    }
  }

  const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  for (const [horizontal, vertical] of [['right', 'down'], ['left', 'down'], ['right', 'up'], ['left', 'up']]) {
    await collapse()
    await waitPanel(false)
    const target = {
      x: horizontal === 'left' ? area.x + area.width - 143 : area.x + 11,
      y: vertical === 'up' ? area.y + area.height - 134 : area.y + 4
    }
    await dragPet(target, horizontal === 'left' && vertical === 'down')
    assert.equal(await questions().count(), 0)
    await openQuestions()
    const bubbleBox = await questions().boundingBox()
    const petBox = await pet().boundingBox()
    assert.ok(horizontal === 'left' ? bubbleBox.x + bubbleBox.width <= petBox.x : bubbleBox.x >= petBox.x + petBox.width)
    if (horizontal === 'left') {
      await button('离下班还有多久？').click()
      const reply = await answer().boundingBox()
      assert.ok(reply.x >= 0 && reply.x + reply.width <= petBox.x)
    }
    await button('展开清单').click()
    await questions().waitFor({ state: 'hidden' })
    await answer().waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: '仅显示桌宠', exact: true }).waitFor()
    const card = page.locator('.card')
    await card.evaluate(async el => { await Promise.allSettled(el.getAnimations().map(animation => animation.finished)) })
    const { panel, bounds } = (await snapshot()).window
    assert.equal(panel.direction.horizontal, horizontal)
    assert.equal(panel.direction.vertical, vertical)
    assert.deepEqual(await screenPet(), target)
    const cardBox = await card.boundingBox()
    assert.ok(cardBox.x >= 0 && cardBox.y >= 0 && cardBox.x + cardBox.width <= panel.bounds.width && cardBox.y + cardBox.height <= panel.bounds.height)
    const petTop = target.y
    const panelTop = panel.bounds.y + cardBox.y
    const panelBottom = panelTop + cardBox.height
    const gap = vertical === 'up' ? petTop - panelBottom : panelTop - petTop - petBox.height
    assert.ok(gap >= 16 && gap <= 24, `visible card-to-pet gap: ${gap}px`)
    assert.ok(vertical === 'up' ? panel.bounds.y + panel.bounds.height > bounds.y : panel.bounds.y < bounds.y + bounds.height)
  }
  report.checks.push('drag stops on release outside the window, even when pointerup is lost; all four corners still expand around the pet')

  const below = await screenPet()
  const stableBounds = (await snapshot()).window.bounds
  await app.evaluate(({ BrowserWindow }) => {
    const pet = BrowserWindow.getAllWindows().find(window => new URL(window.webContents.getURL()).searchParams.get('view') === 'pet')
    const setBounds = pet.setBounds.bind(pet)
    globalThis.petWindowChanges = []
    pet.setBounds = (...args) => { globalThis.petWindowChanges.push('setBounds'); setBounds(...args) }
    pet.on('move', () => globalThis.petWindowChanges.push('move'))
    pet.on('resize', () => globalThis.petWindowChanges.push('resize'))
  })
  for (let attempt = 0; attempt < 3; attempt++) {
    await pet().dblclick()
    await waitPanel(false)
    assert.deepEqual(await screenPet(), below)
    assert.deepEqual((await snapshot()).window.bounds, stableBounds)
    await pet().dblclick()
    await waitPanel(true)
    assert.deepEqual(await screenPet(), below)
    assert.deepEqual((await snapshot()).window.bounds, stableBounds)
  }
  assert.deepEqual(await app.evaluate(() => globalThis.petWindowChanges), [])
  report.checks.push('bottom-right double-click toggles only the panel; no native bounds call, move, or resize reaches the pet')
  await page.screenshot({ path: join(directory, 'expanded.png'), omitBackground: true })
  const saved = await snapshot()
  const savedPet = await screenPet()
  await app.close()
  app = await _electron.launch({ executablePath: executable ? resolve(executable) : require('electron'),
    args: executable ? [] : [resolve('.')], env, timeout: 30_000 })
  ;({ pet: petPage, panel: page } = await desktopPages(app))
  for (const view of [page, petPage]) {
    view.on('pageerror', error => report.errors.push(error.message))
    view.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()) })
  }
  canvas = petPage.locator('.pet-sprite')
  await ready('idle', selectedPetId); await moving()
  assert.equal((await snapshot()).settings.petId, selectedPetId)
  assert.deepEqual((await snapshot()).today.progress, saved.today.progress)
  assert.deepEqual(await screenPet(), savedPet)
  await page.screenshot({ path: join(directory, 'reopened.png'), omitBackground: true })
  report.checks.push('a complete application restart restores Teng Junlong and preserves task progress')
  await app.evaluate(({ BrowserWindow }) => {
    const view = name => BrowserWindow.getAllWindows().find(window => new URL(window.webContents.getURL()).searchParams.get('view') === name)
    const pet = view('pet')
    view('panel').destroy()
    pet.emit('focus')
  })
  report.checks.push('a late pet focus event is safe after Electron destroys the panel')
  assert.deepEqual(report.errors, [])
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || String(error); process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
