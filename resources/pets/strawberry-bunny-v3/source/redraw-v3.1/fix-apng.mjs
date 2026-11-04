import { readFile, writeFile } from 'node:fs/promises';
const root = 'resources/pets/strawberry-bunny-v3';
const crc32 = buffer => {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = value >>> 1 ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};
const states = JSON.parse(await readFile(root + '/manifest.json', 'utf8')).states;
const results = {};
for (const action of ['celebrate', 'all_done', 'drink_water']) {
  const file = root + '/animations/' + action + '.png',
    png = await readFile(file);
  let offset = 8,
    frames = 0,
    loop = null;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset),
      type = png.toString('ascii', offset + 4, offset + 8),
      data = offset + 8;
    if (type === 'acTL') {
      loop = png.readUInt32BE(data + 4);
      if (png.readUInt32BE(data) !== states[action].frames) throw new Error('APNG count mismatch');
    }
    if (type === 'fcTL') {
      png.writeUInt16BE(1, data + 20);
      png.writeUInt16BE(24, data + 22);
      png.writeUInt32BE(crc32(png.subarray(offset + 4, data + length)), data + length);
      frames++;
    }
    offset += length + 12;
  }
  if (frames !== states[action].frames || loop !== (states[action].loop ? 0 : 1)) throw new Error('APNG metadata mismatch');
  await writeFile(file, png);
  results[action] = {
    frames,
    delay: '1/24',
    loop
  };
}
console.log(JSON.stringify(results, null, 2));
