import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const pack = new URL('../', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1160, height: 870 }, deviceScaleFactor: 1 })
  const pageErrors = []
  const requests = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('request', request => { if (!request.url().startsWith('data:')) requests.push(request.url()) })
  // Reproduce an embedded HTML preview with no file base URL or neighboring resources.
  await page.setContent(await readFile(new URL('preview.html', pack), 'utf8'))
  await page.evaluate(() => window.artifactReady)
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#actions img')).every(image => image.complete && image.naturalWidth > 0))
  await page.screenshot({ path: fileURLToPath(new URL('previews/player-light.png', pack)) })
  const actions = []
  for (const id of ['idle', 'react', 'celebrate', 'all_done', 'remind', 'drink_water', 'stretch']) {
    const result = await page.evaluate(id => window.chooseAction(id), id)
    await page.evaluate(() => window.seekPreview(12))
    const visible = await page.evaluate(() => {
      const canvas = document.querySelector('#pet')
      return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0)
    })
    if (!visible) throw new Error('Character canvas is blank: ' + id)
    await page.locator('#next').click()
    const next = await page.locator('#frame-info').textContent()
    if (!next.includes('播放帧 14 /')) throw new Error('Next frame failed: ' + id)
    await page.locator('#previous').click()
    const previous = await page.locator('#frame-info').textContent()
    if (!previous.includes('播放帧 13 /')) throw new Error('Previous frame failed: ' + id)
    actions.push({ ...result, frameStepPassed: true, characterVisible: true })
  }
  await page.evaluate(() => window.chooseAction('react'))
  await page.evaluate(() => window.seekPreview(24))
  await page.locator('[data-bg="dark"]').click()
  await page.screenshot({ path: fileURLToPath(new URL('previews/player-dark.png', pack)) })
  await page.locator('[data-bg="checker"]').click()
  await page.locator('[data-speed="0.25"]').click()
  if (await page.locator('[data-speed="0.25"]').getAttribute('aria-pressed') !== 'true') {
    throw new Error('Speed selection failed')
  }
  await page.locator('#loop').uncheck()
  await page.locator('#restart').click()
  await page.waitForTimeout(2800)
  if (await page.locator('#play').textContent() !== '暂停') throw new Error('Quarter-speed playback paused early')
  await page.locator('[data-speed="1"]').click()
  await page.waitForTimeout(2200)
  if (await page.locator('#play').textContent() !== '播放') throw new Error('Single playback did not finish')
  const race = await page.evaluate(async () => {
    await Promise.all([window.chooseAction('idle'), window.chooseAction('stretch')])
    return document.querySelector('[data-action="stretch"]').getAttribute('aria-pressed')
  })
  if (race !== 'true') throw new Error('Stale action request overwrote the last selection')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: fileURLToPath(new URL('previews/player-mobile.png', pack)), fullPage: true })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
    throw new Error('Mobile preview overflows horizontally')
  }
  if (pageErrors.length) throw new Error(pageErrors.join('\n'))
  if (requests.length) throw new Error('Standalone preview requested external assets: ' + requests.join('\n'))
  const report = { date: '2026-11-03', passed: true, browser: 'Chrome headless', loadedFrom: 'embedded HTML without file base URL',
    actions, backgrounds: ['light', 'dark', 'checker'], speedSelection: true, singlePlayCompletes: true,
    lateSelectionIgnored: true, mobileWidth: 390, horizontalOverflow: false, loadedThumbnails: 7, externalRequests: requests, pageErrors }
  await writeFile(new URL('source/preview-validation.json', pack), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
