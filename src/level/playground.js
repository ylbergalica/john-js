// The playground's fixed test map: an open arena with a few kinds of cover and a few props
// to smash, joined to a side room by a wide corridor and by a 2-tile one that guardians
// (3-tile footprint) can't fit through. Rects are [x, y, width, height] in tiles.
import { Grid } from './generator.js';

const WIDTH = 70, HEIGHT = 38;

const FLOOR = [
  [3, 3, 34, 30], // arena
  [37, 14, 12, 6], // wide corridor
  [49, 8, 18, 18], // side room
  [37, 28, 20, 2], // narrow corridor…
  [55, 26, 2, 2], // …turning up into the side room
];

const WALLS = [
  [9, 8, 2, 2], [29, 8, 2, 2], // pillars
  [8, 24, 4, 4], // block
  [26, 23, 6, 1], [31, 24, 1, 5], // L
  [13, 13, 1, 8], // thin wall
  [56, 15, 3, 3], // side room pillar
];

const START = { x: 20, y: 18 };

// Destroyables huddled against the cover, in world units.
const PROPS = [
  { type: 'starPod', x: 8.4, y: 10.6 }, { type: 'starPod', x: 9.3, y: 11 }, { type: 'cagedStar', x: 11.6, y: 9.4 },
  { type: 'starEgg', x: 14.6, y: 15 }, { type: 'starEgg', x: 14.7, y: 16.2 },
  { type: 'geode', x: 12.6, y: 25 }, { type: 'geode', x: 12.8, y: 26.3 }, { type: 'geode', x: 28.4, y: 10.6 },
  { type: 'druse', x: 8.4, y: 22.4 }, { type: 'druse', x: 9.5, y: 22.6 },
  { type: 'reliquary', x: 29.5, y: 25.5 },
];

// → { grid, rooms, start, exit, props } like generateLayout, without rooms or an exit, and
// with its own props.
export function playgroundLayout() {
  const grid = new Grid(WIDTH, HEIGHT);
  const fill = ([x0, y0, w, h], floor) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) grid.setFloor(x, y, floor);
  };
  for (const r of FLOOR) fill(r, true);
  for (const r of WALLS) fill(r, false);
  return { grid, rooms: [], start: { x: START.x + 0.5, y: START.y + 0.5 }, exit: null, props: PROPS };
}
