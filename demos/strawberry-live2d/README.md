# 草莓兔 Live2D 段子演示

这是独立实验，不替换现有桌宠、不修改任务/提醒数据、不修改四套现有精灵素材。

当前阶段：**真实 Live2D 模型已在浏览器中运行，三段预设段子已完整播放**，支持原图对照、手动表情、暂停和切换。`assets/motion-ready/strawberry-bunny.psd` 共 16 层：脸、五官、衣服和肢体沿用原图；闭眼来自原待机帧，张嘴来自同角色挥手帧，并相对该帧向右 2px、向上 3px 对齐原微笑中心；内置 image_gen 只补运动时才会露出的后发底层，生成图里的脸没有用于合成。原先 Canvas 预演的零合成误差仅对应预演；真实 Cubism 对照另见 `evidence/live2d-reference-comparison.json`，存在网格、过滤和透明度合成差异。

页面默认进入“Live2D 模型”，加载真实 Cubism Core 和 MOC3；“分层动作预演”保留作素材对照。通过官方编辑器建立网格、变形器和关键形，保存 `.cmo3` 并导出 `.moc3`。网页已读取 29 个参数、16 个绘制部件，九个必需表演参数在真实 Core 中均能改变顶点或透明度。

2026-11-04 在用户安装并接受协议的官方 Cubism Editor 5.3.04（试用模式）中完成建模和导出。模型源文件为 `assets/motion-ready/strawberry-bunny.cmo3`，运行文件位于 `public/model/`，导出目标为 SDK 4.2，所有图像打包至一张 1024 × 1024 纹理图。2026-11-05 接入用户下载的 `CubismSdkForWeb-5-r.5`，保留原始 Core 和许可文件，来源与校验值见 `evidence/sdk-source.json`。Core 6 将绘制顺序从 Drawables 移到了 Model，本演示在加载处做局部适配，并拒绝不支持的离屏绘制或异常顺序；没有修改 SDK 文件。浏览器中的参数输出、三段配音、暂停、取消、模式切换及页面关闭检查已通过，见 `evidence/live2d-runtime.json`。

原图精确拆层基线仍位于 `assets/reference-preserved/`，在原始 320 × 320 坐标中保留 32,103 个可见像素与原透明度，默认重组差异为 0；没有独立拉伸或重新设计五官。它是后续补底和动作候选的校验来源。

## 完整走通需要什么

| 阶段 | 输入 / 工具 | 产物与验收 |
| --- | --- | --- |
| 角色外观 | 当前 `resources/pets/strawberry-bunny-v3/keyframes/idle/00.png` | 直接沿用原画；`assets/reference-preserved/source.png` 与原图文件哈希一致。旧 image_gen 图集已废弃，不再用重绘部件重新定义脸型和比例 |
| 拆层和原画修补 | 原图、现有闭眼/张嘴帧、Sharp、ag-psd；内置 image_gen 只补后发底层 | 16 层动作候选位于 `assets/motion-ready/`，中性静止和小幅头/手动作已在网页检查；半闭眼来自 `idle/19`，闭眼来自 `idle/20`，张嘴来自 `react/08`。较大动作和高倍放大仍需继续检查 |
| Cubism 建模 | 官方 Cubism Editor；导入动作候选 PSD，划分 ArtMesh、建立变形器与关键形 | 已保存 `assets/motion-ready/strawberry-bunny.cmo3`；使用原画图层建立真实 Cubism 变形器和关键形 |
| 运行模型导出 | Cubism Editor 的“导出运行时文件 / 导出为moc3文件” | 已生成 `public/model/strawberry-bunny.model3.json`、真实二进制 `.moc3`、纹理图与 `.cdi3.json`；网页运行效果另行验证 |
| 网页运行 | 用户提供的官方 SDK 5-r.5 Core、PixiJS / pixi-live2d-display | 已验证真实 Core 加载草莓兔 MOC3，九个表演参数均改变绘制输出，三段段子可播放 |
| 台词表演 | `src/scenes.ts`、`src/gestures.ts`；macOS 已安装的 Tingting 系统语音；每段音频 RMS 包络 | 六段 WAV 与三份两拍脚本已生成；以音频实际播放时间驱动嘴型和动作进度，短时平滑嘴型开合，语句后停顿保持节奏 |
| AI 决策（后续） | 大模型服务，输出经校验的台词/表情/动作计划 | 本次没有接入大模型。当前演示是固定脚本，不应声称小人已自主生成台词/动作 |

图片生成与模型绑定是两个独立步骤：image_gen 产出 PNG，不能直接产出可由 Cubism Core 加载的 MOC3。只把生成的后发导入原衣服/手臂遮住的区域，生成图的头脸和外轮廓没有覆盖原画。原图内部透明度大多为 253 而不是 255：Canvas 预演在运动时淡入后发底层；Cubism 将补底保留在身体父级下。原图按互斥区域拆层后，GPU 双线性过滤会在眼部和头发切边产生细白缝，因此导出后执行 `npm run prepare:texture`，只向透明切边延伸两像素的部件自身颜色，不替换已有可见纹理像素。使用原画轮廓限制扩边，避免把相邻白衣服带进会单独旋转的头发和手臂。

纹理处理输入为 `assets/motion-ready/texture_00.export.png` 和 `runtime-geometry.json`，保留了官方导出的原图集以及真实 Core 中性网格/UV。处理结果可重复生成。重新导出不同 MOC3 或重新排版图集时，必须同时更新这两份输入；脚本会检查 MOC3 哈希，拒绝沿用旧模型几何。

预演和本次轻量 Cubism 绑定都限制头部倾斜 ±5°、抬手 15°、全身侧倾 ±1.5°（编译模型上限）。实际段子收敛到歪头约 2°、抬手目标不超过 9°、身体侧倾约 0.18°；手动预览限歪头 ±2°、抬手 9°，超出该范围的完整大动作尚未精修。Cubism 的 `ParamAngleX` 是小幅横移，未制作完整侧脸；`ParamMouthForm` 将原微笑层缩放至 95%～105%，未另画新的笑嘴。头部与身体当前使用胸颈附近的旋转支点，身体轻摆会带动脚部，未达到脚底锁定的精修程度。此模型用于验证段子和有限表演动作，尚不代表完整商业模型质量。2026-11-05 修正手臂/头发/衣服的切分归属，重建相关网格并在隐藏后发补底增加 8px 重叠，解决抬手和歪头组合时的白色断边。原始可见脸、衣服、手臂仍沿用原画像素。

旧方案问题记录：让 image_gen 重画整套部件，再对各部件独立非等比拉伸，造成脸型、眼睛、头身比例和笔触偏离。前面的左右眼、手脚与眼距修补没有解决这个根本问题。旧文件仍保留在 `assets/` 根目录及原 `layers/`，只供追溯，**不要用旧的 `assets/strawberry-bunny.psd` 开始建模**。当前素材路径统一使用 `assets/reference-preserved/`。

## 在编辑器中制作这个演示模型

1. 安装官方编辑器，使用 FREE 模式。导入 `assets/motion-ready/strawberry-bunny.psd`，保留原始图层位置与比例。先确认中性状态沿用原图，不能靠重画五官修复装配问题。
2. 参照分层预演检查边界与后发遮挡，再生成网格。后发补底作为遮挡层，而不是替换原前景；原头部与原后发须联动，脚部不能误归到头发组。用主体、头部、左右手变形器组织层级，避免脸与头饰分离。
3. 按下表绑定参数与关键形。开眼/闭眼、三个嘴型层应通过参数控制可见度，默认隐藏图层也必须进入运行模型并有关键形。抬手时检查衣袖与肩膀的覆盖。
4. 保存可编辑的 `assets/motion-ready/strawberry-bunny.cmo3`。在纹理图集中打包图层，保留原角色原始 320 方形画布的比例。图集尺寸根据实际素材占用选择，放大图集本身不会增加原画细节。
5. 选择兼容 Cubism 4.2 的运行模型导出目标，避免本演示使用的旧版 Framework 遇到 5.3 新的混合/离屏特性。导出到 `public/model/`，文件基名为 `strawberry-bunny`，包含所有需要的隐藏 ArtMesh。
6. 从已接受协议的官方 Cubism SDK for Web 中，将 `Core/live2dcubismcore.min.js` 放到 `public/vendor/`，保留对应许可文本及 SDK 来源记录。本项目没有从第三方 CDN 取代官方 Core。
7. 执行 `npm run check:model`，刷新演示页，再执行实际播放与视觉验收。文件检查通过只表示依赖齐全，**不表示画面和动作已经验收**。

### 参数约定

| ID | 范围 / 默认 | 绑定要求 |
| --- | --- | --- |
| `ParamAngleX` | -30～30 / 0 | 当前绑定为头部小幅左右横移，未制作侧脸 |
| `ParamAngleZ` | -30～30 / 0 | 头部倾斜，转轴位于颈部附近 |
| `ParamBodyAngleZ` | -10～10 / 0 | 当前绑定为身体 ±1.5° 轻摆；脚底尚未锁定 |
| `ParamEyeLOpen`、`ParamEyeROpen` | 0～1 / 1 | 左右眼独立开合，0 时闭眼层可见，1 时开眼层可见 |
| `ParamMouthOpenY` | 0～1 / 0 | 嘴巴从闭合到张开，0 时不露开口嘴型；动画由语音包络驱动 |
| `ParamMouthForm` | -1～1 / 0 | 原微笑层 95%～105% 缩放，段子使用 0～1 |
| `ParamArmL`、`ParamArmR` | 0～1 / 0 | 自然垂手到小幅抬手，段子使用幅度不超过 0.6，手动预览上限 0.6 |
| `ParamBreath`（可选） | 0～1 / 0 | 胸肩轻微呼吸 |

播放器检查九个必需参数是否存在，并用真实 Core 比较各参数最小值、最大值时的顶点坐标或透明度；存在但不影响任何绘制部件的参数会阻止载入。另检查左右眼各 0 / 0.5 / 1 的九种组合，防止单独测试通过、同时闭眼却失效的交叉绑定。结果保存在角色 canvas 的 `data-bindings` 和 `data-eye-combinations` 中；端点输出见 `evidence/eye-combinations.json`。参数输出变化仍不代替视觉质量和音画同步验收。

眼睛当前使用原角色的睁眼、半闭、闭合三张绘制帧。中间连续值会让图层半透明叠在瞳孔上，不能作为真正的眼睑形变。网页控制器只向 MOC 输入 0 / 0.5 / 1 三个关键形；自动眨眼包含 70ms 的明确闭合停留，段子使用完全睁眼或闭眼，半闭只作短暂过渡。手动眼部预览也采用这三档。30 / 60 / 120 FPS 的闭合测试、左右眼独立性和真实浏览器逐帧结果见 `tests/eye-motion.test.mjs` 与 `evidence/eye-closure/result.json`。

本演示不要求预先制作 `.motion3.json` 和 `.exp3.json`：脚本直接写入已经绑定的参数。将来需要复用复杂动作时再导出这些文件；它们不能替代 `.moc3`。

## 五个可复用的小动作

`src/gestures.ts` 定义起手、停留、收回的参数时间线，当前真实模型不需要重新导出：

| 动作 | 节奏 | 边界 |
| --- | --- | --- |
| 轻抬手 | 手先起，头跟上，停留后收回 | 肩部旋转，未增加肘部弯曲 |
| 轻招呼 | 两次小幅示意，再放下手 | 沿用原手型，未制作手腕翻转 |
| 歪头思考 | 先轻移再歪头，给反应留白 | 未制作侧脸或点头 |
| 闭眼偷笑 | 先笑再闭眼，停留后睁开 | 使用完整闭眼帧 |
| 困困收尾 | 慢歪头、闭眼休息、恢复 | 限制身体摆动，未制作躺下动作 |

角色下方的“先试一个小动作”可以单独无声播放这五项，支持暂停、重播和切换。三段段子的每拍引用同一动作 ID；进度由当前音频实际时间与句后停顿共同确定，避免慢加载、暂停后动作脱离台词。每个动作最后都回到中性目标，阻尼负责平稳衔接。停止、切换台词、切换预览方式会取消前一个动作的时钟。

这一轮只调整运行时表演，没有操作 Cubism 窗口，没有改 PSD、CMO3、MOC3 或原角色图片。关节网格、手型和连续眼睑等精细绑定仍需进入编辑器处理，不能把参数时间线当作新关节已经制作完成。13 项自动化用例通过；后台浏览器检查了五个动作的起手/中间/停留/回原、暂停冻结、三段台词和双向切换，结果见 `evidence/gesture-library/result.json`，画面对照见同目录 `poses.png`。

2026-11-05 补充点击可见性修复：旧布局在窄窗口里把动作按钮排到角色下方很远，点击时角色已滚出屏幕；参数仍在变化不能证明用户看到了动作。按钮现移到角色正下方，点击及重播动作时会先将舞台滚回视野。起手更快，抬手目标提高到已检查的 0.6 范围，歪头提高到 ±12；未修改原画或模型绑定。窄屏 600 × 800 CSS 像素下五个动作的点击/起手/停留/恢复均保持角色可见，并比较了实际角色画面像素变化，见 `evidence/gesture-visibility/`。原 `gesture-library` 记录为上一轮时序基线。

## 本地运行

需要 Node.js 24 及以上。所有命令在本目录执行：

```sh
nvm use
npm ci
npm run dev
```

打开 <http://127.0.0.1:5187>。默认进入真实“Live2D 模型”，点击“开始表演”播放，或展开“亲手调一调表情”检查局部动作；“对照原图”会暂停表演并显示同位置的原图，取消后继续。可切换到“分层动作预演”作对照。

素材与配音可重新生成，原始 image_gen 输出不会被覆盖：

```sh
npm run prepare:assets
npm run prepare:motion
npm run prepare:audio
npm run prepare:texture
npm test
npm run build
npm run check:model
```

`prepare:assets` 生成原图基线；`prepare:motion` 会先重建该基线，再导入隐藏后发和原角色表情，输出动作候选 PSD、图层与网页预演清单。补底使用内置 image_gen，完整提示保存在 `assets/motion-ready/underpaint-prompt.json`，原始生成图为 `hair-underpaint-generated.png`；它只作为导入源，未整张替换角色。旧 `scripts/prepare-assets.mjs` 只用于追溯废弃的重绘候选，不是默认流程。

`prepare:audio` 使用 macOS 的 `say` / `afconvert` 和已安装的 Tingting 语音，不调用付费 TTS。它只是在本地合成演示固定台词，不代表人物音色已定稿。原画基线记录位于 `assets/reference-preserved/`，当前动作候选的来源与 SHA-256 记录位于 `assets/motion-ready/manifest.json`。

动作过渡使用无回弹的阻尼：头部先进入姿态，身体和手臂稍慢跟随，收手时平稳回到原姿态；暂停时本地动画时钟冻结，恢复不会跳过眨眼。嘴型由音频包络驱动，张嘴与闭嘴分别使用短时平滑，避免逐帧闪烁。30 / 120 FPS 时序一致性、暂停和恢复自然姿态有独立测试。

## 验收范围

- 模型：使用真实 Cubism Core 加载真实 MOC3；眼睛、嘴、头部和手臂的画面随参数变化。
- 台词：三段段子逐句播放，音频和嘴型随实际播放时间同步；停顿后再出现包袱。
- 生命周期：暂停/继续、从头播放、切换段子时取消旧语音；后台隐藏时暂停，回来不跳过包袱；音频失败可重试。
- 独立性：根应用、现有角色资源和真实用户数据库不受影响。本次不提交、不推送、不发布安装包。

自动化播放器用例只验证取消、停顿、失败和重试；构建不验证模型已绑定。本目录 `evidence/` 应分别记录素材、静态构建、文件预检和真实浏览器验收，不能把其中任何一项当作全部完成。

## 来源

- [官方分层素材说明](https://www.live2d.com/en/cubism/download/ps-script/)
- [模型模板与绑定](https://docs.live2d.com/en/cubism-editor-manual/template/)
- [用于运行的模型导出文件](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)
- [官方 SDK for Web](https://www.live2d.com/en/sdk/download/web/)
- [pixi-live2d-display 源码与 API](https://github.com/guansss/pixi-live2d-display)
