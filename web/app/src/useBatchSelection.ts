import { useCallback, useEffect, useMemo, useState, type SetStateAction } from "react";

export const BATCH_LIMIT = 200;

// Keep selection across pages, but never across filters, folders or editors.
// Derive the visible set synchronously: no render can act on hidden stale rows.
export function useBatchSelection(keys: string[], pageKeys: string[], scope: string) {
  const [state, setState] = useState({ scope, keys: new Set<string>() });
  const selected = useMemo(() => {
    const available = new Set(keys);
    return new Set(
      state.scope === scope ? [...state.keys].filter((key) => available.has(key)) : [],
    );
  }, [keys, state, scope]);
  useEffect(() => {
    if (state.scope !== scope || state.keys.size !== selected.size) {
      setState({ scope, keys: selected });
    }
  }, [scope, selected, state]);
  const setSelected = useCallback(
    (value: SetStateAction<Set<string>>) => {
      setState((previous) => {
        const current = previous.scope === scope ? previous.keys : new Set<string>();
        const next = typeof value === "function" ? value(current) : value;
        return { scope, keys: new Set([...next].slice(0, BATCH_LIMIT)) };
      });
    },
    [scope],
  );
  const allPage = pageKeys.length > 0 && pageKeys.every((key) => selected.has(key));
  const somePage = pageKeys.some((key) => selected.has(key));
  const togglePage = () =>
    setSelected((previous) => {
      const next = new Set(previous);
      for (const key of pageKeys) {
        if (allPage) next.delete(key);
        else if (next.size < BATCH_LIMIT) next.add(key);
      }
      return next;
    });
  const toggle = (key: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else if (next.size < BATCH_LIMIT) next.add(key);
      return next;
    });
  return {
    selected,
    setSelected,
    allPage,
    somePage,
    togglePage,
    toggle,
    clear: () => setSelected(new Set()),
    selectMatching: () => setSelected(new Set(keys.slice(0, BATCH_LIMIT))),
    canSelectMore: keys.slice(0, BATCH_LIMIT).some((key) => !selected.has(key)),
    atLimit: selected.size >= BATCH_LIMIT,
  };
}
