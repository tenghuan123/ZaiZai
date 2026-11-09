# 摇铃动作修订 · 1.0.1

使用内置 image_gen，图 1 为原摇铃图集（编辑目标），图 2 为同角色待机图集（造型参考）。保持透明背景，修复铃铛翻转、握持变化和手腕突变。

第一轮修正铃铛方向，第二轮细化中间角度。最终曝光编排沿中间姿态往返两次，回落后短暂停顿，保持原有 72 个播放帧和 24 FPS。原始绘制帧完整保留在 source/sheets 和 keyframes 中。

```text
Use case: precise-object-edit.
Asset type: transparent 2D animation sprite sheet repair, same adult chibi programmer.
Input image 1 is the EDIT TARGET: the existing 24-frame bell reminder sheet. Input image 2 is the CHARACTER IDENTITY reference (idle sheet). Repair ONLY the bell-holding right hand/forearm and the bell's coherent motion in image 1. Preserve the same male character identity, exact head/face/hair, black long overcoat, beige turtleneck, charcoal trousers, cream sneakers, body angle, drawing style, body scale, leg/foot positions and 6 by 4 grid registration from image 1. Preserve transparency.
Defect to repair: the old bell flips upside-down into a goblet-like object and its grip/size changes suddenly during the swing. Replace this with a believable, smooth SMALL-WRIST-MOTION handbell animation, NOT flipping or spinning.
Geometry: ONE small rigid brass/gold classic handbell with a brown wooden handle on TOP and flared bell mouth hanging BELOW the fist in EVERY frame. Fingers wrap the SAME handle throughout; knuckles/thumb grip remains coherent. The grip point is the pivot. The metal bell body, rim and handle form ONE RIGID OBJECT, same proportions, same size and connected throughout, with NO independent bell-body bending, no stretching or melting. Bell always stays upright hanging downward within only +/- 12 degrees of vertical; the bell opening NEVER faces upward and NEVER passes above the gripping hand.
Movement: relaxed shoulder, elbow slightly bent and near torso, hand raises smoothly from hip to lower chest, a short attentive pause, TWO small gentle wrist-led bell shakes with drawn in-between angles and easing at endpoints, then settles and lowers smoothly to the exact starting pose. No broad arm sweeps, no elbow snaps, no left/right hand swapping. Same right hand on VIEWER'S LEFT holds the handle in every frame. The empty left hand may keep its existing subtle palm-up invitation. Maintain the existing friendly facial progression and short blink.
24 frames row-major:
1-3: same low neutral starting pose, bell hanging upright below gripping hand at hip, tiny breathing only.
4-7: gradually lift forearm to lower chest; bell remains hanging DOWN below handle, with only slight natural following tilt.
8-11: first SMALL wrist oscillation: neutral, +10 degree outward tilt, neutral, -10 degree inward tilt. Draw the forearm and bell consistently about the same fixed grip pivot, no large translation.
12-15: second SMALL wrist oscillation: neutral, +8 degree outward tilt, neutral, -8 degree inward tilt, diminishing amplitude. Bell opening remains directed down throughout.
16-18: upright bell settles completely at lower chest, relaxed friendly expression, natural short bilateral blink and left hand gentle invitation.
19-22: smoothly lower forearm and upright bell toward hip, left hand relaxes.
23-24: match starting pose and vertical bell angle so looping has no jump.
OUTPUT: genuine transparent RGBA PNG exactly 1536 x 1024 pixels, exactly SIX COLUMNS x FOUR ROWS of equal 256 x 256 cells; exactly one complete full-body man in EVERY cell, all 24 cells including bottom-right drawn. Same source body size and cell registration as edit target: neutral hair top about y17 and shoe soles y245, character around x148 within each cell. Full hair, coat, fingers and shoes contained in their own cell with clear margin. No text, numbers, panel borders, grid lines, action icons, motion lines, sound symbols, shadows, scenery, paper or painted checkerboard. Preserve image 1's precise illustration look and face; change the defective arm/bell motion only.
```
