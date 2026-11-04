// Run after npm run build: node --import tsx scripts/bunny-proportions-smoke.mjs
import { chromium, _electron } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { spriteSlices } from '../src/shared/pet-proportions.ts';
const require = createRequire(import.meta.url),
  directory = resolve('.cache/bunny-proportions-runs', String(Date.now())),
  root = resolve('resources/pets/strawberry-bunny-v3');
await mkdir(directory, {
  recursive: true
});
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const report = {
  petId: manifest.id,
  petVersion: manifest.version,
  checks: [],
  frames: 0,
  errors: [],
  status: 'running'
};
const labels = {
  idle: '待机眨眼',
  react: '挥手回应',
  celebrate: '鼓掌庆祝',
  all_done: '跳跃欢呼',
  remind: '摇铃提醒',
  drink_water: '喝水提醒',
  stretch: '头顶伸展'
};
const server = createServer(async (req, res) => {
  try {
    const file = resolve('.', '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(resolve('.') + '/')) throw new Error('outside root');
    const data = await readFile(file);
    res.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser, app;
try {
  browser = await chromium.launch({
    headless: true,
    channel: 'chrome'
  });
  const preview = await browser.newPage({
    viewport: {
      width: 1100,
      height: 1100
    }
  });
  preview.on('pageerror', e => report.errors.push(e.message));
  await preview.goto(`http://127.0.0.1:${server.address().port}/resources/pets/strawberry-bunny-v3/preview.html`);
  await preview.evaluate(() => window.artifactReady);
  const sources = Object.fromEntries(await Promise.all(Object.entries(manifest.states).map(async ([action, state]) => [action, `data:image/png;base64,${(await readFile(join(root, state.src))).toString('base64')}`])));
  const slices = Object.fromEntries(Object.entries(manifest.states).map(([a, s]) => [a, Array.from({
    length: s.frames
  }, (_, i) => spriteSlices(320, 320, i, s.proportions))]));
  const neutral = {};
  report.comparisons = {
    preview: {},
    electron: {}
  };
  for (const [action, state] of Object.entries(manifest.states)) {
    await preview.evaluate(action => window.chooseAction(action), action);
    const outcome = await preview.evaluate(async ({
      action,
      state,
      src,
      slices
    }) => {
      window.seekPreview(0);
      const source = new Image();
      source.src = src;
      await source.decode();
      const reference = document.createElement('canvas');
      reference.width = reference.height = 320;
      const ctx = reference.getContext('2d');
      const overflow = document.createElement('canvas');
      overflow.width = overflow.height = 640;
      const outside = overflow.getContext('2d');
      let maxDiff = 0,
        maxMeanDiff = 0;
      const footPositions = [];
      const visibleHeights = [];
      for (let frame = 0; frame < state.frames; frame++) {
        ctx.clearRect(0, 0, 320, 320);
        outside.clearRect(0, 0, 640, 640);
        const sx = frame % state.cols * 320,
          sy = Math.floor(frame / state.cols) * 320;
        for (const s of slices[frame]) {
          ctx.drawImage(source, sx, sy + s.sourceY, 320, s.sourceHeight, s.x, s.y, s.width, s.height);
          outside.drawImage(source, sx, sy + s.sourceY, 320, s.sourceHeight, s.x + 160, s.y + 160, s.width, s.height);
        }
        const large = outside.getImageData(0, 0, 640, 640).data;
        for (let y = 0; y < 640; y++) for (let x = 0; x < 640; x++) if ((x < 160 || x >= 480 || y < 160 || y >= 480) && large[(y * 640 + x) * 4 + 3] > 4) throw new Error(`${action} frame ${frame}: clipped pixel ${x - 160},${y - 160}`);
        window.seekPreview(frame);
        const expected = ctx.getImageData(0, 0, 320, 320).data,
          actual = document.getElementById('after').getContext('2d').getImageData(0, 0, 320, 320).data;
        let top = 320, bottom = -1;
        for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
          if (actual[(y * 320 + x) * 4 + 3] <= 32) continue;
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        footPositions.push(bottom + 1);
        visibleHeights.push(bottom - top + 1);
        let sum = 0;
        for (let i = 0; i < actual.length; i++) {
          const a = i - i % 4 + 3;
          const diff = i % 4 === 3 ? Math.abs(actual[i] - expected[i]) : Math.abs(actual[i] * actual[a] / 255 - expected[i] * expected[a] / 255);
          maxDiff = Math.max(maxDiff, diff);
          sum += diff;
        }
        maxMeanDiff = Math.max(maxMeanDiff, sum / actual.length);
      }
      window.seekPreview(0);
      return {
        frames: state.frames,
        maxDiff,
        maxMeanDiff,
        footRange: [Math.min(...footPositions), Math.max(...footPositions)],
        heightRange: [Math.min(...visibleHeights), Math.max(...visibleHeights)],
        neutral: document.getElementById('after').toDataURL()
      };
    }, {
      action,
      state,
      src: sources[action],
      slices: slices[action]
    });
    assert.ok(outcome.maxMeanDiff < 1 && outcome.maxDiff <= 32, `${action}: preview differs from application renderer (${outcome.maxMeanDiff})`);
    if (action === 'all_done') {
      assert.ok(outcome.footRange[1] - outcome.footRange[0] > 20, 'jump must leave the ground');
      assert.ok(outcome.heightRange[1] - outcome.heightRange[0] > 20, 'jump must retain its anticipation crouch');
    }
    if (action === 'celebrate' || action === 'drink_water') {
      assert.ok(outcome.footRange[1] - outcome.footRange[0] <= 3, `${action}: planted feet moved`);
    }
    report.frames += outcome.frames;
    neutral[action] = outcome.neutral;
    report.comparisons.preview[action] = {
      max: outcome.maxDiff,
      mean: outcome.maxMeanDiff,
      footRange: outcome.footRange,
      heightRange: outcome.heightRange
    };
  }
  if (manifest.version.startsWith('3.1.')) {
    for (const action of ['celebrate', 'all_done']) {
      assert.equal(neutral[action], neutral.idle, `${action}: neutral pose must match idle pixels`);
    }
    report.checks.push('redrawn clap and jump start with the exact idle pixels; planted feet, crouch and airborne motion are preserved');
  }
  report.checks.push('all 536 playback frames match the renderer within 1/255 mean premultiplied pixel difference (GPU/software scaling rounding) and retain all opaque artwork inside the canvas');
  await preview.evaluate(() => {
    window.chooseAction('react');
  });
  await preview.evaluate(() => window.seekPreview(0));
  await preview.screenshot({
    path: join(directory, 'preview-page.png'),
    fullPage: true
  });
  const env = {
    ...process.env,
    TIA_M0_DATA_DIR: join(directory, `data-${Date.now()}`)
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const executable = process.argv.find(v => v.startsWith('--executable='))?.slice(13);
  app = await _electron.launch({
    executablePath: executable ? resolve(executable) : require('electron'),
    args: executable ? [] : [resolve('.')],
    env,
    timeout: 30000
  });
  const page = await app.firstWindow();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') report.errors.push(m.text());
  });
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.getByRole('button', {
    name: '桌宠动作',
    exact: true
  }).click();
  const ready = async action => page.waitForFunction(a => {
    const c = document.querySelector('.pet-sprite');
    return c?.dataset.petAction === a && c.dataset.status === 'ready';
  }, action, {
    polling: 50
  });
  for (const [action, label] of Object.entries(labels)) {
    await page.getByRole('button', {
      name: label,
      exact: true
    }).click();
    await ready(action);
    const difference = await page.locator('.pet-sprite').evaluate(async (c, expectedURL) => {
      const image = new Image();
      image.src = expectedURL;
      await image.decode();
      const ref = document.createElement('canvas');
      ref.width = ref.height = 320;
      const ctx = ref.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const actual = c.getContext('2d').getImageData(0, 0, 320, 320).data,
        expected = ctx.getImageData(0, 0, 320, 320).data;
      let max = 0,
        sum = 0;
      for (let i = 0; i < actual.length; i++) {
        const a = i - i % 4 + 3;
        const diff = i % 4 === 3 ? Math.abs(actual[i] - expected[i]) : Math.abs(actual[i] * actual[a] / 255 - expected[i] * expected[a] / 255);
        max = Math.max(max, diff);
        sum += diff;
      }
      return {
        max,
        mean: sum / actual.length
      };
    }, neutral[action]);
    report.comparisons.electron[action] = difference;
    assert.ok(difference.mean < 1 && difference.max <= 32, `${action}: actual Electron canvas differs from calibrated preview (${difference})`);
  }
  report.checks.push('all seven actual Electron action previews match calibrated preview pixels within rounding tolerance, including unchanged idle');
  await page.getByRole('button', {
    name: '返回清单',
    exact: true
  }).click();
  await ready('idle');
  await page.emulateMedia({
    reducedMotion: 'no-preference'
  });
  await page.getByRole('button', {
    name: '互动桌宠，双击展开或收起',
    exact: true
  }).press('Enter');
  await ready('react');
  await ready('idle');
  report.checks.push('interaction waves once, animates normally and returns to idle');
  await page.screenshot({
    path: join(directory, 'application.png'),
    omitBackground: true
  });
  const review = await browser.newPage({
    viewport: {
      width: 1120,
      height: 500
    },
    deviceScaleFactor: 1
  });
  const before = Object.fromEntries(await Promise.all(Object.keys(labels).map(async a => [a, `data:image/png;base64,${(await readFile(join(root, `keyframes/${a}/00.png`))).toString('base64')}`])));
  await review.setContent(`<style>body{margin:0;background:#f8f3ee;font:13px -apple-system,sans-serif;color:#6e514b}h2{font-size:20px;font-weight:500;margin:22px 24px}main{display:grid;grid-template-columns:repeat(7,160px)}section{text-align:center}img{display:block;width:160px;height:160px}p{margin:8px}small{display:block;margin:4px 0 14px;color:#947b72}</style><h2>草莓兔 · 以待机为基准校准体型</h2><main>${Object.entries(labels).map(([a, label]) => `<section><p>${label}</p><img src="${before[a]}"><small>调整前</small><img src="${neutral[a]}"><small>调整后</small></section>`).join('')}</main>`);
  await review.locator('img').evaluateAll(imgs => Promise.all(imgs.map(i => i.decode())));
  await review.screenshot({
    path: join(directory, 'size-comparison.png'),
    fullPage: true
  });
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.failure = e.stack;
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  if (browser) await browser.close();
  server.close();
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
