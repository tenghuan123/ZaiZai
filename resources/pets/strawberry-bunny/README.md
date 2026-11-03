# 草莓兔女孩桌宠素材包

依据用户提供的角色设定图，用内置 image_gen 生成。保留棕色长卷发、细辫与粉色蝴蝶结、兔子草莓蕾丝头饰、奶油白蕾丝裙及草莓鞋。

## 文件与规格

- 7 张 RGBA 透明底精灵图，每张 2048 × 1024；4 列 × 2 行，每帧 512 × 512，按从左到右、从上到下播放。
- frames/<动作>/00.png 至 07.png：56 张独立透明 PNG，便于自定义播放器。
- animations/<动作>.png：7 个可直接播放的 APNG，512 × 512，保留透明通道；循环次数遵循 manifest。
- preview.png：128 × 128 缩略图。
- preview.html：离线动画预览；直接用浏览器打开，支持播放暂停、速度与背景切换。
- manifest.json：参照 docs/prototype-design.md 的资源包约定，给出帧率、循环和显示参数。锚点为接入初值，尚未经应用布局验收。
- source/reference.png：用户提供的原始设定图。source/prompts.md 与 generation.json 保存完整提示词和制作记录。

| 动作 | 文件 | 帧率 | 应用播放规则 |
| --- | --- | ---: | --- |
| 待机眨眼 | idle.png | 6 | 循环 |
| 挥手回应 | react.png | 8 | 单次，结束后回待机 |
| 鼓掌庆祝 | celebrate.png | 8 | 单次，结束后回待机 |
| 全部完成 | all_done.png | 5 | 单次，结束后回待机 |
| 摇铃提醒 | remind.png | 6 | 循环 |
| 喝水提醒 | drink_water.png | 8 | 循环 |
| 起身拉伸 | stretch.png | 8 | 循环 |

drink_water 与 stretch 为场景扩展动作，需要由后续播放器按任务场景选择；五个标准状态为 idle、react、celebrate、all_done、remind。预览页会反复展示所有动作，应用应遵循 manifest 的 loop 字段。

## 制作与使用说明

本次交付为素材资源，不包含应用播放器接入。原始输出为 1774 × 887，已用 macOS sips 等比标准化为 2048 × 1024 ；使用 CoreGraphics 按固定网格切帧、ImageIO 编码 APNG，保留透明通道。

这是生成式八帧动作稿；发丝、蕾丝与道具细节在帧间有轻微变化，适合先确认桌面尺寸下的角色观感，不能等同于手工逐帧精修。

参考图由用户提供；此制作记录不对参考图的原创性或商业使用权作额外声明。
