import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light' | 'night';

// Order the toggle button steps through: dark → night → light → dark. Night is
// a dark variant, so it sits next to dark.
const CYCLE: Theme[] = ['dark', 'night', 'light'];

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** Step to the next theme in CYCLE — backs the single-button toggles. */
  cycle: () => void;
}

const ThemeContext = createContext<ThemeState>({
  theme: 'dark',
  setTheme: () => {},
  cycle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'light' || saved === 'night' ? saved : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const cycle = () => setThemeState((t) => CYCLE[(CYCLE.indexOf(t) + 1) % CYCLE.length]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState, cycle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}
