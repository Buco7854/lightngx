import { useEffect, useState } from "react";

// Tracks the resolved theme on <html data-theme> so CodeMirror's syntax
// palette can follow theme switches.
export function useDarkTheme(): boolean {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === "dark");
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.dataset.theme === "dark"),
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}
