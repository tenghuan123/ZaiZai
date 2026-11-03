# 滕俊龙 · 路桥工程师

根据用户提供的角色设定图，使用内置 `image_gen` 制作的桌面角色资源包。保留棕色乱短发、深灰短款连帽外套、米色罗纹高领毛衣、深灰工装裤、浅色运动鞋和棕色双肩背包。

## 1.0.1 待机眨眼节奏

修正待机半闭眼帧停留约 542 毫秒的问题：半闭眼缩为约 42 毫秒，稳定闭眼保持约 83 毫秒，再逐步睁眼；跳过一张脚底轻微跳动的闭眼候选帧。将原来的长停顿移到正常睁眼状态，继续使用 4 秒 / 96 帧 / 24 FPS。原始绘制素材保留，其他六组动作保持不变。旧版待机图集、APNG 与帧序保存在 `source/history/`，检查记录见 `source/idle-timing-validation.json`。网页预览默认展示修订后的待机动作。

## 预览

打开 `preview.html` 即可离线播放七组动作。全部图片、缩略图和配置均嵌入 HTML，可单独复制。支持浅色、深色和透明网格背景，慢放、暂停、重播和逐帧查看；取消“循环预览”后遵循各动作的单次或循环设置。

`preview.png` 是动作总览，`previews/react-loop.png` 是循环挥手 APNG。`animations/*.png` 为透明 APNG，需使用支持动画的查看器播放。

## 文件与规格

| 路径 | 内容 |
| --- | --- |
| `manifest.json` | 沿用现有资源包结构的动作配置与角色台词 |
| 根目录 `<动作>.png` | 8 列精灵图，每帧 320 × 320，建议显示为 160 × 160 |
| `keyframes/<动作>/00.png` 至 `23.png` | 每组 24 张候选绘制帧，透明 PNG |
| `animations/<动作>.png` | 与精灵图一致的 APNG，帧时长为精确的 1/24 秒 |
| `source/sheets/` | image_gen 原始 6 × 4 图集，1536 × 1024 |
| `source/reference.png` | 用户提供的角色参考图 |
| `source/prompts.md`、`generation.json` | 完整提示词、生成来源和处理记录 |
| `source/timelines.json` | 绘制帧到播放帧的曝光编排 |
| `source/validation.json` | 透明度、留白、图集/APNG 一致性与帧时长检查 |
| `source/preview-validation.json` | 离线播放器检查结果 |

| 动作 | 标识 | 候选绘制帧 | 播放帧 | 时长 | 默认播放 |
| --- | --- | --- | --- | --- | --- |
| 待机眨眼 | `idle` | 24 | 96 | 4 秒 | 循环 |
| 挥手回应 | `react` | 24 | 56 | 2.33 秒 | 单次 |
| 鼓掌庆祝 | `celebrate` | 24 | 56 | 2.33 秒 | 单次 |
| 跳跃欢呼 | `all_done` | 24 | 64 | 2.67 秒 | 单次 |
| 摇铃提醒 | `remind` | 24 | 72 | 3 秒 | 循环 |
| 喝水提醒 | `drink_water` | 24 | 96 | 4 秒 | 循环 |
| 头顶伸展 | `stretch` | 24 | 96 | 4 秒 | 循环 |

24 FPS 是播放节奏，动画由候选绘制帧的曝光编排形成自然停顿和短眨眼。保留原始透明通道，导出时清除 alpha ≤ 4/255 的残留，统一缩放并对齐脚底；跳跃中段保留离地高度。生成式逐帧绘制的发丝、手指、背包和局部五官可能存在少量帧间变化。

本次交付为独立角色资源包，应用内角色注册由后续接入处理。

## 重建与检查

在项目根目录运行（macOS 系统 Swift/CoreGraphics/ImageIO；只读图像检查使用 Pillow；播放器检查使用项目 Playwright 与本机 Chrome）：

```sh
swift resources/pets/teng-junlong/source/build-pack.swift
python3 resources/pets/teng-junlong/source/validate-pack.py
node resources/pets/teng-junlong/source/build-preview.mjs
node resources/pets/teng-junlong/source/validate-preview.mjs
```
