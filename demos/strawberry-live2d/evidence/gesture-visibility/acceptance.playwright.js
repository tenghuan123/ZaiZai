async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 300, height: 400 }, deviceScaleFactor: 1 });
  const p = await context.newPage(), errors = [], results = [];
  p.on('pageerror', e => errors.push(e.message));
  const dir = '/Users/tenghuan/programming/vjshi/studyDemo/tia-windows-plugins/demos/strawberry-live2d/evidence/gesture-visibility/';
  const state = () => p.evaluate(() => {
    const c = document.querySelector('#character'), stage = document.querySelector('#stage').getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight, stage: stage.toJSON(), scrollY,
      fullyVisible: stage.top >= 0 && stage.bottom <= innerHeight,
      progress: Number(c.dataset.gestureProgress), tilt: Number(c.dataset.tilt), arm: Number(c.dataset.armLeft),
      leftEye: Number(c.dataset.eyeLeftFrame), rightEye: Number(c.dataset.eyeRightFrame),
      renderer: c.dataset.renderer
    };
  });
  try {
    await p.goto('http://127.0.0.1:5187/');
    await p.waitForFunction(() => document.body.dataset.ready === 'true');
    await p.locator('#voice').uncheck();
    for (const id of ['explain', 'greet', 'curious', 'smile', 'sleepy']) {
      await p.locator('[data-scene="take-it-easy"]').click();
      await p.waitForFunction(() => Math.abs(Number(document.querySelector('#character').dataset.tilt)) < .01 && Number(document.querySelector('#character').dataset.armLeft) < .002);
      // Deliberately scroll away as a user reaching controls in a narrow panel would.
      await p.locator('.gesture-button[data-gesture="' + id + '"]').scrollIntoViewIfNeeded();
      await p.locator('.gesture-button[data-gesture="' + id + '"]').click();
      const clicked = await state();
      await p.screenshot({ path: dir + id + '-start.png' });
      await p.waitForTimeout(500);
      const onset = await state();
      await p.waitForFunction(() => Number(document.querySelector('#character').dataset.gestureProgress) > .48);
      await p.locator('#play').click();
      const hold = await state();
      await p.screenshot({ path: dir + id + '-hold.png' });
      await p.locator('#play').click();
      await p.waitForFunction(() => document.querySelector('#emotion-label').textContent === '动作演完啦');
      await p.waitForFunction(() => Math.abs(Number(document.querySelector('#character').dataset.tilt)) < .01 && Number(document.querySelector('#character').dataset.armLeft) < .002);
      results.push({ id, clicked, onset, hold, returned: await state() });
    }
    // Restarting from controls below the actor must reveal it again.
    await p.locator('#play').click();
    await p.waitForFunction(() => Number(document.querySelector('#character').dataset.gestureProgress) > .1);
    await p.locator('#restart').click();
    const restarted = await state();
    await p.locator('[data-scene="effort"]').click();
    await p.locator('#play').click();
    await p.waitForFunction(() => document.querySelector('#emotion-label').textContent === '讲完啦', {}, { timeout: 18000 });
    if (errors.length || results.some(r => !r.clicked.fullyVisible || !r.onset.fullyVisible || !r.hold.fullyVisible || !r.returned.fullyVisible) || !restarted.fullyVisible) throw new Error('Actor left the viewport during gesture preview');
    return { viewport: '600×800 CSS pixels, stacked layout', errors, results, restarted, sceneCompleted: true };
  } finally { await context.close(); }
}
