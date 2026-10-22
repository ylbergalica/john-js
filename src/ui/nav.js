// Keyboard navigation for every menu: the arrow keys (or the movement keys) move focus to the
// nearest button in that direction within the topmost open menu, and Enter or Space presses it.
// A slider takes left and right itself. Nothing happens while no menu is open (in play), while
// a key is being bound, or over the screens that take any key themselves (a box breaking, an
// unlock). Focus moved this way shows (focus-visible) and ticks like a hover; moving the mouse
// drops it again.
import { settings } from '../meta/settings.js';
import { sfx } from '../audio/sfx.js';

// The menus, topmost first; `null` marks those that take keys themselves.
const LAYERS = [
  ['.breaker', null], ['.reveal', null], ['.credits'], ['.settings'], ['.confirm'], ['.panel.shop'], ['.panel'],
  ['.pause-confirm'], ['.pause'], ['.run-summary'], ['.menu'],
];
const FOCUSABLE = 'button:not(:disabled), input[type="range"]';
const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const MOVES = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });

function topLayer(root) {
  for (const [sel, takes = true] of LAYERS) {
    const el = [...root.querySelectorAll(sel)].find(shown);
    if (el) return takes ? el : null;
  }
  return null;
}

function direction(e) {
  if (ARROWS[e.code]) return ARROWS[e.code];
  const action = Object.keys(MOVES).find((a) => settings.bindings[a] === e.code);
  return action ? MOVES[action] : null;
}

// The focusable nearest `from` in direction (dx, dy): ahead of it along that axis, the
// closest by distance ahead plus twice the drift sideways.
function nearest(items, from, [dx, dy]) {
  const a = from.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of items) {
    if (el === from) continue;
    const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const ahead = (bx - ax) * dx + (by - ay) * dy, side = Math.abs((bx - ax) * dy) + Math.abs((by - ay) * dx);
    if (ahead <= 1) continue;
    const score = ahead + side * 2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

export function installMenuNav(root) {
  let keyboard = false; // focus was last moved by a key

  const focus = (el) => {
    el.focus({ focusVisible: true });
    el.scrollIntoView({ block: 'nearest' });
    keyboard = true;
    sfx.play('hover');
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat && !ARROWS[e.code]) return;
    if (root.querySelector('.set-key.listening')) return; // binding a key
    const layer = topLayer(root);
    if (!layer) return;
    const active = document.activeElement;
    const inLayer = layer.contains(active) && active.matches(FOCUSABLE) && shown(active);

    if ((e.code === 'Enter' || e.code === 'Space') && inLayer && active.tagName === 'BUTTON') {
      e.preventDefault();
      e.stopImmediatePropagation(); // the press is this button's, not the menu's (a confirm's Enter)
      active.click();
      return;
    }
    const dir = direction(e);
    if (!dir) return;
    if (inLayer && active.type === 'range' && dir[1] === 0) {
      if (!ARROWS[e.code]) { // A and D step the slider as the arrows do
        active.stepUp(dir[0]);
        active.dispatchEvent(new Event('input', { bubbles: true }));
        active.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    e.preventDefault();
    const items = [...layer.querySelectorAll(FOCUSABLE)].filter(shown);
    if (items.length === 0) return;
    const next = inLayer ? nearest(items, active, dir) : layer.querySelector('.primary:not(:disabled)') ?? items[0];
    if (next) focus(next);
  }, { capture: true });

  // The mouse takes over again: a key-moved focus is let go.
  window.addEventListener('mousemove', (e) => {
    if (!keyboard || (e.movementX === 0 && e.movementY === 0)) return;
    keyboard = false;
    if (root.contains(document.activeElement)) document.activeElement.blur();
  });
}
