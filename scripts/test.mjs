import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
// SQLite is compiled for Electron, so database tests must use the same Node ABI.
const files = readdirSync('tests').filter(name => /\.test\.(ts|mjs)$/.test(name)).map(name => `tests/${name}`)
const result = spawnSync(require('electron'), ['--import', 'tsx', '--test', ...files], {
  stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
