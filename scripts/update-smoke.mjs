import { _electron } from 'playwright'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, cp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const root = resolve('.'), directory = resolve('.cache/update-runs', String(Date.now()))
const resources = join(directory, 'resources')
await mkdir(resources, { recursive: true })
await cp('resources/tray', join(resources, 'tray'), { recursive: true })
const payload = Buffer.alloc(256 * 1024, 7)
const hash = createHash('sha512').update(payload).digest('base64')
let mode = 'current'
const requests = []
const server = createServer((request, response) => {
  requests.push(request.url)
  if (request.url.startsWith('/latest-mac.yml')) {
    const version = mode === 'current' ? '0.1.0' : '0.2.0'
    const name = mode === 'bad-hash' ? 'bad-arm64.zip' : 'test-arm64.zip'
    const checksum = mode === 'bad-hash' ? Buffer.alloc(64).toString('base64') : hash
    response.writeHead(200, { 'Content-Type': 'application/yaml', 'Cache-Control': 'no-store' })
    response.end(`version: ${version}\nfiles:\n  - url: ${name}\n    sha512: ${checksum}\n    size: ${payload.length}\npath: ${name}\nsha512: ${checksum}\nreleaseDate: '2026-11-04T00:00:00.000Z'\nreleaseNotes: '本地自动更新链路验证'\n`)
  } else if (/\/(bad|test)-arm64\.zip/.test(request.url)) {
    response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': payload.length })
    response.write(payload.subarray(0, payload.length / 2))
    setTimeout(() => response.end(payload.subarray(payload.length / 2)), 150)
  } else { response.writeHead(404); response.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
await writeFile(join(resources, 'app-update.yml'), `provider: generic\nurl: http://127.0.0.1:${address.port}/\nupdaterCacheDirName: update-smoke\n`)
// The wrapper changes only this isolated process. The real OS installer is the sole stubbed update operation.
const wrapper = join(directory, 'launch.cjs')
await writeFile(wrapper, `const { app } = require('electron');
Object.defineProperty(app, 'isPackaged', { get: () => true });
Object.defineProperty(process, 'resourcesPath', { value: ${JSON.stringify(resources)} });
app.getVersion = () => '0.1.0';
const { autoUpdater } = require(${JSON.stringify(require.resolve('electron-updater'))});
Object.defineProperty(autoUpdater.app, 'baseCachePath', { get: () => ${JSON.stringify(join(directory, 'cache'))} });
globalThis.__updateInstallCalls = [];
autoUpdater.quitAndInstall = (...args) => globalThis.__updateInstallCalls.push(args);
require(${JSON.stringify(join(root, 'out/main/index.js'))});
`)
const env = { ...process.env, TIA_M0_DATA_DIR: join(directory, 'data') }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const report = { directory, checks: [], errors: [], status: 'running' }
let app, page
async function until(action, message) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) { if (await action()) return; await new Promise(resolve => setTimeout(resolve, 50)) }
  throw new Error(`Timed out: ${message}`)
}
async function phase() { return page.evaluate(async () => (await window.desktop.updates.getState()).value.status.phase) }
try {
  assert.equal(process.platform, 'darwin', 'This installed-updater harness currently targets macOS.')
  app = await _electron.launch({ executablePath: require('electron'), args: [wrapper], env, timeout: 30_000 })
  page = await app.firstWindow(); page.setDefaultTimeout(15_000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.waitForSelector('.widget')
  await page.getByLabel('新增待办', { exact: true }).fill('更新期间保留的任务')
  await page.getByRole('button', { name: '快捷新增任务', exact: true }).click()
  await page.getByRole('article', { name: '更新期间保留的任务', exact: true }).waitFor()
  const before = await page.evaluate(async () => (await window.desktop.bootstrap()).value)
  await page.getByRole('button', { name: '组件偏好设置', exact: true }).click()
  const panel = page.getByRole('region', { name: '软件更新', exact: true })
  // A labelled section is exposed as a region by Chromium.
  await panel.getByRole('button', { name: '检查更新', exact: true }).click()
  await until(async () => await phase() === 'up-to-date', 'up-to-date response from the real updater')
  await panel.getByText('当前已经是最新版本。', { exact: true }).waitFor()
  report.checks.push('configured build reads a local update manifest through electron-updater and the actual check-update IPC/UI')

  mode = 'bad-hash'
  await panel.getByRole('button', { name: '检查更新', exact: true }).click()
  await until(async () => await phase() === 'error', 'SHA-512 rejection')
  await panel.getByText('更新未完成，请检查网络后重试。当前版本仍可继续使用。', { exact: true }).waitFor()
  assert.equal(await app.evaluate(() => globalThis.__updateInstallCalls.length), 0)
  report.checks.push('a corrupted download is rejected by the real SHA-512 verifier, remains uninstalled, and exposes retry in settings')

  mode = 'available'
  await panel.getByRole('button', { name: '检查更新', exact: true }).click()
  await until(async () => await phase() === 'ready', 'verified download ready')
  await panel.getByRole('button', { name: '重启更新', exact: true }).waitFor()
  await panel.getByText('更新内容', { exact: true }).click()
  await panel.getByText('本地自动更新链路验证', { exact: true }).waitFor()
  await panel.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(directory, 'settings-ready.png'), omitBackground: true })
  await page.getByRole('dialog').getByRole('button', { name: '完成', exact: true }).click()
  await page.getByRole('status', { name: '新版本提示', exact: true }).waitFor()
  await page.screenshot({ path: join(directory, 'update-ready.png'), omitBackground: true })
  await page.getByRole('button', { name: '稍后', exact: true }).click()
  assert.equal(await page.getByRole('status', { name: '新版本提示', exact: true }).count(), 0)
  const after = await page.evaluate(async () => (await window.desktop.bootstrap()).value)
  assert.deepEqual(after.today.items, before.today.items)
  assert.equal(after.revision, before.revision, 'update events do not invalidate the task projection')
  assert.equal(await app.evaluate(() => globalThis.__updateInstallCalls.length), 0)
  report.checks.push('verified background download, release notes, dismissible prompt and task preservation work without automatic installation')

  await page.getByRole('button', { name: '组件偏好设置', exact: true }).click()
  await page.getByRole('dialog').getByLabel('固定下班时间', { exact: true }).fill('19:45')
  await panel.getByRole('button', { name: '重启更新', exact: true }).click()
  await until(async () => await app.evaluate(() => globalThis.__updateInstallCalls.length) === 1, 'explicit installation handoff')
  assert.deepEqual(await app.evaluate(() => globalThis.__updateInstallCalls[0]), [false, true])
  assert.equal((await page.evaluate(async () => (await window.desktop.bootstrap()).value)).settings.offworkTime, '19:45')
  report.checks.push('restart-update dispatches exactly once through the real IPC/service; OS installation is stubbed and not claimed as verified')
  assert.deepEqual(report.errors, [])
  assert.ok(requests.some(path => path.includes('latest-mac.yml')))
  assert.ok(requests.some(path => path.includes('test-arm64.zip')))
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.error = error.stack
  if (page) await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
