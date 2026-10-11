// What friends see under "Playing Starspite" on Discord. Desktop build only: in the
// browser `window.desktop` is undefined and this does nothing.
export function setPresence(details, startedAt = null) {
  window.desktop?.setPresence({ details, ...(startedAt && { timestamps: { start: startedAt } }) });
}
