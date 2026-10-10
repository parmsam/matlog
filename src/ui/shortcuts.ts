import { KINDS } from '../core/kinds';
import { openDialog, sheetHead } from './dom';

export function openShortcuts() {
  const d = document.getElementById('shortcuts') as HTMLDialogElement;
  const row = (keys: string[], what: string) => `<tr><td>${keys.map((k) => `<kbd>${k}</kbd>`).join(' ')}</td><td>${what}</td></tr>`;
  d.innerHTML = `${sheetHead('shortcuts-title', 'Keyboard shortcuts')}<div class="sheet-body"><table class="data"><tbody>
    ${KINDS.map((k) => row([k.key.toUpperCase()], `Start / stop ${k.label.toLowerCase()} (Shift: log a finished one)`)).join('')}
    ${row(['U'], 'Undo')}
    ${row(['F'], 'Edit "Working on"')}
    ${row(['G'], 'Progress')}
    ${row(['T'], 'Technique library')}
    ${row(['V'], 'Paste a class note')}
    ${row(['M'], 'Copy the last 7 days as Markdown')}
    ${row([','], 'Settings')}
    ${row(['?'], 'This list')}
  </tbody></table></div>`;
  openDialog(d);
}
