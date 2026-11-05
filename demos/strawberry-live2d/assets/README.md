# 素材状态

`motion-ready/` 是当前动作验收候选：原图前景拆层、现有闭眼/张嘴素材，以及 image_gen 只补充的隐藏后发。`motion-ready/strawberry-bunny.psd` 共 16 层。实际网页分层合成在中性状态与原图的误差已测为 0；这个候选还没有导出成 Cubism MOC3。

`reference-preserved/` 是原图拆层基线，来源为现有草莓兔待机第 0 帧。中性状态必须保留原图的每个可见像素与位置；动作验收素材从这里取得原始脸、五官、衣服和肢体，保持原坐标和纹理。

根目录的 `parts-atlas-v1.png`、`layers/`、`strawberry-bunny.psd`、`assembled-preview.*` 是已被用户否定的 AI 重绘拼装候选，保留作问题追溯，**不再作为绑定素材或网页默认预览**。之前的左右与眼距修补不能解决整体角色失真。

重新生成动作验收素材使用 `npm run prepare:motion`，它会先生成原图基线，再导入隐藏后发和原角色表情。只有基线可使用 `npm run prepare:assets`。不要运行旧的 `scripts/prepare-assets.mjs` 来覆盖原图基线。
