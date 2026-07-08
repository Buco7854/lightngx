import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Kind = "info" | "error" | "warn";

interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

const kindBorder: Record<Kind, string> = {
  info: "border-l-accent",
  error: "border-l-danger",
  warn: "border-l-warn",
};

const ToastContext = createContext<(text: string, kind?: Kind) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (text: string, kind: Kind = "info") => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-3), { id, kind, text }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="fixed bottom-4 left-1/2 z-50 flex w-[min(480px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-2"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            // Elevated control-surface card (distinct from the page bg in
            // both themes) with a colored left edge for the kind.
            className={`flex items-start gap-3 rounded-lg border border-line border-l-4 bg-ctrl px-3.5 py-2.5 text-sm text-fg shadow-2xl ${kindBorder[t.kind]}`}
          >
            <span className="min-w-0 flex-1 break-words">{t.text}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-1 shrink-0 cursor-pointer rounded p-0.5 text-dim transition-colors hover:bg-hov hover:text-fg"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
