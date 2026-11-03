# 生成提示词

使用内置 image_gen；原始参考见 reference.png。后续动作同时参考原始设定和待机图，以保持角色一致。

## idle · 待机眨眼

```text
Use case: stylized-concept
Asset type: production-ready transparent desktop companion animation sprite sheet, idle action.
Input image 1 is the user's character design reference. Faithfully recreate THIS SAME chibi girl, not the surrounding design board.
Character invariants: very long wavy chocolate-brown hair with two thin front braids and small pink bows; warm brown eyes, rosy cheeks; ivory lace bonnet decorated with two small white bunny ornaments, flowers and strawberries; pastel hair clips on viewer-left; pearl flower choker and pastel bead bracelet; modest ivory frilly layered dress with pink ribbons and strawberry accents; white ruffled ankle socks and cream strawberry Mary Jane shoes. Keep the reference's soft pastel 2D anime illustration style, fine warm brown outlines, expressive large head and compact full body. Simplify only tiny lace details for readability at 130px display height. The outfit and identity are identical in every frame.
OUTPUT: ONE 2048x1024 PNG sprite sheet, exactly FOUR COLUMNS and TWO ROWS, eight equally sized 512x512 cells in reading order, with a genuinely transparent alpha background everywhere outside the character. NO visible grid, NO borders, NO text, NO frame numbers, NO decorations outside cells, NO checkerboard graphic, NO scene, NO ground shadow.
Framing: front-facing full-body girl, both shoes and whole bonnet and hair visible in EVERY cell; identical camera and scale; center at local x=256, shoes on local y=468 baseline, hair and bonnet inside y=45..468, safe transparent padding all around. Keep all character parts entirely inside their own cell. Body and hair proportions must not drift. Do not reproduce multiple views, closeups or extra bunnies from the reference board.
Animation: eight successive frames of one subtle seamless IDLE breathing and blinking loop, NOT eight different poses. Frame 1 relaxed standing with arms gently at sides and open eyes; frame 2 chest rises a little and hair tips sway right 2px; frame 3 same position with eyelids halfway closed; frame 4 eyes softly closed; frame 5 half open; frame 6 fully open and gentle breathing down; frame 7 returns toward the exact first pose; frame 8 nearly identical to frame 1 for a seamless loop. Keep feet fixed. Movement is tiny and coherent, face design consistent. No props.
```

## react · 挥手回应

```text
Use case: stylized-concept
Asset type: production-ready transparent desktop companion animation sprite sheet, character action.
Input image 1 is the user's character design reference. Input image 2 is the already-generated idle sprite sheet: match image 2's precise character model, full-body scale, face, line style, 4x2 layout and palette. Faithfully recreate THIS SAME chibi girl, not the surrounding design board.
Character invariants: very long wavy chocolate-brown hair with two thin front braids and small pink bows; warm brown eyes, rosy cheeks; ivory lace bonnet decorated with two small white bunny ornaments, flowers and strawberries; pastel hair clips on viewer-left; pearl flower choker and pastel bead bracelet; modest ivory frilly layered dress with pink ribbons and strawberry accents; white ruffled ankle socks and cream strawberry Mary Jane shoes. Keep the reference's soft pastel 2D anime illustration style, fine warm brown outlines, expressive large head and compact full body. Simplify only tiny lace details for readability at 130px display height. The outfit and identity are identical in every frame.
OUTPUT: ONE 2048x1024 PNG sprite sheet, exactly FOUR COLUMNS and TWO ROWS, eight equally sized 512x512 cells in reading order, with a genuinely transparent alpha background everywhere outside the character. NO visible grid, NO borders, NO text, NO frame numbers, NO decorations outside cells, NO checkerboard graphic, NO scene, NO ground shadow.
Framing: front-facing full-body girl, both shoes and whole bonnet and hair visible in EVERY cell; identical camera and scale; center at local x=256, shoes on local y=468 baseline, hair and bonnet inside y=45..468, safe transparent padding all around. Keep all character parts entirely inside their own cell. Body and hair proportions must not drift. Do not reproduce multiple views, closeups or extra bunnies from the reference board.

Animation: eight successive frames of one friendly WAVE response, shown in reading order. Frame 1 relaxed arms down with open eyes, same neutral stance as image 2; frame 2 lift one hand to chest; frame 3 raise this hand to beside cheek, palm facing viewer; frame 4 wave this palm outward, smiling; frame 5 wave inward, smile and one eye wink; frame 6 wave outward with eyes open; frame 7 lower the hand; frame 8 return to the first neutral pose. Keep the other arm relaxed and both feet in exactly the same positions throughout. Only one waving hand, anatomically clear small mitten-like fingers, no extra fingers. Tiny coordinated hair motion. This is a coherent animation, no separate designs. No extra props or floating symbols.
```

## celebrate · 鼓掌庆祝

```text
Use case: stylized-concept
Asset type: production-ready transparent desktop companion animation sprite sheet, character action.
Input image 1 is the user's character design reference. Input image 2 is the already-generated idle sprite sheet: match image 2's precise character model, full-body scale, face, line style, 4x2 layout and palette. Faithfully recreate THIS SAME chibi girl, not the surrounding design board.
Character invariants: very long wavy chocolate-brown hair with two thin front braids and small pink bows; warm brown eyes, rosy cheeks; ivory lace bonnet decorated with two small white bunny ornaments, flowers and strawberries; pastel hair clips on viewer-left; pearl flower choker and pastel bead bracelet; modest ivory frilly layered dress with pink ribbons and strawberry accents; white ruffled ankle socks and cream strawberry Mary Jane shoes. Keep the reference's soft pastel 2D anime illustration style, fine warm brown outlines, expressive large head and compact full body. Simplify only tiny lace details for readability at 130px display height. The outfit and identity are identical in every frame.
OUTPUT: ONE 2048x1024 PNG sprite sheet, exactly FOUR COLUMNS and TWO ROWS, eight equally sized 512x512 cells in reading order, with a genuinely transparent alpha background everywhere outside the character. NO visible grid, NO borders, NO text, NO frame numbers, NO decorations outside cells, NO checkerboard graphic, NO scene, NO ground shadow.
Framing: front-facing full-body girl, both shoes and whole bonnet and hair visible in EVERY cell; identical camera and scale; center at local x=256, shoes on local y=468 baseline, hair and bonnet inside y=45..468, safe transparent padding all around. Keep all character parts entirely inside their own cell. Body and hair proportions must not drift. Do not reproduce multiple views, closeups or extra bunnies from the reference board.

Animation: eight successive frames of a small happy CLAP celebration. Frame 1 neutral standing, arms low; frame 2 lift both hands in front of chest; frame 3 palms nearly together; frame 4 palms touching in a happy clap and eyes closed with joyful smile; frame 5 palms slightly apart; frame 6 palms touching for a second clap; frame 7 hands lower as eyes open; frame 8 neutral standing again. Keep both shoes planted on the identical baseline. Keep head position and character scale stable; only tiny gentle body bounce and hair-tip sway. Hands must stay below chin and not cover face. No sparkles, text, confetti or extra characters.
```

## all_done · 全部完成

```text
Use case: stylized-concept
Asset type: production-ready transparent desktop companion animation sprite sheet, character action.
Input image 1 is the user's character design reference. Input image 2 is the already-generated idle sprite sheet: match image 2's precise character model, full-body scale, face, line style, 4x2 layout and palette. Faithfully recreate THIS SAME chibi girl, not the surrounding design board.
Character invariants: very long wavy chocolate-brown hair with two thin front braids and small pink bows; warm brown eyes, rosy cheeks; ivory lace bonnet decorated with two small white bunny ornaments, flowers and strawberries; pastel hair clips on viewer-left; pearl flower choker and pastel bead bracelet; modest ivory frilly layered dress with pink ribbons and strawberry accents; white ruffled ankle socks and cream strawberry Mary Jane shoes. Keep the reference's soft pastel 2D anime illustration style, fine warm brown outlines, expressive large head and compact full body. Simplify only tiny lace details for readability at 130px display height. The outfit and identity are identical in every frame.
OUTPUT: ONE 2048x1024 PNG sprite sheet, exactly FOUR COLUMNS and TWO ROWS, eight equally sized 512x512 cells in reading order, with a genuinely transparent alpha background everywhere outside the character. NO visible grid, NO borders, NO text, NO frame numbers, NO decorations outside cells, NO checkerboard graphic, NO scene, NO ground shadow.
Framing: front-facing full-body girl, both shoes and whole bonnet and hair visible in EVERY cell; identical camera and scale; center at local x=256, shoes on local y=468 baseline, hair and bonnet inside y=45..468, safe transparent padding all around. Keep all character parts entirely inside their own cell. Body and hair proportions must not drift. Do not reproduce multiple views, closeups or extra bunnies from the reference board.

Animation: eight successive frames of a joyful ALL TASKS DONE hooray celebration, distinct from clapping. Frame 1 neutral arms down; frame 2 hands curl into little happy fists near chest and knees bend a tiny amount; frame 3 extend both arms diagonally outward in an enthusiastic V, hands at ear height but BELOW the top of the bonnet; frame 4 broad delighted smile and closed joyful eyes, arms in V; frame 5 arms still in V, tiny rise onto tiptoes, hair sways softly; frame 6 come back onto flat feet, eyes opening; frame 7 lower hands to chest; frame 8 relaxed neutral standing. Keep character entirely within its square, bonnet NEVER clipped at the top, no actual big jump, no upward camera or scale changes. Arms spread must remain inside each cell. No confetti, floating effects, text or extra characters.
```

## remind · 摇铃提醒

```text
Use case: stylized-concept
Asset type: production-ready transparent desktop companion animation sprite sheet, character action.
Input image 1 is the user's character design reference. Input image 2 is the already-generated idle sprite sheet: match image 2's precise character model, full-body scale, face, line style, 4x2 layout and palette. Faithfully recreate THIS SAME chibi girl, not the surrounding design board.
Character invariants: very long wavy chocolate-brown hair with two thin front braids and small pink bows; warm brown eyes, rosy cheeks; ivory lace bonnet decorated with two small white bunny ornaments, flowers and strawberries; pastel hair clips on viewer-left; pearl flower choker and pastel bead bracelet; modest ivory frilly layered dress with pink ribbons and strawberry accents; white ruffled ankle socks and cream strawberry Mary Jane shoes. Keep the reference's soft pastel 2D anime illustration style, fine warm brown outlines, expressive large head and compact full body. Simplify only tiny lace details for readability at 130px display height. The outfit and identity are identical in every frame.
OUTPUT: ONE 2048x1024 PNG sprite sheet, exactly FOUR COLUMNS and TWO ROWS, eight equally sized 512x512 cells in reading order, with a genuinely transparent alpha background everywhere outside the character. NO visible grid, NO borders, NO text, NO frame numbers, NO decorations outside cells, NO checkerboard graphic, NO scene, NO ground shadow.
Framing: front-facing full-body girl, both shoes and whole bonnet and hair visible in EVERY cell; identical camera and scale; center at local x=256, shoes on local y=468 baseline, hair and bonnet inside y=45..468, safe transparent padding all around. Keep all character parts entirely inside their own cell. Body and hair proportions must not drift. Do not reproduce multiple views, closeups or extra bunnies from the reference board.

Animation: eight successive frames of a gentle REMINDER loop. The girl holds ONE small golden handbell with a pink ribbon in her raised hand at chest-to-shoulder level, the bell silhouette clear beside her body and never covering face. Frame 1 bell near chest; frame 2 lift bell to shoulder; frame 3 tilt bell gently outward; frame 4 tilt inward, eyebrows slightly raised and small o-shaped attentive mouth; frame 5 outward tilt; frame 6 inward tilt; frame 7 lower bell to chest; frame 8 nearly the first pose. The free hand makes a small welcoming open-palm gesture. Feet and body stay fixed. Expression friendly and patient. Keep the same single bell in every frame. No written words, no question marks, no vibration marks, no separate floating symbols.
```

## drink_water · 喝水提醒

```text
Use case: stylized-concept
Asset type: production-ready transparent desktop companion animation sprite sheet, character action.
Input image 1 is the user's character design reference. Input image 2 is the already-generated idle sprite sheet: match image 2's precise character model, full-body scale, face, line style, 4x2 layout and palette. Faithfully recreate THIS SAME chibi girl, not the surrounding design board.
Character invariants: very long wavy chocolate-brown hair with two thin front braids and small pink bows; warm brown eyes, rosy cheeks; ivory lace bonnet decorated with two small white bunny ornaments, flowers and strawberries; pastel hair clips on viewer-left; pearl flower choker and pastel bead bracelet; modest ivory frilly layered dress with pink ribbons and strawberry accents; white ruffled ankle socks and cream strawberry Mary Jane shoes. Keep the reference's soft pastel 2D anime illustration style, fine warm brown outlines, expressive large head and compact full body. Simplify only tiny lace details for readability at 130px display height. The outfit and identity are identical in every frame.
OUTPUT: ONE 2048x1024 PNG sprite sheet, exactly FOUR COLUMNS and TWO ROWS, eight equally sized 512x512 cells in reading order, with a genuinely transparent alpha background everywhere outside the character. NO visible grid, NO borders, NO text, NO frame numbers, NO decorations outside cells, NO checkerboard graphic, NO scene, NO ground shadow.
Framing: front-facing full-body girl, both shoes and whole bonnet and hair visible in EVERY cell; identical camera and scale; center at local x=256, shoes on local y=468 baseline, hair and bonnet inside y=45..468, safe transparent padding all around. Keep all character parts entirely inside their own cell. Body and hair proportions must not drift. Do not reproduce multiple views, closeups or extra bunnies from the reference board.

Animation: eight successive frames of a DRINK WATER reminder loop. The girl holds ONE small clear pale-blue handled water cup in BOTH hands; the cup stays visible and is the only new prop. Frame 1 hold cup at chest; frame 2 raise cup slowly; frame 3 bring rim to lips; frame 4 take a small sip, eyes gently closed, cup rim at lips; frame 5 finish sip and open eyes; frame 6 lower cup; frame 7 cup at chest and a warm happy smile; frame 8 returns close to frame 1. Cup is never enlarged or covering eyes, show blue water with clean simple shading. Both feet stay planted; camera and scale remain unchanged. Hair and dress remain the same as the reference. No splashing, no giant straw, no text, no floating droplets, no extra characters.
```

## stretch · 起身拉伸

```text
Use case: stylized-concept
Asset type: production-ready transparent desktop companion animation sprite sheet, character action.
Input image 1 is the user's character design reference. Input image 2 is the already-generated idle sprite sheet: match image 2's precise character model, full-body scale, face, line style, 4x2 layout and palette. Faithfully recreate THIS SAME chibi girl, not the surrounding design board.
Character invariants: very long wavy chocolate-brown hair with two thin front braids and small pink bows; warm brown eyes, rosy cheeks; ivory lace bonnet decorated with two small white bunny ornaments, flowers and strawberries; pastel hair clips on viewer-left; pearl flower choker and pastel bead bracelet; modest ivory frilly layered dress with pink ribbons and strawberry accents; white ruffled ankle socks and cream strawberry Mary Jane shoes. Keep the reference's soft pastel 2D anime illustration style, fine warm brown outlines, expressive large head and compact full body. Simplify only tiny lace details for readability at 130px display height. The outfit and identity are identical in every frame.
OUTPUT: ONE 2048x1024 PNG sprite sheet, exactly FOUR COLUMNS and TWO ROWS, eight equally sized 512x512 cells in reading order, with a genuinely transparent alpha background everywhere outside the character. NO visible grid, NO borders, NO text, NO frame numbers, NO decorations outside cells, NO checkerboard graphic, NO scene, NO ground shadow.
Framing: front-facing full-body girl, both shoes and whole bonnet and hair visible in EVERY cell; identical camera and scale; center at local x=256, shoes on local y=468 baseline, hair and bonnet inside y=45..468, safe transparent padding all around. Keep all character parts entirely inside their own cell. Body and hair proportions must not drift. Do not reproduce multiple views, closeups or extra bunnies from the reference board.

Animation: eight successive frames of a gentle STANDING STRETCH reminder. Frame 1 neutral arms down; frame 2 lift elbows outward and hands beside shoulders; frame 3 reach both arms outward and slightly up, fingertips at ear height; frame 4 stretch with elbows almost straight, hands remain at or below the top of her bonnet, eyes softly closed and relaxed smile; frame 5 lean upper body only slightly toward one side while keeping feet planted; frame 6 return to center with eyes opening; frame 7 lower arms; frame 8 neutral again. Full body always visible, whole bonnet below cell top, shoulders and hands entirely within each cell, no big jump. Same exact outfit and head/hair shape, no props, no dumbbells, no text or effects. One smooth coherent eight-frame action.
```
