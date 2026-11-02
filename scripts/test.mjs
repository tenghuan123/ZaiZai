import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const require = createRequire(import.meta.url)
// SQLite is compiled for Electron, so database tests must use the same Node ABI.
const result = spawnSync(require('electron'), ['--import', 'tsx', '--test', 'tests/m0.test.ts'], {
  stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
