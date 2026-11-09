# 摇铃中间帧细化提示词

模式：内置 image_gen；以第一轮修正后的摇铃图集为编辑目标，透明背景。

```text
Use case: precise-object-edit.
Asset type: exact local animation correction on a transparent 24-frame sprite sheet.
The attached image is the EDIT TARGET, a 6 column by 4 row sprite sheet of the same adult chibi male programmer. Its bell now hangs properly, but consecutive middle frames alternate too abruptly between upright and leaning. Correct ONLY the wrist and bell ANGLES during the middle motion to create coherent eased in-betweens. All character artwork, body scale, head/face/hair, clothes, legs/shoes, cell registration and the neutral raising/lowering poses are INVARIANTS.
Preserve image dimensions exactly 1536 x 1024; 24 equal 256 x 256 cells read row-major; one full body man in every cell. True transparent RGBA, no background, no numbers, no grid/border, no symbols, no added shadows.
Preserve frames 1-7 and 18-24 as close to pixel-identical as possible. Change ONLY frames 8-17 (second row columns 2-6 and third row columns 1-5). Keep the elbow/shoulder steady, the hand at lower chest height with a constant grip point, and redraw a gentle smooth small wrist swing about that grip. Each intermediate angle must be VISIBLY drawn, not repeating only two end poses.
Required bell angle storyboard for those cells, measured from downward vertical:
Frame 8: 0 degrees (upright).
Frame 9: +6 degrees.
Frame 10: +12 degrees.
Frame 11: +6 degrees.
Frame 12: 0 degrees.
Frame 13: -6 degrees.
Frame 14: -12 degrees.
Frame 15: -6 degrees.
Frame 16: 0 degrees.
Frame 17: 0 degrees, fully settled.
This forms two soft small strokes, one outward then one inward, with smooth return through neutral; NEVER full rotation. The hand's wrist angle follows the handle continuously without any finger/grip changes.
The bell is ONE RIGID unchanged object: the small dark brown handle is ALWAYS above the flared golden bell, the same right hand on viewer's left ALWAYS wraps the handle, the golden bell mouth ALWAYS points DOWN below the hand, rim/handle/bell stay connected with identical size/proportions in every frame. Rotate the whole handbell consistently with the hand; do not bend it, swap grip, turn it into a cup, invert it, or redraw unrelated prop shapes. Full figure remains within each cell's margins.
Keep the existing friendly face and short natural blink; keep the inviting left-hand gesture and lower-to-hip ending. Same exact warm soft hand-drawn illustration style as input.
```
