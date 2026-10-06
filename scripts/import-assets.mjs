// Copies the sprite art from the original Unity project into src/assets,
// downscaled to sizes that suit the browser. Run once: `npm run assets`.
// Override the source with: UNITY_PROJECT="path/to/John" npm run assets
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const unityRoot = process.env.UNITY_PROJECT
  ?? path.resolve('..', 'Unity Projects', 'John');
const src = path.join(unityRoot, 'Assets', 'Sprites');
const out = path.resolve('src', 'assets');

// [source relative to Assets/Sprites, output name, max dimension in px]
const files = [
  ['Enemies/Goblin/goblin_idle.png', 'goblin_idle.png', 384],
  ['Enemies/Goblin/goblin_idle_void.png', 'goblin_idle_void.png', 384],
  ['Enemies/Striker/striker_idle_0.png', 'striker_idle.png', 384],
  ['Enemies/Striker/striker_idle_void.png', 'striker_idle_void.png', 384],
  ['Player/tail.png', 'tail.png', 128],
  ['Aspects/Anchor/anchor_icon.png', 'anchor_icon.png', 256],
  ['Aspects/Anchor/anchor_object.png', 'anchor_object.png', 256],
  ['Aspects/Flash/flash_icon.png', 'flash_icon.png', 256],
  ['Aspects/Predator/predator_icon.png', 'predator_icon.png', 256],
  ['Aspects/Rift/rift_icon.png', 'rift_icon.png', 256],
];
for (const name of ['first_swing', 'second_swing', 'third_swing', 'fourth_swing', 'parry'])
  for (let i = 0; i < 3; i++) files.push([`Player/Swings/${name}000${i}.png`, `${name}${i}.png`, 384]);
for (let i = 0; i < 4; i++) files.push([`Player/Swings/parry_connect000${i}.png`, `parry_connect${i}.png`, 512]);
for (let i = 0; i < 5; i++) files.push([`Aspects/Rift/rift_open000${i}.png`, `rift_open${i}.png`, 640]);
for (let i = 0; i < 4; i++) files.push([`Aspects/Rift/rift_close000${i}.png`, `rift_close${i}.png`, 640]);

fs.mkdirSync(out, { recursive: true });
for (const [from, to, max] of files) {
  const input = path.join(src, from);
  if (!fs.existsSync(input)) { console.warn('missing', input); continue; }
  await sharp(input).resize({ width: max, height: max, fit: 'inside' }).png().toFile(path.join(out, to));
  console.log('ok', to);
}
