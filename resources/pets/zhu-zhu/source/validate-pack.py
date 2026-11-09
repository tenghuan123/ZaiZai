"""Read-only asset validation. Requires Pillow; does not alter image pixels."""
import hashlib
import json
import struct
import zlib
from pathlib import Path

from PIL import Image, ImageChops

pack = Path(__file__).resolve().parent.parent
manifest = json.loads((pack / "manifest.json").read_text())
timelines = json.loads((pack / "source/timelines.json").read_text())
actions = ["idle", "react", "celebrate", "all_done", "remind", "drink_water", "stretch"]
assert list(manifest["states"]) == actions
assert manifest["canvasSize"] == [320, 320]
report = {"date": "2026-11-03", "passed": True, "actions": []}

for action in actions:
    state = manifest["states"][action]
    timeline = timelines[action]
    assert state["frames"] == len(timeline)
    assert state["cols"] == 8 and state["fps"] == 24
    sheet = Image.open(pack / state["src"]).convert("RGBA")
    assert sheet.size == (2560, ((len(timeline) + 7) // 8) * 320)
    assert len(list((pack / "keyframes" / action).glob("*.png"))) == 24
    signatures = set()
    bounds = []
    keyframes = []
    for key in range(24):
        image = Image.open(pack / "keyframes" / action / f"{key:02}.png").convert("RGBA")
        assert image.size == (320, 320)
        alpha = image.getchannel("A")
        assert alpha.getextrema()[0] == 0 and alpha.getextrema()[1] >= 240
        assert all(alpha.getpixel(point) == 0 for point in [(0, 0), (319, 0), (0, 319), (319, 319)])
        box = alpha.point(lambda value: 255 if value > 12 else 0).getbbox()
        assert box and min(box[0], box[1], 320 - box[2], 320 - box[3]) >= 8, (action, key, box)
        signatures.add(hashlib.sha256(image.tobytes()).hexdigest())
        bounds.append(box)
        keyframes.append(image)
    assert len(signatures) == 24, (action, "Duplicate drawn frames")

    animation_path = pack / "animations" / f"{action}.png"
    data = animation_path.read_bytes()
    position = 8
    controls = []
    while position < len(data):
        length = struct.unpack_from(">I", data, position)[0]
        kind = data[position + 4:position + 8]
        payload = data[position + 8:position + 8 + length]
        expected_crc = struct.unpack_from(">I", data, position + 8 + length)[0]
        assert zlib.crc32(kind + payload) == expected_crc
        if kind == b"fcTL":
            delay = struct.unpack_from(">HH", payload, 20)
            assert delay == (1, 24), (action, delay)
            controls.append(delay)
        position += length + 12

    animation = Image.open(animation_path)
    assert animation.is_animated and animation.size == (320, 320)
    assert animation.n_frames == len(timeline) == len(controls)
    assert animation.info["loop"] == (0 if state["loop"] else 1)
    largest_difference = 0
    for tick, key in enumerate(timeline):
        animation.seek(tick)
        animated_frame = animation.convert("RGBA")
        x, y = tick % 8 * 320, tick // 8 * 320
        packed_frame = sheet.crop((x, y, x + 320, y + 320))
        # Premultiplied CoreGraphics round-trips can differ by a few levels at alpha edges.
        for candidate in [packed_frame, animated_frame]:
            difference = ImageChops.difference(candidate, keyframes[key])
            difference_max = max(high for low, high in difference.getextrema())
            largest_difference = max(largest_difference, difference_max)
            assert difference_max <= 4, (action, tick, difference_max)

    report["actions"].append({"id": action, "drawnFrames": len(signatures), "playbackFrames": len(timeline),
        "fps": state["fps"], "seconds": round(len(timeline) / 24, 4), "loop": state["loop"],
        "sheetSize": list(sheet.size), "minimumPadding": min(min(x1, y1, 320-x2, 320-y2) for x1,y1,x2,y2 in bounds),
        "maximumEncodingDifference": largest_difference, "apngDelays": "1/24 s, exact", "transparentCorners": True})

(pack / "source/validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(report, ensure_ascii=False, indent=2))
