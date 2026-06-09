import { create } from "zustand";

export type ThemeMode = "auto" | "dark" | "light";

const STORAGE_KEY = "ventostack_theme_mode";

function getStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "auto") return stored;
  } catch {
    // localStorage unavailable
  }
  return "auto";
}

function resolveTheme(mode: ThemeMode): "dark" | "light" {
  if (mode !== "auto") return mode;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyDOM(theme: "dark" | "light") {
  try {
    document.documentElement.classList.toggle("dark", theme === "dark");
  } catch {
    // SSR guard
  }
}

interface ThemeState {
  mode: ThemeMode;
  theme: "dark" | "light";
  setTheme: (mode: ThemeMode) => void;
}

export const useTheme = create<ThemeState>((set) => {
  const initialMode = getStoredMode();
  const initialTheme = resolveTheme(initialMode);

  // Apply on store creation
  applyDOM(initialTheme);

  return {
    mode: initialMode,
    theme: initialTheme,
    setTheme: (newMode: ThemeMode) => {
      try {
        localStorage.setItem(STORAGE_KEY, newMode);
      } catch {
        // localStorage unavailable
      }
      const resolved = resolveTheme(newMode);
      applyDOM(resolved);
      set({ mode: newMode, theme: resolved });
    },
  };
});

// 监听系统主题变化，auto 模式下自动跟随
if (typeof window !== "undefined") {
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", () => {
      const state = useTheme.getState();
      if (state.mode === "auto") {
        const resolved = resolveTheme("auto");
        applyDOM(resolved);
        useTheme.setState({ theme: resolved });
      }
    });
  } catch {
    // not available
  }
}
