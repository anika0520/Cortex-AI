import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "dark" | "light";
interface Ctx { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void; }

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted]  = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("cortex-theme") as Theme | null;
    if (stored === "light" || stored === "dark") setThemeState(stored);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark",  theme === "dark");
    root.style.colorScheme = theme;
    localStorage.setItem("cortex-theme", theme);
  }, [theme, mounted]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle   = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), []);

  return <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { theme: "dark" as Theme, toggle: () => {}, setTheme: (_: Theme) => {} };
  return ctx;
}
