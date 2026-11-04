import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = resolve('resources/pets/strawberry-bunny-v3');
const output = resolve('.cache/bunny-redraw-v3.1/staged');
const timelines = JSON.parse(await readFile(join(root, 'source/timelines.json'), 'utf8'));
const masterData = await readFile(join(root, 'keyframes/idle/00.png'));
const master = `data:image/png;base64,${masterData.toString('base64')}`;
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome'
});
const page = await browser.newPage();
const report = {
  master: 'keyframes/idle/00.png',
  frameSize: 320,
  actions: {}
};
try {
  for (const action of ['celebrate', 'all_done', 'drink_water']) {
    const source = `data:image/png;base64,${(await readFile(join(root, `source/redraw-v3.1/${action}-generated.png`))).toString('base64')}`;
    const timeline = timelines[action].timeline;
    const result = await page.evaluate(async ({
      action,
      source,
      master,
      timeline
    }) => {
      const load = async src => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return image;
      };
      const bounds = (context, w, h) => {
        const data = context.getImageData(0, 0, w, h).data;
        let left = w,
          top = h,
          right = -1,
          bottom = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 32) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
        if (right < left) throw new Error('empty cell');
        let shoeLeft = w,
          shoeRight = -1;
        for (let y = Math.max(top, bottom - 10); y <= bottom; y++) for (let x = left; x <= right; x++) if (data[(y * w + x) * 4 + 3] > 32) {
          shoeLeft = Math.min(shoeLeft, x);
          shoeRight = Math.max(shoeRight, x);
        }
        return {
          left,
          top,
          right,
          bottom,
          footX: (shoeLeft + shoeRight + 1) / 2,
          footY: bottom + 1,
          height: bottom - top + 1
        };
      };
      const image = await load(source),
        idle = await load(master);
      if (image.width !== 1536 || image.height !== 1024) throw new Error('unexpected grid ' + image.width + 'x' + image.height);
      const idleCanvas = document.createElement('canvas');
      idleCanvas.width = idleCanvas.height = 320;
      const idleContext = idleCanvas.getContext('2d');
      idleContext.drawImage(idle, 0, 0);
      const reference = bounds(idleContext, 320, 320);
      const candidates = [];
      for (let key = 0; key < 24; key++) {
        const cell = document.createElement('canvas');
        cell.width = cell.height = 256;
        const context = cell.getContext('2d');
        context.drawImage(image, key % 6 * 256, Math.floor(key / 6) * 256, 256, 256, 0, 0, 256, 256);
        const rgba = context.getImageData(0, 0, 256, 256);
        for (let i = 0; i < rgba.data.length; i += 4) if (rgba.data[i + 3] <= 4) rgba.data.fill(0, i, i + 4);
        context.putImageData(rgba, 0, 0);
        for (const [x, y] of [[0, 0], [255, 0], [0, 255], [255, 255]]) if (rgba.data[(y * 256 + x) * 4 + 3] !== 0) throw new Error(`${action} key ${key} has a nontransparent corner`);
        candidates.push({
          canvas: cell,
          geometry: bounds(context, 256, 256)
        });
      }
      const scale = reference.height / candidates[0].geometry.height;
      const neutralFoot = candidates[0].geometry.footY;
      const reused = action === 'drink_water' ? [] : [0, 1, 2, 22, 23];
      const frames = [],
        metrics = [];
      for (let key = 0; key < 24; key++) {
        const {
          canvas: cell,
          geometry: g
        } = candidates[key];
        const frame = document.createElement('canvas');
        frame.width = frame.height = 320;
        const ctx = frame.getContext('2d');
        if (reused.includes(key)) ctx.drawImage(idle, 0, 0);else {
          const footY = action === 'all_done' ? reference.footY + (g.footY - neutralFoot) * scale : reference.footY;
          ctx.drawImage(cell, 0, 0, 256, 256, 160 - g.footX * scale, footY - g.footY * scale, 256 * scale, 256 * scale);
        }
        const g2 = bounds(ctx, 320, 320);
        if (g2.left < 2 || g2.top < 2 || g2.right > 317 || g2.bottom > 317) throw new Error(`${action} key ${key} touches canvas edge: ${JSON.stringify(g2)}`);
        metrics.push({
          key,
          source: g,
          normalized: g2,
          reusedIdle: reused.includes(key)
        });
        frames.push(frame.toDataURL().split(',')[1]);
      }
      const sheet = document.createElement('canvas');
      sheet.width = 8 * 320;
      sheet.height = Math.ceil(timeline.length / 8) * 320;
      const sheetContext = sheet.getContext('2d');
      const decoded = await Promise.all(frames.map(png => load('data:image/png;base64,' + png)));
      for (let i = 0; i < timeline.length; i++) sheetContext.drawImage(decoded[timeline[i]], i % 8 * 320, Math.floor(i / 8) * 320);
      return {
        scale,
        reusedIdleKeys: reused,
        metrics,
        frames,
        sheet: sheet.toDataURL().split(',')[1]
      };
    }, {
      action,
      source,
      master,
      timeline
    });
    await mkdir(join(output, 'keyframes', action), {
      recursive: true
    });
    for (let i = 0; i < 24; i++) await writeFile(join(output, 'keyframes', action, String(i).padStart(2, '0') + '.png'), result.reusedIdleKeys.includes(i) ? masterData : Buffer.from(result.frames[i], 'base64'));
    await writeFile(join(output, action + '.png'), Buffer.from(result.sheet, 'base64'));
    report.actions[action] = {
      scale: result.scale,
      reusedIdleKeys: result.reusedIdleKeys,
      frames: timeline.length,
      metrics: result.metrics
    };
  }
  await writeFile(join(output, 'import.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report.actions).map(([a, r]) => [a, {
    scale: r.scale,
    playbackFrames: r.frames,
    footRange: [Math.min(...r.metrics.map(m => m.normalized.footY)), Math.max(...r.metrics.map(m => m.normalized.footY))]
  }])), null, 2));
} finally {
  await browser.close();
}
