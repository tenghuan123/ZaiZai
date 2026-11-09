# 香香猫 · 室内设计师

按用户提供的角色设定图，用内置 `image_gen` 新增的桌面角色资源包。保留深棕高马尾卷发、金色小圈耳环、白色荷叶边衬衫、米杏长裙与小白鞋。

## 预览

直接打开 `preview.html`，无需联网或启动服务。图片、缩略图和动作配置均已嵌入此文件，单独复制该 HTML 或在内嵌预览中打开，也无需旁边的资源文件。可切换七组动作、浅色 / 深色 / 透明网格背景，支持慢放、暂停、逐帧和重播。预览默认循环，取消“循环预览”后遵循 manifest 中每个动作的单次 / 循环设置。

`preview.png` 为动作总览，`previews/react-loop.png` 为循环挥手 APNG。`animations/*.png` 是透明 APNG，并非静态缩略图。

## 文件与规格

| 路径 | 内容 |
| --- | --- |
| `manifest.json` | 与当前项目资源包相同结构的动作配置与台词 |
| 根目录 `<动作>.png` | 8 列精灵图，每帧 320 × 320；显示尺寸建议 160 × 160 |
| `keyframes/<动作>/00.png` 至 `23.png` | 每组 24 张独立绘制帧，透明 PNG |
| `animations/<动作>.png` | 与精灵图逐帧一致的 APNG；帧时长精确为 1/24 秒 |
| `source/sheets/` | 内置 image_gen 输出的原始 6 × 4 图集，1536 × 1024 |
| `source/reference.png` | 用户提供的角色设定参考，署名已换成昵称 |
| `source/prompts.md`、`padding-correction.md` | 七组生成提示词与欢呼留白修订词 |
| `source/timelines.json` | 绘制帧到播放帧的曝光编排 |
| `source/generation.json` | 生成来源与处理记录 |
| `source/validation.json` | 透明度、裁边、图集 / APNG 一致性与精确帧时长检查 |
| `source/preview-validation.json` | 离线浏览器交互验证记录 |

| 动作 | 标识 | 绘制帧 | 播放帧 | 时长 | 默认播放 |
| --- | --- | --- | --- | --- | --- |
| 待机眨眼 | `idle` | 24 | 96 | 4 秒 | 循环 |
| 挥手回应 | `react` | 24 | 56 | 2.33 秒 | 单次 |
| 鼓掌庆祝 | `celebrate` | 24 | 56 | 2.33 秒 | 单次 |
| 跳跃欢呼 | `all_done` | 24 | 64 | 2.67 秒 | 单次 |
| 摇铃提醒 | `remind` | 24 | 72 | 3 秒 | 循环 |
| 喝水提醒 | `drink_water` | 24 | 96 | 4 秒 | 循环 |
| 头顶伸展 | `stretch` | 24 | 96 | 4 秒 | 循环 |

24 FPS 指播放节奏；每组有 24 张独立绘制帧，通过曝光编排形成自然停顿和短眨眼。原始透明通道保留，打包时仅清除 alpha ≤ 4/255 的残留，并做统一缩放、脚底对齐和固定网格切片。欢呼先用 image_gen 修正跳跃顶点的留白，再导出。

本包已接入 zaizai 的内置角色列表。打开顶栏 `🐾` →「桌宠角色」→「香香猫 · 室内设计师」即可使用，选择会保存，重启后恢复；草莓兔女孩继续保留。角色点击、任务完成、全部完成及到点提醒均使用本包对应动作，回应与完成台词使用本包配置。应用仅打包七张精灵图和 manifest，不依赖本预览页。

## 重建与检查

在项目根目录运行（macOS，使用系统 Swift / CoreGraphics / ImageIO；校验使用 Pillow）：

```sh
swift resources/pets/xiang-xiang-mao/source/build-pack.swift
python3 resources/pets/xiang-xiang-mao/source/validate-pack.py
node resources/pets/xiang-xiang-mao/source/build-preview.mjs
node resources/pets/xiang-xiang-mao/source/validate-preview.mjs
```

预览交互检查使用项目中的 Playwright 与本机 Google Chrome，将 HTML 直接嵌入无本地文件基准路径的页面，验证七张缩略图与七组角色画面可见、无外部资源请求，以及逐帧、背景 / 倍速切换、单次播放结束、异步切换和 390px 窄屏检查。

生成式绘制的发丝、荷叶边和局部五官仍有少量帧间变化。
