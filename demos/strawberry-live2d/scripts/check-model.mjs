import { readFile, stat, mkdir, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('../', import.meta.url))
const modelDirectory = resolve(directory, 'public/model')
const report = { status: 'incomplete', checkedAt: new Date().toISOString(), checks: [], errors: [], runtimeVerified: false }
try {
  const file = resolve(modelDirectory, 'strawberry-bunny.model3.json')
  const model = JSON.parse(await readFile(file, 'utf8'))
  if (model.Version !== 3 || !model.FileReferences?.Moc || !model.FileReferences?.Textures?.length) throw new Error('The exported model3.json is missing its real MOC3 or texture references')
  const references = [model.FileReferences.Moc, ...model.FileReferences.Textures]
  for (const name of references) {
    const target = resolve(modelDirectory, name)
    if (relative(modelDirectory, target).startsWith('..')) throw new Error(`Model reference escapes its directory: ${name}`)
    if (!(await stat(target)).isFile()) throw new Error(`Missing model asset: ${name}`)
  }
  const moc = await readFile(resolve(modelDirectory, model.FileReferences.Moc))
  if (moc.toString('ascii', 0, 4) !== 'MOC3' || moc.length < 64) throw new Error('The .moc3 file is not a compiled Cubism model. JSON/mock exports are not accepted.')
  report.checks.push('model3.json points to an existing compiled MOC3 and all its textures')
  await stat(resolve(directory, 'public/vendor/live2dcubismcore.min.js'))
  report.checks.push('the Cubism Core runtime file is present')
  report.status = 'files-ready'
} catch (error) { report.errors.push(error.message) }
await mkdir(resolve(directory, 'evidence'), { recursive: true })
await writeFile(resolve(directory, 'evidence/model-preflight.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'files-ready') process.exitCode = 1
