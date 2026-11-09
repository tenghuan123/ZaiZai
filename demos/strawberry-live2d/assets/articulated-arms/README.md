# 双臂关节模型与素材

`strawberry-bunny-articulated.cmo3` 已在官方 Cubism Editor 5.3.04 中绑定并保存；对应网页运行模型位于 `public/model-articulated/`。

完整 PSD 共 24 层，增量 `strawberry-arm-joints.psd` 共 10 层。每侧上臂、前臂和手掌来自自己的原画像素，另有默认隐藏的肘/腕补片。中性素材重组可见像素和 Alpha 差异均为 0。

| 角色自身侧别 | 肩 | 肘 | 腕 |
| --- | --- | --- | --- |
| R（画面左侧） | 137,171 | 129,190 | 117,205 |
| L（画面右侧） | 183,171 | 191,190 | 203,205 |

支点以原始 320 方形画布为基准。实际编辑器手工落点会有亚像素差异。层级为 `BodyZ → ArmRotation → Elbow → Wrist`。肩最大 45°，肘最大 95°，腕 ±20°。肘补片挂肩级，腕补片挂肘级；补片默认透明，弯曲时显示，绘制在后发前、对应手臂后。

`rig.json`、`preparation.json` 和 `pose-candidates.png` 是生成脚本的素材准备记录，不是编译模型验收结论。真实产物与验证见 `evidence/articulated-arms/editor-progress.json`、`core-final-export.json`、`result.json`。完整流程、已知范围和再导出要求见 demo 根目录 README。

执行 `npm run prepare:arms` 可重建 PSD、PNG、分层预演清单和概念图；不会改变可编辑模型和已编译模型。对照用的 16 层基线在 `assets/motion-ready/` 和 `public/model/`。
