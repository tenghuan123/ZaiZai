import { readFile, stat } from 'node:fs/promises'
import { createReadStream, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import yaml from 'js-yaml'

async function artifact(directory, name) {
  const file = join(directory, name), hash = createHash('sha512')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return { name, file, size: (await stat(file)).size, sha512: hash.digest('base64') }
}

export async function readArtifacts(directory, manifestName, version) {
  const manifestFile = join(directory, manifestName)
  const content = await readFile(manifestFile, 'utf8'), info = yaml.load(content)
  if (info?.version !== version || !Array.isArray(info.files) || !info.files.length) throw new Error('更新清单版本与 package.json 不一致，或清单缺少文件；请重新打包。')
  const files = new Map()
  for (const entry of info.files) {
    const name = decodeURIComponent(entry.url)
    if (basename(name) !== name || name.includes('\\') || !/\.(exe|zip|dmg)$/.test(name)) throw new Error('更新清单只能引用同目录的安装包。')
    const file = await artifact(directory, name)
    if (file.sha512 !== entry.sha512 || file.size !== entry.size) throw new Error(`安装包校验失败：${name}，请重新打包。`)
    files.set(name, file)
    const blockmap = `${name}.blockmap`
    if (existsSync(join(directory, blockmap))) files.set(blockmap, await artifact(directory, blockmap))
    else if (name.endsWith('.exe')) throw new Error(`缺少差分辅助文件：${blockmap}`)
  }
  return { files: [...files.values()], manifest: { name: manifestName, file: manifestFile, content } }
}

async function publish() {
  const target = process.argv[2]
  if (!['win', 'mac'].includes(target) || process.argv.slice(3).some(arg => arg !== '--dry-run')) {
    throw new Error('用法：node scripts/publish-updates.mjs win|mac [--dry-run]')
  }
  const config = JSON.parse(await readFile(new URL('../updates.config.json', import.meta.url), 'utf8'))
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const directory = target === 'win' ? 'windows-x64' : 'mac-arm64'
  const root = new URL(config.baseUrl)
  if (root.protocol !== 'https:' || root.username || root.password || root.search || root.hash || !root.pathname.endsWith('/')) throw new Error('更新地址必须是 HTTPS 目录。')
  const { bucket, endpoint, prefix } = config.upload
  if (!/^[a-z0-9][a-z0-9-]+[a-z0-9]$/.test(bucket) || !/^https:\/\/oss-[a-z0-9-]+\.aliyuncs\.com$/.test(endpoint)
    || !prefix || prefix.startsWith('/') || !prefix.endsWith('/') || prefix.split('/').includes('..')) throw new Error('OSS 上传配置无效。')
  const plan = await readArtifacts(resolve(`release/updates/${directory}`), target === 'win' ? 'latest.yml' : 'latest-mac.yml', version)
  const baseUrl = new URL(`${directory}/`, root)
  const destination = `oss://${bucket}/${prefix}${directory}/`
  console.log(JSON.stringify({ version, destination, publicUrl: baseUrl.href,
    files: plan.files.map(file => ({ name: file.name, bytes: file.size })), manifestLast: plan.manifest.name }, null, 2))
  if (process.argv.includes('--dry-run')) return

  function upload(file, cache) {
    const meta = `Cache-Control:${cache}` + ('sha512' in file ? `#x-oss-meta-sha512:${file.sha512}` : '#Content-Type:application/yaml')
    const result = spawnSync('ossutil', ['cp', file.file, destination + file.name, '-f', '--endpoint', endpoint,
      '--meta', meta, '--checkpoint-dir', '.cache/oss-checkpoints', '--output-dir', '.cache/oss-reports'], { stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`OSS 上传结果未确认：${file.name}；${'content' in file ? '请检查公网版本清单。' : '本次尚未上传版本清单。'}`)
  }
  async function head(file) {
    return fetch(new URL(encodeURIComponent(file.name), baseUrl), { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(20_000), cache: 'no-store' })
  }
  for (const file of plan.files) {
    const existing = await head(file)
    if (existing.status === 200) {
      if (existing.headers.get('x-oss-meta-sha512') !== file.sha512 || Number(existing.headers.get('content-length')) !== file.size) {
        throw new Error(`同名文件已存在且校验不同，禁止覆盖：${file.name}。请递增版本号后重新打包。`)
      }
      console.log(`已存在相同文件，跳过：${file.name}`)
    } else if (existing.status === 404) upload(file, 'public,max-age=31536000,immutable')
    else throw new Error(`更新地址无法匿名读取：${existing.status} ${file.name}`)
    const uploaded = await head(file)
    if (!uploaded.ok || Number(uploaded.headers.get('content-length')) !== file.size || uploaded.headers.get('x-oss-meta-sha512') !== file.sha512) {
      throw new Error(`上传后的匿名访问或完整性检查失败：${file.name}；版本清单尚未切换。`)
    }
  }
  upload(plan.manifest, 'no-cache,no-store,must-revalidate')
  const published = await fetch(new URL(plan.manifest.name, baseUrl), { signal: AbortSignal.timeout(20_000), cache: 'no-store' })
  if (!published.ok || await published.text() !== plan.manifest.content) throw new Error('版本清单已上传，但公网读取未确认，请检查 OSS 或 CDN 缓存。')
  console.log(`版本 ${version} 已发布：${new URL(plan.manifest.name, baseUrl).href}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await publish().catch(error => { console.error(error.message); process.exitCode = 1 })
}
