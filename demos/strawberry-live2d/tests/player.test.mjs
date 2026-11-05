import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ScenePlayer } from '../src/player.ts'
import { scenes } from '../src/scenes.ts'

function environment() {
  const frames = new Map(), audios = []
  let frameId = 0, now = 0
  class Audio {
    paused = true; ended = false; currentTime = 0; onended = null; onerror = null; muted = false
    constructor(src) { this.src = src; audios.push(this) }
    play() { this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
    finish() { this.ended = true; this.paused = true; this.onended?.() }
  }
  const original = { Audio: globalThis.Audio, raf: globalThis.requestAnimationFrame, cancel: globalThis.cancelAnimationFrame }
  globalThis.Audio = Audio
  globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId }
  globalThis.cancelAnimationFrame = id => frames.delete(id)
  const events = []
  const manifest = { binMs: 40, clips: Object.fromEntries(scenes.flatMap(scene => scene.beats).map(beat => [beat.id, { file: `${beat.id}.wav`, durationMs: 500, envelope: [0.2, 0.8, 0] }])) }
  const player = new ScenePlayer(manifest, event => events.push(event))
  const flush = () => new Promise(resolve => setImmediate(resolve))
  return { player, events, audios, frames, manifest, flush,
    async step(ms = 100) {
      now = Math.max(now, performance.now()) + ms
      const current = [...frames.entries()]; frames.clear()
      for (const [, callback] of current) callback(now)
      await flush()
    },
    restore() {
      player.stop()
      globalThis.Audio = original.Audio; globalThis.requestAnimationFrame = original.raf; globalThis.cancelAnimationFrame = original.cancel
    }
  }
}

test('switching a scene cancels the previous speech and prevents its later beats', async () => {
  const e = environment()
  try {
    const oldRun = e.player.play(scenes[0]), oldAudio = e.audios[0]
    const newRun = e.player.play(scenes[1])
    assert.equal(oldAudio.paused, true)
    assert.equal(oldAudio.onended, null)
    oldAudio.finish(); await e.flush()
    assert.deepEqual(e.events.filter(event => event.type === 'beat').map(event => event.beat.id), ['hurry-1', 'effort-1'])
    e.player.stop(); await Promise.all([oldRun, newRun])
    assert.equal(e.frames.size, 0)
  } finally { e.restore() }
})

test('pausing between two lines preserves the pause instead of skipping to the punchline', async () => {
  const e = environment()
  try {
    const run = e.player.play(scenes[0])
    e.audios[0].finish(); await e.flush()
    e.player.setPaused(true)
    for (let count = 0; count < 12; count++) await e.step()
    assert.equal(e.audios.length, 1)
    e.player.setPaused(false)
    for (let count = 0; count < 8; count++) await e.step()
    assert.equal(e.audios.length, 2)
    assert.equal(e.events.filter(event => event.type === 'beat').at(-1).beat.id, 'hurry-2')
    e.player.stop(); await run
  } finally { e.restore() }
})

test('a media failure stops that run and allows a clean retry', async () => {
  const e = environment()
  try {
    await (async () => {
      const run = e.player.play(scenes[0])
      e.audios[0].onerror(); await run
    })()
    assert.equal(e.events.at(-1).type, 'error')
    assert.equal(e.frames.size, 0)
    const retry = e.player.play(scenes[0])
    assert.equal(e.audios.length, 2)
    assert.equal(e.audios[1].paused, false)
    e.player.stop(); await retry
  } finally { e.restore() }
})

test('missing audio is reported through the same recoverable error boundary', async () => {
  const e = environment()
  try {
    delete e.manifest.clips['hurry-2']
    await e.player.play(scenes[0])
    assert.equal(e.events.at(-1).type, 'error')
    assert.match(e.events.at(-1).message, /hurry-2/)
    assert.equal(e.audios.length, 0)
  } finally { e.restore() }
})

test('gesture time follows actual audio and preserves its position during a paused punchline gap', async () => {
  const e = environment()
  try {
    const run = e.player.play(scenes[0])
    const beat = e.events.find(event => event.type === 'beat')
    assert.equal(beat.progress(), 0)
    e.audios[0].currentTime = .25
    assert.equal(beat.progress(), 250 / (500 + scenes[0].beats[0].pauseAfterMs))
    e.audios[0].finish(); await e.flush()
    await e.step(100)
    const before = beat.progress()
    e.player.setPaused(true)
    for (let i = 0; i < 12; i++) await e.step()
    assert.equal(beat.progress(), before)
    e.player.setPaused(false)
    await e.step()
    assert.ok(beat.progress() > before)
    e.player.stop(); await run
    assert.equal(e.frames.size, 0)
  } finally { e.restore() }
})

test('silent gesture previews pause, cancel and complete without creating audio or receiving stale callbacks', async () => {
  const e = environment()
  try {
    const first = e.player.preview('greet')
    const gesture = e.events.find(event => event.type === 'gesture')
    for (let i = 0; i < 6; i++) await e.step()
    assert.ok(gesture.progress() > 0)
    e.player.setPaused(true)
    const paused = gesture.progress()
    for (let i = 0; i < 12; i++) await e.step()
    assert.equal(gesture.progress(), paused)
    const second = e.player.preview('smile')
    await first
    for (let i = 0; i < 45; i++) await e.step()
    await second
    assert.equal(e.audios.length, 0)
    assert.equal(e.events.filter(event => event.type === 'finished').length, 1)
    assert.equal(e.events.filter(event => event.type === 'gesture').at(-1).progress(), 1)
    assert.equal(e.frames.size, 0)
  } finally { e.restore() }
})
