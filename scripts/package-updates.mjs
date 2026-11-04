import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import builder from 'electron-builder'

const target = process.argv[2]
if (!['win', 'mac'].includes(target)) throw new Error('用法：node scripts/package-updates.mjs win|mac')
const { baseUrl } = JSON.parse(readFileSync(new URL('../updates.config.json', import.meta.url), 'utf8'))
const root = new URL(baseUrl)
if (root.protocol !== 'https:' || root.username || root.password || root.search || root.hash || !root.pathname.endsWith('/')) {
  throw new Error('updates.config.json 的 baseUrl 必须是以 / 结尾、不带凭据或查询参数的 HTTPS 目录。')
}
const directory = target === 'win' ? 'windows-x64' : 'mac-arm64'
const url = new URL(`${directory}/`, root).href
const config = {
  extends: resolve('electron-builder.yml'),
  directories: { output: `release/updates/${directory}` },
  publish: [{ provider: 'generic', url }],
  releaseInfo: { releaseNotesFile: resolve('docs/releases/latest.md') }
}
if (target === 'win') {
  config.npmRebuild = false
  config.win = { artifactName: 'zaizai-${version}-win-x64.${ext}' }
} else {
  // Local ad-hoc builds remain available via pack:mac; they are not update releases.
  if (!process.env.CSC_NAME?.startsWith('Developer ID Application:')) {
    throw new Error('macOS 更新包需要 Developer ID Application 签名。请在本机配置证书，并设置 CSC_NAME；本机测试包请用 npm run pack:mac。')
  }
  const appleAccount = process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
  const appleApi = process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER
  if (!appleAccount && !appleApi) throw new Error('macOS 更新包还需要本机公证凭据：Apple ID 三项或 App Store Connect API 三项。')
  config.mac = { identity: process.env.CSC_NAME, hardenedRuntime: true, notarize: true,
    artifactName: 'zaizai-${version}-mac-arm64.${ext}' }
}
const built = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' })
if (built.error) throw built.error
if (built.status !== 0) process.exit(built.status ?? 1)
const { build, Platform, Arch } = builder
await build({ config, publish: 'never', targets: target === 'win'
  ? Platform.WINDOWS.createTarget(['nsis'], Arch.x64) : Platform.MAC.createTarget(['dmg', 'zip'], Arch.arm64) })
console.log(`更新包已生成：${config.directories.output}`)
console.log(`请先上传安装包及 .blockmap 等配套文件至 ${url}，验证可匿名下载后，最后上传 latest${target === 'win' ? '' : '-mac'}.yml。`)
