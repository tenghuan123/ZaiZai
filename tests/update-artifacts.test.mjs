import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { readArtifacts } from '../scripts/publish-updates.mjs'

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'zaizai-update-artifacts-'))
  const bytes = Buffer.from('test installer'), name = 'zaizai-0.2.0-win-x64.exe'
  const hash = createHash('sha512').update(bytes).digest('base64')
  await writeFile(join(directory, name), bytes)
  await writeFile(join(directory, `${name}.blockmap`), 'test blockmap')
  const manifest = `version: 0.2.0\nfiles:\n  - url: ${name}\n    sha512: ${hash}\n    size: ${bytes.length}\n`
  await writeFile(join(directory, 'latest.yml'), manifest)
  return { directory, name, manifest, close: () => rm(directory, { recursive: true, force: true }) }
}

test('OSS upload plan contains only manifest-referenced installers and their blockmaps', async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.directory, 'unrelated.txt'), 'do not publish')
    const plan = await readArtifacts(f.directory, 'latest.yml', '0.2.0')
    assert.deepEqual(plan.files.map(file => file.name), [f.name, `${f.name}.blockmap`])
    assert.equal(plan.manifest.name, 'latest.yml')
    assert.equal(plan.manifest.content, f.manifest)
  } finally { await f.close() }
})

test('stale version, corrupted installer, missing blockmap and external paths prevent publishing', async () => {
  const f = await fixture()
  try {
    await assert.rejects(readArtifacts(f.directory, 'latest.yml', '0.3.0'), /版本/)
    await writeFile(join(f.directory, 'latest.yml'), f.manifest.replace(f.name, '../outside.exe'))
    await assert.rejects(readArtifacts(f.directory, 'latest.yml', '0.2.0'), /同目录/)
    await writeFile(join(f.directory, 'latest.yml'), f.manifest)
    await rm(join(f.directory, `${f.name}.blockmap`))
    await assert.rejects(readArtifacts(f.directory, 'latest.yml', '0.2.0'), /缺少差分/)
    await writeFile(join(f.directory, f.name), 'corrupted')
    await assert.rejects(readArtifacts(f.directory, 'latest.yml', '0.2.0'), /校验失败/)
  } finally { await f.close() }
})
