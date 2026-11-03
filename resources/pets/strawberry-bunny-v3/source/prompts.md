# V3 完整提示词

使用内置 image_gen 修订自然挥手、五组表情与眨眼；待机沿用 V2。

## idle

### 1

```text
Use case: identity-preserve
Asset type: refined hand-drawn 2D animation sprite sheet for a desktop companion.
Input image 1 is the user's original character design reference. Input image 2 is the old corresponding sprite animation to REPLACE: preserve the exact character identity, pastel illustration style, palette and clothing, but completely improve the motion and timing. Do NOT imitate the old animation's small range or its random blink frames.
Character: same chibi girl with very long wavy chocolate-brown hair and two front braids with pink bows; large brown eyes; ivory lace bonnet with two white bunny ornaments and strawberry/flower trim; pastel barrettes; flower pearl choker and bead bracelet; cream frilly strawberry dress with pink ribbon bows; white ruffled socks and cream strawberry Mary Jane shoes. Fully clothed and wholesome. Keep the SAME face, head size, hair volume, costume details and body proportions in all frames. Soft warm-brown line art, ivory and pastel pink shading, same as references.
OUTPUT: ONE transparent RGBA PNG sprite sheet, 1536 x 1024 pixels, EXACTLY SIX COLUMNS AND FOUR ROWS, 24 equal square cells of 256x256 pixels, reading left-to-right then top-to-bottom. ONE complete full-body girl per cell. This is 24 consecutive in-between animation drawings, NOT 24 independent poses, not a character design board.
Layout: each girl centered on local x=128. Normal standing shoe baseline y=244. Neutral crown top about y=42, leaving room for hands, lean and jump. Keep complete bonnet, hair, hands, dress and shoes INSIDE each cell, minimum 5px safety margin, no crops. Camera, body scale and perspective locked. Except the explicitly requested motion, do not shift the entire character randomly; preserve planted feet when appropriate. Clean transparent alpha; no colored matte, no halo, no floor, no shadows outside the silhouette, no backgrounds, no text, no frame labels, no borders or grid lines.
Animation quality: real drawn intermediate arm/body positions on every moving step. Draw eased acceleration and deceleration, clear anticipation, follow-through of hair and skirt. Adjacent frames must be small progressive changes along ONE motion path. No sudden hand teleportation, no mismatched left/right hands, no ghost trails, no faded double exposure.
Action: calm idle with a separate controlled blink at the very end of the sheet. This sheet will be retimed so the blink happens only about once every four seconds.
Frames 1-18 (first three rows): BOTH EYES FULLY OPEN, same relaxed small closed-mouth smile, no wink, no half-closed sleepy eyes. A tiny continuous breathing cycle, chest gently rising then falling, slight relaxed weight shift and 2px hair-tip motion. Keep face and eye geometry unchanged. Frames 1 and 18 close to same neutral body pose.
Frames 19-24 (last row): keep the ENTIRE body, arms, bonnet, face position, mouth and hair EXACTLY the same as frame 18; change ONLY eyelids in a monotonic blink sequence: 19 eyes 75% open, 20 eyes 25% open, 21 eyes fully closed with relaxed eyelid lines (NOT cheerful upside-down smile eyes), 22 eyes 25% open, 23 eyes 75% open, 24 fully open. Preserve iris position and brows. These six frames must form one smooth quick close-open event with no bobbing head and no smile/mouth change.
```

## react

### 1

```text
Use case: identity-preserve.
Asset type: corrected desktop companion wave animation, transparent 24-frame sprite sheet.
Image 1 is the original character/style reference. Image 2 is the old incorrect wave to replace. Preserve the exact girl, outfit, hair, bonnet, colors and soft 2D line/shading style. The old wave swings the whole straight arm and rocks the torso; correct that anatomical motion.
Output ONE transparent RGBA PNG, exactly 1536x1024, SIX columns by FOUR rows, 24 equal 256x256 cells in reading order. One whole full-body girl per cell, fixed camera, scale, face geometry and planted shoe baseline. Center x128, feet near y244, keep 8px clear margin, no grid/text/background/shadow.
NATURAL WAVE: relaxed shoulder. Upper arm stays close to her side, elbow bent roughly 90 degrees near the ribs, palm beside cheek facing viewer. Wave using a modest forearm arc and a loose wrist with softly separated fingers. Elbow stays nearly still during the greeting. The arm NEVER straightens horizontally, never points straight out, never makes a huge diagonal sweep. Torso and head do NOT rock side to side. Other hand relaxed at skirt. Each step is a genuine small in-between change.
24-frame path:
1-3 relaxed arms down, attentive calm face, small closed-mouth smile.
4-7 smoothly bend elbow and lift hand to beside cheek; eyebrows rise slightly in recognition; smile gradually opens.
8-10 loose wrist waves outward about 15 degrees; elbow remains stationary; gentle welcoming smile.
11-13 wrist waves back inward about 15 degrees, same bent elbow, small relaxed head nod only.
14-18 finish a second small wave with one NATURAL BLINK: frame14 eyes 75% open, frame15 25% open, frame16 fully closed relaxed eyelid lines, frame17 25% open, frame18 75% open. Mouth keeps the same warm smile through this blink. No exaggerated closed happy eyes and no wink.
19-21 eyes fully open again, wrist relaxes and the hand lowers continuously toward waist, smile softens.
22-24 settle arms down with a contented small closed-mouth smile, body matches opening pose.
Facial expression MUST evolve calmly from attentive to warm greeting to relaxed contentment. Do NOT repeat a wide open mouth for all 24 cells. During blink change eyelids smoothly; keep eyes, brows, nose and mouth in stable positions. Character identity, head size, body proportions and clothes consistent in all 24 frames. Clean genuine alpha background.
```

## celebrate

### 1

```text
Use case: precise-object-edit.
Asset type: facial acting correction of an existing 24-frame desktop companion sprite sheet.
Image 1 is the user's character design reference. Image 2 is the EDIT TARGET, a 6-column by 4-row animation sheet of the same girl.
Preserve the target's exact 24 body poses, motion order, hand and prop positions, framing, head geometry, bonnet, braids, dress, socks, shoes, palette and soft 2D illustration style. Change ONLY facial acting: eyes, lids, eyebrows, mouth and subtle cheek blush. Do not redesign the body or swap poses.
The defect in the target is that every face has the SAME wide-open eyes and the SAME open mouth. Correct that: the expression must evolve naturally with the physical action and must include one complete blink with partial closing and reopening drawings.
OUTPUT one genuinely transparent RGBA PNG 1536x1024 pixels, exactly SIX columns by FOUR rows, 24 square 256x256 cells in reading order. Keep the existing layout, one complete girl per cell, stable scale, soles and head positions, 6px safe padding. No background, no matte, no checkerboard graphic, no grid/text/numbers, no extra props or extra people.
Keep the same two warm brown eyes, pupil size and eye location; vary gaze and eyelids coherently. No wink, no one-eye-closed frame. Do not jump instantly from fully open to fully closed; follow the numbered blink phases below. The face is not frozen through the whole action. Mouth changes must be gentle progressive shapes, not random unrelated expressions. During the blink maintain the current mouth shape and body pose path.
Facial acting for TWO CLAPS: frames1-3 quietly pleased closed-mouth smile and attentive open eyes; frames4-7 eyebrows gently lift and smile grows as hands rise; frames8-12 one happy natural blink around the first clap: 8 eyes75% open,9 eyes25% open,10 fully closed,11 eyes25% open,12 eyes75% open. Keep a warm smile through the blink, not a huge changing mouth. Frames13-17 eyes fully open, visibly delighted bright smile with slightly lifted cheeks during the second clap. Frames18-21 smile gradually softens as hands lower; frames22-24 contented small closed-mouth smile, relaxed brows. Keep the exact clapping body animation from image2.
```

### 2

```text
Use case: precise-object-edit. This is an existing 1536x1024 transparent 6-column by 4-row sprite sheet. Preserve ALL its pixels/artwork, the 24 exact body poses, face positions, mouth expressions, props, outfit, hair, head size and framing as closely as possible. Change ONLY eyelid openness in the six specified cells. Cell numbers read left-to-right then top-to-bottom.
The existing blink incorrectly has several completely closed drawings without a visible half-open transition. Correct to this exact bilateral sequence:
Cell 8: BOTH eyes HALF OPEN, brown irises and pupils clearly VISIBLE below lowered upper lids.
Cell 9: BOTH eyes NARROWLY OPEN, small brown iris portions still VISIBLE; do not draw fully closed arcs.
Cell 10: BOTH eyes fully closed, a single pair of relaxed eyelid lines.
Cell 11: BOTH eyes NARROWLY OPEN again, iris portions VISIBLE.
Cell 12: BOTH eyes HALF OPEN again, brown irises and pupils clearly VISIBLE.
Cell 13: BOTH eyes fully OPEN with existing expression.
Keep both eyes symmetric, eye centers fixed, eyebrows and mouth unchanged through the blink. Only the central one cell should be fully shut. Half-open is NOT the same as happy curved closed eyes. Do not alter other cells or add a wink. Output the same 24-cell transparent RGBA sheet, no background or text.
```

## all_done

### 1

```text
Use case: precise-object-edit.
Asset type: facial acting correction of an existing 24-frame desktop companion sprite sheet.
Image 1 is the user's character design reference. Image 2 is the EDIT TARGET, a 6-column by 4-row animation sheet of the same girl.
Preserve the target's exact 24 body poses, motion order, hand and prop positions, framing, head geometry, bonnet, braids, dress, socks, shoes, palette and soft 2D illustration style. Change ONLY facial acting: eyes, lids, eyebrows, mouth and subtle cheek blush. Do not redesign the body or swap poses.
The defect in the target is that every face has the SAME wide-open eyes and the SAME open mouth. Correct that: the expression must evolve naturally with the physical action and must include one complete blink with partial closing and reopening drawings.
OUTPUT one genuinely transparent RGBA PNG 1536x1024 pixels, exactly SIX columns by FOUR rows, 24 square 256x256 cells in reading order. Keep the existing layout, one complete girl per cell, stable scale, soles and head positions, 6px safe padding. No background, no matte, no checkerboard graphic, no grid/text/numbers, no extra props or extra people.
Keep the same two warm brown eyes, pupil size and eye location; vary gaze and eyelids coherently. No wink, no one-eye-closed frame. Do not jump instantly from fully open to fully closed; follow the numbered blink phases below. The face is not frozen through the whole action. Mouth changes must be gentle progressive shapes, not random unrelated expressions. During the blink maintain the current mouth shape and body pose path.
Facial acting for ANTICIPATE, JUMP, LAND: frames1-3 calm closed-mouth smile; frames4-7 anticipation with focused gently lowered brows, lips small determined smile; frames8-10 takeoff with brows rising and a small joyful 'o' mouth; frames11-15 a single excited blink near jump apex:11 eyes75% open,12 eyes25% open,13 fully closed,14 eyes25% open,15 eyes75% open, keep the delighted smile through these frames. Frames16-19 eyes fully reopen with proud happy grin as landing occurs; frames20-24 grin gradually settles into a soft pleased closed-mouth smile with relaxed brows. Preserve the exact crouch, airborne, landing and raised-arm poses from image2.
```

### 2

```text
Use case: precise-object-edit.
Image 1 is an existing 24-frame 6x4 sprite sheet to correct. KEEP this sheet exactly: same 1536x1024 canvas, 24 body poses, jumps, expressions, mouth shapes, hands, outfits and alpha. Change ONLY the inconsistent eyelids in the following cells.
The closed eyes must be BILATERAL: both eyes have the same openness and shape. No wink anywhere.
Cell numbering is left-to-right, top-to-bottom.
Cells 1-10: both eyes open with their existing emotional expressions.
Cell 11 (row2 column5): BOTH eyes 75% open, no wink.
Cell 12 (row2 column6): BOTH eyes 25% open.
Cell 13 (row3 column1): BOTH eyes fully closed, relaxed happy matching eyelid arcs.
Cell 14 (row3 column2): BOTH eyes 25% open.
Cell 15 (row3 column3): BOTH eyes 75% open.
Cells 16-24: BOTH eyes fully open with existing pleased expression; specifically remove the wink in cell20 (row4 column2).
Preserve eye location, face geometry, eyebrows and the mouth across the blink; no body redraw, no repositioning, no extra frames or text. Same character artwork and genuine transparent alpha background.
```

### 3

```text
Use case: background-extraction.
The input image is the FINISHED 24-frame character sprite sheet. Remove ONLY the unwanted brown gradient studio backdrop and its haze from ALL 24 cells. Make all space outside each girl genuinely fully transparent (alpha 0). Preserve the character drawings precisely, including all 24 body poses, jumping positions, facial acting, eyelid openness, mouth shapes, hands, hair strands, ribbons, lace, bunny ornaments and shoes. Do NOT redraw expressions, do NOT add a shadow or a scene.
Output one RGBA PNG with the exact same 1536x1024 dimensions and six-column by four-row layout; no cell shifting, resizing, crops or new elements. Every cell corner and every gap between figures must be truly transparent, no colored matte, no translucent brown rectangles, no checkerboard pixels baked into the image. Keep clean soft anti-aliased edges on the actual character silhouette. This is background removal only.

```

## remind

### 1

```text
Use case: precise-object-edit.
Asset type: facial acting correction of an existing 24-frame desktop companion sprite sheet.
Image 1 is the user's character design reference. Image 2 is the EDIT TARGET, a 6-column by 4-row animation sheet of the same girl.
Preserve the target's exact 24 body poses, motion order, hand and prop positions, framing, head geometry, bonnet, braids, dress, socks, shoes, palette and soft 2D illustration style. Change ONLY facial acting: eyes, lids, eyebrows, mouth and subtle cheek blush. Do not redesign the body or swap poses.
The defect in the target is that every face has the SAME wide-open eyes and the SAME open mouth. Correct that: the expression must evolve naturally with the physical action and must include one complete blink with partial closing and reopening drawings.
OUTPUT one genuinely transparent RGBA PNG 1536x1024 pixels, exactly SIX columns by FOUR rows, 24 square 256x256 cells in reading order. Keep the existing layout, one complete girl per cell, stable scale, soles and head positions, 6px safe padding. No background, no matte, no checkerboard graphic, no grid/text/numbers, no extra props or extra people.
Keep the same two warm brown eyes, pupil size and eye location; vary gaze and eyelids coherently. No wink, no one-eye-closed frame. Do not jump instantly from fully open to fully closed; follow the numbered blink phases below. The face is not frozen through the whole action. Mouth changes must be gentle progressive shapes, not random unrelated expressions. During the blink maintain the current mouth shape and body pose path.
Facial acting for FRIENDLY BELL REMINDER: frames1-3 small patient closed-mouth smile; frames4-7 eyebrows lift with attentive expression, lips part into a small gentle 'o' as bell rises; frames8-11 a warm encouraging smile while ringing, eyes engaged toward viewer; frames12-16 one relaxed natural blink during the pause between rings:12 eyes75% open,13 eyes25% open,14 fully closed,15 eyes25% open,16 eyes75% open. Mouth shape remains the same small encouraging smile through blink. Frames17-20 eyes open again, brows relaxed, smile warm with a tiny head-attention expression; frames21-24 settle to patient closed-mouth smile. Never keep one giant open mouth on every cell. Keep the exact bell, grip and hand path from image2.
```

## drink_water

### 1

```text
Use case: precise-object-edit.
Asset type: facial acting correction of an existing 24-frame desktop companion sprite sheet.
Image 1 is the user's character design reference. Image 2 is the EDIT TARGET, a 6-column by 4-row animation sheet of the same girl.
Preserve the target's exact 24 body poses, motion order, hand and prop positions, framing, head geometry, bonnet, braids, dress, socks, shoes, palette and soft 2D illustration style. Change ONLY facial acting: eyes, lids, eyebrows, mouth and subtle cheek blush. Do not redesign the body or swap poses.
The defect in the target is that every face has the SAME wide-open eyes and the SAME open mouth. Correct that: the expression must evolve naturally with the physical action and must include one complete blink with partial closing and reopening drawings.
OUTPUT one genuinely transparent RGBA PNG 1536x1024 pixels, exactly SIX columns by FOUR rows, 24 square 256x256 cells in reading order. Keep the existing layout, one complete girl per cell, stable scale, soles and head positions, 6px safe padding. No background, no matte, no checkerboard graphic, no grid/text/numbers, no extra props or extra people.
Keep the same two warm brown eyes, pupil size and eye location; vary gaze and eyelids coherently. No wink, no one-eye-closed frame. Do not jump instantly from fully open to fully closed; follow the numbered blink phases below. The face is not frozen through the whole action. Mouth changes must be gentle progressive shapes, not random unrelated expressions. During the blink maintain the current mouth shape and body pose path.
Facial acting for DRINK WATER: frames1-3 calm relaxed closed-mouth smile; frames4-8 gaze follows the cup, expression attentive and expectant, lips gradually purse; frames9-14 gentle focused sipping, gaze slightly down at the cup rim and lips softly pursed where cup touches mouth, NO smiling open mouth behind the cup; frames15-16 cup lowers, expression relaxes into satisfaction; frames17-21 one satisfied natural blink:17 eyes75% open,18 eyes25% open,19 fully closed,20 eyes25% open,21 eyes75% open. Maintain a small contented closed-mouth smile during blink. Frames22-24 eyes open, contented gentle smile, relaxed eyebrows and a hint of rosy cheeks. Keep the exact cup position, handle, hand motion and body from image2.
```

## stretch

### 1

```text
Use case: precise-object-edit.
Asset type: facial acting correction of an existing 24-frame desktop companion sprite sheet.
Image 1 is the user's character design reference. Image 2 is the EDIT TARGET, a 6-column by 4-row animation sheet of the same girl.
Preserve the target's exact 24 body poses, motion order, hand and prop positions, framing, head geometry, bonnet, braids, dress, socks, shoes, palette and soft 2D illustration style. Change ONLY facial acting: eyes, lids, eyebrows, mouth and subtle cheek blush. Do not redesign the body or swap poses.
The defect in the target is that every face has the SAME wide-open eyes and the SAME open mouth. Correct that: the expression must evolve naturally with the physical action and must include one complete blink with partial closing and reopening drawings.
OUTPUT one genuinely transparent RGBA PNG 1536x1024 pixels, exactly SIX columns by FOUR rows, 24 square 256x256 cells in reading order. Keep the existing layout, one complete girl per cell, stable scale, soles and head positions, 6px safe padding. No background, no matte, no checkerboard graphic, no grid/text/numbers, no extra props or extra people.
Keep the same two warm brown eyes, pupil size and eye location; vary gaze and eyelids coherently. No wink, no one-eye-closed frame. Do not jump instantly from fully open to fully closed; follow the numbered blink phases below. The face is not frozen through the whole action. Mouth changes must be gentle progressive shapes, not random unrelated expressions. During the blink maintain the current mouth shape and body pose path.
Facial acting for OVERHEAD SIDE STRETCH: frames1-3 relaxed small closed-mouth smile; frames4-8 lips gently part as arms rise, eyes look slightly upward without moving face; frames9-13 a focused stretch expression, eyebrows relaxed and lips a small soft 'o' as though exhaling; frames14-17 a softer relieved smile as the body moves to the other side; frames18-22 one slow relaxed blink as stretch releases:18 eyes75% open,19 eyes25% open,20 fully closed,21 eyes25% open,22 eyes75% open. Keep the soft smile through this blink. Frames23-24 eyes open again with contented closed-mouth smile. Facial sequence must distinguish effort, exhale and release without grimacing. Preserve all overhead hand, side-bend, hair and leg poses from image2.
```

### 2

```text
Use case: precise-object-edit. This is an existing 1536x1024 transparent 6-column by 4-row sprite sheet. Preserve ALL its pixels/artwork, the 24 exact body poses, face positions, mouth expressions, props, outfit, hair, head size and framing as closely as possible. Change ONLY eyelid openness in the six specified cells. Cell numbers read left-to-right then top-to-bottom.
The existing blink incorrectly has several completely closed drawings without a visible half-open transition. Correct to this exact bilateral sequence:
Cell 18: BOTH eyes HALF OPEN, brown irises and pupils clearly VISIBLE below lowered upper lids.
Cell 19: BOTH eyes NARROWLY OPEN, small brown iris portions still VISIBLE; do not draw fully closed arcs.
Cell 20: BOTH eyes fully closed, a single pair of relaxed eyelid lines.
Cell 21: BOTH eyes NARROWLY OPEN again, iris portions VISIBLE.
Cell 22: BOTH eyes HALF OPEN again, brown irises and pupils clearly VISIBLE.
Cell 23: BOTH eyes fully OPEN with existing expression.
Keep both eyes symmetric, eye centers fixed, eyebrows and mouth unchanged through the blink. Only the central one cell should be fully shut. Half-open is NOT the same as happy curved closed eyes. Do not alter other cells or add a wink. Output the same 24-cell transparent RGBA sheet, no background or text.
```
