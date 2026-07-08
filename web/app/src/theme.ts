export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export function detectThemePref(): ThemePref {
  const stored = localStorage.getItem("ln_theme");
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function resolveTheme(pref: ThemePref): Theme {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

export function applyThemePref(pref: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(pref);
  localStorage.setItem("ln_theme", pref);
}

// Re-applies a "system" preference when the OS theme changes; returns a
// cleanup function.
export function watchSystemTheme(getPref: () => ThemePref): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => {
    if (getPref() === "system") applyThemePref("system");
  };
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}
