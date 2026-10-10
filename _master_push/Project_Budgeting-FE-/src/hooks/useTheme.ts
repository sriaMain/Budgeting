import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'sria-theme';

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/** Mirrors the inline script in index.html so the very first React render
 * already agrees with whatever was painted pre-hydration - no flash/mismatch.
 * Defaults to light when nothing's been saved yet - the app always opens in
 * light mode until the user explicitly toggles dark mode themselves, rather
 * than following the OS/browser's system color-scheme preference. */
function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage unavailable (privacy mode, etc.) - fall through.
  }
  return 'light';
}

/**
 * Site-wide light/dark toggle. Tailwind's `darkMode: 'class'` (see
 * tailwind.config.ts) means every `dark:` utility across the app responds
 * to the `dark` class on <html> - components elsewhere don't need to call
 * this hook themselves, only whatever renders the toggle button does.
 *
 * Persisted to localStorage under "sria-theme" so the choice survives a
 * reload or a closed tab; index.html applies it before React mounts to
 * avoid a light-mode flash.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable - theme still applies for this session.
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setTheme, toggleTheme };
}
