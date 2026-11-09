import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadHumorContent } from '../src/main/desktop/humor-pack'
import { drawHumorLine } from '../src/renderer/src/features/pet/humor'

test('a local pack replaces both categories, with a fallback for invalid packs', t => {
  const directory = mkdtempSync(join(tmpdir(), 'zaizai-humor-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'humor-pack.json')
  const unexpected = (error: unknown): never => { throw error }
  const builtIn = loadHumorContent(directory, unexpected)
  assert.ok(builtIn.joke.length > 1 && builtIn.roast.length > 1)

  const entries = [{ kind: 'joke', text: '桌宠的新笑话' }, { kind: 'joke', text: ' 桌宠的新笑话 ' }, { kind: 'roast', text: '桌宠的新吐槽' }]
  writeFileSync(path, '\uFEFF' + JSON.stringify({ formatVersion: 1, entries }))
  const local = loadHumorContent(directory, unexpected)
  assert.deepEqual(local, { joke: ['桌宠的新笑话'], roast: ['桌宠的新吐槽'] })
  assert.equal(drawHumorLine(local.joke, 0.5, local.joke[0]), local.joke[0])

  for (const raw of ['{broken json', JSON.stringify({ formatVersion: 2, entries }), JSON.stringify({ formatVersion: 1, entries: entries.slice(0, 1) })]) {
    writeFileSync(path, raw)
    let failure: unknown
    assert.deepEqual(loadHumorContent(directory, error => { failure = error }), builtIn)
    assert.ok(failure instanceof Error)
  }
})

test('drawing another line skips the previous line across the draw range', () => {
  const lines = ['a', 'b', 'c']
  for (const previous of lines) {
    assert.deepEqual([drawHumorLine(lines, 0, previous), drawHumorLine(lines, 0.9999, previous)], lines.filter(line => line !== previous))
  }
})
