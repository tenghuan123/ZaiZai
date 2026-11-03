import { readFile, writeFile, readdir } from 'node:fs/promises'

const pack = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json', pack), 'utf8'))
const timelines = JSON.parse(await readFile(new URL('source/timelines.json', pack), 'utf8'))
const assets = {}
const files = [...Object.values(manifest.states).map(state => state.src), 'preview.png', 'README.md', 'manifest.json']
for (const id of Object.keys(manifest.states)) {
  // Include the drawings so thumbnail choices in the template never depend on sibling paths.
  for (const name of await readdir(new URL('keyframes/' + id + '/', pack))) {
    if (name.endsWith('.png')) files.push('keyframes/' + id + '/' + name)
  }
}
for (const path of files) {
  const mime = path.endsWith('.png') ? 'image/png' : path.endsWith('.json') ? 'application/json' : 'text/markdown;charset=utf-8'
  assets[path] = 'data:' + mime + ';base64,' + (await readFile(new URL(path, pack))).toString('base64')
}
const template = await readFile(new URL('source/preview.template.html', pack), 'utf8')
const marker = '<!-- EMBEDDED_PACK_DATA -->'
if (template.split(marker).length !== 2) throw new Error('Preview template must contain one data marker')
const data = JSON.stringify({ manifest, timelines, assets }).replaceAll('<', '\\u003c')
const html = template.replace(marker, '<script>window.tengJunlongPack=' + data + ';</script>')
await writeFile(new URL('preview.html', pack), html)
console.log('Built standalone preview.html: ' + (Buffer.byteLength(html) / 1024 / 1024).toFixed(1) + ' MiB; all assets embedded')
