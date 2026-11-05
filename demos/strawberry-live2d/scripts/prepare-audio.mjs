import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('../', import.meta.url))
const { scenes } = await import('../src/scenes.ts')
const output = resolve(directory, 'public/audio')
const scratch = resolve(directory, '.cache/audio')
await mkdir(output, { recursive: true })
await mkdir(scratch, { recursive: true })
const voice = 'Tingting'
const manifest = { voice, source: 'macOS installed system voice; fixed demo dialogue; no LLM or remote TTS', binMs: 40, clips: {} }
for (const beat of scenes.flatMap(scene => scene.beats)) {
  const aiff = resolve(scratch, `${beat.id}.aiff`)
  const wav = resolve(output, `${beat.id}.wav`)
  for (const [command, args] of [
    ['say', ['-v', voice, '-r', '185', '-o', aiff, beat.text]],
    ['afconvert', ['-f', 'WAVE', '-d', 'LEI16@22050', '-c', '1', aiff, wav]]
  ]) {
    const result = spawnSync(command, args, { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.error || result.status}`)
  }
  const data = await readFile(wav)
  if (data.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`Invalid WAV: ${wav}`)
  let cursor = 12, sampleRate, pcm
  while (cursor + 8 <= data.length) {
    const name = data.toString('ascii', cursor, cursor + 4), length = data.readUInt32LE(cursor + 4)
    if (name === 'fmt ') {
      if (data.readUInt16LE(cursor + 8) !== 1 || data.readUInt16LE(cursor + 10) !== 1 || data.readUInt16LE(cursor + 22) !== 16) throw new Error('Expected mono 16-bit PCM')
      sampleRate = data.readUInt32LE(cursor + 12)
    }
    if (name === 'data') pcm = data.subarray(cursor + 8, cursor + 8 + length)
    cursor += 8 + length + length % 2
  }
  if (!sampleRate || !pcm) throw new Error(`Missing PCM data: ${wav}`)
  const samplesPerBin = Math.round(sampleRate * manifest.binMs / 1000)
  const envelope = []
  for (let start = 0; start < pcm.length / 2; start += samplesPerBin) {
    let squares = 0, count = 0
    for (let index = start; index < Math.min(start + samplesPerBin, pcm.length / 2); index++) {
      squares += (pcm.readInt16LE(index * 2) / 32768) ** 2; count++
    }
    envelope.push(Math.sqrt(squares / count))
  }
  const peak = Math.max(...envelope, 0.001)
  manifest.clips[beat.id] = { text: beat.text, file: `${beat.id}.wav`, durationMs: Math.round(pcm.length / 2 / sampleRate * 1000),
    envelope: envelope.map(value => Number((value < 0.006 ? 0 : Math.min(1, value / peak * 1.5)).toFixed(3))) }
}
await writeFile(resolve(output, 'envelopes.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ directory: dirname(output), clips: Object.keys(manifest.clips), voice }))
