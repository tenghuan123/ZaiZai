# 草莓兔 Live2D · Windows 交接

接手目标是在 Cubism Editor 里继续打磨双肘，让新导出的模型本身也能自然弯肘。当前可编辑工程已有独立的肩、肘、腕绑定。网页在此基础上通过 TypeScript 混合肘缝两侧的渲染顶点，并调整了挥手节奏。直接在 Cubism 或其他播放器里打开当前模型时，看到的是已有的关节绑定。可在网页里用相同姿态的前后对照作为修模参考。

这是独立的浏览器 demo。ZaiZai 的 Electron 桌宠仍使用自己的精灵图播放链路。

## 在 Windows 上跑起来

在已有仓库的 PowerShell 中执行。建议使用 demo 的 `.nvmrc` 所列 Node.js 24.16.0。

```powershell
git fetch origin
git switch --track origin/codex/live2d-windows-handoff
Set-Location demos/strawberry-live2d
node --version
npm.cmd ci
npm.cmd run dev
```

打开 <http://127.0.0.1:5187/>。默认进入 Live2D 模式，确认角色加载完成，再试“挥手招呼”“轻抬手”、段子播放和暂停。展开“亲手调一调表情”可单独调肩、肘、腕。“对照原图”可用来核对中性姿势。浏览器需要 WebGL。仓库已带模型、纹理、配音和运行所需的 Cubism Core，浏览器预览无需安装 Cubism Editor 或另行下载完整 SDK。

## 要打开的文件

| 入口 | 用途 |
| --- | --- |
| [双臂关节工程 `.cmo3`](assets/articulated-arms/strawberry-bunny-articulated.cmo3) | 用 Cubism Editor 打开。交接使用此前已保存并导出验证的工程版本。 |
| [增量手臂 PSD](assets/articulated-arms/strawberry-arm-joints.psd) · [完整 24 层 PSD](assets/articulated-arms/strawberry-bunny.psd) | 需要补素材时使用。现有工程已经包含这些部件及其绑定，可直接从工程继续。 |
| [网页导出目录](public/model-articulated/) | 网页实际加载的 MOC3、model3.json、cdi3.json 和图集。 |
| [网页柔化](src/arm-skinning.ts) · [渲染接入](src/viewer.ts) · [动作时间线](src/gestures.ts) | 当前肘部参考效果及五个动作。配音与口型由 [场景配置](src/scenes.ts) 和 [播放逻辑](src/player.ts) 驱动。 |
| [肘部特写对照](evidence/elbow-refinement/elbow-detail-comparison.png) · [双臂姿势对照](evidence/elbow-refinement/both-comparison.png) · [验收记录](evidence/elbow-refinement/result.json) | 复现同一姿态下柔化前后的差别。 |
| [模型结构与历史验收](README.md) · [编辑器记录](evidence/articulated-arms/editor-progress.json) | 参数范围、变形器层级、纹理流程及已有导出的验证结果。 |

旧版 16 层工程在 `assets/motion-ready/`，对应的旧网页导出在 `public/model/`。本次从双臂关节工程继续。

## 在 Cubism Editor 里继续

1. 在 Windows 安装 Cubism Editor 5.3.04，与原工程保存版本一致。打开上面的双臂关节 CMO3 后先另存副本。原工程在试用模式下保存，先确认 Windows 端可以打开、编辑、保存并导出副本。[官方 Windows 下载](https://www.live2d.com/en/cubism/download/editor/)
2. 先看单侧肘缝。在角色自身的左右两侧分别检查肩、肘、腕参数，尤其是肘从 `0` 到 `0.25`、`0.5`、`0.75`、`1` 的过渡。以网页对照为参考，在编辑器内试做肘附近的局部网格关键形，再确认双臂同时弯曲时的效果。沿用现有的参数 ID 和 `BodyZ → ArmRotation → Elbow → Wrist` 层级。角色自身的 L 在画面右侧。
3. 对同一组姿态检查肘缝是否露底、补片是否遮错、轮廓是否折角以及手腕是否仍独立。确认肩单独抬起、中性姿态和挥手收回时，脸、衣服和静止轮廓保持原有观感。
4. 先导出到临时目录，沿用 SDK 4.2 兼容目标、包含隐藏 ArtMesh 和原尺寸图集。核对贴图和参数后成套替换网页模型文件。同步保存 [原始导出图集](assets/articulated-arms/texture_00.export.png)。在 Playwright 的 `browser_run_code` 中运行 [Core 检查脚本](evidence/articulated-arms/inspect-export.playwright.js)，将返回的 `geometry` 和新 MOC3 的 SHA-256 写入 [几何记录](assets/articulated-arms/runtime-geometry.json)。PowerShell 可用 `Get-FileHash -Algorithm SHA256` 取得哈希，写入时转成小写。需要重新扩边时从 demo 目录执行 `node scripts/pad-runtime-texture.mjs --articulated`，脚本会校验哈希，也会检查中性网格与 UV 的映射。[官方 MOC3 导出说明](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)
5. 用 Core 原始顶点单独验收新导出。检查网页时先在副本中停用 `viewer.ts` 里安装的顶点 getter，避免网页柔化掩盖模型结果。现有 `ArmSkinning` 假设上臂和前臂由刚性旋转驱动。若肘部改为模型内变形，确认原生效果达到要求后，再移除网页补偿并相应调整测试。保留已验证的动作节奏。

## 验证命令

在 demo 目录运行。文件预检会刷新 `evidence/model-preflight.json`，浏览器复测会更新对应截图和结果记录。

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run check:model
```

复测当前网页柔化时，保持开发服务运行，在另一个 PowerShell 窗口进入同一 demo 目录。

```powershell
npm.cmd install --no-save --package-lock=false playwright@1.64.1
npx.cmd playwright install chromium
node evidence/elbow-refinement/acceptance.mjs
```

当前网页基线已有 17 项单元测试和 90 组 Core 关节组合验证。浏览器复测覆盖挥手和轻抬手的暂停冻结与回位，以及中性姿态的像素对照。Windows 上打开和保存 CMO3、导出，以及肘部柔化写入可编辑模型，都是接手后的验证项。

素材生成入口见 [demo README](README.md)。常规预览直接用仓库中的 WAV。重录脚本 `prepare:audio` 依赖 macOS 的 `say` 和 `afconvert`。
