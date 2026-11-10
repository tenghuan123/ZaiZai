"""Pack dense PNG exports into indexed atlases without changing playback pixels."""

import argparse
import io
import json
import re
from pathlib import Path

from PIL import Image, PngImagePlugin


def compact_atlas(path, state, frame_width, frame_height):
    cols = state['cols']
    frames = state['frames']

    def origin(index):
        return index % cols * frame_width, index // cols * frame_height

    with Image.open(path) as source:
        expected_size = (cols * frame_width, ((frames + cols - 1) // cols) * frame_height)
        if source.size != expected_size:
            raise ValueError(f'{path}: expected a dense atlas of size {expected_size}')
        rgba = source.convert('RGBA')
        tiles = {}
        frame_indices = []
        for frame in range(frames):
            x, y = origin(frame)
            pixels = rgba.crop((x, y, x + frame_width, y + frame_height)).tobytes()
            frame_indices.append(tiles.setdefault(pixels, len(tiles)))

        rows = (len(tiles) + cols - 1) // cols
        atlas = Image.new('RGBA', (expected_size[0], rows * frame_height))
        for pixels, index in tiles.items():
            atlas.paste(Image.frombytes('RGBA', (frame_width, frame_height), pixels), origin(index))

        metadata = PngImagePlugin.PngInfo()
        if 'srgb' in source.info:
            metadata.add(b'sRGB', bytes([source.info['srgb']]))
        output = io.BytesIO()
        atlas.save(output, format='PNG', pnginfo=metadata, icc_profile=source.info.get('icc_profile'))
        return frame_indices, output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sheets', type=Path, nargs='+', help='dense playback PNG exports named after their actions')
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    manifest_path = root / 'manifest.json'
    preview_path = root / 'preview.html'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    states = {state['src']: state for state in manifest['states'].values()}
    outputs = {}
    for sheet in args.sheets:
        if sheet.name not in states or sheet.name in outputs:
            parser.error(f'unknown or repeated action sheet: {sheet}')
        state = states[sheet.name]
        state['frameIndices'], outputs[sheet.name] = compact_atlas(sheet, state, *manifest['canvasSize'])

    preview = preview_path.read_text(encoding='utf-8')
    actions_line = re.search(r'^const actions=(.*);$', preview, flags=re.MULTILINE)
    actions = json.loads(actions_line.group(1))
    for action in actions:
        action['state'] = manifest['states'][action['id']]
    # The standalone preview also works from file://, where fetching JSON is blocked.
    actions_json = json.dumps(actions, ensure_ascii=False, separators=(',', ':'))
    preview = preview[:actions_line.start(1)] + actions_json + preview[actions_line.end(1):]

    for filename, png in outputs.items():
        (root / filename).write_bytes(png)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    preview_path.write_text(preview, encoding='utf-8')


if __name__ == '__main__':
    main()
