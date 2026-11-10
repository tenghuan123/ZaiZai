# OSS 自动更新

2026-11-04 接入。客户端使用 `electron-updater`，从 OSS 的普通 HTTPS 地址检查与下载更新，不需要账号或 OSS 密钥。公开地址与上传目标统一记录在根目录 `updates.config.json`。

## 已配置的地址

- 公网根目录：`https://xuanxintest.oss-cn-beijing.aliyuncs.com/zaizai/updates/`
- Windows x64：`windows-x64/latest.yml`，安装包和 `.exe.blockmap` 与清单位于同一目录。
- macOS arm64：`mac-arm64/latest-mac.yml`，ZIP、DMG 及打包生成的配套文件与清单位于同一目录。
- 上传目标：Bucket `xuanxintest`，地域 `cn-beijing`，前缀 `zaizai/updates/`。

更新对象需要允许匿名读取。本机已通过现有 `ossutil v1.7.19` 配置读取该前缀；临时对象的匿名 HTTPS HEAD、完整 GET、Range 分段 GET、缓存和 SHA-512 元信息验证通过，测试对象已清理。没有更改 Bucket 的权限设置。

OSS 上传凭据只由发布机器上的 `ossutil` 使用，不进入应用、仓库配置或安装包。当前地址无需额外配置 CORS：更新请求由 Electron 主进程发起。

## 用户体验

支持更新的安装版在启动 15 秒后检查，此后每 4 小时检查一次。发现新版后自动后台下载，任务清单的设置齿轮亮起红点。设置里显示下载进度，校验通过后出现「重启更新」。隐藏时会尝试发送系统通知，点击通知可打开设置。

设置中的“软件更新”显示当前版本、更新内容、检查结果和下载进度，可手动重试。更新状态通过独立 IPC 同步，不会因每次下载进度而重新查询任务清单。普通退出不会自动安装，只有用户点击“重启更新”才调用安装器；设置里的下班时间草稿会先保存，保存失败则不重启。

Windows 从应用内重启更新时会静默覆盖原安装并重新启动应用。双击安装包仍会打开安装向导。

升级后首次打开时会显示「本版本新功能」。点击「知道了」会记住已查看的版本，之后可以在设置中回看。仅桌宠模式会临时展开清单显示说明，确认后收回。说明随安装包提供，离线也可查看。

检查、下载或校验失败后继续运行当前版本，设置中可重试。应用仍使用原有 appId 与数据目录，任务和偏好不随程序文件替换；数据库继续沿用既有的迁移前备份与事务迁移。

开发模式和 `pack:mac` 本机测试包没有更新配置，不向 OSS 发请求。`pack:win` 已默认生成包含更新配置的 Windows 包，与 `pack:update:win` 等效。

## Windows 发布

1. 递增 `package.json` 的 `version`，并同步锁文件。每个正式版本只构建和发布一次，已发布安装包不以相同版本重新覆盖。
2. 更新 `docs/releases/latest.md`。这些更新内容会同时写入下载清单和安装包，供升级前查看和升级后回看。
3. 构建和核对上传计划：

```sh
npm run pack:update:win
npm run publish:update:win -- --dry-run
```

产物位于 `release/updates/windows-x64/`：当前版本的 EXE、EXE.blockmap 和 `latest.yml`。`win-unpacked/`、构建记录及源码不上传。安装包内部的 `resources/app-update.yml` 已写入 OSS 的 Windows 更新地址。

4. 完成安装包验收后，执行下面的命令实际发布：

```sh
npm run publish:update:win
```

发布脚本先检查清单版本、安装包大小和 SHA-512，再上传本版本引用的安装包与辅助文件。上传后通过匿名 HEAD 验证公网大小和 SHA-512 元信息，最后上传 `latest.yml` 并核对内容。已有同名文件只有校验和大小都一致才跳过；不同内容会拒绝覆盖，要求更换版本。中途失败不删除已上传的版本文件，可修复原因后重试。

安装包使用长缓存 `public,max-age=31536000,immutable`，固定地址清单使用 `no-cache,no-store,must-revalidate`。以后接 CDN 时，清单地址也要遵守该缓存策略。

当前 Windows 包没有配置代码签名，仍是测试构建，需 Windows 真机完成安装和跨版本更新验收；发布脚本不会绕过更新器的默认签名校验。若本机配置了 Windows 签名证书，electron-builder 会按现有签名机制处理。

## macOS 发布条件

客户端路径已接通，但当前本机 ad-hoc 签名测试包没有启用发布更新。`pack:update:mac` 在打包前检查正式签名和公证条件，缺失时直接退出，原有 `pack:mac` 仍可生成本机测试包。

在发布机器的本地环境配置 `CSC_NAME`，值为完整的 `Developer ID Application: ...` 证书名；证书需在本机钥匙串中可用，或通过 electron-builder 支持的 `CSC_LINK` / `CSC_KEY_PASSWORD` 配置。公证使用以下任一组本地环境变量：

- `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`。
- `APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`。

具备这些条件后执行 `npm run pack:update:mac`，会生成开启 Hardened Runtime、签名和公证的 DMG + ZIP。核验后使用 `npm run publish:update:mac -- --dry-run` 查看计划，`npm run publish:update:mac` 发布。证书、密码和私钥不写入项目或聊天。

## 版本保留与首次切换

此前已分发的旧版没有自动更新代码，需要手动安装一次支持更新的新版，后续才能自动升级。安装包版本与文档里的功能里程碑版本分别管理，以 `package.json` 为准。

无需永久保存全部历史安装包。初期可保留最近三个稳定版和对应辅助文件，再按实际使用情况清理；当前清单引用的文件和仍有下载中的文件不能删除。保留旧 `.blockmap` 有利于差分下载，删除前需要验证全量下载兜底。新版仍须包含从受支持旧版本升级的数据迁移，不能仅通过把清单改回旧版来回滚数据库。

## 验证范围

2026-11-04：类型检查、生产构建、57/57 项测试、真实 Electron 更新链路与设置回归均通过；Windows NSIS 打包、包内更新地址与依赖、安装包 SHA-512 及上传计划检查通过。[验证记录](auto-update-evidence/checks.json)、[更新提示截图](auto-update-evidence/update-ready.png)、[设置截图](auto-update-evidence/settings-ready.png)。

自动化用例覆盖定时检查、并发去重、明确安装、网络失败与重试、停止后的迟到事件和安装失败恢复。上传计划用例覆盖版本错误、文件损坏、缺失辅助文件与越界路径。

`npm run smoke:updates` 使用隔离的数据和缓存目录、仅监听本机的更新服务，运行真实 Electron、IPC、界面及 `electron-updater` 的清单查询和 SHA-512 下载校验；仅 OS 安装器被替换为记录调用，测试不会安装伪造更新或触碰正式 OSS 清单。截图与结果写入 `.cache/update-runs/`。

本轮没有上传正式安装包或 `latest*.yml`，也没有发布新版本。Windows 真机升级、macOS 正式签名后的系统安装和不同用户网络仍需实际验收；本机链路验证不能替代这些结果。

参考：[electron-builder 自动更新](https://www.electron.build/v26/docs/features/auto-update/)、[发布配置](https://www.electron.build/v26/docs/publish/)、[OSS 文件元信息](https://help.aliyun.com/zh/oss/user-guide/manage-object-metadata)。

本次提交整理验证：生产构建、57 项规则/产物校验测试，以及真实 Electron + electron-updater 本地更新链路通过；OS 安装器仅记录调用，未安装伪造更新。开发版更新禁用状态与任务正常操作也已核对。
