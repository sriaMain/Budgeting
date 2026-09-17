import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/**
 * Site-wide light/dark toggle. Tailwind's `darkMode: 'class'` (see
 * tailwind.config.ts) means every `dark:` utility across the app responds
 * to the `dark` class on <html> - components elsewhere don't need to call
 * this hook themselves, only whatever renders the toggle button does.
 *
 * Deliberately NOT persisted (no localStorage/sessionStorage): every fresh
 * load of the app starts in light mode regardless of a prior session's
 * choice or the OS/browser dark-mode setting. The toggle only affects the
 * current page session.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setTheme, toggleTheme };
}
