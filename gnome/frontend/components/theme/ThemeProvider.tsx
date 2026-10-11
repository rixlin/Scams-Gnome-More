"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import {
  ThemeMode,
  ThemeOption,
  THEME_OPTIONS,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  getStoredTheme,
  applyThemeToDOM,
} from "../../lib/theme";

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  currentOption: ThemeOption;
}

const defaultOption =
  THEME_OPTIONS.find((opt) => opt.id === DEFAULT_THEME) || THEME_OPTIONS[0];

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  currentOption: defaultOption,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    // Ensure DOM attribute and CSS variables match stored theme immediately
    applyThemeToDOM(theme);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        const next = e.newValue as ThemeMode;
        if (THEME_OPTIONS.some((opt) => opt.id === next)) {
          setThemeState(next);
          applyThemeToDOM(next);
        }
      }
    };

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ThemeMode>;
      if (customEvent.detail) {
        setThemeState(customEvent.detail);
        applyThemeToDOM(customEvent.detail);
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("gnome_theme_updated", handleCustomEvent);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("gnome_theme_updated", handleCustomEvent);
    };
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    applyThemeToDOM(newTheme);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, newTheme);
        window.dispatchEvent(
          new CustomEvent<ThemeMode>("gnome_theme_updated", { detail: newTheme })
        );
      } catch {}
    }
  };

  const currentOption = useMemo(() => {
    return (
      THEME_OPTIONS.find((opt) => opt.id === theme) ||
      defaultOption
    );
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, currentOption }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
