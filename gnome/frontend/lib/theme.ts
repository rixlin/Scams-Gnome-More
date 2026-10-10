export type ThemeMode =
  | "mythical-light"
  | "mythical-dark"
  | "default-light"
  | "default-dark";

export interface ThemeOption {
  id: ThemeMode;
  name: string;
  badge?: string;
  isDark: boolean;
  swatches: string[];
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "mythical-light",
    name: "Mythical Light",
    isDark: false,
    swatches: ["#edf2f7", "#ffffff", "#d2dce8", "#277a3f", "#dc2626"],
  },
  {
    id: "mythical-dark",
    name: "Mythical Dark",
    badge: "Default",
    isDark: true,
    swatches: ["#10141b", "#1b2330", "#2a374a", "#7ecc8f", "#c85942"],
  },
  {
    id: "default-light",
    name: "Default Light",
    isDark: false,
    swatches: ["#f8fafc", "#ffffff", "#e2e8f0", "#059669", "#dc2626"],
  },
  {
    id: "default-dark",
    name: "Default Dark",
    isDark: true,
    swatches: ["#000000", "#18181b", "#27272a", "#34d399", "#dc2626"],
  },
];

export const THEME_STORAGE_KEY = "gnome_theme";
export const DEFAULT_THEME: ThemeMode = "mythical-dark";

export const THEME_PALETTES: Record<ThemeMode, Record<string, string>> = {
  "mythical-light": {
    "--theme-canvas": "#edf2f7",
    "--theme-zinc-950": "#ffffff",
    "--theme-zinc-900": "#ffffff",
    "--theme-zinc-800": "#d2dce8",
    "--theme-zinc-700": "#bcc9dc",
    "--theme-zinc-600": "#7e91a8",
    "--theme-zinc-500": "#5f738c",
    "--theme-zinc-400": "#41546b",
    "--theme-zinc-300": "#2b3a4d",
    "--theme-zinc-200": "#1c2838",
    "--theme-zinc-100": "#111924",
    "--theme-zinc-50": "#090e15",
    "--theme-emerald-950": "#e5f3e7",
    "--theme-emerald-900": "#c3e6cb",
    "--theme-emerald-800": "#236938",
    "--theme-emerald-700": "#1d572e",
    "--theme-emerald-600": "#277a3f",
    "--theme-emerald-500": "#16a34a",
    "--theme-emerald-400": "#15803d",
    "--theme-emerald-300": "#166534",
    "--theme-emerald-200": "#14532d",
    "--theme-emerald-100": "#0f3d20",
    "--theme-red-950": "#fef2f2",
    "--theme-red-800": "#fca5a5",
    "--theme-red-600": "#dc2626",
    "--theme-red-500": "#ef4444",
    "--theme-red-400": "#b91c1c",
    "--theme-red-300": "#991b1b",
    "--theme-amber-950": "#fffbeb",
    "--theme-amber-800": "#fde68a",
    "--theme-amber-500": "#d97706",
    "--theme-amber-400": "#b45309",
    "--theme-amber-300": "#92400e",
    "--theme-amber-200": "#78350f",
    "--theme-amber-100": "#451a03",
    "--theme-indigo-950": "#eef2ff",
    "--theme-indigo-900": "#e0e7ff",
    "--theme-indigo-700": "#c7d2fe",
    "--theme-indigo-400": "#4338ca",
    "--theme-indigo-300": "#3730a3",
    "--theme-indigo-200": "#312e81",
    "--theme-indigo-100": "#1e1b4b",
    "--theme-blue-400": "#2563eb",
    "--theme-blue-300": "#1d4ed8",
    "color-scheme": "light",
  },
  "mythical-dark": {
    "--theme-canvas": "#10141b",
    "--theme-zinc-950": "#141a24",
    "--theme-zinc-900": "#1b2330",
    "--theme-zinc-800": "#2a374a",
    "--theme-zinc-700": "#384961",
    "--theme-zinc-600": "#4f6480",
    "--theme-zinc-500": "#758ba8",
    "--theme-zinc-400": "#9bb1cc",
    "--theme-zinc-300": "#c5d5e8",
    "--theme-zinc-200": "#e2edf7",
    "--theme-zinc-100": "#f0f5fc",
    "--theme-zinc-50": "#f8fafd",
    "--theme-emerald-950": "#13261a",
    "--theme-emerald-900": "#1a3823",
    "--theme-emerald-800": "#1f4528",
    "--theme-emerald-700": "#2c5f38",
    "--theme-emerald-600": "#3b784e",
    "--theme-emerald-500": "#4f9463",
    "--theme-emerald-400": "#7ecc8f",
    "--theme-emerald-300": "#a3e2b1",
    "--theme-emerald-200": "#c3edd0",
    "--theme-emerald-100": "#e0f5e4",
    "--theme-red-950": "#2d1512",
    "--theme-red-800": "#5c231a",
    "--theme-red-600": "#c85942",
    "--theme-red-500": "#d96750",
    "--theme-red-400": "#e8826d",
    "--theme-red-300": "#f5b0a2",
    "--theme-amber-950": "#291c0f",
    "--theme-amber-800": "#5a3c18",
    "--theme-amber-500": "#cfa04c",
    "--theme-amber-400": "#deb468",
    "--theme-amber-300": "#edd093",
    "--theme-amber-200": "#f7dfba",
    "--theme-amber-100": "#fef3c7",
    "--theme-indigo-950": "#182030",
    "--theme-indigo-900": "#232f45",
    "--theme-indigo-700": "#3d5073",
    "--theme-indigo-400": "#8aa5d1",
    "--theme-indigo-300": "#b0c7e8",
    "--theme-indigo-200": "#d4e3f7",
    "--theme-indigo-100": "#eef4fd",
    "--theme-blue-400": "#6da0d4",
    "--theme-blue-300": "#97bee3",
    "color-scheme": "dark",
  },
  "default-light": {
    "--theme-canvas": "#f8fafc",
    "--theme-zinc-950": "#ffffff",
    "--theme-zinc-900": "#ffffff",
    "--theme-zinc-800": "#e2e8f0",
    "--theme-zinc-700": "#cbd5e1",
    "--theme-zinc-600": "#94a3b8",
    "--theme-zinc-500": "#64748b",
    "--theme-zinc-400": "#475569",
    "--theme-zinc-300": "#334155",
    "--theme-zinc-200": "#1e293b",
    "--theme-zinc-100": "#0f172a",
    "--theme-zinc-50": "#020617",
    "--theme-emerald-950": "#ecfdf5",
    "--theme-emerald-900": "#d1fae5",
    "--theme-emerald-800": "#065f46",
    "--theme-emerald-700": "#047857",
    "--theme-emerald-600": "#059669",
    "--theme-emerald-500": "#10b981",
    "--theme-emerald-400": "#059669",
    "--theme-emerald-300": "#047857",
    "--theme-emerald-200": "#065f46",
    "--theme-emerald-100": "#064e3b",
    "--theme-red-950": "#fef2f2",
    "--theme-red-800": "#fecaca",
    "--theme-red-600": "#dc2626",
    "--theme-red-500": "#ef4444",
    "--theme-red-400": "#b91c1c",
    "--theme-red-300": "#991b1b",
    "--theme-amber-950": "#fffbeb",
    "--theme-amber-800": "#fde68a",
    "--theme-amber-500": "#d97706",
    "--theme-amber-400": "#b45309",
    "--theme-amber-300": "#92400e",
    "--theme-amber-200": "#78350f",
    "--theme-amber-100": "#451a03",
    "--theme-indigo-950": "#eef2ff",
    "--theme-indigo-900": "#e0e7ff",
    "--theme-indigo-700": "#c7d2fe",
    "--theme-indigo-400": "#4338ca",
    "--theme-indigo-300": "#3730a3",
    "--theme-indigo-200": "#312e81",
    "--theme-indigo-100": "#1e1b4b",
    "--theme-blue-400": "#2563eb",
    "--theme-blue-300": "#1d4ed8",
    "color-scheme": "light",
  },
  "default-dark": {
    "--theme-canvas": "#000000",
    "--theme-zinc-950": "#09090b",
    "--theme-zinc-900": "#18181b",
    "--theme-zinc-800": "#27272a",
    "--theme-zinc-700": "#3f3f46",
    "--theme-zinc-600": "#52525b",
    "--theme-zinc-500": "#71717a",
    "--theme-zinc-400": "#a1a1aa",
    "--theme-zinc-300": "#d4d4d8",
    "--theme-zinc-200": "#e4e4e7",
    "--theme-zinc-100": "#f4f4f5",
    "--theme-zinc-50": "#fafafa",
    "--theme-emerald-950": "#022c22",
    "--theme-emerald-900": "#064e3b",
    "--theme-emerald-800": "#065f46",
    "--theme-emerald-700": "#047857",
    "--theme-emerald-600": "#059669",
    "--theme-emerald-500": "#10b981",
    "--theme-emerald-400": "#34d399",
    "--theme-emerald-300": "#6ee7b7",
    "--theme-emerald-200": "#a7f3d0",
    "--theme-emerald-100": "#d1fae5",
    "--theme-red-950": "#450a0a",
    "--theme-red-800": "#991b1b",
    "--theme-red-600": "#dc2626",
    "--theme-red-500": "#ef4444",
    "--theme-red-400": "#f87171",
    "--theme-red-300": "#fca5a5",
    "--theme-amber-950": "#451a03",
    "--theme-amber-800": "#92400e",
    "--theme-amber-500": "#f59e0b",
    "--theme-amber-400": "#fbbf24",
    "--theme-amber-300": "#fcd34d",
    "--theme-amber-200": "#fde68a",
    "--theme-amber-100": "#fef3c7",
    "--theme-indigo-950": "#1e1b4b",
    "--theme-indigo-900": "#312e81",
    "--theme-indigo-700": "#4338ca",
    "--theme-indigo-400": "#818cf8",
    "--theme-indigo-300": "#a5b4fc",
    "--theme-indigo-200": "#c7d2fe",
    "--theme-indigo-100": "#e0e7ff",
    "--theme-blue-400": "#60a5fa",
    "--theme-blue-300": "#93c5fd",
    "color-scheme": "dark",
  },
};

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (
      saved === "mythical-light" ||
      saved === "mythical-dark" ||
      saved === "default-light" ||
      saved === "default-dark"
    ) {
      return saved;
    }
  } catch {
    // Ignore localStorage errors
  }
  return DEFAULT_THEME;
}

export function applyThemeToDOM(theme: ThemeMode): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const body = document.body;

  root.setAttribute("data-theme", theme);
  if (body) body.setAttribute("data-theme", theme);

  const isLight = theme === "mythical-light" || theme === "default-light";
  if (isLight) {
    root.classList.remove("dark");
    root.classList.add("light");
    if (body) {
      body.classList.remove("dark");
      body.classList.add("light");
    }
  } else {
    root.classList.remove("light");
    root.classList.add("dark");
    if (body) {
      body.classList.remove("light");
      body.classList.add("dark");
    }
  }

  // Set the CSS variables directly on root.style and body.style for instant theme application
  const palette = THEME_PALETTES[theme] || THEME_PALETTES[DEFAULT_THEME];
  for (const [prop, val] of Object.entries(palette)) {
    root.style.setProperty(prop, val);
    if (body) body.style.setProperty(prop, val);
  }
}
