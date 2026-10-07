// h('div', { class: 'x', text: 'hi', onclick }, ...children) → HTMLElement
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

// Writes DOM properties only when the value changed, so per-frame UI updates don't
// trigger style recalculation when nothing moved. Keys: 'text', 'hidden', '.class'
// (toggled by a boolean), or a style property.
export class DomWriter {
  constructor() { this.last = new WeakMap(); }
  set(el, key, value) {
    let m = this.last.get(el);
    if (!m) this.last.set(el, (m = new Map()));
    if (m.get(key) === value) return;
    m.set(key, value);
    if (key === 'text') el.textContent = value;
    else if (key === 'hidden') el.classList.toggle('hidden', value);
    else if (key[0] === '.') el.classList.toggle(key.slice(1), value);
    else el.style.setProperty(key, value);
  }
}
