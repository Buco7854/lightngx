import { useSyncExternalStore } from "react";

// Minimal History-API router (no dependency). Views read the current URL
// with useLocation() and change it with navigate() / setQuery().

function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
}

// useLocation re-renders on back/forward and on our own navigate() calls,
// which dispatch a synthetic popstate.
export function useLocation(): URL {
  const href = useSyncExternalStore(
    subscribe,
    () => window.location.pathname + window.location.search,
  );
  return new URL(href, window.location.origin);
}

export function navigate(to: string, opts?: { replace?: boolean }) {
  if (to === window.location.pathname + window.location.search) return;
  if (opts?.replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Merge query params onto the current path (null/"" deletes a key).
export function setQuery(params: Record<string, string | null>, opts?: { replace?: boolean }) {
  const sp = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === "") sp.delete(k);
    else sp.set(k, v);
  }
  const qs = sp.toString();
  navigate(window.location.pathname + (qs ? `?${qs}` : ""), opts);
}
