async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  const p = await context.newPage(), errors = [], shots = [], checks = [];
  p.on('pageerror', error => errors.push(error.message));
  await p.addInitScript(() => {
    window.__audios = []; window.__samples = [];
    const Native = window.Audio;
    window.Audio = function (...args) { const audio = new Native(...args); audio.muted = true; window.__audios.push(audio); return audio; };
    window.Audio.prototype = Native.prototype;
    setInterval(() => {
      const c = document.querySelector('#character'), audio = window.__audios.at(-1);
      if (c) window.__samples.push({ eye: c.dataset.eye, leftEye: c.dataset.eyeLeftFrame, rightEye: c.dataset.eyeRightFrame, gesture: c.dataset.gesture, gestureProgress: c.dataset.gestureProgress, mouth: c.dataset.mouth, tilt: c.dataset.tilt, armLeft: c.dataset.armLeft, body: c.dataset.body, beat: document.querySelector('#stage')?.dataset.beat, audioTime: audio?.currentTime, audioPaused: audio?.paused });
    }, 30);
  });
  const dir = '/Users/tenghuan/programming/vjshi/studyDemo/tia-windows-plugins/demos/strawberry-live2d/evidence/gesture-library/';
  try {
    await p.goto('http://127.0.0.1:5187/');
    await p.waitForFunction(() => document.body.dataset.ready === 'true');
    await p.locator('#voice').uncheck();
    const snapshot = () => p.locator('#character').evaluate(c => ({ gesture: c.dataset.gesture, gestureProgress: c.dataset.gestureProgress, tilt: c.dataset.tilt, armLeft: c.dataset.armLeft, eyeLeftFrame: c.dataset.eyeLeftFrame, mouth: c.dataset.mouth, renderer: c.dataset.renderer }));
    const snap = async (id, phase) => {
      await p.evaluate(() => scrollTo(0, 0));
      const metrics = await p.evaluate(() => ({ innerWidth, stage: document.querySelector('#stage').getBoundingClientRect().toJSON() }));
      const file = `${id}-${phase}-full.png`;
      await p.screenshot({ path: dir + file });
      shots.push({ id, phase, file, ...metrics, pose: await snapshot() });
    };
    for (const id of ['explain', 'greet', 'curious', 'smile', 'sleepy']) {
      await p.locator(`.gesture-button[data-gesture="${id}"]`).click();
      await p.locator('#play').click();
      await snap(id, 'start');
      await p.locator('#play').click();
      await p.waitForFunction(() => Number(document.querySelector('#character').dataset.gestureProgress) > .2);
      await p.locator('#play').click();
      await snap(id, 'enter');
      await p.locator('#play').click();
      await p.waitForFunction(() => Number(document.querySelector('#character').dataset.gestureProgress) > .56);
      await p.locator('#play').click();
      await snap(id, 'hold');
      const before = await snapshot();
      await p.waitForTimeout(180);
      const after = await snapshot();
      checks.push({ id, pauseFrozen: ['gestureProgress', 'tilt', 'armLeft', 'eyeLeftFrame', 'mouth'].every(key => before[key] === after[key]) });
      await p.locator('#play').click();
      await p.waitForFunction(() => document.querySelector('#emotion-label').textContent === '动作演完啦');
      await p.waitForFunction(() => {
        const c = document.querySelector('#character');
        return Math.abs(Number(c.dataset.tilt)) < .01 && Number(c.dataset.armLeft) < .002 && Number(c.dataset.eye) > .999 && Number(c.dataset.blink) > .999;
      });
      await snap(id, 'returned');
    }
    const silentPreviewAudioCount = await p.evaluate(() => window.__audios.length);
    // Interrupt an action, then a spoken line, to cover both ownership directions.
    await p.locator('.gesture-button[data-gesture="greet"]').click();
    await p.waitForFunction(() => Number(document.querySelector('#character').dataset.gestureProgress) > .08);
    await p.locator('[data-scene="effort"]').click();
    const previewCancelled = await p.locator('#character').getAttribute('data-gesture') === null;
    await p.locator('#play').click();
    await p.waitForFunction(() => window.__audios.at(-1)?.currentTime > .12);
    const interrupted = await p.evaluate(() => window.__audios.length - 1);
    await p.locator('.gesture-button[data-gesture="curious"]').click();
    const speechCancelled = await p.evaluate(index => window.__audios[index].paused, interrupted);
    const completed = [];
    for (const scene of ['take-it-easy', 'effort', 'rest']) {
      await p.locator(`[data-scene="${scene}"]`).click();
      await p.locator('#play').click();
      await p.waitForFunction(() => document.querySelector('#emotion-label').textContent === '讲完啦', {}, { timeout: 18000 });
      completed.push(scene);
    }
    await p.locator('#mode-study').click();
    await p.waitForFunction(() => document.body.dataset.mode === 'study' && document.body.dataset.ready === 'true');
    await p.locator('.gesture-button[data-gesture="smile"]').click();
    await p.waitForFunction(() => document.querySelector('#character').dataset.eyeLeftFrame === '0');
    const study = await snapshot();
    await p.locator('#mode-live2d').click();
    await p.waitForFunction(() => document.body.dataset.mode === 'live2d' && document.body.dataset.ready === 'true');
    const result = await p.evaluate(() => ({ samples: window.__samples, audios: window.__audios.map(a => ({ file: a.src.split('/').pop(), muted: a.muted, error: a.error?.message })), renderer: document.querySelector('#character').dataset.renderer }));
    return { ...result, errors, shots, checks, silentPreviewAudioCount, previewCancelled, speechCancelled, completed, study };
  } finally { await context.close(); }
}
