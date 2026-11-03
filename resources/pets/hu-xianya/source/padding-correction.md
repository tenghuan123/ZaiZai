# 胡娴雅 · 欢呼留白修订

模式：内置 image_gen；编辑目标为第一版欢呼原图，第二张输入为用户角色参考图。

```text
Use case: precise-object-edit.
Input image1 is the finished 24-frame transparent Hu Xianya jump animation sheet, an EDIT TARGET. Input image2 is the original character identity reference.
Correct the sprite cell padding problem ONLY. Keep the exact same 24 poses, same character, face, expressions, high curly ponytail, white ruffle blouse, apricot long skirt, white sneakers, same jump motion, frame order, camera and illustration style.
Output one transparent RGBA PNG 1536x1024 with EXACTLY SIX COLUMNS and FOUR ROWS, equal256x256 cells. Scale EACH existing full-body figure uniformly to 85% of its current size, centered around cell x128 and standing soles baseline y242. Apply the SAME 85% reduction to EVERY cell, not independent scales. The jump displacement must remain proportionate and airborne feet must stay above the standing baseline.
Mandatory safety: EVERY hair strand and EVERY raised hand fully inside each cell. A minimum20px EMPTY TRANSPARENT margin above the highest hair/hand in ALL24 cells, including cells11 and12 at jump apex. No cropping at any cell edge.
The target currently clips top of ponytail at apex. This is a framing correction, not an action or outfit redesign. Keep all24 complete drawings; no scenery, no matte, no shadow or grid/text. Fully transparent alpha0 outside each figure, no background.
```
