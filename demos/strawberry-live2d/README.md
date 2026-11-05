# 草莓兔 Live2D 段子演示

独立的本地实验。当前默认加载双臂关节版真实 Cubism 模型，支持五个动作、三段配音段子、原图对照和暂停。根桌宠应用与原角色精灵资源保持原样。

## 当前产物

| 文件 | 用途 |
| --- | --- |
| `assets/articulated-arms/strawberry-bunny-articulated.cmo3` | 在官方 Cubism Editor 5.3.04 中保存的可编辑模型 |
| `assets/articulated-arms/strawberry-arm-joints.psd` | 10 层双臂增量素材；导入现有模型时避免重复脸部和衣服 |
| `assets/articulated-arms/strawberry-bunny.psd` | 完整 24 层素材，只有图层，不包含变形器绑定 |
| `public/model-articulated/` | 当前网页使用的真实 MOC3、model3.json、cdi3.json 和一张 1024 × 1024 纹理 |
| `public/study-articulated/` | Canvas 分层预演；用于素材对照，不能替代真实 Cubism 验收 |
| `assets/motion-ready/`、`public/model/` | 上一版 16 层模型基线，可供回退和对照 |
| `evidence/articulated-arms/` | 本轮 Core 输出、实际浏览器验收、编辑进度和画面对照 |

模型含 33 个参数、24 个绘制部件。网页检查 13 个必需表演参数的实际输出、六个手臂关节的影响范围、四块关节补片和左右眼九种关键形组合；参数存在但没有真实绑定会阻止加载。

当前分支为 `codex/strawberry-live2d-refinement`，基线临时提交为 `5a346c8`。本轮关节细化在此基线上继续，本地工作未推送、未打包发布。

## 保持原图的方法

脸、五官、衣服和手臂沿用原画。两个整臂各拆成上臂、前臂、手掌；左右分别使用自己的像素，没有镜像另一侧手。四块默认隐藏的肘/腕补底只复制原手臂的局部颜色。原始 320 × 320 静止拆层重组的可见像素与 Alpha 差异为 0，Canvas 中性合成最大误差为 0。

闭眼和半闭眼沿用同角色待机帧，嘴型沿用同角色挥手帧并对齐原微笑中心。此前 image_gen 只用于运动时才会露出的后发补底，没有用生成图替换脸部。来源和校验值见 `assets/reference-preserved/`、`assets/motion-ready/manifest.json` 和 `assets/articulated-arms/rig.json`。

零像素差异是素材/Canvas 校验。真实 Cubism 会经过网格、纹理过滤和透明度合成，不能据此声称运行画面逐像素等同原图。原始素材仅 320 方形，高倍放大不会增加细节。

## 关节与参数

双臂层级为 `BodyZ → ArmRotation → Elbow → Wrist`。上臂和肘补片挂在肩级，前臂和腕补片挂在肘级，手掌挂在腕级。补片与新手臂使用绘制顺序 500，置于后发前、对应手臂后；放在 499 会被后发遮住，不能覆盖接缝。

| ID | 范围 / 默认 | 当前绑定 |
| --- | --- | --- |
| `ParamArmL/R` | 0～1 / 0 | 肩从自然垂手至左右各 45° 抬起 |
| `ParamElbowL/R` | 0～1 / 0 | 肘从伸直到左右各 95° 弯曲；补片透明度 0 / 1 / 1 对应 0 / 0.5 / 1 |
| `ParamWristL/R` | -1～1 / 0 | 手腕 -20° / 0° / +20°；补片透明度 1 / 0 / 1 |
| `ParamAngleX` | -30～30 / 0 | 头部小幅横移，未制作侧脸 |
| `ParamAngleZ` | -30～30 / 0 | 头部约 ±5° 倾斜，动作使用参数 ±12 以内 |
| `ParamBodyAngleZ` | -10～10 / 0 | 身体约 ±1.5° 轻摆，脚底尚未锁定 |
| `ParamEyeLOpen/ROpen` | 0～1 / 1 | 独立睁眼、半闭、闭眼三张原绘制帧 |
| `ParamMouthOpenY` | 0～1 / 0 | 随实际音频 RMS 包络开合 |
| `ParamMouthForm` | -1～1 / 0 | 原微笑层缩放至 95%～105% |

眼睛仅输入 0 / 0.5 / 1；不能把半透明叠图当成连续眼睑形变。自动眨眼含 70ms 完全闭合停留，段子闭眼段使用完整闭眼帧。手腕是平面旋转，仍沿用原手型，没有制作翻掌、手指展开或透视变化。

## 五个动作与段子

`src/gestures.ts` 是表演时间线的唯一来源。肩、肘、腕分别阻尼平滑，所有动作含收回过程。

| 动作 | 节奏 |
| --- | --- |
| 轻抬手 | 小幅抬肩，配少量弯肘，停留后收回 |
| 挥手招呼 | 4.6 秒：先抬臂、弯肘到脸旁，摆腕两次，再慢慢放下 |
| 歪头思考 | 小幅横移和歪头，留反应时间 |
| 闭眼偷笑 | 先露笑意，再完整闭眼停留 |
| 困困收尾 | 慢歪头、闭眼休息，再恢复 |

角色下方按钮可无声试演，点击时先让舞台进入视野。短句段子使用轻抬手，避免把整段挥手压缩到一秒多的台词里。段子动作进度和嘴型由实际音频时间驱动，暂停、重播、切换或失败会处理当前时钟与语音。展开“亲手调一调表情”可独立调左肩、左肘和左腕。

当前仍是固定台词和固定动作脚本，未接入大模型。后续 AI 可输出经校验的台词和动作 ID，实时驱动已绑定参数；新增侧脸、翻掌、手指等结构仍需补素材和模型关键形。

## 完整工作流与易错点

1. 从原图精确拆层，准备被遮挡区域与关节补底，先验证中性重组。
2. 另存 CMO3 副本；将增量手臂 PSD 添加为新 ArtMesh，删除副本内旧整臂。保留脸、眼睛、嘴和身体的既有绑定。
3. 在中性姿态创建肩/肘/腕旋转变形器，再逐项绑定端点与补片透明度。检查父子关系、双臂独立性、极限姿势和收回。
4. 在纹理编辑器中双击未排版的新增分层，使其进入图集，再自动排版。只点自动排版不会加入这些未放置图像。100% 比率、禁止旋转、余量 6px。
5. 保存 CMO3，导出 SDK 4.2 MOC3，包含隐藏 ArtMesh。当前渲染器不支持 Cubism 5.3 的离屏/混合新特性。
6. 备份官方导出的原图集至 `assets/articulated-arms/texture_00.export.png`；从同一份 MOC3 读取中性网格/UV，更新 `runtime-geometry.json` 和 MOC SHA-256。
7. 执行关节版纹理扩边，再检查实际浏览器。扩边只延伸每个原部件自己的边缘颜色，限制在原画轮廓内。脚本会拒绝几何与 MOC 哈希不匹配的输入。

官方 Core 来自用户下载并接受协议的 `CubismSdkForWeb-5-r.5`，原始许可保留在 `public/vendor/`，来源见 `evidence/sdk-source.json`。Core 6 的绘制顺序在加载处局部适配；不修改 SDK 文件。图片生成工具产出 PNG，不能直接产出 MOC3。

官方编辑器当前使用试用模式。保存本轮试用状态不等于验证所有后续模型都符合 FREE 模式的参数和部件限制；后续选择授权版本时需按当时官方限制核对。

## 本地运行与验证

需要 Node.js 24 及以上。在本目录执行：

```sh
nvm use
npm ci
npm run dev
```

打开 <http://127.0.0.1:5187/>。默认进入真实 Live2D 模型。“对照原图”会暂停播放，取消后继续。

```sh
npm run prepare:arms
node scripts/pad-runtime-texture.mjs --articulated
npm test
npm run build
npm run check:model
```

`prepare:arms` 只重建分层素材、预演清单和概念姿态图，不会重建或覆盖 CMO3/MOC3。`rig.json` 和 `pose-candidates.png` 记录素材准备状态；真实绑定证据以 `core-final-export.json` 和 `editor-progress.json` 为准。`npm run prepare:texture` 保留为旧 16 层模型的扩边入口，关节版使用上面的显式参数。

本轮 14 项单元用例、类型检查、构建和模型文件预检通过。实际浏览器验收完成五个动作的起手/停留/回位与暂停冻结、三段段子的完整播放、语音中断、模式切换；无页面错误，见 `evidence/articulated-arms/result.json`。Core 输出含 24 个部件、33 个参数，见 `core-final-export.json`。这些证据验证当前有限动作，不代表任意关节组合、全角度转头或商业模型精修已经完成。

先前 16 层模型、眼部闭合和窄屏可见性证据分别保留于 `evidence/live2d-runtime.json`、`evidence/eye-closure/`、`evidence/gesture-visibility/`。

## 来源

- [官方模型导出说明](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)
- [官方纹理编辑说明](https://docs.live2d.com/zh-CHS/cubism-editor-manual/texture-atlas-edit/)
- [官方 SDK for Web](https://www.live2d.com/en/sdk/download/web/)
- [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)
