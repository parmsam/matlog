import type { ThemeChoice } from '../core/types';

const THEME_COLOR = { gi: '#f3efe6', nogi: '#14161c' } as const;
export type Theme = keyof typeof THEME_COLOR;

/** Auto follows the system: light is the gi, dark is no-gi. */
export function resolveTheme(choice: ThemeChoice, prefersDark = matchMedia('(prefers-color-scheme: dark)').matches): Theme {
  if (choice !== 'auto') return choice;
  return prefersDark ? 'nogi' : 'gi';
}

export function applyTheme(choice: ThemeChoice) {
  const theme = resolveTheme(choice);
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}
