# 臭臭汪 · 前端工程师

根据用户提供的角色设定图，使用内置 `image_gen` 生成的桌面角色资源包。保留深棕凌乱短发、黑色长大衣、米色罗纹高领毛衣、深灰休闲长裤与浅色运动鞋。

## 1.0.2 摇铃画风统一

以原始摇铃人物为底图，把 image_gen 修好的手与铃铛作为局部素材合回原图；局部区域之外的像素直接保留，恢复与其余动作一致的脸型、五官、发丝、服装和线条质感。铃口保持朝下，沿小幅摆动姿态播放，跳过幅度过大的候选帧与额外闭眼帧，继续使用 3 秒 / 24 FPS。提示词见 `source/remind-style-prompt.md`，组装配置和检查见 `source/remind-assembly.json`、`source/remind-style-validation.json`。

## 1.0.1 摇铃修订

修正摇铃过程中铃铛翻转成朝上杯状、手腕角度突变的问题：铃口持续朝下，手握同一铃柄，通过小幅倾斜和中间姿态往返完成两次轻摇，再平稳放下。保持 3 秒 / 24 FPS，眨眼使用短曝光。修订提示词见 `source/remind-revision-prompt.md` 与 `source/remind-smoothing-prompt.md`；原图保留在 `source/history/remind-v1.png`。预览默认打开摇铃动作。

## 预览

打开 `preview.html` 即可离线播放七组动作。图像、缩略图和配置均已嵌入 HTML，可单独复制使用。支持动作切换、浅色 / 深色 / 透明网格、慢放、暂停、重播及逐帧查看；取消“循环预览”后遵循 manifest 的播放设置。

`preview.png` 为动作总览。`previews/react-loop.png` 是循环挥手 APNG。`animations/*.png` 均为透明 APNG，支持动画的查看器才能播放。

## 文件与规格

| 路径 | 内容 |
| --- | --- |
| `manifest.json` | 与现有项目资源包相同结构的动作配置与台词 |
| 根目录 `<动作>.png` | 8 列精灵图，每帧 320 × 320；建议显示为 160 × 160 |
| `keyframes/<动作>/00.png` 至 `23.png` | 每组 24 张候选绘制帧，透明 PNG |
| `animations/<动作>.png` | 与精灵图一致的 APNG，帧时长精确为 1/24 秒 |
| `source/sheets/` | image_gen 生成的原始 6 × 4 图集，1536 × 1024 |
| `source/reference.png` | 用户提供的设定参考图，署名已换成昵称 |
| `source/prompts.md`、`generation.json` | 完整生成提示词与制作记录 |
| `source/timelines.json` | 绘制帧到播放帧的曝光编排 |
| `source/validation.json` | 透明度、边界、编码一致性与 APNG 配时检查结果 |
| `source/preview-validation.json` | 离线播放器的交互检查结果 |

| 动作 | 标识 | 候选绘制帧 | 播放帧 | 时长 | 默认播放 |
| --- | --- | --- | --- | --- | --- |
| 待机眨眼 | `idle` | 24 | 96 | 4 秒 | 循环 |
| 挥手回应 | `react` | 24 | 56 | 2.33 秒 | 单次 |
| 鼓掌庆祝 | `celebrate` | 24 | 56 | 2.33 秒 | 单次 |
| 跳跃欢呼 | `all_done` | 24 | 64 | 2.67 秒 | 单次 |
| 摇铃提醒 | `remind` | 24 | 72 | 3 秒 | 循环 |
| 喝水提醒 | `drink_water` | 24 | 96 | 4 秒 | 循环 |
| 头顶伸展 | `stretch` | 24 | 96 | 4 秒 | 循环 |

24 FPS 是播放节奏，每组通过 24 张候选绘制帧的曝光编排形成自然停顿和短眨眼。保留生成的透明通道，打包时清除 alpha ≤ 4/255 的残留，统一缩放、脚底对齐并按固定网格导出。跳跃中段保留离地高度。

本包 v1.0.2 已接入应用内置角色列表。启动最新构建后，打开顶栏 `🐾` →「桌宠角色」→「臭臭汪 · 前端工程师」即可切换，选择通过现有设置流程保存并在重启后恢复。七组动作及台词由 manifest 提供，摇铃使用已确认的画风统一版。应用构建仅引用七张根目录精灵图与 manifest；预览、APNG、历史版本和生成资料不进入应用包。

## 重建与检查

在项目根目录运行（macOS，系统 Swift / CoreGraphics / ImageIO；只读图像检查使用 Pillow，预览检查使用项目 Playwright 与本机 Chrome）：

```sh
swift resources/pets/chou-chou-wang/source/compose-remind.swift
swift resources/pets/chou-chou-wang/source/build-pack.swift
python3 resources/pets/chou-chou-wang/source/validate-pack.py
node resources/pets/chou-chou-wang/source/build-preview.mjs
node resources/pets/chou-chou-wang/source/validate-preview.mjs
```

预览检查从没有本地文件基准路径的嵌入页面载入 HTML，检查七张缩略图、七组画面、逐帧、背景与倍速、单次播放结束、异步切换及窄屏布局。

生成式逐帧绘制的发丝、纽扣、手指及局部五官仍可能存在轻微帧间变化。完整生成提示词保存在 `source/prompts.md`。
