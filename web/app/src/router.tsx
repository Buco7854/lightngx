import { useSyncExternalStore, type AnchorHTMLAttributes } from "react";

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
  navigate(hrefWithQuery(params), opts);
}

// The URL setQuery() would navigate to: what a Link pointing at the same
// destination has to advertise so the browser can open it in a new tab.
export function hrefWithQuery(params: Record<string, string | null>): string {
  const sp = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === "") sp.delete(k);
    else sp.set(k, v);
  }
  const qs = sp.toString();
  return window.location.pathname + (qs ? `?${qs}` : "");
}

// Link is the navigable counterpart of a button: a real <a href>, so the
// browser offers middle-click, Ctrl/Cmd-click and "Open link in new tab",
// while a plain left click stays an in-page navigation. Pass onNavigate when
// that navigation has to run something first (an unsaved-changes guard, say);
// a modified click bypasses it, which is right — this tab does not move.
export function Link({
  href,
  onNavigate,
  replace,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  onNavigate?: () => void;
  replace?: boolean;
}) {
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        // Anything but a plain left click belongs to the browser: new tab,
        // new window, download. (Middle click fires auxclick, not click.)
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (onNavigate) onNavigate();
        else navigate(href, { replace });
      }}
      {...props}
    />
  );
}
