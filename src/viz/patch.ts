/** A round embroidered patch. */
export function patchSvg(color: string, label: string): string {
  return `<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" fill="${color}" stroke="var(--ink)" stroke-width="2"/><circle cx="26" cy="26" r="19" fill="none" stroke="#fff" stroke-width="1.4" stroke-dasharray="2.5 2"/><text x="26" y="30" text-anchor="middle" font-size="11" font-weight="800" fill="${color === '#e9e4d8' || color === '#d9a520' ? '#1b2230' : '#fff'}" font-family="var(--display)">${label}</text></svg>`;
}
