# zaizai 应用图标

我在这里，也在你身边。

用户选定「贴贴分身」方向：奶白的自己与淡紫色数字分身依偎，淡紫分身佩戴草莓发夹。2026-11-03 使用内置 `image_gen` 制作并按用户反馈修订；完整提示词见 [prompts.json](prompts.json)。

- `approved-preview.png`：用户确认的原始预览，保留展示底色。
- `zaizai-master.png`：透明底版，用于生成应用所需的尺寸与格式。
- `zaizai.png`：1024 × 1024 RGBA 图标。
- `zaizai.icns`：macOS 多尺寸图标，包含 16–1024 px 表示。
- `zaizai.ico`：Windows 图标，包含 16、24、32、48、64、128、256 px 表示；当前仅生成资源，Windows 应用未验收。

在 macOS 运行 `npm run icons:mac` 可从底版重新生成 PNG / ICNS / ICO，使用系统 `sips` 与 `iconutil` 转换尺寸和格式，不重新生成图像。图标在浅色和深色背景的显示见 [验收预览](../../docs/branding-evidence/icon-preview.png)。

`electron-builder.yml` 指向以上正式图标。应用显示名与包名为 `zaizai`；原 bundle ID、通知身份和数据目录继续保留，以承接已有设置与任务。
